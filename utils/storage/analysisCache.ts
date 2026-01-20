// Analysis cache management

import { PhotoRecord, AIAnalysisResult } from "../../types";
import { fsCache } from '../fileSystemCache';
import { openDB, STORE_CACHE } from "./dbCore";

/**
 * Generates a unique key for the file based on its immutable properties.
 */
export const getFileKey = (input: File | PhotoRecord): string => {
  let name = "";
  let size = 0;
  let modified = 0;

  if (input instanceof File) {
    name = input.name;
    size = input.size;
    modified = input.lastModified;
  } else if (input.originalFile) {
    name = input.fileName;
    size = input.originalFile.size;
    modified = input.originalFile.lastModified;
  } else {
    name = input.fileName;
    size = input.fileSize || 0;
    modified = input.lastModified || 0;
  }

  return `${name}_${size}_${modified}`;
};

/**
 * Generate session key from photos list
 */
export const generateSessionKey = (photos: PhotoRecord[]): string => {
  if (photos.length === 0) return '';

  const keys = photos.map(p => getFileKey(p)).sort();
  const str = JSON.stringify(keys);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash;
  }

  const positiveHash = (hash >>> 0).toString(16);
  return `sess_${positiveHash}`;
};

export const getCachedAnalysis = async (input: File | PhotoRecord): Promise<AIAnalysisResult | null> => {
  if (fsCache.isAvailable() && !(input instanceof File)) {
    const fsCached = await fsCache.getCachedAnalysis(input);
    if (fsCached) {
      console.log('Retrieved from file system cache');
      return fsCached;
    }
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_CACHE, 'readonly');
    const store = transaction.objectStore(STORE_CACHE);
    const key = getFileKey(input);
    const request = store.get(key);

    request.onsuccess = () => {
      resolve(request.result as AIAnalysisResult || null);
    };
    request.onerror = () => {
      console.warn("Cache lookup failed", request.error);
      resolve(null);
    };
  });
};

export const cacheAnalysis = async (input: File | PhotoRecord, result: AIAnalysisResult): Promise<void> => {
  if (fsCache.isAvailable() && !(input instanceof File)) {
    await fsCache.cacheAnalysis(input, result);
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_CACHE, 'readwrite');
    const store = transaction.objectStore(STORE_CACHE);
    const key = getFileKey(input);
    const request = store.put(result, key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const clearAnalysisCache = async (): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_CACHE, 'readwrite');
    const store = transaction.objectStore(STORE_CACHE);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Check if a file has cached analysis result
 */
export const hasCachedAnalysis = async (file: File): Promise<boolean> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const transaction = db.transaction(STORE_CACHE, 'readonly');
    const store = transaction.objectStore(STORE_CACHE);
    const key = getFileKey(file);
    const request = store.get(key);

    request.onsuccess = () => {
      resolve(request.result !== undefined);
    };
    request.onerror = () => {
      resolve(false);
    };
  });
};

/**
 * Delete cache for specific files
 */
export const deleteCacheByFiles = async (files: File[]): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_CACHE, 'readwrite');
    const store = transaction.objectStore(STORE_CACHE);

    let completed = 0;
    const total = files.length;

    if (total === 0) {
      resolve();
      return;
    }

    files.forEach(file => {
      const key = getFileKey(file);
      const request = store.delete(key);

      request.onsuccess = () => {
        completed++;
        if (completed === total) resolve();
      };
      request.onerror = () => {
        completed++;
        if (completed === total) resolve();
      };
    });
  });
};

/**
 * Get cached analysis by key directly
 */
export const getCachedAnalysisByKey = async (key: string): Promise<AIAnalysisResult | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_CACHE, 'readonly');
    const store = transaction.objectStore(STORE_CACHE);
    const request = store.get(key);

    request.onsuccess = () => {
      resolve(request.result as AIAnalysisResult || null);
    };
    request.onerror = () => {
      console.warn("Cache lookup by key failed", request.error);
      resolve(null);
    };
  });
};
