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

import { GoogleGenAI, Type, Schema } from "@google/genai";
import { PhotoRecord, AIAnalysisResult, AppMode } from "../../types";
import { extractBase64Data } from "../../utils/imageUtils";
import { formatHierarchyForPrompt, validateAgainstMaster, validateTemperatureRemarks, isQualityManagementPhoto } from "../../utils/constructionMaster";
import { trackUsage } from "../usageTracker";
import { getRelevantExamples, getActiveSession } from "../../utils/storage";
import { RuleSettings } from "../../utils/analysisRules";
import { getLearnedSettings, rulesToPromptText as learnedRulesToPromptText } from "../learningService";
import { hasApiKey } from './apiKey';
import { getSelectedModel, PRIMARY_MODEL, FALLBACK_MODEL } from './models';

// Re-export from submodules for backward compatibility
export { AbortChecker, checkAbort, formatDuration, formatExamplesForPrompt, trackFieldChange, LogFunction, sleep, MAX_RETRIES, RETRY_DELAY_MS } from './helpers';
export { getSystemInstruction, REMARKS_CATEGORIES } from './systemPrompts';
export { selectWorkTypes, getFilteredHierarchy } from './workTypeSelector';
export { InteractiveMessage, InteractiveAnalysisResult, analyzePhotoInteractive } from './interactiveAnalysis';

