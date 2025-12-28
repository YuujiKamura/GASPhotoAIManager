import { PhotoRecord, AIAnalysisResult, AnalysisExample, AnalysisSession, AnalysisHistoryEntry, PhotoCategory } from "../types";
import { fsCache } from './fileSystemCache';

const DB_NAME = 'ConstructionPhotoManagerDB';
const DB_VERSION = 6; // Version 6: Added analysisHistory store
const STORE_SESSION = 'projectData';
const STORE_CACHE = 'analysisCache'; // Persistent pool for analysis results
const STORE_RULES = 'analysisRules'; // Store for custom prompt rules
const STORE_EXAMPLES = 'analysisExamples'; // Store for few-shot examples
const STORE_SESSIONS = 'analysisSessions'; // Store for saved sessions (お手本セッション)
const STORE_HISTORY = 'analysisHistory'; // Store for analysis history (履歴)
const KEY_SESSION = 'currentSession';
const KEY_ACTIVE_SESSION = 'activeExampleSession'; // LocalStorage key for currently selected session
const MAX_HISTORY_ENTRIES = 20; // 履歴の最大件数

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
export const getFileKey = (input: File | PhotoRecord): string => {
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

/**
 * 写真リストからセッションキーを生成
 * ファイルキーをソートしてハッシュ化することで、同じ写真群は同じキーになる
 */
export const generateSessionKey = (photos: PhotoRecord[]): string => {
  if (photos.length === 0) return '';

  // ファイルキーを取得してソート（順序が違っても同じキーになるように）
  const keys = photos.map(p => getFileKey(p)).sort();

  // シンプルなハッシュ生成（djb2アルゴリズム）
  const str = JSON.stringify(keys);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // 32bit整数に変換
  }

  // 正の16進数に変換
  const positiveHash = (hash >>> 0).toString(16);
  return `sess_${positiveHash}`;
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
// 解析履歴 (Analysis History) - 軽量版
// ============================================

/**
 * 履歴用の自動名称を生成
 */
const generateHistoryName = (workTypes: string[], createdAt: number): string => {
  const date = new Date(createdAt);
  const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (workTypes.length === 0) {
    return dateStr;
  }
  const typeSummary = workTypes.slice(0, 2).join('・');
  return workTypes.length > 2 ? `${typeSummary}他 (${dateStr})` : `${typeSummary} (${dateStr})`;
};

/**
 * 解析結果を履歴として保存（お手本機能統合版）
 */
export const saveAnalysisHistory = async (
  photos: PhotoRecord[],
  instruction: string,
  modelUsed?: string
): Promise<AnalysisHistoryEntry> => {
  const db = await openDB();

  // 工種をサマリーとして抽出
  const workTypes = [...new Set(
    photos
      .map(p => p.analysis?.workType)
      .filter((w): w is string => !!w)
  )];

  // セッションキーと写真キーを生成
  const sessionKey = generateSessionKey(photos);
  const photoKeys = photos.map(p => getFileKey(p));

  // サムネイルを最大6枚抽出
  const thumbnails = photos
    .filter(p => p.base64)
    .slice(0, 6)
    .map(p => p.base64);

  const createdAt = Date.now();
  const entry: AnalysisHistoryEntry = {
    id: crypto.randomUUID(),
    sessionKey,
    createdAt,
    photoCount: photos.length,
    instruction,
    workTypes,
    photoKeys,
    modelUsed,
    // お手本機能用（デフォルトはfalse）
    isExampleSession: false,
    name: generateHistoryName(workTypes, createdAt),
    thumbnails
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
 * 重複チェック付きで履歴に追加（起動時・PDF読み込み時用）
 * 同じセッションキーが既にあれば追加しない
 * 上限を超えた場合は古いものを削除
 */
export const addToHistoryIfNew = async (
  photos: PhotoRecord[],
  instruction: string = '',
  modelUsed?: string
): Promise<{ added: boolean; entry?: AnalysisHistoryEntry }> => {
  if (photos.length === 0) {
    return { added: false };
  }

  const sessionKey = generateSessionKey(photos);
  if (!sessionKey) {
    return { added: false };
  }

  // 既存履歴を取得
  const existingHistory = await getAnalysisHistory();

  // 同じセッションキーがあれば追加しない
  if (existingHistory.some(h => h.sessionKey === sessionKey)) {
    console.log('Session already exists in history:', sessionKey);
    return { added: false };
  }

  // 新規追加
  const entry = await saveAnalysisHistory(photos, instruction, modelUsed);

  // 上限を超えた場合、古いものを削除
  if (existingHistory.length >= MAX_HISTORY_ENTRIES) {
    const toDelete = existingHistory.slice(MAX_HISTORY_ENTRIES - 1);
    for (const old of toDelete) {
      await deleteAnalysisHistory(old.id);
    }
    console.log(`Removed ${toDelete.length} old history entries`);
  }

  console.log('Added new session to history:', sessionKey);
  return { added: true, entry };
};

/**
 * 履歴一覧を取得（新しい順）
 */
export const getAnalysisHistory = async (): Promise<AnalysisHistoryEntry[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_HISTORY, 'readonly');
    const store = transaction.objectStore(STORE_HISTORY);
    const request = store.getAll();
    request.onsuccess = () => {
      const entries = request.result as AnalysisHistoryEntry[];
      // 新しい順にソート
      entries.sort((a, b) => b.createdAt - a.createdAt);
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

// ============================================
// 履歴 ⇔ お手本機能 統合
// ============================================

/**
 * 履歴エントリーをお手本として設定/解除
 */
export const toggleHistoryAsExample = async (
  id: string,
  isExample: boolean,
  name?: string
): Promise<AnalysisHistoryEntry | null> => {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_HISTORY, 'readwrite');
    const store = transaction.objectStore(STORE_HISTORY);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const entry = getRequest.result as AnalysisHistoryEntry | undefined;
      if (!entry) {
        resolve(null);
        return;
      }

      const updated: AnalysisHistoryEntry = {
        ...entry,
        isExampleSession: isExample,
        name: name || entry.name
      };

      const putRequest = store.put(updated);
      putRequest.onsuccess = () => resolve(updated);
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
};

/**
 * 履歴エントリーの名前を更新
 */
export const updateHistoryName = async (id: string, name: string): Promise<void> => {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_HISTORY, 'readwrite');
    const store = transaction.objectStore(STORE_HISTORY);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const entry = getRequest.result as AnalysisHistoryEntry | undefined;
      if (!entry) {
        resolve();
        return;
      }

      const updated = { ...entry, name };
      const putRequest = store.put(updated);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
};

/**
 * お手本として設定された履歴を取得
 */
export const getExampleHistoryEntries = async (): Promise<AnalysisHistoryEntry[]> => {
  const all = await getAnalysisHistory();
  return all.filter(entry => entry.isExampleSession);
};

/**
 * アクティブなお手本履歴を設定（LocalStorage）
 */
const KEY_ACTIVE_EXAMPLE_HISTORY = 'activeExampleHistoryId';

export const setActiveExampleHistory = (historyId: string | null): void => {
  if (historyId) {
    localStorage.setItem(KEY_ACTIVE_EXAMPLE_HISTORY, historyId);
  } else {
    localStorage.removeItem(KEY_ACTIVE_EXAMPLE_HISTORY);
  }
};

export const getActiveExampleHistoryId = (): string | null => {
  return localStorage.getItem(KEY_ACTIVE_EXAMPLE_HISTORY);
};

/**
 * アクティブなお手本履歴エントリーを取得
 */
export const getActiveExampleHistory = async (): Promise<AnalysisHistoryEntry | null> => {
  const id = getActiveExampleHistoryId();
  if (!id) return null;
  return getAnalysisHistoryEntry(id);
};