/**
 * 個人ストレージ
 *
 * ユーザー指定の別リポジトリに個人データを暗号化して保存
 * - APIキー、認証情報（暗号化）
 * - 作業履歴
 * - 個人設定
 */

import {
  PersonalConfig,
  EncryptedCredentials,
  SessionData,
  SyncResult,
} from '../types';
import { encrypt, decrypt, hashPassword, verifyPassword } from '../utils/crypto';

// GitHub API設定
const PERSONAL_DIR = 'gaspm-data';
const FILES = {
  config: `${PERSONAL_DIR}/config.json`,
  credentials: `${PERSONAL_DIR}/credentials.enc.json`,
  sessions: `${PERSONAL_DIR}/sessions`,
};

// IndexedDB設定
const DB_NAME = 'GASPMPersonalStorage';
const DB_VERSION = 1;
const STORES = {
  data: 'personalData',
  sessions: 'sessions',
};

// メモリキャッシュ
let cachedConfig: PersonalConfig | null = null;
let masterPasswordHash: string | null = null;
let unlocked = false;
let pendingChanges = false;

// 設定キー
const PERSONAL_REPO_KEY = 'gaspm_personal_repo';
const MASTER_HASH_KEY = 'gaspm_master_hash';

/**
 * IndexedDBを開く
 */
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORES.data)) {
        db.createObjectStore(STORES.data, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.sessions)) {
        db.createObjectStore(STORES.sessions, { keyPath: 'id' });
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

/**
 * ローカルに保存
 */
const saveLocal = async <T>(key: string, data: T): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.data, 'readwrite');
    const store = transaction.objectStore(STORES.data);
    const request = store.put({ key, data, updatedAt: new Date().toISOString() });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * ローカルから読み込み
 */
const loadLocal = async <T>(key: string): Promise<T | null> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.data, 'readonly');
      const store = transaction.objectStore(STORES.data);
      const request = store.get(key);
      request.onsuccess = () => {
        resolve(request.result?.data || null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
};

/**
 * GitHub APIでファイルを取得
 */
const fetchFromGitHub = async <T>(
  token: string,
  owner: string,
  repo: string,
  path: string
): Promise<{ data: T; sha: string } | null> => {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const result = await response.json();
    const content = atob(result.content);
    return {
      data: JSON.parse(content) as T,
      sha: result.sha,
    };
  } catch (e) {
    console.warn(`[PersonalStorage] Failed to fetch ${path}:`, e);
    return null;
  }
};

/**
 * GitHub APIでファイルを保存
 */
const saveToGitHub = async <T>(
  token: string,
  owner: string,
  repo: string,
  path: string,
  data: T,
  message: string,
  sha?: string
): Promise<{ success: boolean; sha?: string }> => {
  try {
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));

    const body: Record<string, unknown> = {
      message,
      content,
      branch: 'main',
    };

    if (sha) {
      body.sha = sha;
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `GitHub API error: ${response.status}`);
    }

    const result = await response.json();
    return { success: true, sha: result.content.sha };
  } catch (e: any) {
    console.error(`[PersonalStorage] Failed to save ${path}:`, e);
    return { success: false };
  }
};

/**
 * 個人リポジトリ情報を取得
 */
const getPersonalRepoInfo = (): { owner: string; repo: string } | null => {
  const stored = localStorage.getItem(PERSONAL_REPO_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }
  return null;
};

/**
 * GitHubトークンを取得（暗号化されている場合は復号）
 */
const getGitHubToken = (): string | null => {
  // 暗号化前の移行期間はプレーンテキストも許容
  return localStorage.getItem('github_token');
};

// ============================================
// 公開API
// ============================================

/**
 * 個人ストレージが設定済みか
 */
export const isPersonalStorageConfigured = (): boolean => {
  return getPersonalRepoInfo() !== null;
};

/**
 * 個人リポジトリを設定
 */
export const configurePersonalRepo = async (
  repoUrl: string,
  masterPassword: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // URLからowner/repoを抽出
    const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (!match) {
      return { success: false, error: '無効なGitHubリポジトリURL' };
    }

    const owner = match[1];
    const repo = match[2];

    // トークンで接続確認
    const token = getGitHubToken();
    if (!token) {
      return { success: false, error: 'GitHubトークンが設定されていません' };
    }

    // リポジトリアクセス確認
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      return { success: false, error: 'リポジトリにアクセスできません' };
    }

    // マスターパスワードのハッシュを保存
    const hash = await hashPassword(masterPassword);
    localStorage.setItem(MASTER_HASH_KEY, hash);
    masterPasswordHash = hash;

    // リポジトリ情報を保存
    localStorage.setItem(PERSONAL_REPO_KEY, JSON.stringify({ owner, repo }));

    unlocked = true;
    console.log('[PersonalStorage] Configured:', owner, repo);

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

/**
 * マスターパスワードでアンロック
 */
export const unlock = async (password: string): Promise<boolean> => {
  const storedHash = localStorage.getItem(MASTER_HASH_KEY);
  if (!storedHash) {
    return false;
  }

  const valid = await verifyPassword(password, storedHash);
  if (valid) {
    masterPasswordHash = storedHash;
    unlocked = true;
  }
  return valid;
};

