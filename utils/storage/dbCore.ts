// Database core - constants and openDB function

export const DB_NAME = 'ConstructionPhotoManagerDB';
export const DB_VERSION = 9;
export const STORE_SESSION = 'projectData';
export const STORE_CACHE = 'analysisCache';
export const STORE_RULES = 'analysisRules';
export const STORE_EXAMPLES = 'analysisExamples';
export const STORE_SESSIONS = 'analysisSessions';
export const STORE_HISTORY = 'analysisHistory';
export const STORE_ISSUES = 'analysisIssues';
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
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
};
