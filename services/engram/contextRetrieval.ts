/**
 * コンテキスト検索モジュール
 *
 * Engram Level 3: 画像コンテキストに基づく知識検索
 * - 画像特徴からの知識検索
 * - 類似画像との関連知識取得
 * - コンテキスト依存のフィルタリング
 */

import { KnowledgeEntry } from './knowledgeDB';
import { getKnowledgeForWorkTypes, searchKnowledge, initEngramMemory } from './engramMemory';
import { searchSimilarByImage, SimilaritySearchOptions } from './similaritySearch';
import { getHashIndexStats } from './hashIndex';
import { PhotoRecord } from '../../types';

// ============================================
// 型定義
// ============================================

export interface ContextRetrievalOptions {
  workTypes?: string[];           // 工種フィルタ
  useSimilarity?: boolean;        // 類似検索を使用するか
  maxMasters?: number;            // 最大マスタ数
  maxExamples?: number;           // 最大お手本数
  maxRules?: number;              // 最大ルール数
  similarityThreshold?: number;   // 類似度閾値
}

export interface RetrievedContext {
  masters: KnowledgeEntry[];
  examples: KnowledgeEntry[];
  rules: KnowledgeEntry[];
  aliases: KnowledgeEntry[];
  similarImages: Array<{
    fileName: string;
    relatedKnowledge: KnowledgeEntry[];
  }>;
  stats: {
    totalKnowledge: number;
    estimatedTokens: number;
    retrievalTime: number;
    similarityUsed: boolean;
  };
}

// ============================================
// メイン検索関数
// ============================================

/**
 * 画像コンテキストから知識を検索
 */
export const retrieveContext = async (
  images: PhotoRecord[],
  options: ContextRetrievalOptions = {}
): Promise<RetrievedContext> => {
  const startTime = performance.now();
  const {
    workTypes = [],
    useSimilarity,
    maxMasters = 30,
    maxExamples = 3,
    maxRules = 10,
    similarityThreshold = 0.75
  } = options;

  // 初期化確認
  await initEngramMemory();

  const result: RetrievedContext = {
    masters: [],
    examples: [],
    rules: [],
    aliases: [],
    similarImages: [],
    stats: {
      totalKnowledge: 0,
      estimatedTokens: 0,
      retrievalTime: 0,
      similarityUsed: false
    }
  };

  // 1. 工種ベースの知識取得
  if (workTypes.length > 0) {
    const knowledge = await getKnowledgeForWorkTypes(workTypes, {
      includeExamples: true,
      includeRules: true,
      limit: maxMasters
    });

    result.masters = knowledge.masters.slice(0, maxMasters);
    result.examples = knowledge.examples.slice(0, maxExamples);
    result.rules = knowledge.rules.slice(0, maxRules);
    result.aliases = knowledge.aliases.slice(0, 20);
  }

  // 2. 類似画像ベースの知識検索（オプション）
  const hashStats = await getHashIndexStats();
  const shouldUseSimilarity = useSimilarity ?? (hashStats.totalEntries > 0);

  if (shouldUseSimilarity && images.length > 0) {
    result.stats.similarityUsed = true;

    for (const image of images.slice(0, 5)) { // 最大5画像まで
      if (!image.base64) continue;

      try {
        const searchOptions: SimilaritySearchOptions = {
          workTypes,
          limit: 2,
          minSimilarity: similarityThreshold
        };

        const { results } = await searchSimilarByImage(image.base64, searchOptions);

        if (results.length > 0) {
          // 類似画像に関連する知識を収集
          const relatedKnowledge: KnowledgeEntry[] = [];

          for (const res of results) {
            if (res.entry.workType) {
              const wt = res.entry.workType;
              const wtKnowledge = await searchKnowledge(wt, {
                types: ['master', 'example'],
                workTypes: [wt],
                limit: 3
              });
              relatedKnowledge.push(...wtKnowledge);
            }
          }

          result.similarImages.push({
            fileName: image.fileName,
            relatedKnowledge
          });

          // 追加のお手本を収集
          const additionalExamples = relatedKnowledge.filter(k => k.type === 'example');
          for (const ex of additionalExamples) {
            if (!result.examples.some(e => e.id === ex.id) && result.examples.length < maxExamples) {
              result.examples.push(ex);
            }
          }
        }
      } catch (e) {
        console.warn(`Failed to search similar for ${image.fileName}:`, e);
      }
    }
  }

  // 3. 統計を計算
  result.stats.totalKnowledge =
    result.masters.length +
    result.examples.length +
    result.rules.length +
    result.aliases.length;

  result.stats.estimatedTokens = estimateKnowledgeTokens(result);
  result.stats.retrievalTime = performance.now() - startTime;

  return result;
};

