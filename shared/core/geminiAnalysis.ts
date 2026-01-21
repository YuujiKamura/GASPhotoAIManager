/**
 * Gemini API - Core Analysis Module (Environment-agnostic)
 *
 * CLI/Web両環境で使用可能な解析コアロジック
 * ブラウザ依存（IndexedDB等）を排除
 *
 * ## 変更履歴
 * - 2026-01-17: 工種マスタ対応追加（hierarchyオプション）
 */

import { GoogleGenAI, Type, Schema } from "@google/genai";

// ============================================
// 型定義
// ============================================

export interface PhotoInput {
  fileName: string;
  base64: string;
  mimeType: string;
  date?: number;
}

export interface AnalysisResult {
  fileName: string;
  workType: string;
  variety?: string;
  detail?: string;
  station: string;
  remarks: string;
  remarksCategory?: string;
  remarksValue?: string;
  description: string;
  measurements?: string;
  hasBoard: boolean;
  detectedText: string;
  reasoning?: string;
}

export type AppMode = 'construction' | 'general';

export type LogFunction = (
  msg: string,
  type: 'info' | 'success' | 'error' | 'json',
  details?: unknown
) => void;

export type AbortChecker = () => boolean;

export type ProgressCallback = (
  current: number,
  total: number,
  fileName: string,
  result?: AnalysisResult
) => void;

export interface AnalyzeOptions {
  apiKey: string;
  mode?: AppMode;
  instruction?: string;
  batchSize?: number;
  model?: string;
  onLog?: LogFunction;
  onProgress?: ProgressCallback;
  shouldAbort?: AbortChecker;
  /** 工種マスタ階層データ（工事写真モードで使用） */
  hierarchy?: Record<string, unknown>;
}

// ============================================
// 定数
// ============================================

export const PRIMARY_MODEL = 'gemini-2.5-flash';
export const FALLBACK_MODEL = 'gemini-2.0-flash';
export const MAX_RETRIES = 3;
export const RETRY_DELAY_MS = 2000;

export const REMARKS_CATEGORIES = [
  "到着温度", "敷均し温度", "初期締固め前温度", "開放温度",
  "アスファルト混合物温度測定",
  "現場密度測定",
  "転圧状況", "敷均し状況", "舗設状況", "初期転圧状況", "2次転圧状況",
  "乳剤散布状況", "端部乳剤塗布状況", "養生砂散布状況", "清掃状況",
  "掘削状況", "積込状況", "取壊し状況", "据付状況", "設置状況",
  "剥取状況", "既設舗装厚さ確認",
  "処分施設", "処分施設許可票", "計量状況", "処分状況",
  "着手前", "完了", "竣工", "施工完了", "既済部分",
  "不陸整正出来形", "路盤厚出来形", "表層厚出来形", "幅員出来形",
  "朝礼実施状況", "朝礼・KYミーティング実施状況", "朝礼状況",
  "KY活動状況", "危険予知活動状況", "KYミーティング実施状況",
  "新規入場者教育状況", "新規入場者教育実施状況",
  "保安施設設置状況", "点灯確認状況", "安全巡視状況",
  "安全訓練実施状況", "避難訓練実施状況",
  "災害発生状況", "事故発生状況", "被害状況",
  "環境対策状況", "騒音対策状況", "粉塵対策状況",
  ""
];

// ============================================
// スキーマ定義
// ============================================

const BATCH_ANALYSIS_SCHEMA: Schema = {
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
        description: "備考の種類"
      },
      measurements: { type: Type.STRING },
      description: { type: Type.STRING },
      hasBoard: { type: Type.BOOLEAN },
      detectedText: { type: Type.STRING },
      reasoning: { type: Type.STRING }
    },
    required: ["fileName", "workType", "station", "description", "remarksCategory"]
  }
};

// ============================================
// ヘルパー関数
// ============================================

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const checkAbort = (shouldAbort?: AbortChecker, context?: string): void => {
  if (shouldAbort?.()) {
    const msg = context ? `処理が中断されました: ${context}` : '処理が中断されました';
    throw new Error(msg);
  }
};

const extractBase64Data = (base64WithPrefix: string): string => {
  if (base64WithPrefix.includes(',')) {
    return base64WithPrefix.split(',')[1];
  }
  return base64WithPrefix;
};

const formatShootingTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

