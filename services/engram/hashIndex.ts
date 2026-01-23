/**
 * 画像ハッシュインデックス管理
 *
 * IndexedDBに画像ハッシュを保存し、類似画像検索を支援する。
 */

import { openDB, STORE_IMAGE_HASH } from '../../utils/storage/dbCore';
import { ImageHashResult } from './imageHash';

// インデックスエントリの型
export interface HashIndexEntry {
  id: string;              // 画像キー（ファイル名またはハッシュ）
  hash: string;            // pHash値
  exampleId?: string;      // 関連するお手本ID（あれば）
  workType?: string;       // 工種
  category?: string;       // カテゴリ
  thumbnail?: string;      // サムネイル（検証用）
  createdAt: number;
  updatedAt: number;
}

// インデックス統計
export interface HashIndexStats {
  totalEntries: number;
  entriesByWorkType: Record<string, number>;
  entriesByCategory: Record<string, number>;
  lastUpdated: number;
}

/**
 * ハッシュエントリを保存
 */
export const saveHashEntry = async (entry: Omit<HashIndexEntry, 'createdAt' | 'updatedAt'>): Promise<HashIndexEntry> => {
  const db = await openDB();
  const now = Date.now();

  const fullEntry: HashIndexEntry = {
    ...entry,
    createdAt: now,
    updatedAt: now
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_IMAGE_HASH, 'readwrite');
    const store = transaction.objectStore(STORE_IMAGE_HASH);
    const request = store.put(fullEntry);
    request.onsuccess = () => resolve(fullEntry);
    request.onerror = () => reject(request.error);
  });
};

/**
 * ハッシュエントリを取得
 */
export const getHashEntry = async (id: string): Promise<HashIndexEntry | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_IMAGE_HASH, 'readonly');
    const store = transaction.objectStore(STORE_IMAGE_HASH);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

/**
 * 全ハッシュエントリを取得
 */
export const getAllHashEntries = async (): Promise<HashIndexEntry[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_IMAGE_HASH, 'readonly');
    const store = transaction.objectStore(STORE_IMAGE_HASH);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

/**
 * 工種でフィルタしてハッシュエントリを取得
 */
export const getHashEntriesByWorkType = async (workType: string): Promise<HashIndexEntry[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_IMAGE_HASH, 'readonly');
    const store = transaction.objectStore(STORE_IMAGE_HASH);
    const index = store.index('workType');
    const request = index.getAll(workType);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

/**
 * 複数工種でフィルタしてハッシュエントリを取得
 */
export const getHashEntriesByWorkTypes = async (workTypes: string[]): Promise<HashIndexEntry[]> => {
  if (workTypes.length === 0) {
    return getAllHashEntries();
  }

  const results: HashIndexEntry[] = [];
  const seen = new Set<string>();

  for (const workType of workTypes) {
    const entries = await getHashEntriesByWorkType(workType);
    for (const entry of entries) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        results.push(entry);
      }
    }
  }

  return results;
};

/**
 * ハッシュエントリを削除
 */
export const deleteHashEntry = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_IMAGE_HASH, 'readwrite');
    const store = transaction.objectStore(STORE_IMAGE_HASH);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * 全ハッシュエントリをクリア
 */
export const clearHashIndex = async (): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_IMAGE_HASH, 'readwrite');
    const store = transaction.objectStore(STORE_IMAGE_HASH);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * インデックス統計を取得
 */
export const getHashIndexStats = async (): Promise<HashIndexStats> => {
  const entries = await getAllHashEntries();

  const entriesByWorkType: Record<string, number> = {};
  const entriesByCategory: Record<string, number> = {};
  let lastUpdated = 0;

  for (const entry of entries) {
    if (entry.workType) {
      entriesByWorkType[entry.workType] = (entriesByWorkType[entry.workType] || 0) + 1;
    }
    if (entry.category) {
      entriesByCategory[entry.category] = (entriesByCategory[entry.category] || 0) + 1;
    }
    if (entry.updatedAt > lastUpdated) {
      lastUpdated = entry.updatedAt;
    }
  }

  return {
    totalEntries: entries.length,
    entriesByWorkType,
    entriesByCategory,
    lastUpdated
  };
};

/**
 * お手本からハッシュインデックスを構築
 */
export const buildHashIndexFromExamples = async (
  examples: Array<{ id: string; thumbnail: string; analysis: { workType?: string }; category?: string }>,
  computePHash: (base64: string) => Promise<ImageHashResult>,
  onProgress?: (current: number, total: number) => void
): Promise<number> => {
  let indexed = 0;

  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    try {
      // 既存エントリをチェック
      const existing = await getHashEntry(example.id);
      if (existing) {
        indexed++;
        onProgress?.(i + 1, examples.length);
        continue;
      }

      // pHashを計算
      const hashResult = await computePHash(example.thumbnail);

      // インデックスに保存
      await saveHashEntry({
        id: example.id,
        hash: hashResult.hash,
        exampleId: example.id,
        workType: example.analysis.workType,
        category: example.category,
        thumbnail: example.thumbnail.substring(0, 100) // 省略して保存
      });

      indexed++;
    } catch (e) {
      console.warn(`Failed to index example ${example.id}:`, e);
    }

    onProgress?.(i + 1, examples.length);
  }

  return indexed;
};
