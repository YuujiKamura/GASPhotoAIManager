/**
 * Gemini API - Analysis Module: analyzePhotoBatch, identifyTargetPhotos
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
export { AbortChecker, checkAbort, formatDuration, formatExamplesForPrompt, trackFieldChange, LogFunction, sleep, MAX_RETRIES, RETRY_DELAY_MS } from './helpers';
export { getSystemInstruction, REMARKS_CATEGORIES } from './systemPrompts';
export { selectWorkTypes, getFilteredHierarchy } from './workTypeSelector';
export { InteractiveMessage, InteractiveAnalysisResult, analyzePhotoInteractive } from './interactiveAnalysis';
import { AbortChecker, checkAbort, formatDuration, formatExamplesForPrompt, trackFieldChange, sleep, MAX_RETRIES, RETRY_DELAY_MS, LogFunction } from './helpers';
import { getSystemInstruction, REMARKS_CATEGORIES } from './systemPrompts';
import { selectWorkTypes, getFilteredHierarchy } from './workTypeSelector';

const ANALYSIS_SCHEMA: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      fileName: { type: Type.STRING }, workType: { type: Type.STRING }, variety: { type: Type.STRING },
      detail: { type: Type.STRING }, station: { type: Type.STRING },
      remarksCategory: { type: Type.STRING, enum: REMARKS_CATEGORIES, description: "備考の種類" },
      measurements: { type: Type.STRING, description: "測定値" }, description: { type: Type.STRING },
      hasBoard: { type: Type.BOOLEAN }, detectedText: { type: Type.STRING }, reasoning: { type: Type.STRING }
    },
    required: ["fileName", "workType", "station", "description", "remarksCategory"]
  }
};

const RELAY_FIELDS = ['station', 'variety', 'workType', 'detail', 'remarks', 'measurements'] as const;
type RelayField = typeof RELAY_FIELDS[number];

const createEmptyResult = (fileName: string): AIAnalysisResult => ({
  fileName, workType: '', variety: '', detail: '', station: '', remarks: '', remarksCategory: '',
  remarksValue: '', description: '', measurements: '', hasBoard: false, detectedText: '', reasoning: '', changeLog: []
});

const parseApiItem = (item: any): AIAnalysisResult => ({
  fileName: item.fileName || "unknown", workType: item.workType || "", variety: item.variety || "",
  detail: item.detail || "", station: item.station || "", remarks: item.remarksCategory || "",
  remarksCategory: item.remarksCategory || "", remarksValue: "", description: item.description || "",
  measurements: item.measurements || "", hasBoard: !!item.hasBoard, detectedText: item.detectedText || "",
  reasoning: item.reasoning || "", changeLog: []
});

const isSafetyRemarks = (remarks: string) =>
  ['朝礼', 'KY', '安全', '新規入場', '点灯', '巡視'].some(kw => remarks.includes(kw));

const applyContextRelay = (results: AIAnalysisResult[]): AIAnalysisResult[] => {
  const lastKnown: Record<RelayField, string> = { station: '', variety: '', workType: '', detail: '', remarks: '', measurements: '' };
  return results.map(res => {
    if (isSafetyRemarks(res.remarks || '')) return res;
    const changeLog = res.changeLog || [], updated: Partial<AIAnalysisResult> = {};
    for (const field of RELAY_FIELDS) {
      const current = res[field] || '', inherited = current || lastKnown[field];
      if (!current && lastKnown[field]) trackFieldChange(changeLog, field, 'context_relay', '', inherited, '前の写真から継承');
      updated[field] = inherited;
      if (current) lastKnown[field] = current;
    }
    return { ...res, ...updated, changeLog };
  });
};

const validateResults = (results: AIAnalysisResult[], onLog?: LogFunction): AIAnalysisResult[] => {
  return results.map(res => {
    const changeLog = res.changeLog || [];
    const { validatedWorkType, validatedVariety, validatedDetail, warnings } =
      validateAgainstMaster(res.workType, res.variety, res.detail, res.remarks);
    warnings.forEach(w => onLog?.(`[MASTER警告] ${res.fileName}: ${w}`, "error"));
    for (const [field, orig, val] of [['workType', res.workType, validatedWorkType], ['variety', res.variety, validatedVariety], ['detail', res.detail, validatedDetail]] as const)
      trackFieldChange(changeLog, field, 'master_validation', orig || '', val, 'マスタに存在しない値を修正');
    if (res.remarks?.match(/[^着手完]工/) && !res.remarks.includes('施工'))
      onLog?.(`🚨 [AI創作検出] ${res.fileName}: 備考「${res.remarks}」に「〜工」が含まれています`, "error");
    let finalRemarks = res.remarks, finalRemarksCategory = res.remarksCategory, finalMeasurements = res.measurements;
    if (res.remarksCategory && isQualityManagementPhoto(res.remarksCategory)) {
      const v = validateTemperatureRemarks(res.remarksCategory || '', res.measurements || '');
      if (!v.isValid) {
        v.warnings.forEach(w => onLog?.(`[温度バリデーション] ${res.fileName}: ${w}`, "error"));
        if (v.correctedCategory) { trackFieldChange(changeLog, 'remarksCategory', 'temperature_validation', res.remarksCategory || '', v.correctedCategory, '温度バリデーションで修正'); finalRemarksCategory = finalRemarks = v.correctedCategory; }
        if (v.correctedValue) { trackFieldChange(changeLog, 'measurements', 'temperature_validation', res.measurements || '', v.correctedValue, '温度バリデーションで修正'); finalMeasurements = v.correctedValue; }
      }
    }
    return { ...res, workType: validatedWorkType, variety: validatedVariety, detail: validatedDetail, remarks: finalRemarks, remarksCategory: finalRemarksCategory, measurements: finalMeasurements, changeLog };
  });
};

const validateApiKey = (apiKey: string) => { if (!apiKey || !hasApiKey()) throw new Error('APIキーが設定されていません。設定画面からAPIキーを入力してください。'); };

export const identifyTargetPhotos = async (
  photos: PhotoRecord[], instruction: string, apiKey: string, onLog?: LogFunction, shouldAbort?: AbortChecker
): Promise<string[]> => {
  validateApiKey(apiKey);
  checkAbort(shouldAbort, 'identifyTargetPhotos開始前');
  const startTime = performance.now(), genAI = new GoogleGenAI({ apiKey });
  const photoSummaries = photos.map(p => ({
    fileName: p.fileName, currentAnalysis: p.analysis ? { workType: p.analysis.workType, remarks: p.analysis.remarks, description: p.analysis.description } : "Not analyzed"
  }));
  const prompt = `User Instruction: "${instruction}"\nGiven the following list of photos and their current analysis, identify which fileNames should be re-analyzed.\nReturn a JSON object with "targetFiles" array.\nPhotos:\n${JSON.stringify(photoSummaries, null, 2)}`;
  try {
    checkAbort(shouldAbort, 'identifyTargetPhotos API呼び出し前');
    const result = await genAI.models.generateContent({ model: PRIMARY_MODEL, contents: [{ role: 'user', parts: [{ text: prompt }] }], config: { responseMimeType: "application/json" } });
    const responseText = result.text || "{}", json = JSON.parse(responseText);
    trackUsage(PRIMARY_MODEL, prompt, responseText, 0, 'identifyTargetPhotos');
    onLog?.(`[PROFILER] identifyTargetPhotos: Total=${formatDuration(performance.now() - startTime)}, Found ${json.targetFiles?.length || 0} targets`, "info");
    return json.targetFiles || [];
  } catch (e) { console.error("Identify targets failed", e); return []; }
};

export const analyzePhotoBatch = async (
  records: PhotoRecord[], instruction: string, batchSize: number, appMode: AppMode, apiKey: string,
  onLog?: LogFunction, onIndividualResult?: (fileName: string, result: AIAnalysisResult) => void,
  shouldAbort?: AbortChecker, onReasoningStream?: (text: string) => void, ruleSettings?: RuleSettings
): Promise<AIAnalysisResult[]> => {
  validateApiKey(apiKey);
  const batchStartTime = performance.now(), genAI = new GoogleGenAI({ apiKey }), getPrimaryModel = () => getSelectedModel();
  onLog?.(`[PROFILER] Batch start: ${records.length} photos, model=${getPrimaryModel()}`, "info");
  records.forEach((r, i) => onLog?.(`  [${i + 1}/${records.length}] ${r.fileName}`, 'info'));

  let filteredHierarchy: object | undefined;
  if (appMode === 'construction' && records.length >= 3) {
    const selectorStart = performance.now(), selectedWorkTypes = await selectWorkTypes(records, apiKey, onLog);
    filteredHierarchy = getFilteredHierarchy(selectedWorkTypes);
    const fullSize = JSON.stringify(formatHierarchyForPrompt()).length, filteredSize = JSON.stringify(filteredHierarchy).length;
    onLog?.(`[PROFILER] Selector: ${formatDuration(performance.now() - selectorStart)}, hierarchy ${fullSize} -> ${filteredSize} chars (${((1 - filteredSize/fullSize) * 100).toFixed(1)}% reduction)`, "info");
  }

  const prepStart = performance.now();
  const inputs = records.map(r => ({ inlineData: { data: extractBase64Data(r.base64), mimeType: r.mimeType } }));
  onLog?.(`[PROFILER] Image prep: ${formatDuration(performance.now() - prepStart)}`, "info");

  let examplesPrompt = "", learnedRulesPrompt = "";
  if (appMode === 'construction') {
    try {
      const activeSession = await getActiveSession();
      if (activeSession) onLog?.(`[EXAMPLES] お手本セッション適用中: "${activeSession.name}" (${activeSession.photoCount}枚)`, "info");
      const examples = await getRelevantExamples(undefined, undefined, 5);
      if (examples.length > 0) { examplesPrompt = formatExamplesForPrompt(examples); onLog?.(`[EXAMPLES] ${examples.length}件のお手本をプロンプトに適用`, "success"); }
    } catch (e) { console.warn('Failed to load examples:', e); }
  }
  try {
    const learnedSettings = await getLearnedSettings();
    if (learnedSettings.rules.length > 0 || learnedSettings.aliases.length > 0) { learnedRulesPrompt = learnedRulesToPromptText(learnedSettings); onLog?.(`[LEARNING] ${learnedSettings.rules.length}件のルール、${learnedSettings.aliases.length}件のエイリアスを適用`, "success"); }
  } catch (e) { console.warn('Failed to load learned settings:', e); }

  const systemPrompt = getSystemInstruction(appMode, instruction, filteredHierarchy, ruleSettings);
  const fullSystemPrompt = [systemPrompt, examplesPrompt, learnedRulesPrompt].filter(Boolean).join('\n\n');
  const prompt = `Analyze these ${records.length} photos. For each photo, output the JSON object matching the schema. Order must match input order.\n**CONTEXT RELAY**: If you cannot clearly determine station/variety from a photo but the previous photo had these values and appears from same location/work type, you may inherit those values.\nPhoto FileNames: ${records.map(r => r.fileName).join(", ")}`;
  let attempt = 0, modelToUse = getPrimaryModel();

  while (attempt < MAX_RETRIES) {
    checkAbort(shouldAbort, 'analyzePhotoBatch リトライループ');
    try {
      const apiStart = performance.now();
      let firstChunkTime: number | null = null;
      const result = await genAI.models.generateContentStream({
        model: modelToUse, contents: [{ role: 'user', parts: [...inputs, { text: prompt }] }],
        config: { systemInstruction: fullSystemPrompt, responseMimeType: "application/json", responseSchema: ANALYSIS_SCHEMA, temperature: 0.1 }
      });
      let fullText = "", chunkCount = 0;
      for await (const chunk of result) {
        checkAbort(shouldAbort, 'analyzePhotoBatch ストリーミング中');
        if (firstChunkTime === null) { firstChunkTime = performance.now() - apiStart; onLog?.(`[PROFILER] Time to first chunk: ${formatDuration(firstChunkTime)}`, "info"); }
        chunkCount++; fullText += chunk.text;
        if (onReasoningStream) { const match = fullText.match(/"reasoning"\s*:\s*"([^"]*)/); if (match?.[1]) onReasoningStream(match[1]); }
      }
      onLog?.(`[PROFILER] API stream complete: ${formatDuration(performance.now() - apiStart)} (${chunkCount} chunks, ${fullText.length} chars)`, "info");
      trackUsage(modelToUse, prompt + systemPrompt, fullText, records.length, 'analyzePhotoBatch');
      onLog?.("Gemini Raw Response", 'json', fullText);

      const parseStart = performance.now();
      let parsed: any;
      try { parsed = JSON.parse(fullText); } catch { const m = fullText.match(/\[.*\]/s); parsed = m ? JSON.parse(m[0]) : (() => { throw new Error("Invalid JSON"); })(); }
      if (!Array.isArray(parsed)) parsed = [parsed];
      const validResults = parsed.map(parseApiItem);
      validResults.forEach(res => onIndividualResult?.(res.fileName, res));
      const matchedResults = records.map(record => validResults.find(r => r.fileName === record.fileName) || (onLog?.(`[WARNING] No AI result found for ${record.fileName}, using placeholder`, 'error'), createEmptyResult(record.fileName)));
      const finalResults = validateResults(applyContextRelay(matchedResults), onLog);
      onLog?.(`[PROFILER] Batch complete: Total=${formatDuration(performance.now() - batchStartTime)}, Per photo=${formatDuration((performance.now() - batchStartTime) / records.length)}, Parse=${formatDuration(performance.now() - parseStart)}`, "success");
      return finalResults;
    } catch (error: any) {
      attempt++;
      const isQuotaError = error.message?.includes("429") || error.status === 429 || error.status === 503;
      onLog?.(`API Error (${modelToUse}) - Attempt ${attempt}/${MAX_RETRIES}`, "error", { message: error.message });
      if (attempt >= MAX_RETRIES) throw error;
      if (isQuotaError) {
        if (modelToUse !== FALLBACK_MODEL) { const prev = modelToUse; modelToUse = modelToUse === 'gemini-2.5-pro' ? 'gemini-2.5-flash' : FALLBACK_MODEL; onLog?.(`Rate Limit hit on ${prev}. Switching to: ${modelToUse}`, "info"); await sleep(RETRY_DELAY_MS); }
        else { onLog?.(`Rate Limit on fallback model. Waiting...`, "info"); await sleep(RETRY_DELAY_MS * 3); }
      } else await sleep(RETRY_DELAY_MS);
    }
  }
  throw new Error("Max retries exceeded");
};
