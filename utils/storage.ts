

import { PhotoRecord, AIAnalysisResult } from "../types";

const DB_NAME = 'ConstructionPhotoManagerDB';
const DB_VERSION = 3; // Version 3 handles File storage in Session Store implicitly
const STORE_SESSION = 'projectData';
const STORE_CACHE = 'analysisCache'; // Persistent pool for analysis results
const STORE_RULES = 'analysisRules'; // New: Store for custom prompt rules
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

      // New Store for Rules
      if (!db.objectStoreNames.contains(STORE_RULES)) {
        db.createObjectStore(STORE_RULES, { keyPath: 'id' });
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