/**
 * Gemini API - Analysis Module
 *
 * 解析関連の関数を集約
 * - analyzePhotoBatch: バッチ解析
 * - identifyTargetPhotos: ターゲット写真の特定
 *
 * 分割モジュール:
 * - systemPrompts.ts: システム指示生成
 * - helpers.ts: ヘルパー関数
 * - workTypeSelector.ts: 工種選択
 * - interactiveAnalysis.ts: 対話型解析
 */

import { GoogleGenAI } from "@google/genai";
import { PhotoRecord, AIAnalysisResult, AppMode } from "../../types";
import { extractBase64Data } from "../../utils/imageUtils";
import { formatHierarchyForPrompt, getHierarchySubset } from "../../utils/constructionMaster";
import { loadMasterCsv, toChainRecordsJson, getWorkTypesFromMaster, ChainRecord } from "../../utils/masterCsvParser";
import { trackUsage } from "../usageTracker";
import { getRelevantExamples, getActiveSession, getActiveExampleHistoryId, getAnalysisHistoryEntry } from "../../utils/storage";
import { RuleSettings } from "../../utils/analysisRules";
import { getLearnedSettings, rulesToPromptText as learnedRulesToPromptText } from "../learningService";
// Core module - サブモジュールを統合
import {
  hasApiKey,
  getSelectedModel,
  PRIMARY_MODEL,
  FALLBACK_MODEL,
  type ModelType,
  type AbortChecker,
  type LogFunction,
  checkAbort,
  formatDuration,
  formatExamplesForPrompt,
  sleep,
  MAX_RETRIES,
  RETRY_DELAY_MS,
  BATCH_ANALYSIS_SCHEMA,
  createBatchAnalysisSchema,
  parseAIResponse,
  mapToAnalysisResults,
  matchResultsToRecords,
  applyContextRelay,
  validateResults,
  getSystemInstruction,
  selectWorkTypes,
  getFilteredHierarchy,
} from './core';

// Re-export from submodules for backward compatibility
export { checkAbort, formatDuration, formatExamplesForPrompt, trackFieldChange, sleep, MAX_RETRIES, RETRY_DELAY_MS, REMARKS_CATEGORIES } from './core';
export type { AbortChecker, LogFunction } from './core';
export { getSystemInstruction } from './core';
export { selectWorkTypes, getFilteredHierarchy } from './core';
export { analyzePhotoInteractive } from './interactiveAnalysis';
export type { InteractiveMessage, InteractiveAnalysisResult } from './interactiveAnalysis';

// ============================================
// ターゲット写真の特定
// ============================================

export const identifyTargetPhotos = async (
  photos: PhotoRecord[],
  instruction: string,
  apiKey: string,
  onLog?: LogFunction,
  shouldAbort?: AbortChecker
): Promise<string[]> => {
  if (!apiKey || !hasApiKey()) {
    throw new Error('APIキーが設定されていません。設定画面からAPIキーを入力してください。');
  }

  checkAbort(shouldAbort, 'identifyTargetPhotos開始前');

  const startTime = performance.now();
  const genAI = new GoogleGenAI({ apiKey });

  const photoSummaries = photos.map(p => ({
    fileName: p.fileName,
    currentAnalysis: p.analysis ? {
      workType: p.analysis.workType,
      remarks: p.analysis.remarks,
      description: p.analysis.description
    } : "Not analyzed"
  }));

  const prompt = `
    User Instruction: "${instruction}"

    Given the following list of photos and their current analysis, identify which fileNames should be re-analyzed to satisfy the instruction.
    Return a JSON object with a key "targetFiles" containing an array of strings (fileNames).

    Photos:
    ${JSON.stringify(photoSummaries, null, 2)}
  `;

  try {
    checkAbort(shouldAbort, 'identifyTargetPhotos API呼び出し前');
    const result = await genAI.models.generateContent({
      model: PRIMARY_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json" }
    });

    const responseText = result.text || "{}";
    trackUsage(PRIMARY_MODEL, prompt, responseText, 0, 'identifyTargetPhotos');
    const json = JSON.parse(responseText);
    const totalTime = performance.now() - startTime;
    onLog?.(`[PROFILER] identifyTargetPhotos: Total=${formatDuration(totalTime)}, Found ${json.targetFiles?.length || 0} targets`, "info");
    return json.targetFiles || [];
  } catch (e) {
    console.error("Identify targets failed", e);
    return [];
  }
};

// ============================================
// バッチ解析
// ============================================

