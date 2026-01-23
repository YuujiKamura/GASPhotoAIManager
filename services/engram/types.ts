/**
 * Engram モジュール - 工種フィルタリング型定義
 * 知識ベース（お手本・ルール・エイリアス）のフィルタリングに使用
 */

/**
 * フィルタオプション
 */
export interface KnowledgeFilterOptions {
  workTypes?: string[];  // 対象工種リスト
  limit?: number;        // 取得件数上限
  includeRelated?: boolean; // 関連工種も含めるか
}

/**
 * フィルタ結果
 */
export interface FilteredKnowledge {
  examples: any[];       // フィルタ済みお手本
  rules: any[];          // フィルタ済みルール
  aliases: any[];        // フィルタ済みエイリアス
  stats: {
    originalCount: { examples: number; rules: number; aliases: number };
    filteredCount: { examples: number; rules: number; aliases: number };
    reductionRate: number; // 削減率 (0-1)
  };
}

/**
 * 工種関連マップ（将来拡張用）
 */
export interface WorkTypeRelation {
  primary: string;
  related: string[];
}
