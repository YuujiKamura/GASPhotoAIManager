// Analysis issues (問題ケース) management

import { PhotoRecord, AnalysisIssue, IssueType, IssueStatus } from "../../types";
import { openDB, STORE_ISSUES } from "./dbCore";

/**
 * Save analysis issue
 */
export const saveAnalysisIssue = async (
  record: PhotoRecord,
  issueDescription: string,
  issueType: IssueType,
  expectedValues?: AnalysisIssue['expectedValues']
): Promise<AnalysisIssue> => {
  if (!record.analysis) {
    throw new Error('解析結果がありません');
  }

  const now = Date.now();
  const issue: AnalysisIssue = {
    id: `issue_${now}_${Math.random().toString(36).substr(2, 9)}`,
    fileName: record.fileName,
    thumbnail: record.base64,
    actualAnalysis: { ...record.analysis },
    expectedValues,
    issueDescription,
    issueType,
    status: 'open',
    createdAt: now
  };

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_ISSUES, 'readwrite');
    const store = transaction.objectStore(STORE_ISSUES);
    const request = store.put(issue);
    request.onsuccess = () => resolve(issue);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Get all issues (newest first)
 */
export const getAnalysisIssues = async (): Promise<AnalysisIssue[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_ISSUES, 'readonly');
    const store = transaction.objectStore(STORE_ISSUES);
    const request = store.getAll();
    request.onsuccess = () => {
      const issues = request.result as AnalysisIssue[];
      resolve(issues.sort((a, b) => b.createdAt - a.createdAt));
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * Get issues by status
 */
export const getIssuesByStatus = async (status: IssueStatus): Promise<AnalysisIssue[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_ISSUES, 'readonly');
    const store = transaction.objectStore(STORE_ISSUES);
    const index = store.index('status');
    const request = index.getAll(status);
    request.onsuccess = () => {
      const issues = request.result as AnalysisIssue[];
      resolve(issues.sort((a, b) => b.createdAt - a.createdAt));
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * Update issue
 */
export const updateAnalysisIssue = async (
  id: string,
  updates: Partial<Omit<AnalysisIssue, 'id' | 'createdAt'>>
): Promise<AnalysisIssue | null> => {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_ISSUES, 'readwrite');
    const store = transaction.objectStore(STORE_ISSUES);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const issue = getRequest.result as AnalysisIssue | undefined;
      if (!issue) {
        resolve(null);
        return;
      }

      const updated = { ...issue, ...updates };
      if (updates.status === 'resolved') {
        updated.resolvedAt = Date.now();
      }

      const putRequest = store.put(updated);
      putRequest.onsuccess = () => resolve(updated);
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
};

/**
 * Delete issue
 */
export const deleteAnalysisIssue = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_ISSUES, 'readwrite');
    const store = transaction.objectStore(STORE_ISSUES);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Get open issue count
 */
export const getOpenIssueCount = async (): Promise<number> => {
  const issues = await getIssuesByStatus('open');
  return issues.length;
};
