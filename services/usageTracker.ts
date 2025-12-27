/**
 * API使用量・コスト追跡サービス
 * すべてのGemini APIコールを追跡し、コストを可視化する
 */

// Gemini料金表 (2024年12月時点、USD)
const PRICING = {
  // Gemini 1.5 Flash
  'gemini-1.5-flash': {
    inputPerMillion: 0.075,
    outputPerMillion: 0.30,
  },
  'gemini-2.5-flash': {
    inputPerMillion: 0.075,
    outputPerMillion: 0.30,
  },
  // Gemini 1.5 Pro
  'gemini-1.5-pro': {
    inputPerMillion: 1.25,
    outputPerMillion: 5.00,
  },
  'gemini-3-pro-preview': {
    inputPerMillion: 1.25,
    outputPerMillion: 5.00,
  },
  // デフォルト（不明なモデル用）
  'default': {
    inputPerMillion: 1.25,
    outputPerMillion: 5.00,
  }
};

// 画像あたりの推定トークン数
const TOKENS_PER_IMAGE = 258;

// 1文字あたりの推定トークン数（日本語）
const TOKENS_PER_CHAR_JP = 0.5;
const TOKENS_PER_CHAR_EN = 0.25;

export interface UsageRecord {
  timestamp: Date;
  model: string;
  inputTokens: number;
  outputTokens: number;
  imageCount: number;
  estimatedCost: number;
  operation: string;
}

export interface UsageSummary {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalImages: number;
  totalImageSizeBytes: number;
  estimatedCostUSD: number;
  estimatedCostJPY: number;
  records: UsageRecord[];
}

// セッション中の使用量を保持
let usageSummary: UsageSummary = {
  totalCalls: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalImages: 0,
  totalImageSizeBytes: 0,
  estimatedCostUSD: 0,
  estimatedCostJPY: 0,
  records: []
};

// 為替レート（概算）
const USD_TO_JPY = 150;

// リスナー（UI更新用）
type UsageListener = (summary: UsageSummary) => void;
const listeners: UsageListener[] = [];

export const addUsageListener = (listener: UsageListener) => {
  listeners.push(listener);
};

export const removeUsageListener = (listener: UsageListener) => {
  const idx = listeners.indexOf(listener);
  if (idx >= 0) listeners.splice(idx, 1);
};

const notifyListeners = () => {
  listeners.forEach(l => l({ ...usageSummary, records: [...usageSummary.records] }));
};

/**
 * テキストからトークン数を推定
 */
export const estimateTokens = (text: string): number => {
  if (!text) return 0;
  // 日本語文字の割合を推定
  const jpChars = (text.match(/[\u3000-\u9fff]/g) || []).length;
  const otherChars = text.length - jpChars;
  return Math.ceil(jpChars * TOKENS_PER_CHAR_JP + otherChars * TOKENS_PER_CHAR_EN);
};

/**
 * 画像のトークン数を推定
 */
export const estimateImageTokens = (imageCount: number): number => {
  return imageCount * TOKENS_PER_IMAGE;
};

/**
 * Base64画像のサイズを取得
 */
export const getBase64Size = (base64: string): number => {
  // data:image/jpeg;base64, の部分を除去
  const data = base64.includes(',') ? base64.split(',')[1] : base64;
  // Base64は3バイトを4文字で表現
  return Math.ceil(data.length * 0.75);
};

/**
 * コストを計算
 */
const calculateCost = (model: string, inputTokens: number, outputTokens: number): number => {
  const pricing = PRICING[model as keyof typeof PRICING] || PRICING.default;
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
  return inputCost + outputCost;
};

/**
 * API使用量を記録
 */
export const trackUsage = (
  model: string,
  inputText: string,
  outputText: string,
  imageCount: number,
  operation: string
): UsageRecord => {
  const inputTokens = estimateTokens(inputText) + estimateImageTokens(imageCount);
  const outputTokens = estimateTokens(outputText);
  const estimatedCost = calculateCost(model, inputTokens, outputTokens);

  const record: UsageRecord = {
    timestamp: new Date(),
    model,
    inputTokens,
    outputTokens,
    imageCount,
    estimatedCost,
    operation
  };

  usageSummary.totalCalls++;
  usageSummary.totalInputTokens += inputTokens;
  usageSummary.totalOutputTokens += outputTokens;
  usageSummary.totalImages += imageCount;
  usageSummary.estimatedCostUSD += estimatedCost;
  usageSummary.estimatedCostJPY = usageSummary.estimatedCostUSD * USD_TO_JPY;
  usageSummary.records.push(record);

  notifyListeners();

  return record;
};

/**
 * 画像サイズを追加（別途トラッキング）
 */
export const trackImageSize = (sizeBytes: number) => {
  usageSummary.totalImageSizeBytes += sizeBytes;
  notifyListeners();
};

/**
 * 現在の使用量サマリーを取得
 */
export const getUsageSummary = (): UsageSummary => {
  return { ...usageSummary, records: [...usageSummary.records] };
};

/**
 * 使用量をリセット
 */
export const resetUsage = () => {
  usageSummary = {
    totalCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalImages: 0,
    totalImageSizeBytes: 0,
    estimatedCostUSD: 0,
    estimatedCostJPY: 0,
    records: []
  };
  notifyListeners();
};

/**
 * サイズを人間が読みやすい形式に変換
 */
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * コストを日本円でフォーマット
 */
export const formatCostJPY = (costUSD: number): string => {
  const jpy = costUSD * USD_TO_JPY;
  if (jpy < 1) {
    return `¥${jpy.toFixed(2)}`;
  }
  return `¥${Math.round(jpy).toLocaleString()}`;
};
