import { PhotoRecord, AIAnalysisResult, AnalysisExample, AnalysisSession, AnalysisHistoryEntry, PhotoCategory } from "../types";
import { fsCache } from './fileSystemCache';

const DB_NAME = 'ConstructionPhotoManagerDB';
const DB_VERSION = 6; // Version 6: Added analysisHistory store
const STORE_SESSION = 'projectData'; // Legacy - kept for migration
const STORE_CACHE = 'analysisCache'; // Persistent pool for analysis results
const STORE_RULES = 'analysisRules'; // Store for custom prompt rules
const STORE_EXAMPLES = 'analysisExamples'; // Store for few-shot examples
const STORE_SESSIONS = 'analysisSessions'; // Store for saved sessions (お手本セッション)
const STORE_HISTORY = 'analysisHistory'; // Store for analysis history (履歴) - NOW MAIN SESSION STORE
const KEY_CURRENT_SESSION_ID = 'currentSessionId'; // LocalStorage key for current session ID
const KEY_ACTIVE_SESSION = 'activeExampleSession'; // LocalStorage key for currently selected example session

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

      // Store for Few-shot Examples (お手本)
      if (!db.objectStoreNames.contains(STORE_EXAMPLES)) {
        const examplesStore = db.createObjectStore(STORE_EXAMPLES, { keyPath: 'id' });
        examplesStore.createIndex('category', 'category', { unique: false });
        examplesStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // NEW: Store for saved sessions (お手本セッション)
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const sessionsStore = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
        sessionsStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Store for analysis history (解析履歴)
      if (!db.objectStoreNames.contains(STORE_HISTORY)) {
        const historyStore = db.createObjectStore(STORE_HISTORY, { keyPath: 'id' });
        historyStore.createIndex('createdAt', 'createdAt', { unique: false });
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

// --- Session Management (Unified with History) ---

/**
 * 現在のセッションIDを取得
 */
export const getCurrentSessionId = (): string | null => {
  return localStorage.getItem(KEY_CURRENT_SESSION_ID);
};

/**
 * 現在のセッションIDを設定
 */
export const setCurrentSessionId = (id: string): void => {
  localStorage.setItem(KEY_CURRENT_SESSION_ID, id);
};

/**
 * 現在のセッションIDをクリア
 */
export const clearCurrentSessionId = (): void => {
  localStorage.removeItem(KEY_CURRENT_SESSION_ID);
};

/**
 * 新しいセッションを開始（IDを生成して設定）
 */
export const startNewSession = (): string => {
  const id = crypto.randomUUID();
  setCurrentSessionId(id);
  return id;
};

/**
 * 現在のセッションを履歴に保存/更新（自動保存用）
 */
export const saveCurrentSession = async (
  photos: PhotoRecord[],
  instruction?: string,
  modelUsed?: string
): Promise<AnalysisHistoryEntry | null> => {
  if (photos.length === 0) return null;

  const db = await openDB();
  let sessionId = getCurrentSessionId();
  const now = Date.now();

  // 工種をサマリーとして抽出
  const workTypes = [...new Set(
    photos
      .map(p => p.analysis?.workType)
      .filter((w): w is string => !!w)
  )];

  // 既存セッションがあれば更新、なければ新規作成
  if (sessionId) {
    const existing = await getAnalysisHistoryEntry(sessionId);
    if (existing) {
      // 更新
      const updated: AnalysisHistoryEntry = {
        ...existing,
        updatedAt: now,
        photoCount: photos.length,
        photos,
        workTypes,
        instruction: instruction || existing.instruction,
        modelUsed: modelUsed || existing.modelUsed
      };
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_HISTORY, 'readwrite');
        const store = transaction.objectStore(STORE_HISTORY);
        const request = store.put(updated);
        request.onsuccess = () => resolve(updated);
        request.onerror = () => reject(request.error);
      });
    }
  }

  // 新規作成
  sessionId = startNewSession();
  const entry: AnalysisHistoryEntry = {
    id: sessionId,
    createdAt: now,
    updatedAt: now,
    photoCount: photos.length,
    instruction,
    workTypes,
    photos,
    modelUsed
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_HISTORY, 'readwrite');
    const store = transaction.objectStore(STORE_HISTORY);
    const request = store.add(entry);
    request.onsuccess = () => resolve(entry);
    request.onerror = () => reject(request.error);
  });
};

/**
 * 現在のセッション（または最新履歴）を読み込む
 * 旧projectDataからのマイグレーションも行う
 */
