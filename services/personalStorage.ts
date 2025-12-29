/**
 * 個人ストレージ - ユーザー指定の別リポジトリに個人データを暗号化して保存
 */

import {
  PersonalConfig,
  EncryptedCredentials,
  SessionData,
  SyncResult,
} from '../types';
import { encrypt, hashPassword, verifyPassword } from '../utils/crypto';

const PERSONAL_DIR = 'gaspm-data';
const FILES = {
  config: `${PERSONAL_DIR}/config.json`,
  credentials: `${PERSONAL_DIR}/credentials.enc.json`,
};

const DB_NAME = 'GASPMPersonalStorage';
const DB_VERSION = 1;
const STORES = { data: 'personalData', sessions: 'sessions' };

const PERSONAL_REPO_KEY = 'gaspm_personal_repo';
const MASTER_HASH_KEY = 'gaspm_master_hash';

let cachedConfig: PersonalConfig | null = null;
let masterPasswordHash: string | null = null;
let unlocked = false;
let pendingChanges = false;

// IndexedDB汎用ラッパー
const withDB = async <T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest
): Promise<T> => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORES.data)) {
        db.createObjectStore(STORES.data, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.sessions)) {
        db.createObjectStore(STORES.sessions, { keyPath: 'id' });
      }
    };
    request.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    request.onerror = (e) => reject((e.target as IDBOpenDBRequest).error);
  });

  return new Promise((resolve, reject) => {
    const store = db.transaction(storeName, mode).objectStore(storeName);
    const req = operation(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

const saveLocal = <T>(key: string, data: T) =>
  withDB<void>(STORES.data, 'readwrite', (s) =>
    s.put({ key, data, updatedAt: new Date().toISOString() })
  );

const loadLocal = async <T>(key: string): Promise<T | null> => {
  try {
    const result = await withDB<{ data: T } | undefined>(STORES.data, 'readonly', (s) => s.get(key));
    return result?.data ?? null;
  } catch {
    return null;
  }
};

// GitHub API
const githubFetch = async (token: string, owner: string, repo: string, path: string, options?: RequestInit) => {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      ...options?.headers,
    },
  });
};

const fetchFromGitHub = async <T>(
  token: string, owner: string, repo: string, path: string
): Promise<{ data: T; sha: string } | null> => {
  try {
    const res = await githubFetch(token, owner, repo, path);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    const result = await res.json();
    return { data: JSON.parse(atob(result.content)), sha: result.sha };
  } catch (e) {
    console.warn(`[PersonalStorage] Failed to fetch ${path}:`, e);
    return null;
  }
};

const saveToGitHub = async <T>(
  token: string, owner: string, repo: string, path: string,
  data: T, message: string, sha?: string
): Promise<{ success: boolean; sha?: string }> => {
  try {
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    const res = await githubFetch(token, owner, repo, path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, content, branch: 'main', ...(sha && { sha }) }),
    });
    if (!res.ok) throw new Error((await res.json()).message || `GitHub API error: ${res.status}`);
    return { success: true, sha: (await res.json()).content?.sha };
  } catch (e) {
    console.error(`[PersonalStorage] Failed to save ${path}:`, e);
    return { success: false };
  }
};

