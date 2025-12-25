/**
 * AI API コスト見積もり・追跡モジュール
 *
 * 処理前に見積もりを表示し、ユーザー確認後に実行する仕組み
 */

// モデル別料金テーブル（$/1M tokens）
export const PRICING: Record<string, {
  input: number;
  output: number;
  imageTokens: number;
  label: string;
}> = {
  'gemini-2.5-flash': {
    input: 0.075,
    output: 0.30,
    imageTokens: 258,  // 768px換算
    label: 'Gemini 2.5 Flash'
  },
  'gemini-2.5-pro': {
    input: 1.25,
    output: 10.0,
    imageTokens: 258,
    label: 'Gemini 2.5 Pro'
  },
  'gpt-4o': {
    input: 2.50,
    output: 10.0,
    imageTokens: 170,  // low detail
    label: 'GPT-4o'
  },
  'gpt-4o-mini': {
    input: 0.15,
    output: 0.60,
    imageTokens: 170,
    label: 'GPT-4o Mini'
  },
  'claude-sonnet-4': {
    input: 3.0,
    output: 15.0,
    imageTokens: 1600,  // 概算
    label: 'Claude Sonnet 4'
  },
};

const USD_TO_JPY = 150;

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  apiCalls: number;
  estimatedCostUSD: number;
  estimatedCostJPY: number;
  model: string;
  breakdown: {
    images?: number;
    textChars?: number;
    tokensPerImage?: number;
  };
}

export interface CostReport {
  estimate: CostEstimate;
  actual: {
    inputTokens: number;
    outputTokens: number;
    apiCalls: number;
    costUSD: number;
    costJPY: number;
    duration: number;
  };
  accuracy: number;
  sessionTotal: number;
}

// セッション累計
let sessionTotalCostUSD = 0;

export function getSessionTotal(): number {
  return sessionTotalCostUSD;
}

export function resetSessionTotal(): void {
  sessionTotalCostUSD = 0;
}

/**
 * 画像サイズに応じたトークン数を推定
 */
export function estimateImageTokens(
  imageSizeBytes: number,
  model: string
): number {
  const pricing = PRICING[model];
  if (!pricing) {
    return 258; // デフォルト
  }

  // 画像サイズに応じた補正（小さい画像: 基準値、大きい画像: 最大4倍程度）
  const sizeMultiplier = Math.min(4, imageSizeBytes / 500000 + 1);
  return Math.ceil(pricing.imageTokens * sizeMultiplier);
}

/**
 * 処理前のコスト見積もりを計算
 */
export function estimateCost(
  imageCount: number,
  model: string = 'gemini-2.5-flash',
  apiCallMultiplier: number = 1,
  imageSizes?: number[]
): CostEstimate {
  const pricing = PRICING[model] || PRICING['gemini-2.5-flash'];

  // 画像トークン推定
  let imageTokens: number;
  if (imageSizes && imageSizes.length > 0) {
    imageTokens = imageSizes.reduce(
      (sum, size) => sum + estimateImageTokens(size, model),
      0
    );
  } else {
    imageTokens = imageCount * pricing.imageTokens;
  }

  const inputTokens = imageTokens * apiCallMultiplier;
  const outputTokens = imageCount * 50 * apiCallMultiplier; // 1枚あたり約50トークンの出力推定

  const costUSD =
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output;

  return {
    inputTokens,
    outputTokens,
    apiCalls: apiCallMultiplier,
    estimatedCostUSD: costUSD,
    estimatedCostJPY: costUSD * USD_TO_JPY,
    model,
    breakdown: {
      images: imageCount,
      tokensPerImage: pricing.imageTokens
    }
  };
}

/**
 * 見積もりをCLIに表示
 */
export function showEstimate(estimate: CostEstimate): void {
  const pricing = PRICING[estimate.model];
  const modelLabel = pricing?.label || estimate.model;

  console.log(`
📊 処理前見積もり
├─ 画像: ${estimate.breakdown.images}枚
├─ 推定トークン: 入力${estimate.inputTokens.toLocaleString()} / 出力${estimate.outputTokens.toLocaleString()}
├─ API呼び出し: ${estimate.apiCalls}回
├─ モデル: ${modelLabel}
└─ 推定コスト: $${estimate.estimatedCostUSD.toFixed(4)} (約${Math.ceil(estimate.estimatedCostJPY)}円)
`);
}

