/**
 * Engram外部メモリ管理
 *
 * Level 3: 知識を外部メモリとして管理
 * - 知識DBの統合管理
 * - コンテキスト依存の知識検索
 * - 自動同期とキャッシュ
 */

import {
  KnowledgeEntry,
  KnowledgeType,
  KnowledgeSearchOptions,
  getAllKnowledgeEntries,
  getKnowledgeByWorkType,
  getKnowledgeByType,
  importAllKnowledge,
  clearKnowledgeDB,
  getKnowledgeStats,
  normalizeText
} from './knowledgeDB';
import { ChainRecord, loadMasterCsv, toChainRecordsJson } from '../../utils/masterCsvParser';
import { getExamples } from '../../utils/storage';
import { getLearnedSettings } from '../learningService';

// ============================================
// メモリ状態
// ============================================

interface EngramMemoryState {
  initialized: boolean;
  lastSync: number;
  stats: {
    total: number;
    byType: Record<KnowledgeType, number>;
  } | null;
}

let memoryState: EngramMemoryState = {
  initialized: false,
  lastSync: 0,
  stats: null
};

// メモリキャッシュ（高速アクセス用）
let memoryCache: Map<string, KnowledgeEntry[]> = new Map();

// ============================================
// 初期化と同期
// ============================================

/**
 * Engramメモリを初期化
 */
export const initEngramMemory = async (
  forceSync: boolean = false,
  onProgress?: (message: string) => void
): Promise<void> => {
  if (memoryState.initialized && !forceSync) {
    onProgress?.('[ENGRAM] メモリ初期化済み');
    return;
  }

  onProgress?.('[ENGRAM] メモリ初期化開始...');

  // 知識DBの統計を確認
  const stats = await getKnowledgeStats();

  // 空の場合または強制同期の場合は再構築
  if (stats.total === 0 || forceSync) {
    onProgress?.('[ENGRAM] 知識DBを構築中...');
    await syncKnowledgeFromSources(onProgress);
  }

  // 状態を更新
  memoryState = {
    initialized: true,
    lastSync: Date.now(),
    stats: {
      total: stats.total,
      byType: stats.byType
    }
  };

  // キャッシュをクリア
  memoryCache.clear();

  onProgress?.(`[ENGRAM] 初期化完了: ${stats.total}エントリ`);
};

/**
 * ソースから知識を同期
 */
export const syncKnowledgeFromSources = async (
  onProgress?: (message: string) => void
): Promise<{ imported: number; skipped: number }> => {
  // 各ソースからデータを取得
  onProgress?.('[ENGRAM] マスタCSVを読み込み中...');
  let chainRecords: ChainRecord[] = [];
  try {
    const masterRows = await loadMasterCsv();
    chainRecords = toChainRecordsJson(masterRows);
  } catch (e) {
    console.warn('Failed to load master CSV:', e);
  }

  onProgress?.('[ENGRAM] お手本を読み込み中...');
  const examples = await getExamples();

  onProgress?.('[ENGRAM] 学習ルールを読み込み中...');
  const learnedSettings = await getLearnedSettings();

  onProgress?.('[ENGRAM] 知識DBにインポート中...');
  const result = await importAllKnowledge(
    chainRecords,
    examples,
    learnedSettings.rules,
    learnedSettings.aliases,
    (current, total, type) => {
      if (current % 100 === 0 || current === total) {
        onProgress?.(`[ENGRAM] インポート中: ${current}/${total} (${type})`);
      }
    }
  );

  onProgress?.(`[ENGRAM] 同期完了: ${result.imported}件追加, ${result.skipped}件スキップ`);
  return result;
};

/**
 * メモリをリセット
 */
export const resetEngramMemory = async (): Promise<void> => {
  await clearKnowledgeDB();
  memoryCache.clear();
  memoryState = {
    initialized: false,
    lastSync: 0,
    stats: null
  };
};

// ============================================
// 検索
// ============================================

/**
 * コンテキストに応じた知識を検索
 */
