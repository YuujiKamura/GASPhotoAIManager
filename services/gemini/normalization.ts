/**
 * Gemini API - Normalization Module
 *
 * 正規化・シーン割当関連の関数を集約
 * - getNormalizationProposals: 正規化提案を取得
 * - applyNormalizationCorrections: 正規化修正を適用
 * - normalizeDataConsistency: 後方互換性のためのラッパー
 * - assignSceneIds: シーンIDを割り当て
 * - refinePairContext: ペアコンテキストを改善
 */

import { GoogleGenAI } from "@google/genai";
import { PhotoRecord } from "../../types";
import { extractBase64Data } from "../../utils/imageUtils";
import { detectUnknownTerms } from "../../utils/constructionMaster";
import { trackUsage } from "../usageTracker";
import { AbortChecker, checkAbort } from './analysis';
import { isAutoApiEnabled } from './apiKey';
import { PRIMARY_MODEL, FALLBACK_MODEL } from './models';

// ============================================
// 定数
// ============================================
const COMPLEX_MODEL = 'gemini-2.5-flash';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// ============================================
// ヘルパー関数
// ============================================

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================
// 型定義
// ============================================

/**
 * 正規化の修正提案の型
 */
export interface NormalizationCorrection {
  fileName: string;
  workType?: string;
  variety?: string;
  detail?: string;
  station?: string;
  remarks?: string;
}

export interface NormalizationResult {
  corrections: NormalizationCorrection[];
  originalData: Array<{
    fileName: string;
    workType: string;
    variety: string;
    detail: string;
    station: string;
    remarks: string;
  }>;
}

// ============================================
// 正規化提案の取得
// ============================================

/**
 * 修正提案を取得（適用はしない）
 * NOTE: autoNormalization が false の場合、API呼び出しをスキップ
 */