/**
 * アンロック状態か
 */
export const isUnlocked = (): boolean => {
  return unlocked;
};

/**
 * 認証情報を取得
 */
export const getCredential = async (key: string): Promise<string | null> => {
  // ローカルから取得（暗号化されていない移行期間）
  const plain = localStorage.getItem(key);
  if (plain) {
    return plain;
  }

  // 暗号化データから取得（将来）
  // TODO: 実装

  return null;
};

/**
 * 認証情報を保存
 */
export const setCredential = async (
  key: string,
  value: string,
  password?: string
): Promise<void> => {
  if (password) {
    // 暗号化して保存
    const { encrypted, iv, salt } = await encrypt(value, password);
    const credentials = await loadLocal<EncryptedCredentials>('credentials') || {};
    (credentials as any)[key] = encrypted;
    credentials.iv = iv;
    credentials.salt = salt;
    await saveLocal('credentials', credentials);
    pendingChanges = true;
  } else {
    // 平文で保存（移行期間）
    localStorage.setItem(key, value);
  }
};

/**
 * 個人設定を取得
 */
export const getPersonalConfig = async (): Promise<PersonalConfig> => {
  if (cachedConfig) {
    return cachedConfig;
  }

  let config = await loadLocal<PersonalConfig>('config');

  // GitHubから読み込み
  const token = getGitHubToken();
  const repoInfo = getPersonalRepoInfo();

  if (token && repoInfo) {
    const remote = await fetchFromGitHub<PersonalConfig>(
      token,
      repoInfo.owner,
      repoInfo.repo,
      FILES.config
    );

    if (remote && (!config || remote.data.version > config.version)) {
      config = remote.data;
      await saveLocal('config', config);
    }
  }

  cachedConfig = config || createDefaultConfig();
  return cachedConfig;
};

/**
 * 個人設定を保存
 */
export const savePersonalConfig = async (config: PersonalConfig): Promise<void> => {
  config.version++;
  config.updatedAt = new Date().toISOString();

  cachedConfig = config;
  await saveLocal('config', config);
  pendingChanges = true;
};

/**
 * セッションを保存
 */
export const saveSession = async (session: SessionData): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.sessions, 'readwrite');
    const store = transaction.objectStore(STORES.sessions);
    const request = store.put(session);
    request.onsuccess = () => {
      pendingChanges = true;
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * プロジェクトのセッション一覧を取得
 */
export const getSessions = async (projectId: string): Promise<SessionData[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.sessions, 'readonly');
    const store = transaction.objectStore(STORES.sessions);
    const request = store.getAll();
    request.onsuccess = () => {
      const all = request.result as SessionData[];
      const filtered = all.filter((s) => s.projectId === projectId);
      filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      resolve(filtered);
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * GitHubに同期
 */
export const syncToGitHub = async (): Promise<SyncResult> => {
  const token = getGitHubToken();
  const repoInfo = getPersonalRepoInfo();

  if (!token || !repoInfo) {
    return {
      success: false,
      pushed: 0,
      pulled: 0,
      error: '個人リポジトリ未設定',
    };
  }

  let pushed = 0;
  let pulled = 0;

  try {
    // 設定を同期
    const config = await getPersonalConfig();
    const remoteConfig = await fetchFromGitHub<PersonalConfig>(
      token,
      repoInfo.owner,
      repoInfo.repo,
      FILES.config
    );

    if (!remoteConfig || config.version > remoteConfig.data.version) {
      const result = await saveToGitHub(
        token,
        repoInfo.owner,
        repoInfo.repo,
        FILES.config,
        config,
        '[GASPM] Update personal config',
        remoteConfig?.sha
      );
      if (result.success) pushed++;
    } else if (remoteConfig.data.version > config.version) {
      cachedConfig = remoteConfig.data;
      await saveLocal('config', remoteConfig.data);
      pulled++;
    }

    // 認証情報を同期
    const credentials = await loadLocal<EncryptedCredentials>('credentials');
    if (credentials) {
      const remoteCredentials = await fetchFromGitHub<EncryptedCredentials>(
        token,
        repoInfo.owner,
        repoInfo.repo,
        FILES.credentials
      );

      const result = await saveToGitHub(
        token,
        repoInfo.owner,
        repoInfo.repo,
        FILES.credentials,
        credentials,
        '[GASPM] Update credentials',
        remoteCredentials?.sha
      );
      if (result.success) pushed++;
    }

    pendingChanges = false;

    return {
      success: true,
      pushed,
      pulled,
    };
  } catch (e: any) {
    return {
      success: false,
      pushed,
      pulled,
      error: e.message,
    };
  }
};

/**
 * 未同期の変更があるか
 */
export const hasPendingChanges = (): boolean => {
  return pendingChanges;
};

/**
 * キャッシュをクリア
 */
export const clearCache = (): void => {
  cachedConfig = null;
  unlocked = false;
};

// ============================================
// ヘルパー関数
// ============================================

const createDefaultConfig = (): PersonalConfig => ({
  version: 0,
  language: 'ja',
  theme: 'system',
  updatedAt: new Date().toISOString(),
});
