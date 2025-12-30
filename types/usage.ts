/**
 * API使用量・コスト関連の型定義
 * UsageRecord, UsageSummary, CostEstimate など
 */

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