// ============================================
// システムプロンプト生成
// ============================================

const getSystemInstruction = (
  mode: AppMode,
  instruction?: string,
  hierarchy?: Record<string, unknown>
): string => {
  if (mode === 'general') {
    return `
You are a professional photo archivist. Analyze the image and provide structured metadata.
1. Category: Main subject (e.g., Landscape, Family, Work).
2. Sub-category: Specifics (e.g., Mountain, Birthday, Office).
3. Location: Inferred or read from text.
4. Description: A concise caption explaining the photo.
${instruction ? `\nUSER OVERRIDE INSTRUCTION: ${instruction}` : ""}
    `.trim();
  }

  // 工種マスタから工種一覧を抽出（提供されている場合）
  let workTypesList = '';
  if (hierarchy && hierarchy['直接工事費']) {
    const root = hierarchy['直接工事費'] as Record<string, unknown>;
    const types = new Set<string>();
    for (const catKey in root) {
      Object.keys(root[catKey] as Record<string, unknown>).forEach(k => types.add(k));
    }
    workTypesList = Array.from(types).join(', ');
  }

  // Construction Mode
  return `
You are a Japanese construction site supervisor creating a formal photo ledger (工事写真帳).

**PHOTO CATEGORIES (写真区分)**:
1. 着手前及び完成写真 - Before construction / After completion
2. 施工状況写真 - Construction in progress (active work)
3. 安全管理写真 - Safety management (morning meetings, KY activities)
4. 使用材料写真 - Materials
5. 品質管理写真 - Quality control (temperature, density)
6. 出来形管理写真 - Finished dimension measurement
7. 災害写真 - Disaster
8. 事故写真 - Accident
9. その他 - Others

${workTypesList ? `**AVAILABLE WORK TYPES (工種一覧)**:\n${workTypesList}\n\nYou MUST select workType from this list. Do not create new work types.\n` : ''}
**OUTPUT FORMAT**:
- workType: 工種 (e.g., 舗装工, 道路土工)
- variety: 種別 (e.g., 舗装打換え工)
- detail: 細別 (e.g., 表層工, 舗装版破砕)
- station: 測点 format "地名 No.整数" (e.g., "小峯2丁目 No.4")
- remarksCategory: Select from enum (e.g., "転圧状況", "着手前")
- measurements: All numerical values with units
- description: Important info from blackboard or scene
- hasBoard: true if blackboard is visible
- detectedText: OCR text from blackboard

**SAFETY PHOTOS (安全管理写真)**:
For safety photos, set workType="", variety="", detail="".
Use remarksCategory like "朝礼実施状況", "KY活動状況", "新規入場者教育状況"

${instruction ? `\nUSER INSTRUCTION: ${instruction}` : ""}
  `.trim();
};

// ============================================
// AIレスポンス処理
// ============================================

const parseAIResponse = (text: string): unknown[] => {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    const match = text.match(/\[.*\]/s);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error("Invalid JSON response from AI");
  }
};

const mapToAnalysisResults = (parsed: unknown[]): AnalysisResult[] => {
  return parsed.map((item: unknown) => {
    const obj = item as Record<string, unknown>;
    const remarksCategory = (obj.remarksCategory as string) || "";
    return {
      fileName: (obj.fileName as string) || "unknown",
      workType: (obj.workType as string) || "",
      variety: (obj.variety as string) || "",
      detail: (obj.detail as string) || "",
      station: (obj.station as string) || "",
      remarks: remarksCategory,
      remarksCategory: remarksCategory,
      remarksValue: "",
      description: (obj.description as string) || "",
      measurements: (obj.measurements as string) || "",
      hasBoard: !!obj.hasBoard,
      detectedText: (obj.detectedText as string) || "",
      reasoning: (obj.reasoning as string) || "",
    };
  });
};

// ============================================
// メイン解析関数
// ============================================

/**
 * 写真をバッチ解析
 */
