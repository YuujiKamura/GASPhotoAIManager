// Analysis rules management

import { openDB, STORE_RULES } from "./dbCore";

export interface AnalysisRule {
  id: string;
  name: string;
  instruction: string;
  tags?: string[];
}

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
