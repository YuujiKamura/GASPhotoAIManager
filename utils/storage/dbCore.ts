// Database core - constants and openDB function

export const DB_NAME = 'ConstructionPhotoManagerDB';
export const DB_VERSION = 12;  // 11 → 12 for Engram Level 3
export const STORE_SESSION = 'projectData';
export const STORE_CACHE = 'analysisCache';
export const STORE_RULES = 'analysisRules';
export const STORE_EXAMPLES = 'analysisExamples';
export const STORE_SESSIONS = 'analysisSessions';
export const STORE_HISTORY = 'analysisHistory';
export const STORE_ISSUES = 'analysisIssues';
export const STORE_LEARNED = 'learnedRules';
export const STORE_IMAGE_HASH = 'imageHashIndex';
export const STORE_KNOWLEDGE_DB = 'knowledgeDB';  // Engram Level 3
export const KEY_SESSION = 'currentSession';
export const KEY_ACTIVE_SESSION = 'activeExampleSession';
export const MAX_HISTORY_ENTRIES = 20;

export const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_SESSION)) {
        db.createObjectStore(STORE_SESSION);
      }

      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE);
      }

      if (!db.objectStoreNames.contains(STORE_RULES)) {
        db.createObjectStore(STORE_RULES, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(STORE_EXAMPLES)) {
        const examplesStore = db.createObjectStore(STORE_EXAMPLES, { keyPath: 'id' });
        examplesStore.createIndex('category', 'category', { unique: false });
        examplesStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const sessionsStore = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
        sessionsStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_HISTORY)) {
        const historyStore = db.createObjectStore(STORE_HISTORY, { keyPath: 'id' });
        historyStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_ISSUES)) {
        const issuesStore = db.createObjectStore(STORE_ISSUES, { keyPath: 'id' });
        issuesStore.createIndex('createdAt', 'createdAt', { unique: false });
        issuesStore.createIndex('status', 'status', { unique: false });
        issuesStore.createIndex('issueType', 'issueType', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_LEARNED)) {
        db.createObjectStore(STORE_LEARNED, { keyPath: 'id' });
      }

      // 画像ハッシュインデックス (Engram Level 2)
      if (!db.objectStoreNames.contains(STORE_IMAGE_HASH)) {
        const hashStore = db.createObjectStore(STORE_IMAGE_HASH, { keyPath: 'id' });
        hashStore.createIndex('hash', 'hash', { unique: false });
        hashStore.createIndex('workType', 'workType', { unique: false });
        hashStore.createIndex('category', 'category', { unique: false });
        hashStore.createIndex('exampleId', 'exampleId', { unique: false });
        hashStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // 知識DB (Engram Level 3)
      if (!db.objectStoreNames.contains(STORE_KNOWLEDGE_DB)) {
        const knowledgeStore = db.createObjectStore(STORE_KNOWLEDGE_DB, { keyPath: 'id' });
        knowledgeStore.createIndex('type', 'type', { unique: false });
        knowledgeStore.createIndex('workType', 'workType', { unique: false });
        knowledgeStore.createIndex('contentHash', 'contentHash', { unique: false });
        knowledgeStore.createIndex('weight', 'weight', { unique: false });
        knowledgeStore.createIndex('createdAt', 'createdAt', { unique: false });
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