export const getNormalizationProposals = async (
  records: PhotoRecord[],
  apiKey: string,
  customPrompt?: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error' | 'json', details?: any) => void,
  shouldAbort?: AbortChecker
): Promise<NormalizationResult> => {
  // 自動正規化が無効の場合、API呼び出しをスキップ（customPromptがある場合は明示的な呼び出しなので実行）
  if (!isAutoApiEnabled('autoNormalization') && !customPrompt) {
    onLog?.('[NORMALIZATION] 自動正規化がOFF - API呼び出しをスキップ', 'info');
    return { corrections: [], originalData: [] };
  }

  checkAbort(shouldAbort, 'getNormalizationProposals開始前');

  const completedRecords = records.filter(r => r.status === 'done' && r.analysis);
  if (completedRecords.length === 0) {
    return { corrections: [], originalData: [] };
  }

  const genAI = new GoogleGenAI({ apiKey });

  const dataSnapshot = completedRecords.map(r => ({
    fileName: r.fileName,
    workType: r.analysis!.workType || '',
    variety: r.analysis!.variety || '',
    detail: r.analysis!.detail || '',
    station: r.analysis!.station || '',
    remarks: r.analysis!.remarks || ''
  }));

  onLog?.(`Running consistency check with ${COMPLEX_MODEL}...`, "info");

  const userInstruction = customPrompt ? `\n\n**USER INSTRUCTION:** ${customPrompt}` : '';

  const prompt = `
    You are a data consistency expert for construction photos.
    Review the following list of records.

    **CRITICAL RULES:**
    1. DO NOT create new terms - only use what exists in the input
    2. DO NOT add "〜工" suffix to remarks (〜工 is only for workType/variety/detail)
    3. DO NOT change remarks that contain measurement values (numbers, ℃, mm, cm, m, %)
    4. PRESERVE specific data from each photo - do not unify remarks across photos
    5. If unsure, leave the field UNCHANGED
    6. NEVER invent terms like "温度管理工", "温度測定工", "密度管理工"

    **TEMPERATURE PHOTO CYCLES (温度管理写真のルール):**
    Temperature management photos come in specific cycles. DO NOT unify them.

    Per truck (1サイクル = 9枚):
    - 到着温度 (arrival temp): 全景 + ボードアップ + 温度計アップ = 3枚
    - 敷均し温度 (spread temp): 全景 + ボードアップ + 温度計アップ = 3枚
    - 初期締固め前温度 (initial compaction temp): 全景 + ボードアップ + 温度計アップ = 3枚

    Per day/location (1日1回):
    - 開放温度 (release temp): 全景 + ボードアップ + 温度計アップ = 3枚

    IMPORTANT:
    - Each truck has DIFFERENT temperature values - do not unify!
    - "到着温度 161.1℃" and "到着温度 158.5℃" are from different trucks - keep both!
    - "敷均し温度 155.3℃" is specific to that measurement - do not change!
    - Photos in the same cycle share the SAME temperature value

    VALID remarks for temperature photos:
    - "到着温度 161.1℃"
    - "敷均し温度 155.3℃"
    - "初期締固め前温度 148.8℃"
    - "開放温度 50℃"
    - "アスファルト混合物温度測定 到着温度 161.1℃"

    INVALID remarks (do not create these):
    - "温度管理工" ❌
    - "温度測定工" ❌
    - "温度測定" ❌ (missing actual value)
    - "温度管理" ❌ (too vague)

    TASKS:
    1. **Normalize Station Names (測点) ONLY**:
       - Fix OCR errors (e.g., "No.0+00" vs "No.0.00" -> unify to "No.X+XX").

    2. **Fix Hierarchy Errors (RARE)**:
       - Only if "Detail" is clearly wrong (e.g., "完了", "状況" as detail).
       - Move status words to "Remarks", clear "Detail".

    3. **DO NOT touch Remarks unless clearly wrong**:
       - Keep measurement values intact (e.g., "出荷時156℃", "t=50mm")
       - Keep specific descriptions from board photos
       - DO NOT simplify "アスファルト混合物温度測定 出荷時156℃" to just "温度測定"
    ${userInstruction}

    INPUT DATA:
    ${JSON.stringify(dataSnapshot, null, 2)}

    OUTPUT:
    Return JSON: { "corrections": [ { "fileName": "...", "workType": "...", "variety": "...", "detail": "...", "station": "...", "remarks": "..." } ] }
    Only include records that need changing. If no changes needed, return { "corrections": [] }.
  `;

  let modelToUse = COMPLEX_MODEL;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    checkAbort(shouldAbort, 'getNormalizationProposals リトライループ');
    try {
      const result = await genAI.models.generateContent({
        model: modelToUse,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json"
        }
      });

      const text = result.text;
      if (!text) throw new Error("No text response");

      trackUsage(modelToUse, prompt, text, 0, 'getNormalizationProposals');
      const json = JSON.parse(text);
      onLog?.("Normalization proposals received", "json", json);

      const corrections = (json.corrections || []) as NormalizationCorrection[];

      // マスタ外用語の検出（警告のみ）
      for (const c of corrections) {
        const warnings = detectUnknownTerms(
          c.workType || '',
          c.variety || '',
          c.detail || '',
          c.remarks || ''
        );
        if (warnings.length > 0) {
          onLog?.(`🚨 提案に問題: ${c.fileName}: ${warnings.join(', ')}`, "error");
        }
      }

      return { corrections, originalData: dataSnapshot };

    } catch (e: any) {
      attempt++;
      const isQuotaError = e.message?.includes("429") || e.status === 429;
      onLog?.(`Normalization Error (${modelToUse}) - ${attempt}/${MAX_RETRIES}`, "error", e.message);

      if (attempt < MAX_RETRIES) {
        if (isQuotaError && modelToUse !== FALLBACK_MODEL) {
          modelToUse = FALLBACK_MODEL;
          onLog?.(`Rate limit hit, switching to ${FALLBACK_MODEL}`, "info");
        }
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  onLog?.("Normalization failed (Non-fatal)", "error");
  return { corrections: [], originalData: dataSnapshot };
};

// ============================================
// 正規化修正の適用
// ============================================

/**
 * 承認された修正を適用
 */
export const applyNormalizationCorrections = (
  records: PhotoRecord[],
  corrections: NormalizationCorrection[]
): PhotoRecord[] => {
  return records.map(r => {
    const fix = corrections.find(c => c.fileName === r.fileName);
    if (fix && r.analysis) {
      return {
        ...r,
        analysis: {
          ...r.analysis,
          workType: fix.workType !== undefined ? fix.workType : r.analysis.workType,
          variety: fix.variety !== undefined ? fix.variety : r.analysis.variety,
          detail: fix.detail !== undefined ? fix.detail : r.analysis.detail,
          station: fix.station !== undefined ? fix.station : r.analysis.station,
          remarks: fix.remarks !== undefined ? fix.remarks : r.analysis.remarks
        }
      };
    }
    return r;
  });
};

/**
 * 後方互換性のため残す（内部で新しい関数を使用）
 */
const normalizeDataConsistency = async (
  records: PhotoRecord[],
  apiKey: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error' | 'json', details?: any) => void,
  shouldAbort?: AbortChecker
): Promise<PhotoRecord[]> => {
  const { corrections } = await getNormalizationProposals(records, apiKey, undefined, onLog, shouldAbort);
  if (corrections.length === 0) return records;
  return applyNormalizationCorrections(records, corrections);
};

// ============================================
// シーンID割当
// ============================================

/**
 * Visual Anchoring & Clustering
 * Optimized to use cache for visual feature extraction.
 *
 * NOTE: autoSceneAssignment が false の場合、API呼び出しをスキップ
 */
export const assignSceneIds = async (
  records: PhotoRecord[],
  apiKey: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error' | 'json', details?: any) => void,
  shouldAbort?: AbortChecker
): Promise<{ fileName: string, sceneId: string, phase: 'before' | 'after' | 'status', visualAnchors: string }[]> => {
  // 自動シーン割当が無効の場合、API呼び出しをスキップ
  if (!isAutoApiEnabled('autoSceneAssignment')) {
    onLog?.('[SCENE] 自動シーン割当がOFF - API呼び出しをスキップ', 'info');
    // 空の配列を返す（ペアリングは測点ベースで行われる）
    return [];
  }

  checkAbort(shouldAbort, 'assignSceneIds開始前');

  const genAI = new GoogleGenAI({ apiKey });

  // Step 1: Feature Extraction (Visual Anchors)
  // Only run for photos that don't have visualAnchors yet.
  const needsExtraction = records.filter(r => !r.analysis?.visualAnchors);
  const cachedFeatures = records.filter(r => r.analysis?.visualAnchors).map(r => ({
    fileName: r.fileName,
    visualAnchors: r.analysis!.visualAnchors!,
    phase: r.analysis!.phase || 'status'
  }));

  let newFeatures: { fileName: string, visualAnchors: string, phase: 'before' | 'after' | 'status' }[] = [];

  if (needsExtraction.length > 0) {
    onLog?.(`Extracting visual features for ${needsExtraction.length} new photos...`, 'info');

    // Process in batches of 5 to avoid payload limits
    const BATCH_SIZE = 5;
    for (let i = 0; i < needsExtraction.length; i += BATCH_SIZE) {
      checkAbort(shouldAbort, 'assignSceneIds バッチ処理');
      const batch = needsExtraction.slice(i, i + BATCH_SIZE);

      const inputs = batch.map(r => ({
        fileName: r.fileName,
        image: {
          inlineData: {
            data: extractBase64Data(r.base64),
            mimeType: r.mimeType
          }
        }
      }));

      const promptParts: any[] = [];
      promptParts.push({
        text: `
        各写真の「背景の特徴(visualAnchors)」と「工事段階(phase)」を抽出してください。

        **タスク1: 背景の特徴 (visualAnchors)**
        - 場所を特定するための恒久的な特徴を記述（建物、電柱、山、道路形状など）。
        - 可変要素（車、人、天気）は除外。
        - 簡潔に（例：「左に白い家、奥に赤い看板」）。
        **タスク2: 工事段階 (phase)**
        - "before": 着手前（未舗装、古い舗装、雑草）
        - "after": 完了後（新しいアスファルト、きれいな白線）
        - "status": 施工中（重機、作業員、掘削中）
        **出力形式**:
        {
          "features": [
            { "fileName": "...", "visualAnchors": "...", "phase": "..." }
          ]
        }
      `});

      inputs.forEach(input => {
        promptParts.push(input.image);
        promptParts.push({ text: `[${input.fileName}]\n` });
      });

      try {
        const result = await genAI.models.generateContent({
          model: COMPLEX_MODEL,
          contents: [{ role: 'user', parts: promptParts }],
          config: { responseMimeType: "application/json" }
        });

        const text = result.text || "{}";
        trackUsage(COMPLEX_MODEL, 'featureExtraction', text, batch.length, 'assignSceneIds:extract');
        const json = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
        if (json.features) {
          newFeatures = [...newFeatures, ...json.features];
        }
      } catch (e: any) {
        onLog?.(`Feature extraction failed for batch ${i}`, 'error', e.message);
      }
    }
  } else {
    onLog?.("Using cached visual features for all photos.", 'success');
  }

  const allFeatures = [...cachedFeatures, ...newFeatures];

  // Step 2: Clustering (Text-only)
  // Group photos based on visualAnchors descriptions.
  if (allFeatures.length === 0) return [];

  onLog?.(`Clustering ${allFeatures.length} photos based on visual anchors...`, 'info');

  const clusteringPrompt = `
    以下の写真リストを、背景の特徴(visualAnchors)に基づいて撮影場所ごとにグループ化してください。

    **ルール**:
    - 特徴が似ている写真は同じ場所(sceneId)とする。
    - sceneIdは "S1", "S2" のように連番を振る。
    - phase (before/after/status) は入力値をそのまま保持する。

    **入力データ**:
    ${JSON.stringify(allFeatures, null, 2)}

    **出力形式**:
    {
      "assignments": [
        { "fileName": "...", "sceneId": "...", "phase": "...", "visualAnchors": "..." }
      ]
    }
  `;

  try {
    const result = await genAI.models.generateContent({
      model: PRIMARY_MODEL, // Text-only is fast and cheap
      contents: [{ role: 'user', parts: [{ text: clusteringPrompt }] }],
      config: { responseMimeType: "application/json" }
    });

    const text = result.text || "{}";
    trackUsage(PRIMARY_MODEL, clusteringPrompt, text, 0, 'assignSceneIds:cluster');
    const json = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
    return json.assignments || [];

  } catch (e: any) {
    onLog?.("Clustering failed.", 'error', e.message);
    // Fallback: Return features as is with unique IDs
    return allFeatures.map((f, i) => ({
      fileName: f.fileName,
      visualAnchors: f.visualAnchors,
      phase: (f.phase === 'unknown' ? 'status' : f.phase) as 'before' | 'after' | 'status',
      sceneId: `S${i}`
    }));
  }
};

// ============================================
// ペアコンテキストの改善
// ============================================

/**
 * ペアコンテキストを改善
 * Logic remains similar but now relies on Scene IDs if available
 */
const refinePairContext = async (
  sortedRecords: PhotoRecord[],
  apiKey: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error' | 'json', details?: any) => void
): Promise<PhotoRecord[]> => {
  // For now, we trust the "Phase" from assignSceneIds more.
  return sortedRecords;
};

// Deprecated old sorting function, kept as stub if needed or removed
const sortPhotosByScene = async () => [];
