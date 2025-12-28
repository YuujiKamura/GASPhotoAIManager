// Project data (session) management

import { PhotoRecord } from "../../types";
import { openDB, STORE_SESSION, KEY_SESSION } from "./dbCore";

export const saveProjectData = async (photos: PhotoRecord[]): Promise<void> => {
  if (photos.length === 0) return;

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
