import { PhotoRecord, AIAnalysisResult, AnalysisExample, PhotoCategory } from "../types";
import { fsCache } from './fileSystemCache';

const DB_NAME = 'ConstructionPhotoManagerDB';
const DB_VERSION = 4; // Version 4: Added analysisExamples store
const STORE_SESSION = 'projectData';
const STORE_CACHE = 'analysisCache'; // Persistent pool for analysis results
const STORE_RULES = 'analysisRules'; // Store for custom prompt rules
const STORE_EXAMPLES = 'analysisExamples'; // NEW: Store for few-shot examples
const KEY_SESSION = 'currentSession';

export interface AnalysisRule {
  id: string;
  name: string;
  instruction: string;
  tags?: string[];
}

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Session Store (Current working state)
      if (!db.objectStoreNames.contains(STORE_SESSION)) {
        db.createObjectStore(STORE_SESSION);
      }

      // Cache Store (Persistent Pool)
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE);
      }

      // Store for Rules
      if (!db.objectStoreNames.contains(STORE_RULES)) {
        db.createObjectStore(STORE_RULES, { keyPath: 'id' });
      }

      // NEW: Store for Few-shot Examples (お手本)
      if (!db.objectStoreNames.contains(STORE_EXAMPLES)) {
        const examplesStore = db.createObjectStore(STORE_EXAMPLES, { keyPath: 'id' });
        examplesStore.createIndex('category', 'category', { unique: false });
        examplesStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
};

// --- Session Management (Current View) ---

export const saveProjectData = async (photos: PhotoRecord[]): Promise<void> => {
  if (photos.length === 0) return;

  // We NOW store the full record including the File object (supported by IDB).
  // This ensures that on reload, the 'originalFile' is preserved.
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_SESSION, 'readwrite');
    const store = transaction.objectStore(STORE_SESSION);
    const request = store.put(photos, KEY_SESSION);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const loadProjectData = async (): Promise<PhotoRecord[] | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_SESSION, 'readonly');
    const store = transaction.objectStore(STORE_SESSION);
    const request = store.get(KEY_SESSION);
    request.onsuccess = () => resolve(request.result as PhotoRecord[] || null);
    request.onerror = () => reject(request.error);
  });
};

export const clearProjectData = async (): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_SESSION, 'readwrite');
    const store = transaction.objectStore(STORE_SESSION);
    const request = store.delete(KEY_SESSION);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// --- Persistent Analysis Cache (Data Pool) ---

/**
 * Generates a unique key for the file based on its immutable properties.
 * Can handle a raw File object OR a PhotoRecord with metadata.
 */
const getFileKey = (input: File | PhotoRecord): string => {
  let name = "";
  let size = 0;
  let modified = 0;

  // Priority 1: Raw File Object
  if (input instanceof File) {
    name = input.name;
    size = input.size;
    modified = input.lastModified;
  }
  // Priority 2: PhotoRecord with originalFile (Ensures consistency if record missing explicit metadata)
  else if (input.originalFile) {
    name = input.fileName; // fileName matches originalFile.name
    size = input.originalFile.size;
    modified = input.originalFile.lastModified;
  }
  // Priority 3: PhotoRecord explicit metadata
  else {
    name = input.fileName;
    // Fallback to 0 if not present (legacy data compatibility)
    size = input.fileSize || 0;
    modified = input.lastModified || 0;
  }

  // Composite key: Name + Size + ModifiedTime ensures uniqueness for specific file versions
  return `${name}_${size}_${modified}`;
};

export const getCachedAnalysis = async (input: File | PhotoRecord): Promise<AIAnalysisResult | null> => {
  // 先にFile System Cacheを確認（利用可能な場合）
  if (fsCache.isAvailable() && !(input instanceof File)) {
    const fsCached = await fsCache.getCachedAnalysis(input);
    if (fsCached) {
      console.log('Retrieved from file system cache');
      return fsCached;
    }
  }

  // IndexedDBから取得
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
  // File System Cacheにも保存（利用可能な場合）
  if (fsCache.isAvailable() && !(input instanceof File)) {
    await fsCache.cacheAnalysis(input, result);
  }

  // IndexedDBにも保存
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

// --- Rules Management (New) ---

export const saveRule = async (rule: AnalysisRule): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_RULES, 'readwrite');
    const store = transaction.objectStore(STORE_RULES);
    const request = store.put(rule);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getRules = async (): Promise<AnalysisRule[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_RULES, 'readonly');
    const store = transaction.objectStore(STORE_RULES);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as AnalysisRule[]);
    request.onerror = () => reject(request.error);
  });
};

export const deleteRule = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_RULES, 'readwrite');
    const store = transaction.objectStore(STORE_RULES);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// --- Examples Management (お手本 - Few-shot Examples) ---

/**
 * 解析例（お手本）を保存
 * PhotoRecordから必要な情報を抽出してExampleを作成
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
    thumbnail: record.base64, // 既にリサイズ済みのbase64を使用
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
 * 解析結果から写真区分を推定
 */
const detectPhotoCategory = (analysis: AIAnalysisResult): PhotoCategory => {
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
 * すべてのお手本を取得
 */
export const getExamples = async (): Promise<AnalysisExample[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_EXAMPLES, 'readonly');
    const store = transaction.objectStore(STORE_EXAMPLES);
    const request = store.getAll();
    request.onsuccess = () => {
      const examples = request.result as AnalysisExample[];
      // 作成日時の降順でソート（新しい順）
      examples.sort((a, b) => b.createdAt - a.createdAt);
      resolve(examples);
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * カテゴリーでフィルタしてお手本を取得
 */
export const getExamplesByCategory = async (category: PhotoCategory): Promise<AnalysisExample[]> => {
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
 * お手本を更新
 */
export const updateExample = async (example: AnalysisExample): Promise<void> => {
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
 * お手本を削除
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
 * すべてのお手本をクリア
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
 * 解析に使用するお手本を選択（関連性でフィルタ）
 * 最大3件を返す
 */
export const getRelevantExamples = async (
  workType?: string,
  category?: PhotoCategory,
  limit: number = 3
): Promise<AnalysisExample[]> => {
  const all = await getExamples();

  // スコアリングで関連性を計算
  const scored = all.map(ex => {
    let score = 0;

    // カテゴリー一致: +3点
    if (category && ex.category === category) {
      score += 3;
    }

    // 工種一致: +2点
    if (workType && ex.analysis.workType === workType) {
      score += 2;
    }

    // 基本スコア: お手本として登録されている = 1点
    score += 1;

    return { example: ex, score };
  });

  // スコア順にソートして上位を返す
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.example);
};

// --- Export / Import Utilities ---

export const exportDataToJson = (photos: PhotoRecord[]): string => {
  const dataToExport = photos.map(p => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { originalFile, ...rest } = p;
    return rest;
  });
  return JSON.stringify(dataToExport, null, 2);
};

export const importDataFromJson = (jsonStr: string): PhotoRecord[] => {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) throw new Error("Invalid JSON format");
    return parsed as PhotoRecord[];
  } catch (e) {
    console.error("Import failed", e);
    throw e;
  }
};

export const exportRulesToJson = (rules: AnalysisRule[]): string => {
  return JSON.stringify(rules, null, 2);
};

export const importRulesFromJson = (jsonStr: string): AnalysisRule[] => {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) throw new Error("Invalid Rules JSON format");
    return parsed as AnalysisRule[];
  } catch (e) {
    console.error("Import rules failed", e);
    throw e;
  }
};