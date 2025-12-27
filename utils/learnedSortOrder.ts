/**
 * 学習済みソート順序管理
 * ユーザーが手動で並べ替えた順序を記録し、次回から適用する
 */

const STORAGE_KEY = 'learned_detail_order';

export interface LearnedOrder {
  // detail値の相対順序を記録 (key: detail名, value: 順序番号)
  detailOrder: { [key: string]: number };
  // 最終更新日時
  updatedAt: string;
}

/**
 * 学習済み順序をlocalStorageから取得
 */
export function getLearnedOrder(): LearnedOrder {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load learned order:', e);
  }
  return { detailOrder: {}, updatedAt: '' };
}

/**
 * 学習済み順序をlocalStorageに保存
 */
export function saveLearnedOrder(order: LearnedOrder): void {
  try {
    order.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch (e) {
    console.warn('Failed to save learned order:', e);
  }
}

/**
 * 写真の並び順から学習
 * @param orderedDetails - 並び替え後のdetail値の配列（順序通り）
 */
export function learnFromOrder(orderedDetails: string[]): void {
  const learned = getLearnedOrder();

  // 現在の順序を学習
  const uniqueDetails = [...new Set(orderedDetails.filter(d => d && d !== '未分類'))];
  uniqueDetails.forEach((detail, index) => {
    learned.detailOrder[detail] = index;
  });

  saveLearnedOrder(learned);
  console.log('[LearnedOrder] Saved order:', learned.detailOrder);
}

/**
 * 学習済み順序でソート用の比較値を取得
 * @param detail - detail値
 * @returns 順序番号（未学習の場合は9999）
 */
export function getLearnedOrderValue(detail: string): number {
  const learned = getLearnedOrder();
  return learned.detailOrder[detail] ?? 9999;
}

/**
 * 学習済み順序をクリア
 */
export function clearLearnedOrder(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear learned order:', e);
  }
}

/**
 * 学習済み順序の一覧を取得（デバッグ用）
 */
export function getLearnedOrderList(): string[] {
  const learned = getLearnedOrder();
  return Object.entries(learned.detailOrder)
    .sort((a, b) => a[1] - b[1])
    .map(([detail]) => detail);
}