export const loadCurrentSession = async (): Promise<PhotoRecord[] | null> => {
  const db = await openDB();

  // 1. 現在のセッションIDがあればそれを読み込む
  const sessionId = getCurrentSessionId();
  if (sessionId) {
    const entry = await getAnalysisHistoryEntry(sessionId);
    if (entry && entry.photos.length > 0) {
      return entry.photos;
    }
  }

  // 2. 最新の履歴を読み込む
  const history = await getAnalysisHistory();
  if (history.length > 0) {
    const latest = history[0]; // 新しい順でソート済み
    setCurrentSessionId(latest.id);
    return latest.photos;
  }

  // 3. 旧projectDataからマイグレーション
  const legacyPhotos = await loadLegacyProjectData(db);
  if (legacyPhotos && legacyPhotos.length > 0) {
    // 履歴に移行
    const entry = await saveCurrentSession(legacyPhotos);
    if (entry) {
      // 旧データを削除
      await clearLegacyProjectData(db);
      return legacyPhotos;
    }
  }

  return null;
};

/**
 * 旧projectDataを読み込む（マイグレーション用）
 */
const loadLegacyProjectData = async (db: IDBDatabase): Promise<PhotoRecord[] | null> => {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_SESSION, 'readonly');
      const store = transaction.objectStore(STORE_SESSION);
      const request = store.get('currentSession');
      request.onsuccess = () => resolve(request.result as PhotoRecord[] || null);
      request.onerror = () => resolve(null); // エラーでもnullを返す
    } catch {
      resolve(null);
    }
  });
};

/**
 * 旧projectDataをクリア（マイグレーション後）
 */
const clearLegacyProjectData = async (db: IDBDatabase): Promise<void> => {
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE_SESSION, 'readwrite');
      const store = transaction.objectStore(STORE_SESSION);
      const request = store.delete('currentSession');
      request.onsuccess = () => resolve();
      request.onerror = () => resolve(); // エラーでも続行
    } catch {
      resolve();
    }
  });
};

/**
 * 現在のセッションをクリア（プロジェクトを閉じる時）
 */
export const clearCurrentSession = async (): Promise<void> => {
  const sessionId = getCurrentSessionId();
  if (sessionId) {
    // 履歴は残す（必要なら削除は別途）
  }
  clearCurrentSessionId();
};

/**
 * 履歴から特定のセッションを復元
 */
export const restoreSessionFromHistory = async (id: string): Promise<PhotoRecord[] | null> => {
  const entry = await getAnalysisHistoryEntry(id);
  if (entry && entry.photos.length > 0) {
    setCurrentSessionId(id);
    return entry.photos;
  }
  return null;
};

// Legacy aliases for backward compatibility (will be removed later)
export const saveProjectData = saveCurrentSession;
export const loadProjectData = loadCurrentSession;
export const clearProjectData = clearCurrentSession;

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
 * 解析に使用するお手本を選択
 * アクティブなセッションがあればそのセッションの例を返す
 * なければ全体からスコアリングで選択
 */