export const searchKnowledge = async (
  query: string,
  options: KnowledgeSearchOptions = {}
): Promise<KnowledgeEntry[]> => {
  const {
    types,
    workTypes,
    limit = 10,
    minWeight = 0
  } = options;

  // 初期化確認
  if (!memoryState.initialized) {
    await initEngramMemory();
  }

  // キャッシュキーを生成
  const cacheKey = JSON.stringify({ query, options });
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey)!;
  }

  // 工種でフィルタされたエントリを取得
  let entries: KnowledgeEntry[];
  if (workTypes && workTypes.length > 0) {
    const results: KnowledgeEntry[] = [];
    const seen = new Set<string>();
    for (const wt of workTypes) {
      const wtEntries = await getKnowledgeByWorkType(wt);
      for (const e of wtEntries) {
        if (!seen.has(e.id)) {
          seen.add(e.id);
          results.push(e);
        }
      }
    }
    entries = results;
  } else {
    entries = await getAllKnowledgeEntries();
  }

  // タイプでフィルタ
  if (types && types.length > 0) {
    entries = entries.filter(e => types.includes(e.type));
  }

  // 重みでフィルタ
  if (minWeight > 0) {
    entries = entries.filter(e => e.weight >= minWeight);
  }

  // クエリで検索（簡易的なテキストマッチング）
  const normalizedQuery = normalizeText(query);
  const queryTerms = normalizedQuery.split(' ').filter(t => t.length > 0);

  const scored = entries.map(entry => {
    let score = entry.weight;

    // クエリマッチスコア
    for (const term of queryTerms) {
      if (entry.content.includes(term)) {
        score += 1;
      }
    }

    return { entry, score };
  });

  // スコアでソート
  scored.sort((a, b) => b.score - a.score);

  // 上位N件を取得
  const results = scored.slice(0, limit).map(s => s.entry);

  // キャッシュに保存
  memoryCache.set(cacheKey, results);

  return results;
};

/**
 * 工種に関連する知識を取得
 */
export const getKnowledgeForWorkTypes = async (
  workTypes: string[],
  options: { includeExamples?: boolean; includeRules?: boolean; limit?: number } = {}
): Promise<{
  masters: KnowledgeEntry[];
  examples: KnowledgeEntry[];
  rules: KnowledgeEntry[];
  aliases: KnowledgeEntry[];
}> => {
  const { includeExamples = true, includeRules = true, limit = 50 } = options;

  // 初期化確認
  if (!memoryState.initialized) {
    await initEngramMemory();
  }

  const results = {
    masters: [] as KnowledgeEntry[],
    examples: [] as KnowledgeEntry[],
    rules: [] as KnowledgeEntry[],
    aliases: [] as KnowledgeEntry[]
  };

  // 工種でフィルタ
  for (const wt of workTypes) {
    const entries = await getKnowledgeByWorkType(wt);
    for (const entry of entries) {
      switch (entry.type) {
        case 'master':
          if (results.masters.length < limit) {
            results.masters.push(entry);
          }
          break;
        case 'example':
          if (includeExamples && results.examples.length < limit) {
            results.examples.push(entry);
          }
          break;
        case 'rule':
          if (includeRules && results.rules.length < limit) {
            results.rules.push(entry);
          }
          break;
        case 'alias':
          if (includeRules && results.aliases.length < limit) {
            results.aliases.push(entry);
          }
          break;
      }
    }
  }

  // 重みでソート
  results.masters.sort((a, b) => b.weight - a.weight);
  results.examples.sort((a, b) => b.weight - a.weight);
  results.rules.sort((a, b) => b.weight - a.weight);
  results.aliases.sort((a, b) => b.weight - a.weight);

  return results;
};

// ============================================
// ユーティリティ
// ============================================

/**
 * メモリ状態を取得
 */
export const getMemoryState = (): EngramMemoryState => {
  return { ...memoryState };
};

/**
 * メモリ統計を取得
 */
export const getMemoryStats = async (): Promise<{
  initialized: boolean;
  lastSync: number;
  total: number;
  byType: Record<KnowledgeType, number>;
  byWorkType: Record<string, number>;
  cacheSize: number;
}> => {
  const stats = await getKnowledgeStats();
  return {
    initialized: memoryState.initialized,
    lastSync: memoryState.lastSync,
    total: stats.total,
    byType: stats.byType,
    byWorkType: stats.byWorkType,
    cacheSize: memoryCache.size
  };
};

/**
 * キャッシュをクリア
 */
export const clearMemoryCache = (): void => {
  memoryCache.clear();
};
