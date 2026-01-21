/**
 * Gemini API - Helpers Module
 *
 * 共通ヘルパー関数、型定義、定数を集約
 */

import { Type, Schema } from "@google/genai";
import { AnalysisExample, FieldChange, ChangeStage, AIAnalysisResult, PhotoRecord } from "../../types";
import { validateAgainstMaster, validateTemperatureRemarks, isQualityManagementPhoto } from "../../utils/constructionMaster";
import { REMARKS_CATEGORIES } from './systemPrompts';

// ============================================
// 中断処理の共通インターフェース
// ============================================
export type AbortChecker = () => boolean;

/**
 * 中断チェックを行い、中断が要求されている場合はエラーをスロー
 */
export const checkAbort = (shouldAbort?: AbortChecker, context?: string): void => {
  if (shouldAbort?.()) {
    const msg = context ? `処理が中断されました: ${context}` : '処理が中断されました';
    throw new Error(msg);
  }
};

// ============================================
// 定数
// ============================================
const COMPLEX_MODEL = 'gemini-2.5-flash';
export const MAX_RETRIES = 3;
export const RETRY_DELAY_MS = 2000;

// ============================================
// ヘルパー関数
// ============================================

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

/**
 * フィールドの変更を記録する
 */
export const trackFieldChange = (
  changeLog: FieldChange[],
  field: string,
  stage: ChangeStage,
  before: string,
  after: string,
  reason?: string
): void => {
  if (before !== after) {
    changeLog.push({ field, stage, before, after, reason });
  }
};

/**
 * お手本をプロンプト用のテキストに整形
 * Few-shot examples として AI に渡す
 */
export const formatExamplesForPrompt = (examples: AnalysisExample[]): string => {
  if (examples.length === 0) return '';

  const exampleTexts = examples
    .filter(ex => ex.analysis) // analysisが存在するもののみ
    .map((ex, i) => {
      const a = ex.analysis;
      return `
Example ${i + 1}: "${ex.name}"
- workType: "${a.workType || ''}"
- variety: "${a.variety || ''}"
- detail: "${a.detail || ''}"
- station: "${a.station || ''}"
- remarks: "${a.remarks || ''}"
- description: "${a.description || ''}"
- hasBoard: ${a.hasBoard ?? false}
`.trim();
    });

  return `
--- FEW-SHOT EXAMPLES (お手本) ---
The following are correct examples of analysis output. Use them as reference for similar photos:

${exampleTexts.join('\n\n')}

--- END EXAMPLES ---
`;
};

/**
 * エラーメッセージからAPIキーを除去
 */
const sanitizeApiKeyFromMessage = (message: string, apiKey?: string): string => {
  if (!message) return message;
  let sanitized = message;
  if (apiKey) {
    sanitized = sanitized.replace(new RegExp(apiKey, 'g'), '[API_KEY_REDACTED]');
  }
  sanitized = sanitized.replace(/AIza[A-Za-z0-9_-]{30,}/g, '[API_KEY_REDACTED]');
  return sanitized;
};

/**
 * ログ出力用の型定義
 */
export type LogFunction = (msg: string, type: 'info' | 'success' | 'error' | 'json', details?: any) => void;

// ============================================
// バッチ解析用スキーマ
// ============================================

/**
 * バッチ解析用スキーマを生成
 * workTypes が渡された場合、workType フィールドを enum 化して選択肢を強制
 */
export const createBatchAnalysisSchema = (workTypes?: string[]): Schema => ({
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      fileName: { type: Type.STRING },
      workType: workTypes && workTypes.length > 0
        ? {
            type: Type.STRING,
            enum: workTypes,
            description: "工種。必ずこのリストから選択すること"
          }
        : { type: Type.STRING },
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
});

// 後方互換性のためのデフォルトスキーマ
export const BATCH_ANALYSIS_SCHEMA: Schema = createBatchAnalysisSchema();

// ============================================
// AIレスポンスパース関数
// ============================================
export const parseAIResponse = (text: string): any[] => {
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

/**
 * AIレスポンスをAIAnalysisResult形式に変換
 */
export const mapToAnalysisResults = (parsed: any[]): AIAnalysisResult[] => {
  return parsed.map((item: any) => {
    const remarksCategory = item.remarksCategory || "";
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
      measurements: item.measurements || "",
      hasBoard: !!item.hasBoard,
      detectedText: item.detectedText || "",
      reasoning: item.reasoning || "",
      changeLog: []
    };
  });
};