/**
 * ユーザー確認を求める
 */
export function askConfirmation(): Promise<boolean> {
  return new Promise(resolve => {
    process.stdout.write('[Y] 実行 / [N] キャンセル: ');
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.once('data', data => {
      const input = data.toString().trim().toLowerCase();
      process.stdin.setRawMode?.(false);
      process.stdout.write('\n');
      resolve(input === 'y' || input === 'yes' || input === '');
    });
  });
}

/**
 * コストトラッカークラス
 */
export class CostTracker {
  private estimate: CostEstimate;
  private startTime: number = 0;
  private currentApiCalls: number = 0;
  private actualInputTokens: number = 0;
  private actualOutputTokens: number = 0;

  public onProgress?: (progress: number, cost: number) => void;
  public onApiCall?: (callNumber: number, tokens: { input: number; output: number }) => void;

  constructor(estimate: CostEstimate) {
    this.estimate = estimate;
  }

  start(): void {
    this.startTime = Date.now();
  }

  recordApiCall(inputTokens: number, outputTokens: number): void {
    this.currentApiCalls++;
    this.actualInputTokens += inputTokens;
    this.actualOutputTokens += outputTokens;

    const progress = Math.min(100, Math.round((this.currentApiCalls / this.estimate.apiCalls) * 100));
    const currentCost = this.getCurrentCostUSD();

    this.onApiCall?.(this.currentApiCalls, { input: inputTokens, output: outputTokens });
    this.onProgress?.(progress, currentCost);
  }

  getCurrentCostUSD(): number {
    const pricing = PRICING[this.estimate.model] || PRICING['gemini-2.5-flash'];
    return (this.actualInputTokens / 1_000_000) * pricing.input +
           (this.actualOutputTokens / 1_000_000) * pricing.output;
  }

  finish(): CostReport {
    const duration = Date.now() - this.startTime;
    const actualCostUSD = this.getCurrentCostUSD();

    // セッション累計に加算
    sessionTotalCostUSD += actualCostUSD;

    const accuracy = this.estimate.estimatedCostUSD > 0
      ? Math.round((1 - Math.abs(actualCostUSD - this.estimate.estimatedCostUSD) / this.estimate.estimatedCostUSD) * 100)
      : 100;

    return {
      estimate: this.estimate,
      actual: {
        inputTokens: this.actualInputTokens,
        outputTokens: this.actualOutputTokens,
        apiCalls: this.currentApiCalls,
        costUSD: actualCostUSD,
        costJPY: actualCostUSD * USD_TO_JPY,
        duration
      },
      accuracy: Math.max(0, accuracy),
      sessionTotal: sessionTotalCostUSD
    };
  }

  showReport(): void {
    const report = this.finish();

    console.log(`
✅ 処理完了
├─ 実際のトークン: 入力${report.actual.inputTokens.toLocaleString()} / 出力${report.actual.outputTokens.toLocaleString()}
├─ 実際のコスト: $${report.actual.costUSD.toFixed(4)} (約${Math.ceil(report.actual.costJPY)}円)
├─ 見積もり精度: ${report.accuracy}%
├─ 処理時間: ${(report.actual.duration / 1000).toFixed(1)}秒
└─ セッション累計: $${report.sessionTotal.toFixed(4)} (約${Math.ceil(report.sessionTotal * USD_TO_JPY)}円)
`);
  }
}

/**
 * 進捗バーを生成
 */
export function progressBar(percent: number, width: number = 20): string {
  const filled = Math.round(width * percent / 100);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * 進捗表示ユーティリティ
 */
export function showProgress(progress: number, cost: number, elapsed: number): void {
  const bar = progressBar(progress);
  process.stdout.write(`\r⏳ 処理中 [${bar}] ${progress}% - $${cost.toFixed(4)} (${(elapsed / 1000).toFixed(1)}s)`);
}
