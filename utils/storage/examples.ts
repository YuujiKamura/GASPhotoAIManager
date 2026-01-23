// Analysis examples (お手本) management

import { PhotoRecord, AnalysisExample, PhotoCategory } from "../../types";
import { openDB, STORE_EXAMPLES } from "./dbCore";
import { detectPhotoCategory } from "./categoryUtils";
import { getSession, getActiveSessionId } from "./sessions";
import { getActiveExampleHistoryId, getAnalysisHistoryEntry } from "./history";
import { getCachedAnalysisByKey } from "./analysisCache";

/**
 * Save example from PhotoRecord
 */
export const saveExample = async (
  record: PhotoRecord,
  name: string,
  tags?: string[]
): Promise<AnalysisExample> => {
  if (!record.analysis) {
    throw new Error('解析結果がありません');
  }

  const example: AnalysisExample = {
    id: `ex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    thumbnail: record.base64,
    analysis: { ...record.analysis },
    category: detectPhotoCategory(record.analysis),
    tags: tags || [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_EXAMPLES, 'readwrite');
    const store = transaction.objectStore(STORE_EXAMPLES);
    const request = store.put(example);
    request.onsuccess = () => resolve(example);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Get all examples
 */
export const getExamples = async (): Promise<AnalysisExample[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_EXAMPLES, 'readonly');
    const store = transaction.objectStore(STORE_EXAMPLES);
    const request = store.getAll();
    request.onsuccess = () => {
      const examples = request.result as AnalysisExample[];
      examples.sort((a, b) => b.createdAt - a.createdAt);
      resolve(examples);
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * Get examples by category
 */
const getExamplesByCategory = async (category: PhotoCategory): Promise<AnalysisExample[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_EXAMPLES, 'readonly');
    const store = transaction.objectStore(STORE_EXAMPLES);
    const index = store.index('category');
    const request = index.getAll(category);
    request.onsuccess = () => resolve(request.result as AnalysisExample[]);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Update example
 */
const updateExample = async (example: AnalysisExample): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_EXAMPLES, 'readwrite');
    const store = transaction.objectStore(STORE_EXAMPLES);
    const request = store.put({ ...example, updatedAt: Date.now() });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Delete example
 */
export const deleteExample = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_EXAMPLES, 'readwrite');
    const store = transaction.objectStore(STORE_EXAMPLES);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Clear all examples
 */
export const clearExamples = async (): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_EXAMPLES, 'readwrite');
    const store = transaction.objectStore(STORE_EXAMPLES);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Options for filtering examples
 */
export interface ExampleFilterOptions {
  workType?: string;
  workTypes?: string[];  // 複数工種対応
  category?: PhotoCategory;
  limit?: number;
}

/**
 * Filter examples by workTypes
 * Returns all examples if workTypes is undefined or empty
 */
const filterByWorkTypes = (examples: AnalysisExample[], workTypes?: string[]): AnalysisExample[] => {
  if (!workTypes || workTypes.length === 0) {
    return examples;
  }
  return examples.filter(ex =>
    ex.analysis.workType && workTypes.includes(ex.analysis.workType)
  );
};

/**
 * Get relevant examples for analysis
 * Checks both session examples and history-based examples
 */
export const getRelevantExamples = async (
  workType?: string,
  category?: PhotoCategory,
  limit: number = 3,
  workTypes?: string[]  // 複数工種でのフィルタリング
): Promise<AnalysisExample[]> => {
  // 1. まずセッションベースのお手本をチェック
  const activeSessionId = getActiveSessionId();
  if (activeSessionId) {
    const session = await getSession(activeSessionId);
    if (session && session.examples.length > 0) {
      // workTypesでフィルタリング
      const filtered = filterByWorkTypes(session.examples, workTypes);
      if (filtered.length > 0) {
        const scored = filtered.map(ex => {
          let score = 0;
          if (category && ex.category === category) score += 3;
          if (workType && ex.analysis.workType === workType) score += 2;
          score += 1;
          return { example: ex, score };
        });
        return scored
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map(s => s.example);
      }
    }
  }

  // 2. 履歴ベースのお手本をチェック（新機能）
  const activeHistoryId = getActiveExampleHistoryId();
  if (activeHistoryId) {
    const historyEntry = await getAnalysisHistoryEntry(activeHistoryId);
    if (historyEntry && historyEntry.isExampleSession && historyEntry.photoKeys.length > 0) {
      // 履歴のphotoKeysからキャッシュを取得してお手本に変換
      const examplesFromHistory: AnalysisExample[] = [];
      for (let i = 0; i < Math.min(historyEntry.photoKeys.length, limit * 2); i++) {
        const key = historyEntry.photoKeys[i];
        const analysis = await getCachedAnalysisByKey(key);
        if (analysis) {
          examplesFromHistory.push({
            id: `hist_${historyEntry.id}_${i}`,
            name: `${analysis.workType || ''} - ${analysis.remarks || key}`,
            thumbnail: historyEntry.thumbnails?.[i] || '',
            analysis,
            category: detectPhotoCategory(analysis),
            tags: [],
            createdAt: historyEntry.createdAt,
            updatedAt: historyEntry.createdAt
          });
        }
      }

      if (examplesFromHistory.length > 0) {
        console.log(`[EXAMPLES] 履歴お手本から${examplesFromHistory.length}件取得: "${historyEntry.name}"`);
        // workTypesでフィルタリング
        const filtered = filterByWorkTypes(examplesFromHistory, workTypes);
        if (filtered.length > 0) {
          const scored = filtered.map(ex => {
            let score = 0;
            if (category && ex.category === category) score += 3;
            if (workType && ex.analysis.workType === workType) score += 2;
            score += 1;
            return { example: ex, score };
          });
          return scored
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(s => s.example);
        }
      }
    }
  }

  // 3. フォールバック: すべてのお手本から取得
  const all = await getExamples();
  if (all.length === 0) return [];

  // workTypesでフィルタリング
  const filtered = filterByWorkTypes(all, workTypes);
  if (filtered.length === 0) return [];

  const scored = filtered.map(ex => {
    let score = 0;
    if (category && ex.category === category) score += 3;
    if (workType && ex.analysis.workType === workType) score += 2;
    score += 1;
    return { example: ex, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.example);
};