/**
 * AI結果をレコードにマッチング
 */
export const matchResultsToRecords = (
  records: PhotoRecord[],
  validResults: AIAnalysisResult[],
  onLog?: LogFunction
): AIAnalysisResult[] => {
  return records.map(record => {
    const aiResult = validResults.find(res => res.fileName === record.fileName);
    if (aiResult) return aiResult;

    onLog?.(`[WARNING] No AI result found for ${record.fileName}, using placeholder`, 'error');
    return {
      fileName: record.fileName,
      workType: '', variety: '', detail: '', station: '',
      remarks: '', remarksCategory: '', remarksValue: '',
      description: '', measurements: '',
      hasBoard: false, detectedText: '', reasoning: '',
      changeLog: []
    };
  });
};

// ============================================
// コンテキスト継承 (Context Relay)
// ============================================
const isSafetyRemarks = (remarks: string): boolean => {
  const safetyKeywords = ['朝礼', 'KY', '安全', '新規入場', '点灯', '巡視'];
  return safetyKeywords.some(kw => remarks.includes(kw));
};

// 処分関連remarksは写真ごとに異なるため継承しない
const isDisposalRemarks = (remarks: string): boolean => {
  const disposalKeywords = ['処分', '計量', '許可票', 'アスファルト塊', 'As塊'];
  return disposalKeywords.some(kw => remarks.includes(kw));
};

// remarksを継承すべきでないカテゴリ
const shouldSkipRemarksInheritance = (remarks: string): boolean => {
  return isSafetyRemarks(remarks) || isDisposalRemarks(remarks);
};

export const applyContextRelay = (results: AIAnalysisResult[]): AIAnalysisResult[] => {
  let lastKnown = { station: "", variety: "", workType: "", detail: "", remarks: "", measurements: "" };

  return results.map(res => {
    // 安全管理写真は完全にスキップ
    if (isSafetyRemarks(res.remarks || '')) return res;

    const changeLog = res.changeLog || [];
    const updated: any = { ...res };

    // remarksは継承しない（写真ごとに固有であるべき）
    // station, variety, workType, detail, measurementsのみ継承
    const fieldsToInherit = ['station', 'variety', 'workType', 'detail', 'measurements'] as const;

    for (const field of fieldsToInherit) {
      const inherited = res[field] || lastKnown[field];
      trackFieldChange(changeLog, field, 'context_relay', res[field] || '', inherited, '前の写真から継承');
      updated[field] = inherited;
      if (res[field]) lastKnown[field] = res[field];
    }

    // remarksは継承しない（AIが返した値をそのまま使用）
    // ただし、lastKnownは更新して同じremarksが続く場合に備える
    if (res.remarks) lastKnown.remarks = res.remarks;

    return { ...updated, changeLog };
  });
};

// ============================================
// マスタバリデーション
// ============================================
export const validateResults = (
  results: AIAnalysisResult[],
  onLog?: LogFunction
): AIAnalysisResult[] => {
  return results.map(res => {
    const changeLog = res.changeLog || [];
    const { validatedWorkType, validatedVariety, validatedDetail, warnings } =
      validateAgainstMaster(res.workType, res.variety, res.detail, res.remarks);

    if (warnings.length > 0) {
      onLog?.(`[MASTER警告] ${res.fileName}: ${warnings.join(', ')}`, "error");
    }

    trackFieldChange(changeLog, 'workType', 'master_validation', res.workType || '', validatedWorkType, 'マスタに存在しない値を修正');
    trackFieldChange(changeLog, 'variety', 'master_validation', res.variety || '', validatedVariety, 'マスタに存在しない値を修正');
    trackFieldChange(changeLog, 'detail', 'master_validation', res.detail || '', validatedDetail, 'マスタに存在しない値を修正');

    if (res.remarks?.match(/[^着手完]工/) && !res.remarks.includes('施工')) {
      onLog?.(`🚨 [AI創作検出] ${res.fileName}: 備考「${res.remarks}」に「〜工」が含まれています`, "error");
    }

    let finalRemarks = res.remarks;
    let finalRemarksCategory = res.remarksCategory;
    let finalMeasurements = res.measurements;

    if (res.remarksCategory && isQualityManagementPhoto(res.remarksCategory)) {
      const tempValidation = validateTemperatureRemarks(res.remarksCategory || '', res.measurements || '');

      if (!tempValidation.isValid) {
        tempValidation.warnings.forEach(w => onLog?.(`[温度バリデーション] ${res.fileName}: ${w}`, "error"));

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
};