export const getRelevantExamples = async (
  workType?: string,
  category?: PhotoCategory,
  limit: number = 3
): Promise<AnalysisExample[]> => {
  // まずアクティブなセッションをチェック
  const activeSessionId = getActiveSessionId();
  if (activeSessionId) {
    const session = await getSession(activeSessionId);
    if (session && session.examples.length > 0) {
      // セッション内からスコアリング
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

  // アクティブセッションがなければ全体から
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

// --- Session Management (お手本セッション) ---

/**
 * 現在のセッション（写真一覧）をお手本セッションとして保存
 */
export const saveCurrentSessionAsExample = async (
  records: PhotoRecord[],
  name: string,
  description?: string
): Promise<AnalysisSession> => {
  const analyzedRecords = records.filter(r => r.analysis && r.status === 'done');
  if (analyzedRecords.length === 0) {
    throw new Error('解析済みの写真がありません');
  }

  const now = Date.now();
  const examples: AnalysisExample[] = analyzedRecords.map((record, i) => ({
    id: `ex_${now}_${i}`,
    name: `${record.analysis!.workType || ''} - ${record.analysis!.remarks || record.fileName}`,
    thumbnail: record.base64,
    analysis: { ...record.analysis! },
    category: detectPhotoCategory(record.analysis!),
    tags: [],
    createdAt: now,
    updatedAt: now
  }));

  const session: AnalysisSession = {
    id: `session_${now}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    description,
    examples,
    photoCount: examples.length,
    createdAt: now,
    updatedAt: now
  };

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_SESSIONS, 'readwrite');
    const store = transaction.objectStore(STORE_SESSIONS);
    const request = store.put(session);
    request.onsuccess = () => resolve(session);
    request.onerror = () => reject(request.error);
  });
};

/**
 * 保存されたセッション一覧を取得
 */
export const getSessions = async (): Promise<AnalysisSession[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_SESSIONS, 'readonly');
    const store = transaction.objectStore(STORE_SESSIONS);
    const request = store.getAll();
    request.onsuccess = () => {
      const sessions = request.result as AnalysisSession[];
      sessions.sort((a, b) => b.createdAt - a.createdAt);
      resolve(sessions);
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * 特定のセッションを取得
 */
export const getSession = async (id: string): Promise<AnalysisSession | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_SESSIONS, 'readonly');
    const store = transaction.objectStore(STORE_SESSIONS);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result as AnalysisSession || null);
    request.onerror = () => reject(request.error);
  });
};

/**
 * セッションを削除
 */
export const deleteSession = async (id: string): Promise<void> => {
  const db = await openDB();
  // アクティブだった場合はクリア
  if (getActiveSessionId() === id) {
    clearActiveSession();
  }
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_SESSIONS, 'readwrite');
    const store = transaction.objectStore(STORE_SESSIONS);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * 全セッションをクリア
 */
export const clearSessions = async (): Promise<void> => {
  clearActiveSession();
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_SESSIONS, 'readwrite');
    const store = transaction.objectStore(STORE_SESSIONS);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * アクティブなお手本セッションを設定
 */
export const setActiveSession = (sessionId: string): void => {
  localStorage.setItem(KEY_ACTIVE_SESSION, sessionId);
};

/**
 * アクティブなお手本セッションIDを取得
 */
export const getActiveSessionId = (): string | null => {
  return localStorage.getItem(KEY_ACTIVE_SESSION);
};

/**
 * アクティブなお手本セッションをクリア
 */
export const clearActiveSession = (): void => {
  localStorage.removeItem(KEY_ACTIVE_SESSION);
};

// --- Station History (測点履歴) ---

const KEY_STATION_HISTORY = 'stationHistory';
const MAX_STATION_HISTORY = 20; // 最大保存数

/**
 * 測点履歴を取得
 */
export const getStationHistory = (): string[] => {
  try {
    const data = localStorage.getItem(KEY_STATION_HISTORY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

/**
 * 測点を履歴に追加（重複は除去、最新が先頭）
 */
export const addStationToHistory = (station: string): void => {
  if (!station || station.trim() === '') return;

  const history = getStationHistory();
  // 既存のものを除去して先頭に追加
  const filtered = history.filter(s => s !== station);
  const newHistory = [station, ...filtered].slice(0, MAX_STATION_HISTORY);
  localStorage.setItem(KEY_STATION_HISTORY, JSON.stringify(newHistory));
};

/**
 * 複数の測点を履歴に追加
 */
export const addStationsToHistory = (stations: string[]): void => {
  const validStations = stations.filter(s => s && s.trim() !== '');
  if (validStations.length === 0) return;

  const history = getStationHistory();
  // 重複を除去しつつ新しいものを先頭に
  const combined = [...validStations, ...history];
  const unique = [...new Set(combined)].slice(0, MAX_STATION_HISTORY);
  localStorage.setItem(KEY_STATION_HISTORY, JSON.stringify(unique));
};

/**
 * 測点履歴をクリア
 */
export const clearStationHistory = (): void => {
  localStorage.removeItem(KEY_STATION_HISTORY);
};

/**
 * アクティブなセッションの情報を取得（表示用）
 */
export const getActiveSession = async (): Promise<AnalysisSession | null> => {
  const id = getActiveSessionId();
  if (!id) return null;
  return getSession(id);
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

// ============================================
// 解析履歴 (Analysis History)
// ============================================

/**
 * 解析結果を履歴として保存（現在のセッションを更新）
 */
export const saveAnalysisHistory = async (
  photos: PhotoRecord[],
  instruction: string,
  modelUsed?: string
): Promise<AnalysisHistoryEntry> => {
  // 現在のセッションを更新する形で保存
  const entry = await saveCurrentSession(photos, instruction, modelUsed);
  if (!entry) {
    throw new Error('Failed to save analysis history');
  }
  return entry;
};

/**
 * 履歴一覧を取得（更新日時の新しい順）
 */
export const getAnalysisHistory = async (): Promise<AnalysisHistoryEntry[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_HISTORY, 'readonly');
    const store = transaction.objectStore(STORE_HISTORY);
    const request = store.getAll();
    request.onsuccess = () => {
      const entries = request.result as AnalysisHistoryEntry[];
      // updatedAtがあればそれで、なければcreatedAtでソート（新しい順）
      entries.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
      resolve(entries);
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * 特定の履歴を取得
 */
export const getAnalysisHistoryEntry = async (id: string): Promise<AnalysisHistoryEntry | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_HISTORY, 'readonly');
    const store = transaction.objectStore(STORE_HISTORY);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result as AnalysisHistoryEntry || null);
    request.onerror = () => reject(request.error);
  });
};

/**
 * 履歴を削除
 */
export const deleteAnalysisHistory = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_HISTORY, 'readwrite');
    const store = transaction.objectStore(STORE_HISTORY);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * 全履歴を削除
 */
export const clearAnalysisHistory = async (): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_HISTORY, 'readwrite');
    const store = transaction.objectStore(STORE_HISTORY);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};