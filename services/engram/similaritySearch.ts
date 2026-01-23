/**
 * 類似画像検索モジュール
 *
 * pHashを使用して類似画像を検索し、最適なお手本を選択する。
 */

import { ImageHashResult, computePHash, hammingDistance, computeSimilarity, SIMILARITY_THRESHOLD } from './imageHash';
import { HashIndexEntry, getAllHashEntries, getHashEntriesByWorkTypes } from './hashIndex';
import { AnalysisExample } from '../../types';

// 検索結果の型
export interface SimilaritySearchResult {
  entry: HashIndexEntry;
  distance: number;        // ハミング距離
  similarity: number;      // 類似度 (0-1)
}

// 検索オプション
export interface SimilaritySearchOptions {
  threshold?: number;      // ハミング距離の閾値（デフォルト: SIMILARITY_THRESHOLD）
  limit?: number;          // 返す件数上限（デフォルト: 5）
  workTypes?: string[];    // 工種フィルタ
  minSimilarity?: number;  // 最低類似度（デフォルト: 0.8）
}

/**
 * 類似画像を検索
 */
export const searchSimilarImages = async (
  targetHash: string,
  options: SimilaritySearchOptions = {}
): Promise<SimilaritySearchResult[]> => {
  const {
    threshold = SIMILARITY_THRESHOLD,
    limit = 5,
    workTypes,
    minSimilarity = 0.8
  } = options;

  // インデックスからエントリを取得
  const entries = workTypes && workTypes.length > 0
    ? await getHashEntriesByWorkTypes(workTypes)
    : await getAllHashEntries();

  // 類似度を計算してソート
  const results: SimilaritySearchResult[] = [];

  for (const entry of entries) {
    const distance = hammingDistance(targetHash, entry.hash);
    const similarity = computeSimilarity(targetHash, entry.hash);

    // 閾値内かつ最低類似度以上のもののみ追加
    if (distance <= threshold && similarity >= minSimilarity) {
      results.push({ entry, distance, similarity });
    }
  }

  // 類似度でソート（高い順）
  results.sort((a, b) => b.similarity - a.similarity);

  return results.slice(0, limit);
};

/**
 * Base64画像から類似画像を検索
 */
export const searchSimilarByImage = async (
  base64Data: string,
  options: SimilaritySearchOptions = {}
): Promise<{ hash: ImageHashResult; results: SimilaritySearchResult[] }> => {
  // pHashを計算
  const hash = await computePHash(base64Data);

  // 類似検索
  const results = await searchSimilarImages(hash.hash, options);

  return { hash, results };
};

/**
 * 最も類似したお手本を取得
 *
 * お手本DBと連携して、最も類似したお手本を返す。
 */
export const findMostSimilarExample = async (
  base64Data: string,
  examples: AnalysisExample[],
  options: SimilaritySearchOptions = {}
): Promise<{ example: AnalysisExample; similarity: number } | null> => {
  const { results } = await searchSimilarByImage(base64Data, { ...options, limit: 1 });

  if (results.length === 0) {
    return null;
  }

  const topResult = results[0];
  const matchingExample = examples.find(ex => ex.id === topResult.entry.exampleId);

  if (!matchingExample) {
    return null;
  }

  return {
    example: matchingExample,
    similarity: topResult.similarity
  };
};

/**
 * 複数画像に対して一括で類似お手本を検索
 *
 * バッチ解析時に使用。各画像に最適なお手本を1-2件ずつ選択。
 */
export const findSimilarExamplesForBatch = async (
  images: Array<{ fileName: string; base64: string }>,
  examples: AnalysisExample[],
  options: SimilaritySearchOptions = {}
): Promise<Map<string, { example: AnalysisExample; similarity: number }[]>> => {
  const resultMap = new Map<string, { example: AnalysisExample; similarity: number }[]>();
  const limit = options.limit || 2;

  for (const image of images) {
    try {
      const { results } = await searchSimilarByImage(image.base64, { ...options, limit });

      const matchedExamples: { example: AnalysisExample; similarity: number }[] = [];

      for (const result of results) {
        const matchingExample = examples.find(ex => ex.id === result.entry.exampleId);
        if (matchingExample) {
          matchedExamples.push({
            example: matchingExample,
            similarity: result.similarity
          });
        }
      }

      resultMap.set(image.fileName, matchedExamples);
    } catch (e) {
      console.warn(`Failed to search similar for ${image.fileName}:`, e);
      resultMap.set(image.fileName, []);
    }
  }

  return resultMap;
};

/**
 * 類似検索結果から最適なお手本セットを選択
 *
 * 重複を排除しつつ、カバレッジを最大化するお手本を選択。
 */
export const selectOptimalExamples = async (
  images: Array<{ fileName: string; base64: string }>,
  examples: AnalysisExample[],
  maxExamples: number = 3,
  options: SimilaritySearchOptions = {}
): Promise<{ examples: AnalysisExample[]; coverage: number }> => {
  const batchResults = await findSimilarExamplesForBatch(images, examples, options);

  // 各お手本の出現回数をカウント
  const exampleCounts = new Map<string, { example: AnalysisExample; count: number; totalSimilarity: number }>();

  for (const [_, matches] of batchResults) {
    for (const match of matches) {
      const existing = exampleCounts.get(match.example.id);
      if (existing) {
        existing.count++;
        existing.totalSimilarity += match.similarity;
      } else {
        exampleCounts.set(match.example.id, {
          example: match.example,
          count: 1,
          totalSimilarity: match.similarity
        });
      }
    }
  }

  // スコアでソート（出現回数 × 平均類似度）
  const sorted = Array.from(exampleCounts.values())
    .map(item => ({
      ...item,
      score: item.count * (item.totalSimilarity / item.count)
    }))
    .sort((a, b) => b.score - a.score);

  // 上位N件を選択
  const selectedExamples = sorted.slice(0, maxExamples).map(item => item.example);

  // カバレッジを計算（マッチした画像数 / 全画像数）
  let matchedImages = 0;
  for (const [_, matches] of batchResults) {
    if (matches.some(m => selectedExamples.some(ex => ex.id === m.example.id))) {
      matchedImages++;
    }
  }
  const coverage = images.length > 0 ? matchedImages / images.length : 0;

  return { examples: selectedExamples, coverage };
};
