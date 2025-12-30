// Analysis examples (お手本) management

import { PhotoRecord, AIAnalysisResult, AnalysisExample, PhotoCategory } from "../../types";
import { openDB, STORE_EXAMPLES } from "./dbCore";
import { getSession, getActiveSessionId } from "./sessions";

/**
 * Detect photo category from analysis result
 */
export const detectPhotoCategory = (analysis: AIAnalysisResult): PhotoCategory => {
  const remarks = analysis.remarks?.toLowerCase() || '';

  if (remarks.includes('着手前') || remarks.includes('竣工') || remarks.includes('完成')) {
    return '着手前及び完成写真';
  }
  if (remarks.includes('状況') && !remarks.includes('出来形')) {
    return '施工状況写真';
  }
  if (remarks.includes('出来形') || analysis.measurements) {
    return '出来形管理写真';
  }
  if (remarks.includes('安全') || remarks.includes('朝礼') || remarks.includes('KY')) {
    return '安全管理写真';
  }
  if (remarks.includes('材料')) {
    return '使用材料写真';
  }
  if (remarks.includes('品質')) {
    return '品質管理写真';
  }

  return 'その他';
};

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
 * Get relevant examples for analysis
 */
export const getRelevantExamples = async (
  workType?: string,
  category?: PhotoCategory,
  limit: number = 3
): Promise<AnalysisExample[]> => {
  const activeSessionId = getActiveSessionId();
  if (activeSessionId) {
    const session = await getSession(activeSessionId);
    if (session && session.examples.length > 0) {
      const scored = session.examples.map(ex => {
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

  const all = await getExamples();
  if (all.length === 0) return [];

  const scored = all.map(ex => {
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