const getPersonalRepoInfo = (): { owner: string; repo: string } | null => {
  try {
    const stored = localStorage.getItem(PERSONAL_REPO_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

const getGitHubToken = () => localStorage.getItem('github_token');

const createDefaultConfig = (): PersonalConfig => ({
  version: 0,
  language: 'ja',
  theme: 'system',
  updatedAt: new Date().toISOString(),
});

// 公開API
export const isPersonalStorageConfigured = () => getPersonalRepoInfo() !== null;

export const configurePersonalRepo = async (
  repoUrl: string, masterPassword: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (!match) return { success: false, error: '無効なGitHubリポジトリURL' };

    const [, owner, repo] = match;
    const token = getGitHubToken();
    if (!token) return { success: false, error: 'GitHubトークンが設定されていません' };

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return { success: false, error: 'リポジトリにアクセスできません' };

    const hash = await hashPassword(masterPassword);
    localStorage.setItem(MASTER_HASH_KEY, hash);
    localStorage.setItem(PERSONAL_REPO_KEY, JSON.stringify({ owner, repo }));
    masterPasswordHash = hash;
    unlocked = true;
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const unlock = async (password: string): Promise<boolean> => {
  const storedHash = localStorage.getItem(MASTER_HASH_KEY);
  if (!storedHash) return false;
  const valid = await verifyPassword(password, storedHash);
  if (valid) {
    masterPasswordHash = storedHash;
    unlocked = true;
  }
  return valid;
};

export const isUnlocked = () => unlocked;

export const getCredential = async (key: string): Promise<string | null> => {
  return localStorage.getItem(key);
};

export const setCredential = async (key: string, value: string, password?: string): Promise<void> => {
  if (password) {
    const { encrypted, iv, salt } = await encrypt(value, password);
    const credentials = (await loadLocal<EncryptedCredentials>('credentials')) || {};
    (credentials as any)[key] = encrypted;
    credentials.iv = iv;
    credentials.salt = salt;
    await saveLocal('credentials', credentials);
    pendingChanges = true;
  } else {
    localStorage.setItem(key, value);
  }
};

export const getPersonalConfig = async (): Promise<PersonalConfig> => {
  if (cachedConfig) return cachedConfig;

  let config = await loadLocal<PersonalConfig>('config');
  const token = getGitHubToken();
  const repoInfo = getPersonalRepoInfo();

  if (token && repoInfo) {
    const remote = await fetchFromGitHub<PersonalConfig>(token, repoInfo.owner, repoInfo.repo, FILES.config);
    if (remote && (!config || remote.data.version > config.version)) {
      config = remote.data;
      await saveLocal('config', config);
    }
  }

  cachedConfig = config || createDefaultConfig();
  return cachedConfig;
};

export const savePersonalConfig = async (config: PersonalConfig): Promise<void> => {
  config.version++;
  config.updatedAt = new Date().toISOString();
  cachedConfig = config;
  await saveLocal('config', config);
  pendingChanges = true;
};

export const saveSession = async (session: SessionData): Promise<void> => {
  await withDB<void>(STORES.sessions, 'readwrite', (s) => s.put(session));
  pendingChanges = true;
};

export const getSessions = async (projectId: string): Promise<SessionData[]> => {
  const all = await withDB<SessionData[]>(STORES.sessions, 'readonly', (s) => s.getAll());
  return all.filter((s) => s.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const syncToGitHub = async (): Promise<SyncResult> => {
  const token = getGitHubToken();
  const repoInfo = getPersonalRepoInfo();
  if (!token || !repoInfo) {
    return { success: false, pushed: 0, pulled: 0, error: '個人リポジトリ未設定' };
  }

  let pushed = 0, pulled = 0;
  try {
    const config = await getPersonalConfig();
    const remoteConfig = await fetchFromGitHub<PersonalConfig>(token, repoInfo.owner, repoInfo.repo, FILES.config);

    if (!remoteConfig || config.version > remoteConfig.data.version) {
      if ((await saveToGitHub(token, repoInfo.owner, repoInfo.repo, FILES.config, config, '[GASPM] Update personal config', remoteConfig?.sha)).success) pushed++;
    } else if (remoteConfig.data.version > config.version) {
      cachedConfig = remoteConfig.data;
      await saveLocal('config', remoteConfig.data);
      pulled++;
    }

    const credentials = await loadLocal<EncryptedCredentials>('credentials');
    if (credentials) {
      const remoteCreds = await fetchFromGitHub<EncryptedCredentials>(token, repoInfo.owner, repoInfo.repo, FILES.credentials);
      if ((await saveToGitHub(token, repoInfo.owner, repoInfo.repo, FILES.credentials, credentials, '[GASPM] Update credentials', remoteCreds?.sha)).success) pushed++;
    }

    pendingChanges = false;
    return { success: true, pushed, pulled };
  } catch (e: any) {
    return { success: false, pushed, pulled, error: e.message };
  }
};

export const hasPendingChanges = () => pendingChanges;

export const clearCache = () => {
  cachedConfig = null;
  unlocked = false;
};
