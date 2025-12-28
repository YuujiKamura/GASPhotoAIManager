/**
 * Gemini API - Helpers Module
 *
 * 共通ヘルパー関数、型定義、定数を集約
 */

import { AnalysisExample, FieldChange, ChangeStage } from "../../types";

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
export const COMPLEX_MODEL = 'gemini-3.0-flash';
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

  const exampleTexts = examples.map((ex, i) => {
    const a = ex.analysis;
    return `
Example ${i + 1}: "${ex.name}"
- workType: "${a.workType}"
- variety: "${a.variety || ''}"
- detail: "${a.detail || ''}"
- station: "${a.station}"
- remarks: "${a.remarks}"
- description: "${a.description}"
- hasBoard: ${a.hasBoard}
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
export const sanitizeApiKeyFromMessage = (message: string, apiKey?: string): string => {
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
