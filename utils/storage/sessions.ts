// Analysis sessions (お手本セッション) management

import { PhotoRecord, AnalysisExample, AnalysisSession } from "../../types";
import { openDB, STORE_SESSIONS, KEY_ACTIVE_SESSION } from "./dbCore";
import { detectPhotoCategory } from "./examples";

/**
 * Save current session as example session
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
 * Get all sessions
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
 * Get specific session
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
 * Delete session
 */
export const deleteSession = async (id: string): Promise<void> => {
  const db = await openDB();
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
 * Clear all sessions
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
 * Set active session
 */
export const setActiveSession = (sessionId: string): void => {
  localStorage.setItem(KEY_ACTIVE_SESSION, sessionId);
};

/**
 * Get active session ID
 */
export const getActiveSessionId = (): string | null => {
  return localStorage.getItem(KEY_ACTIVE_SESSION);
};

/**
 * Clear active session
 */
export const clearActiveSession = (): void => {
  localStorage.removeItem(KEY_ACTIVE_SESSION);
};

/**
 * Get active session info
 */
export const getActiveSession = async (): Promise<AnalysisSession | null> => {
  const id = getActiveSessionId();
  if (!id) return null;
  return getSession(id);
};
