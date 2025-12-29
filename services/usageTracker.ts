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
const getBase64Size = (base64: string): number => {
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
const trackImageSize = (sizeBytes: number) => {
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

/**
 * 解析前のコスト見積もり
 */
export interface CostEstimate {
  imageCount: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUSD: number;
  estimatedCostJPY: number;
  breakdown: { operation: string; model: string; cost: number }[];
  notes: string[];
}

/**
 * 解析前にコストを見積もる
 * @param imageCount 画像枚数
 * @param mode 処理モード (auto, landscape, construction)
 */
const estimateAnalysisCost = (
  imageCount: number,
  mode: 'auto' | 'landscape' | 'construction' = 'auto'
): CostEstimate => {
  const breakdown: { operation: string; model: string; cost: number }[] = [];
  const notes: string[] = [];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // 推定プロンプトサイズ（文字数）
  const AVG_PROMPT_SIZE = 500;
  const AVG_RESPONSE_SIZE = 200;

  // Step 1: 写真タイプ判定 (Flash model, サンプル3枚)
  if (mode === 'auto') {
    const sampleCount = Math.min(3, imageCount);
    const detectInputTokens = estimateTokens(AVG_PROMPT_SIZE.toString().repeat(AVG_PROMPT_SIZE)) + estimateImageTokens(sampleCount);
    const detectOutputTokens = estimateTokens(AVG_RESPONSE_SIZE.toString().repeat(AVG_RESPONSE_SIZE));
    const detectCost = calculateCost('gemini-2.5-flash', detectInputTokens, detectOutputTokens);

    breakdown.push({
      operation: '写真タイプ判定',
      model: 'Flash',
      cost: detectCost
    });
    totalInputTokens += detectInputTokens;
    totalOutputTokens += detectOutputTokens;
  }

  // Step 2A: 景観写真ペアリング (Pro model)
  if (mode === 'auto' || mode === 'landscape') {
    // 空間特徴抽出 - 全画像を処理
    const BATCH_SIZE = 4;
    const batchCount = Math.ceil(imageCount / BATCH_SIZE);

    const spatialInputTokens = (estimateTokens(AVG_PROMPT_SIZE.toString().repeat(AVG_PROMPT_SIZE)) + estimateImageTokens(Math.min(BATCH_SIZE, imageCount))) * batchCount;
    const spatialOutputTokens = estimateTokens(AVG_RESPONSE_SIZE.toString().repeat(AVG_RESPONSE_SIZE * 3)) * batchCount;
    const spatialCost = calculateCost('gemini-3-pro-preview', spatialInputTokens, spatialOutputTokens);

    breakdown.push({
      operation: '空間特徴抽出',
      model: 'Pro',
      cost: spatialCost
    });
    totalInputTokens += spatialInputTokens;
    totalOutputTokens += spatialOutputTokens;

    notes.push('景観モード: 画像の座標ベース解析を実行');
  }

  // Step 2B: 黒板付き写真解析 (Flash model)
  if (mode === 'auto' || mode === 'construction') {
    // 詳細解析 - 全画像
    const analyzeInputTokens = estimateTokens(AVG_PROMPT_SIZE.toString().repeat(AVG_PROMPT_SIZE * 2)) + estimateImageTokens(imageCount);
    const analyzeOutputTokens = estimateTokens(AVG_RESPONSE_SIZE.toString().repeat(AVG_RESPONSE_SIZE * imageCount));
    const analyzeCost = calculateCost('gemini-2.5-flash', analyzeInputTokens, analyzeOutputTokens);

    breakdown.push({
      operation: '黒板/詳細解析',
      model: 'Flash',
      cost: analyzeCost
    });

    if (mode === 'auto') {
      // 自動モードの場合、両方の可能性を含む
      notes.push('黒板モード: 工種・測点の抽出を実行');
    }
    totalInputTokens += analyzeInputTokens;
    totalOutputTokens += analyzeOutputTokens;
  }

  const estimatedCostUSD = breakdown.reduce((sum, b) => sum + b.cost, 0);

  if (mode === 'auto') {
    notes.push('※ 自動判定のため、実際のコストは写真の内容により変動します');
  }

  return {
    imageCount,
    estimatedInputTokens: totalInputTokens,
    estimatedOutputTokens: totalOutputTokens,
    estimatedCostUSD,
    estimatedCostJPY: estimatedCostUSD * USD_TO_JPY,
    breakdown,
    notes
  };
};

/**
 * 簡易見積もり（画像枚数のみで概算）
 */
export const estimateQuickCost = (imageCount: number): { min: number; max: number; typical: number } => {
  // 最小: Flash modelのみ使用
  const minCost = calculateCost('gemini-2.5-flash',
    estimateImageTokens(imageCount) + 500,  // 画像 + プロンプト
    200 * imageCount  // レスポンス
  );

  // 最大: Pro modelで全画像処理
  const maxCost = calculateCost('gemini-3-pro-preview',
    estimateImageTokens(imageCount) + 1000,
    500 * imageCount
  );

  // 典型的: 混合使用
  const typicalCost = (minCost + maxCost) / 2;

  return {
    min: minCost,
    max: maxCost,
    typical: typicalCost
  };
};