/**
 * 特定のクエリで知識を検索
 */
export const retrieveByQuery = async (
  query: string,
  options: ContextRetrievalOptions = {}
): Promise<KnowledgeEntry[]> => {
  const { workTypes, maxMasters = 20 } = options;

  await initEngramMemory();

  return searchKnowledge(query, {
    workTypes,
    limit: maxMasters
  });
};

/**
 * 工種から関連知識を検索
 */
export const retrieveByWorkTypes = async (
  workTypes: string[],
  options: ContextRetrievalOptions = {}
): Promise<RetrievedContext> => {
  const startTime = performance.now();
  const { maxMasters = 30, maxExamples = 3, maxRules = 10 } = options;

  await initEngramMemory();

  const knowledge = await getKnowledgeForWorkTypes(workTypes, {
    includeExamples: true,
    includeRules: true,
    limit: Math.max(maxMasters, maxExamples, maxRules)
  });

  const result: RetrievedContext = {
    masters: knowledge.masters.slice(0, maxMasters),
    examples: knowledge.examples.slice(0, maxExamples),
    rules: knowledge.rules.slice(0, maxRules),
    aliases: knowledge.aliases.slice(0, 20),
    similarImages: [],
    stats: {
      totalKnowledge: 0,
      estimatedTokens: 0,
      retrievalTime: 0,
      similarityUsed: false
    }
  };

  result.stats.totalKnowledge =
    result.masters.length +
    result.examples.length +
    result.rules.length +
    result.aliases.length;

  result.stats.estimatedTokens = estimateKnowledgeTokens(result);
  result.stats.retrievalTime = performance.now() - startTime;

  return result;
};

// ============================================
// ユーティリティ
// ============================================

/**
 * 知識のトークン数を推定
 */
const estimateKnowledgeTokens = (context: RetrievedContext): number => {
  let chars = 0;

  // マスタ
  for (const m of context.masters) {
    chars += (m.content?.length || 0) + 20; // オーバーヘッド
  }

  // お手本
  for (const e of context.examples) {
    chars += (e.content?.length || 0) + 100; // 詳細情報のオーバーヘッド
  }

  // ルール
  for (const r of context.rules) {
    chars += (r.content?.length || 0) + 30;
  }

  // エイリアス
  for (const a of context.aliases) {
    chars += (a.content?.length || 0) + 20;
  }

  // 日本語混在を想定して約2文字/トークン
  return Math.ceil(chars / 2);
};

/**
 * 検索結果を要約
 */
export const summarizeContext = (context: RetrievedContext): string => {
  const lines = [
    `知識検索結果:`,
    `  マスタ: ${context.masters.length}件`,
    `  お手本: ${context.examples.length}件`,
    `  ルール: ${context.rules.length}件`,
    `  エイリアス: ${context.aliases.length}件`,
    `  類似画像: ${context.similarImages.length}件`,
    `  推定トークン: ${context.stats.estimatedTokens}`,
    `  検索時間: ${context.stats.retrievalTime.toFixed(1)}ms`,
    `  類似検索: ${context.stats.similarityUsed ? '使用' : '未使用'}`
  ];
  return lines.join('\n');
};