export async function analyzePhotos(
  photos: PhotoInput[],
  options: AnalyzeOptions
): Promise<AnalysisResult[]> {
  const {
    apiKey,
    mode = 'construction',
    instruction,
    batchSize = 5,
    model = PRIMARY_MODEL,
    onLog,
    onProgress,
    shouldAbort,
    hierarchy,
  } = options;

  if (!apiKey) {
    throw new Error('APIキーが設定されていません');
  }

  const startTime = Date.now();
  const genAI = new GoogleGenAI({ apiKey });
  const allResults: AnalysisResult[] = [];

  onLog?.(`解析開始: ${photos.length}枚, モデル=${model}`, 'info');

  // バッチに分割して処理
  const batches: PhotoInput[][] = [];
  for (let i = 0; i < photos.length; i += batchSize) {
    batches.push(photos.slice(i, i + batchSize));
  }

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    checkAbort(shouldAbort, `バッチ ${batchIndex + 1}/${batches.length}`);

    const batch = batches[batchIndex];
    onLog?.(`バッチ ${batchIndex + 1}/${batches.length} (${batch.length}枚)`, 'info');

    const batchResults = await analyzeBatch(
      genAI,
      batch,
      mode,
      instruction,
      model,
      onLog,
      shouldAbort,
      hierarchy
    );

    // 結果を通知
    for (const result of batchResults) {
      const photoIndex = photos.findIndex(p => p.fileName === result.fileName);
      onProgress?.(
        allResults.length + 1,
        photos.length,
        result.fileName,
        result
      );
    }

    allResults.push(...batchResults);
  }

  const totalTime = Date.now() - startTime;
  onLog?.(
    `解析完了: ${allResults.length}枚, 合計時間=${formatDuration(totalTime)}`,
    'success'
  );

  return allResults;
}

/**
 * 単一バッチの解析
 */
async function analyzeBatch(
  genAI: GoogleGenAI,
  photos: PhotoInput[],
  mode: AppMode,
  instruction: string | undefined,
  model: string,
  onLog?: LogFunction,
  shouldAbort?: AbortChecker,
  hierarchy?: Record<string, unknown>
): Promise<AnalysisResult[]> {
  const systemPrompt = getSystemInstruction(mode, instruction, hierarchy);

  // 画像入力を構築
  const inputs = photos.map(p => ({
    inlineData: {
      data: extractBase64Data(p.base64),
      mimeType: p.mimeType
    }
  }));

  // プロンプト構築
  const photoInfoList = photos.map(p => {
    const timeInfo = p.date ? formatShootingTime(p.date) : 'unknown';
    return `${p.fileName} (撮影時間: ${timeInfo})`;
  });

  const prompt = `
Analyze these ${photos.length} photos.
For each photo, output the JSON object matching the schema.
Order must match the input order.

Photo Info:
${photoInfoList.join("\n")}
  `.trim();

  let attempt = 0;
  let currentModel = model;

  while (attempt < MAX_RETRIES) {
    checkAbort(shouldAbort, 'API呼び出し');

    try {
      const apiStartTime = Date.now();

      const result = await genAI.models.generateContentStream({
        model: currentModel,
        contents: [{ role: 'user', parts: [...inputs, { text: prompt }] }],
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: BATCH_ANALYSIS_SCHEMA,
          temperature: 0.1
        }
      });

      let fullText = "";
      for await (const chunk of result) {
        checkAbort(shouldAbort, 'ストリーミング中');
        fullText += chunk.text;
      }

      const apiTime = Date.now() - apiStartTime;
      onLog?.(`API応答: ${formatDuration(apiTime)}, ${fullText.length}文字`, 'info');

      const parsed = parseAIResponse(fullText);
      return mapToAnalysisResults(parsed);

    } catch (error: unknown) {
      attempt++;
      const err = error as Error & { status?: number };
      const isQuotaError = err.message?.includes("429") || err.status === 429 || err.status === 503;

      onLog?.(`APIエラー (${currentModel}) - 試行 ${attempt}/${MAX_RETRIES}: ${err.message}`, 'error');

      if (attempt >= MAX_RETRIES) {
        throw error;
      }

      if (isQuotaError) {
        // フォールバックモデルに切り替え
        if (currentModel !== FALLBACK_MODEL) {
          currentModel = FALLBACK_MODEL;
          onLog?.(`レート制限のためフォールバック: ${currentModel}`, 'info');
        }
        await sleep(RETRY_DELAY_MS * 3);
      } else {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw new Error("最大リトライ回数を超えました");
}

/**
 * 単一写真の解析
 */
export async function analyzePhoto(
  photo: PhotoInput,
  options: AnalyzeOptions
): Promise<AnalysisResult> {
  const results = await analyzePhotos([photo], { ...options, batchSize: 1 });
  return results[0];
}