// Import from submodules
import { AbortChecker, checkAbort, formatDuration, formatExamplesForPrompt, trackFieldChange, sleep, MAX_RETRIES, RETRY_DELAY_MS, LogFunction } from './helpers';
import { getSystemInstruction, REMARKS_CATEGORIES } from './systemPrompts';
import { selectWorkTypes, getFilteredHierarchy } from './workTypeSelector';

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
  // Early validation: Check API key before proceeding
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
      config: {
        responseMimeType: "application/json"
      }
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
  ruleSettings?: RuleSettings
): Promise<AIAnalysisResult[]> => {
  // Early validation: Check API key before proceeding
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
  if (appMode === 'construction' && records.length >= 3) {
    const selectorStart = performance.now();
    const selectedWorkTypes = await selectWorkTypes(records, apiKey, onLog);
    filteredHierarchy = getFilteredHierarchy(selectedWorkTypes);
    const selectorTime = performance.now() - selectorStart;
    const fullSize = JSON.stringify(formatHierarchyForPrompt()).length;
    const filteredSize = JSON.stringify(filteredHierarchy).length;
    onLog?.(`[PROFILER] Selector: ${formatDuration(selectorTime)}, hierarchy ${fullSize} -> ${filteredSize} chars (${((1 - filteredSize/fullSize) * 100).toFixed(1)}% reduction)`, "info");
  }

  const prepStartTime = performance.now();
  const inputs = records.map(r => ({
    inlineData: {
      data: extractBase64Data(r.base64),
      mimeType: r.mimeType
    }
  }));
  const prepTime = performance.now() - prepStartTime;
  onLog?.(`[PROFILER] Image prep: ${formatDuration(prepTime)}`, "info");

  // Fetch relevant examples (お手本) for few-shot learning
  let examplesPrompt = "";
  if (appMode === 'construction') {
    try {
      // アクティブなセッションを確認してログに表示
      const activeSession = await getActiveSession();
      if (activeSession) {
        onLog?.(`[EXAMPLES] お手本セッション適用中: "${activeSession.name}" (${activeSession.photoCount}枚)`, "info");
      }

      const examples = await getRelevantExamples(undefined, undefined, 5); // セッションから最大5件
      if (examples.length > 0) {
        examplesPrompt = formatExamplesForPrompt(examples);
        onLog?.(`[EXAMPLES] ${examples.length}件のお手本をプロンプトに適用`, "success");
      }
    } catch (e) {
      // Examples are optional, continue without them
      console.warn('Failed to load examples:', e);
    }
  }

  const systemPrompt = getSystemInstruction(appMode, instruction, filteredHierarchy, ruleSettings);

  // 学習ルールを取得してプロンプトに追加
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

  const fullSystemPrompt = [systemPrompt, examplesPrompt, learnedRulesPrompt].filter(Boolean).join('\n\n');

  const prompt = `
    Analyze these ${records.length} photos.
    For each photo, output the JSON object matching the schema.
    Order must match the input order.

    **CONTEXT RELAY**: If you cannot clearly determine the station (測点) or variety (種別) from a photo,
    but the previous photo had these values and the current photo appears to be from the same location/work type,
    you may inherit those values. However, always prioritize explicit information visible in the current photo.

    Photo FileNames for reference:
    ${records.map(r => r.fileName).join(", ")}
  `;

  const schema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        fileName: { type: Type.STRING },
        workType: { type: Type.STRING },
        variety: { type: Type.STRING },
        detail: { type: Type.STRING },
        station: { type: Type.STRING },
        remarksCategory: {
          type: Type.STRING,
          enum: REMARKS_CATEGORIES,
          description: "備考の種類。温度管理なら「到着温度」「敷均し温度」等を選択（測定値は含めない）"
        },
        measurements: {
          type: Type.STRING,
          description: "測定値。単位は種別名の後ろに1回。例: 「基準高下がり (mm)\\n設計値 H1=50, H2=50\\n実測値 H1=50, H2=51」。複数種別は空行で区切る。値がない場合は空文字"
        },
        description: { type: Type.STRING },
        hasBoard: { type: Type.BOOLEAN },
        detectedText: { type: Type.STRING },
        reasoning: { type: Type.STRING }
      },
      required: ["fileName", "workType", "station", "description", "remarksCategory"]
    }
  };

  let attempt = 0;
  let modelToUse = getPrimaryModel(); // ユーザー選択モデルを使用

  while (attempt < MAX_RETRIES) {
    // Check if analysis should be aborted
    checkAbort(shouldAbort, 'analyzePhotoBatch リトライループ');

    try {
      const apiStartTime = performance.now();
      let firstChunkTime: number | null = null;

      const result = await genAI.models.generateContentStream({
        model: modelToUse,
        contents: [
          { role: 'user', parts: [...inputs, { text: prompt }] }
        ],
        config: {
          systemInstruction: fullSystemPrompt,
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.1
        }
      });

      let fullText = "";
      let chunkCount = 0;
      for await (const chunk of result) {
        // Check abort during streaming
        checkAbort(shouldAbort, 'analyzePhotoBatch ストリーミング中');

        if (firstChunkTime === null) {
          firstChunkTime = performance.now() - apiStartTime;
          onLog?.(`[PROFILER] Time to first chunk: ${formatDuration(firstChunkTime)}`, "info");
        }
        chunkCount++;
        const chunkText = chunk.text;
        fullText += chunkText;

        // Try to extract "reasoning" from the partial JSON if it exists
        if (onReasoningStream) {
          const match = fullText.match(/"reasoning"\s*:\s*"([^"]*)/);
          if (match && match[1]) {
            onReasoningStream(match[1]);
          }
        }
      }

      const apiTime = performance.now() - apiStartTime;
      onLog?.(`[PROFILER] API stream complete: ${formatDuration(apiTime)} (${chunkCount} chunks, ${fullText.length} chars)`, "info");

      const text = fullText;

      // Track usage for this batch
      trackUsage(modelToUse, prompt + systemPrompt, text, records.length, 'analyzePhotoBatch');

      onLog?.("Gemini Raw Response", 'json', text);

      const parseStartTime = performance.now();
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        // Fallback: try to find JSON array in text
        const match = text.match(/\[.*\]/s);
        if (match) {
          parsed = JSON.parse(match[0]);
        } else {
          throw new Error("Invalid JSON response from AI");
        }
      }

      const parseTime = performance.now() - parseStartTime;

      if (!Array.isArray(parsed)) {
        // If single object, wrap in array
        parsed = [parsed];
      }

      // Validate against schema-ish
      const validResults: AIAnalysisResult[] = parsed.map((item: any) => {
        const remarksCategory = item.remarksCategory || "";
        const measurements = item.measurements || "";

        return {
          fileName: item.fileName || "unknown",
          workType: item.workType || "",
          variety: item.variety || "",
          detail: item.detail || "",
          station: item.station || "",
          remarks: remarksCategory,
          remarksCategory: remarksCategory,
          remarksValue: "",
          description: item.description || "",
          measurements: measurements,
          hasBoard: !!item.hasBoard,
          detectedText: item.detectedText || "",
          reasoning: item.reasoning || "",
          changeLog: []
        };
      });

      // Log individual results
      validResults.forEach(res => {
        onIndividualResult?.(res.fileName, res);
      });

      // Match AI results to original records by fileName (not by index)
      const matchedResults: AIAnalysisResult[] = records.map(record => {
        const aiResult = validResults.find(res => res.fileName === record.fileName);

        if (aiResult) {
          return aiResult;
        } else {
          onLog?.(`[WARNING] No AI result found for ${record.fileName}, using placeholder`, 'error');
          return {
            fileName: record.fileName,
            workType: '',
            variety: '',
            detail: '',
            station: '',
            remarks: '',
            remarksCategory: '',
            remarksValue: '',
            description: '',
            measurements: '',
            hasBoard: false,
            detectedText: '',
            reasoning: '',
            changeLog: []
          };
        }
      });

      // Apply context relay: inherit from previous photos
      const isSafetyRemarks = (remarks: string) => {
        const safetyKeywords = ['朝礼', 'KY', '安全', '新規入場', '点灯', '巡視'];
        return safetyKeywords.some(kw => remarks.includes(kw));
      };

      let lastKnownStation = "";
      let lastKnownVariety = "";
      let lastKnownWorkType = "";
      let lastKnownDetail = "";
      let lastKnownRemarks = "";
      let lastKnownMeasurements = "";

      const finalResults = matchedResults.map((res) => {
        const changeLog = res.changeLog || [];

        // Safety management photos should keep empty workType/variety
        if (isSafetyRemarks(res.remarks || '')) {
          return res;
        }

        // Apply context relay for empty fields (non-safety photos only)
        const station = res.station || lastKnownStation;
        const variety = res.variety || lastKnownVariety;
        const workType = res.workType || lastKnownWorkType;
        const detail = res.detail || lastKnownDetail;
        const remarks = res.remarks || lastKnownRemarks;
        const measurements = res.measurements || lastKnownMeasurements;

        // 継承による変更を記録
        trackFieldChange(changeLog, 'station', 'context_relay', res.station || '', station, '前の写真から継承');
        trackFieldChange(changeLog, 'variety', 'context_relay', res.variety || '', variety, '前の写真から継承');
        trackFieldChange(changeLog, 'workType', 'context_relay', res.workType || '', workType, '前の写真から継承');
        trackFieldChange(changeLog, 'detail', 'context_relay', res.detail || '', detail, '前の写真から継承');
        trackFieldChange(changeLog, 'remarks', 'context_relay', res.remarks || '', remarks, '前の写真から継承');
        trackFieldChange(changeLog, 'measurements', 'context_relay', res.measurements || '', measurements, '前の写真から継承');

        // Update context for next iteration (only if current has value)
        if (res.station) lastKnownStation = res.station;
        if (res.variety) lastKnownVariety = res.variety;
        if (res.workType) lastKnownWorkType = res.workType;
        if (res.detail) lastKnownDetail = res.detail;
        if (res.remarks) lastKnownRemarks = res.remarks;
        if (res.measurements) lastKnownMeasurements = res.measurements;

        return { ...res, station, variety, workType, detail, remarks, measurements, changeLog };
      });

      // Validate against master data and log warnings for AI-invented values
      const validatedResults = finalResults.map(res => {
        const changeLog = res.changeLog || [];
        const { validatedWorkType, validatedVariety, validatedDetail, warnings } =
          validateAgainstMaster(res.workType, res.variety, res.detail, res.remarks);

        if (warnings.length > 0) {
          onLog?.(`[MASTER警告] ${res.fileName}: ${warnings.join(', ')}`, "error");
        }

        // マスタバリデーションによる変更を記録
        trackFieldChange(changeLog, 'workType', 'master_validation', res.workType || '', validatedWorkType, 'マスタに存在しない値を修正');
        trackFieldChange(changeLog, 'variety', 'master_validation', res.variety || '', validatedVariety, 'マスタに存在しない値を修正');
        trackFieldChange(changeLog, 'detail', 'master_validation', res.detail || '', validatedDetail, 'マスタに存在しない値を修正');

        // 備考に「〜工」が含まれている場合は警告
        if (res.remarks && res.remarks.match(/[^着手完]工/) && !res.remarks.includes('施工')) {
          onLog?.(`🚨 [AI創作検出] ${res.fileName}: 備考「${res.remarks}」に「〜工」が含まれています`, "error");
        }

        // 温度管理写真のバリデーション
        let finalRemarks = res.remarks;
        let finalRemarksCategory = res.remarksCategory;
        let finalMeasurements = res.measurements;

        if (res.remarksCategory && isQualityManagementPhoto(res.remarksCategory)) {
          const tempValidation = validateTemperatureRemarks(
            res.remarksCategory || '',
            res.measurements || ''
          );

          if (!tempValidation.isValid) {
            tempValidation.warnings.forEach(w => {
              onLog?.(`[温度バリデーション] ${res.fileName}: ${w}`, "error");
            });

            // 修正を適用
            if (tempValidation.correctedCategory) {
              trackFieldChange(changeLog, 'remarksCategory', 'temperature_validation', res.remarksCategory || '', tempValidation.correctedCategory, '温度バリデーションで修正');
              finalRemarksCategory = tempValidation.correctedCategory;
              trackFieldChange(changeLog, 'remarks', 'temperature_validation', res.remarks || '', finalRemarksCategory, '温度バリデーションで修正');
              finalRemarks = finalRemarksCategory;
            }
            if (tempValidation.correctedValue) {
              trackFieldChange(changeLog, 'measurements', 'temperature_validation', res.measurements || '', tempValidation.correctedValue, '温度バリデーションで修正');
              finalMeasurements = tempValidation.correctedValue;
            }
          }
        }

        return {
          ...res,
          workType: validatedWorkType,
          variety: validatedVariety,
          detail: validatedDetail,
          remarks: finalRemarks,
          remarksCategory: finalRemarksCategory,
          measurements: finalMeasurements,
          changeLog
        };
      });

      const totalTime = performance.now() - batchStartTime;
      const perPhotoTime = totalTime / records.length;
      onLog?.(`[PROFILER] Batch complete: Total=${formatDuration(totalTime)}, Per photo=${formatDuration(perPhotoTime)}, Parse=${formatDuration(parseTime)}`, "success");

      return validatedResults;

    } catch (error: any) {
      attempt++;
      const isQuotaError = error.message?.includes("429") || error.status === 429 || error.status === 503;

      onLog?.(`API Error (${modelToUse}) - Attempt ${attempt}/${MAX_RETRIES}`, "error", { message: error.message });

      if (attempt >= MAX_RETRIES) {
        throw error;
      }

      if (isQuotaError) {
        // Try fallback chain
        if (modelToUse !== FALLBACK_MODEL) {
          const previousModel = modelToUse;
          if (modelToUse === 'gemini-2.5-pro') {
            modelToUse = 'gemini-2.5-flash';
          } else {
            modelToUse = FALLBACK_MODEL;
          }
          onLog?.(`Rate Limit hit on ${previousModel}. Switching to: ${modelToUse}`, "info");
          await sleep(RETRY_DELAY_MS);
        } else {
          onLog?.(`Rate Limit on fallback model. Waiting...`, "info");
          await sleep(RETRY_DELAY_MS * 3);
        }
      } else {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw new Error("Max retries exceeded");
};