export const analyzePhotoBatch = async (
  records: PhotoRecord[],
  instruction: string,
  batchSize: number,
  appMode: AppMode,
  apiKey: string,
  onLog?: LogFunction,
  onIndividualResult?: (fileName: string, result: AIAnalysisResult) => void,
  shouldAbort?: AbortChecker,
  onReasoningStream?: (text: string) => void,
  ruleSettings?: RuleSettings,
  workType?: string
): Promise<AIAnalysisResult[]> => {
  if (!apiKey || !hasApiKey()) {
    throw new Error('APIキーが設定されていません。設定画面からAPIキーを入力してください。');
  }

  const batchStartTime = performance.now();
  const genAI = new GoogleGenAI({ apiKey });
  const getPrimaryModel = () => getSelectedModel();

  onLog?.(`[PROFILER] Batch start: ${records.length} photos, model=${getPrimaryModel()}`, "info");
  records.forEach((r, i) => onLog?.(`  [${i + 1}/${records.length}] ${r.fileName}`, 'info'));

  // Use selector to determine work types (only for construction mode)
  let filteredHierarchy: object | undefined;
  if (appMode === 'construction') {
    const fullSize = JSON.stringify(formatHierarchyForPrompt()).length;

    if (workType) {
      // 工種指定あり → selectWorkTypes()スキップ（API呼び出し削減）
      filteredHierarchy = getHierarchySubset([workType]);
      const filteredSize = JSON.stringify(filteredHierarchy).length;
      onLog?.(`[PROFILER] 工種指定済み: ${workType} - selector skip, hierarchy ${fullSize} -> ${filteredSize} chars (${((1 - filteredSize/fullSize) * 100).toFixed(1)}% reduction)`, "info");
    } else if (records.length >= 3) {
      // 工種指定なし → 従来通りAIが推定
      const selectorStart = performance.now();
      const selectedWorkTypes = await selectWorkTypes(records, apiKey, onLog);
      filteredHierarchy = getFilteredHierarchy(selectedWorkTypes);
      const selectorTime = performance.now() - selectorStart;
      const filteredSize = JSON.stringify(filteredHierarchy).length;
      onLog?.(`[PROFILER] Selector: ${formatDuration(selectorTime)}, hierarchy ${fullSize} -> ${filteredSize} chars (${((1 - filteredSize/fullSize) * 100).toFixed(1)}% reduction)`, "info");
    }
  }

  const { inputs, examplesPrompt, systemPrompt, workTypes } = await prepareAnalysisInputs(records, appMode, instruction, filteredHierarchy, ruleSettings, onLog);
  const prompt = buildBatchPrompt(records);

  // 工種一覧がある場合は動的スキーマを生成（workType を enum 化）
  const schema = workTypes.length > 0 ? createBatchAnalysisSchema(workTypes) : BATCH_ANALYSIS_SCHEMA;

  let attempt = 0;
  let modelToUse = getPrimaryModel();

  while (attempt < MAX_RETRIES) {
    checkAbort(shouldAbort, 'analyzePhotoBatch リトライループ');

    try {
      const { text, apiTime, chunkCount } = await streamAPIResponse(
        genAI, modelToUse, inputs, prompt, systemPrompt, schema, shouldAbort, onLog, onReasoningStream
      );
      onLog?.(`[PROFILER] API stream complete: ${formatDuration(apiTime)} (${chunkCount} chunks, ${text.length} chars)`, "info");

      trackUsage(modelToUse, prompt + systemPrompt, text, records.length, 'analyzePhotoBatch');
      onLog?.("Gemini Raw Response", 'json', text);

      const parsed = parseAIResponse(text);
      const validResults = mapToAnalysisResults(parsed);
      validResults.forEach(res => onIndividualResult?.(res.fileName, res));

      const matchedResults = matchResultsToRecords(records, validResults, onLog);
      const relayedResults = applyContextRelay(matchedResults);
      const validatedResults = validateResults(relayedResults, onLog);

      const totalTime = performance.now() - batchStartTime;
      onLog?.(`[PROFILER] Batch complete: Total=${formatDuration(totalTime)}, Per photo=${formatDuration(totalTime / records.length)}`, "success");

      return validatedResults;

    } catch (error: any) {
      attempt++;
      const isQuotaError = error.message?.includes("429") || error.status === 429 || error.status === 503;
      onLog?.(`API Error (${modelToUse}) - Attempt ${attempt}/${MAX_RETRIES}`, "error", { message: error.message });

      if (attempt >= MAX_RETRIES) throw error;

      if (isQuotaError) {
        modelToUse = handleQuotaError(modelToUse, onLog);
        await sleep(modelToUse === FALLBACK_MODEL ? RETRY_DELAY_MS * 3 : RETRY_DELAY_MS);
      } else {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw new Error("Max retries exceeded");
};

// ============================================
// ヘルパー関数
// ============================================

async function prepareAnalysisInputs(
  records: PhotoRecord[],
  appMode: AppMode,
  instruction: string,
  filteredHierarchy: object | undefined,
  ruleSettings: RuleSettings | undefined,
  onLog?: LogFunction
) {
  const inputs = records.map(r => ({
    inlineData: { data: extractBase64Data(r.base64), mimeType: r.mimeType }
  }));

  let examplesPrompt = "";
  let chainRecords: ChainRecord[] = [];
  let workTypes: string[] = [];

  if (appMode === 'construction') {
    // CSVマスタからチェーンレコードと工種一覧を読み込み
    try {
      const masterRows = await loadMasterCsv();
      if (masterRows.length > 0) {
        chainRecords = toChainRecordsJson(masterRows);
        workTypes = getWorkTypesFromMaster(masterRows);
        onLog?.(`[MASTER] CSVから${masterRows.length}件のマスタレコード、${workTypes.length}件の工種を読み込み`, "info");
      }
    } catch (e) {
      console.warn('Failed to load master CSV:', e);
    }

    try {
      // セッションベースのお手本をチェック
      const activeSession = await getActiveSession();
      if (activeSession) {
        onLog?.(`[EXAMPLES] お手本セッション適用中: "${activeSession.name}" (${activeSession.photoCount}枚)`, "info");
      }

      // 履歴ベースのお手本をチェック（新機能）
      const activeHistoryId = getActiveExampleHistoryId();
      if (activeHistoryId && !activeSession) {
        const historyEntry = await getAnalysisHistoryEntry(activeHistoryId);
        if (historyEntry && historyEntry.isExampleSession) {
          onLog?.(`[EXAMPLES] 履歴お手本適用中: "${historyEntry.name}" (${historyEntry.photoCount}枚)`, "info");
        }
      }

      const examples = await getRelevantExamples(undefined, undefined, 5);
      if (examples.length > 0) {
        examplesPrompt = formatExamplesForPrompt(examples);
        onLog?.(`[EXAMPLES] ${examples.length}件のお手本をプロンプトに適用`, "success");
      }
    } catch (e) {
      console.warn('Failed to load examples:', e);
    }
  }

  const baseSystemPrompt = getSystemInstruction(appMode, instruction, filteredHierarchy, ruleSettings, chainRecords);

  let learnedRulesPrompt = "";
  try {
    const learnedSettings = await getLearnedSettings();
    if (learnedSettings.rules.length > 0 || learnedSettings.aliases.length > 0) {
      learnedRulesPrompt = learnedRulesToPromptText(learnedSettings);
      onLog?.(`[LEARNING] ${learnedSettings.rules.length}件のルール、${learnedSettings.aliases.length}件のエイリアスを適用`, "success");
    }
  } catch (e) {
    console.warn('Failed to load learned settings:', e);
  }

  const systemPrompt = [baseSystemPrompt, examplesPrompt, learnedRulesPrompt].filter(Boolean).join('\n\n');
  return { inputs, examplesPrompt, systemPrompt, workTypes };
}

function buildBatchPrompt(records: PhotoRecord[]): string {
  // 撮影時間情報を含める（安全管理写真の判定に使用）
  const photoInfoList = records.map(r => {
    const timeInfo = r.date ? formatShootingTime(r.date) : 'unknown';
    return `${r.fileName} (撮影時間: ${timeInfo})`;
  });

  return `
    Analyze these ${records.length} photos.
    For each photo, output the JSON object matching the schema.
    Order must match the input order.

    **SHOOTING TIME INFO**: Use the shooting time to help determine photo category.
    - Photos taken 8:00-9:00 AM with workers gathered = 朝礼状況 (DEFINITE)

    **CONTEXT RELAY**: If you cannot clearly determine the station (測点) or variety (種別) from a photo,
    but the previous photo had these values and the current photo appears to be from the same location/work type,
    you may inherit those values. However, always prioritize explicit information visible in the current photo.

    Photo Info (fileName + shooting time):
    ${photoInfoList.join("\n    ")}
  `;
}

function formatShootingTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

async function streamAPIResponse(
  genAI: GoogleGenAI,
  modelToUse: string,
  inputs: any[],
  prompt: string,
  systemPrompt: string,
  schema: ReturnType<typeof createBatchAnalysisSchema>,
  shouldAbort?: AbortChecker,
  onLog?: LogFunction,
  onReasoningStream?: (text: string) => void
): Promise<{ text: string; apiTime: number; chunkCount: number }> {
  const apiStartTime = performance.now();
  let firstChunkTime: number | null = null;

  const result = await genAI.models.generateContentStream({
    model: modelToUse,
    contents: [{ role: 'user', parts: [...inputs, { text: prompt }] }],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.1
    }
  });

  let fullText = "";
  let chunkCount = 0;
  for await (const chunk of result) {
    checkAbort(shouldAbort, 'analyzePhotoBatch ストリーミング中');

    if (firstChunkTime === null) {
      firstChunkTime = performance.now() - apiStartTime;
      onLog?.(`[PROFILER] Time to first chunk: ${formatDuration(firstChunkTime)}`, "info");
    }
    chunkCount++;
    fullText += chunk.text;

    if (onReasoningStream) {
      const match = fullText.match(/"reasoning"\s*:\s*"([^"]*)/);
      if (match?.[1]) onReasoningStream(match[1]);
    }
  }

  return { text: fullText, apiTime: performance.now() - apiStartTime, chunkCount };
}

function handleQuotaError(currentModel: ModelType, onLog?: LogFunction): ModelType {
  if (currentModel === FALLBACK_MODEL) {
    onLog?.(`Rate Limit on fallback model. Waiting...`, "info");
    return FALLBACK_MODEL;
  }

  const nextModel: ModelType = currentModel === 'gemini-2.5-pro' ? 'gemini-2.5-flash' : FALLBACK_MODEL;
  onLog?.(`Rate Limit hit on ${currentModel}. Switching to: ${nextModel}`, "info");
  return nextModel;
}
