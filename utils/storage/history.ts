// Analysis history management

import { PhotoRecord, AnalysisHistoryEntry } from "../../types";
import { openDB, STORE_HISTORY, MAX_HISTORY_ENTRIES } from "./dbCore";
import { generateSessionKey, getFileKey } from "./analysisCache";

/**
 * Generate auto name for history
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
 * Save or update analysis history
 * If a session with the same sessionKey exists, update it; otherwise create new
 */
export const saveAnalysisHistory = async (
  photos: PhotoRecord[],
  instruction: string,
  modelUsed?: string
): Promise<AnalysisHistoryEntry> => {
  const db = await openDB();

  const workTypes = [...new Set(
    photos
      .map(p => p.analysis?.workType)
      .filter((w): w is string => !!w)
  )];

  const sessionKey = generateSessionKey(photos);
  const photoKeys = photos.map(p => getFileKey(p));

  const thumbnails = photos
    .filter(p => p.base64)
    .slice(0, 6)
    .map(p => p.base64);

  // Check for existing entry with same sessionKey
  const existingHistory = await getAnalysisHistory();
  const existingEntry = existingHistory.find(h => h.sessionKey === sessionKey);

  const now = Date.now();
  const entry: AnalysisHistoryEntry = existingEntry
    ? {
        ...existingEntry,
        // Keep original id, createdAt, name, isExampleSession
        photoCount: photos.length,
        instruction: instruction || existingEntry.instruction,
        workTypes,
        photoKeys,
        modelUsed: modelUsed || existingEntry.modelUsed,
        thumbnails,
        updatedAt: now  // Track last update time
      }
    : {
        id: crypto.randomUUID(),
        sessionKey,
        createdAt: now,
        photoCount: photos.length,
        instruction,
        workTypes,
        photoKeys,
        modelUsed,
        isExampleSession: false,
        name: generateHistoryName(workTypes, now),
        thumbnails
      };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_HISTORY, 'readwrite');
    const store = transaction.objectStore(STORE_HISTORY);
    // Use put() instead of add() to allow updates
    const request = store.put(entry);
    request.onsuccess = () => {
      console.log(existingEntry ? 'Updated existing history:' : 'Added new history:', sessionKey);
      resolve(entry);
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * Add to history if new (with duplicate check)
 */
const addToHistoryIfNew = async (
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

  const existingHistory = await getAnalysisHistory();

  if (existingHistory.some(h => h.sessionKey === sessionKey)) {
    console.log('Session already exists in history:', sessionKey);
    return { added: false };
  }

  const entry = await saveAnalysisHistory(photos, instruction, modelUsed);

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
 * Get all history entries (newest first)
 */
export const getAnalysisHistory = async (): Promise<AnalysisHistoryEntry[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_HISTORY, 'readonly');
    const store = transaction.objectStore(STORE_HISTORY);
    const request = store.getAll();
    request.onsuccess = () => {
      const entries = request.result as AnalysisHistoryEntry[];
      entries.sort((a, b) => b.createdAt - a.createdAt);
      resolve(entries);
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * Get specific history entry
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
 * Delete history entry
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
 * Clear all history
 */
const clearAnalysisHistory = async (): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_HISTORY, 'readwrite');
    const store = transaction.objectStore(STORE_HISTORY);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Toggle history as example
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
 * Update history name
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
 * Get history entries marked as examples
 */
const getExampleHistoryEntries = async (): Promise<AnalysisHistoryEntry[]> => {
  const all = await getAnalysisHistory();
  return all.filter(entry => entry.isExampleSession);
};

// Active example history management
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

const getActiveExampleHistory = async (): Promise<AnalysisHistoryEntry | null> => {
  const id = getActiveExampleHistoryId();
  if (!id) return null;
  return getAnalysisHistoryEntry(id);
};
