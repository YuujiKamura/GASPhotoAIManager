/**
 * プロジェクトストレージ
 *
 * プロジェクトリポジトリ内の .gaspm/ ディレクトリにデータを保存
 * GitHub APIを通じて同期
 */

import {
  ProjectConfig,
  LearnedRule,
  LearnedAlias,
  LearnedSettings,
  SyncResult,
} from '../types';

// GitHub API設定
const GASPM_DIR = '.gaspm';
const FILES = {
  config: `${GASPM_DIR}/project-config.json`,
  rules: `${GASPM_DIR}/learned-rules.json`,
  aliases: `${GASPM_DIR}/aliases.json`,
};

// IndexedDB設定
const DB_NAME = 'GASPMProjectStorage';
const DB_VERSION = 1;
const STORE_NAME = 'projectData';

// メモリキャッシュ
let cachedConfig: ProjectConfig | null = null;
let cachedRules: LearnedRule[] | null = null;
let cachedAliases: LearnedAlias[] | null = null;
let pendingChanges = false;

/**
 * IndexedDBを開く
 */
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
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
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
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
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
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
    console.warn(`[ProjectStorage] Failed to fetch ${path}:`, e);
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
    console.error(`[ProjectStorage] Failed to save ${path}:`, e);
    return { success: false };
  }
};

/**
 * リポジトリ情報を取得
 */
const getRepoInfo = (): { owner: string; repo: string } | null => {
  // 現在のページURLからリポジトリ情報を推測
  // または設定から取得
  const stored = localStorage.getItem('gaspm_project_repo');
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
 * リポジトリ情報を設定
 */
export const setProjectRepo = (owner: string, repo: string): void => {
  localStorage.setItem('gaspm_project_repo', JSON.stringify({ owner, repo }));
};

/**
 * GitHubトークンを取得
 */
const getGitHubToken = (): string | null => {
  return localStorage.getItem('github_token');
};

// ============================================
// 公開API
// ============================================

/**
 * プロジェクト設定を取得
 */
export const getProjectConfig = async (): Promise<ProjectConfig> => {
  if (cachedConfig) {
    return cachedConfig;
  }

  // ローカルから読み込み
  let config = await loadLocal<ProjectConfig>('config');

  // GitHubから読み込み
  const token = getGitHubToken();
  const repoInfo = getRepoInfo();

  if (token && repoInfo) {
    const remote = await fetchFromGitHub<ProjectConfig>(
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
 * プロジェクト設定を保存
 */
export const saveProjectConfig = async (config: ProjectConfig): Promise<void> => {
  config.version++;
  config.updatedAt = new Date().toISOString();

  cachedConfig = config;
  await saveLocal('config', config);
  pendingChanges = true;
};

/**
 * 学習ルールを取得
 */
export const getProjectRules = async (): Promise<LearnedRule[]> => {
  if (cachedRules) {
    return cachedRules;
  }

  let rules = await loadLocal<LearnedRule[]>('rules');

  const token = getGitHubToken();
  const repoInfo = getRepoInfo();

  if (token && repoInfo) {
    const remote = await fetchFromGitHub<LearnedRule[]>(
      token,
      repoInfo.owner,
      repoInfo.repo,
      FILES.rules
    );

    if (remote) {
      // マージ（IDで重複排除、新しい方を優先）
      const merged = mergeArraysById(rules || [], remote.data);
      rules = merged;
      await saveLocal('rules', rules);
    }
  }

  cachedRules = rules || [];
  return cachedRules;
};

/**
 * 学習ルールを追加
 */
export const addProjectRule = async (rule: LearnedRule): Promise<void> => {
  const rules = await getProjectRules();
  rules.push(rule);
  cachedRules = rules;
  await saveLocal('rules', rules);
  pendingChanges = true;
};

/**
 * エイリアスを取得
 */
export const getProjectAliases = async (): Promise<LearnedAlias[]> => {
  if (cachedAliases) {
    return cachedAliases;
  }

  let aliases = await loadLocal<LearnedAlias[]>('aliases');

  const token = getGitHubToken();
  const repoInfo = getRepoInfo();

  if (token && repoInfo) {
    const remote = await fetchFromGitHub<LearnedAlias[]>(
      token,
      repoInfo.owner,
      repoInfo.repo,
      FILES.aliases
    );

    if (remote) {
      const merged = mergeArraysById(aliases || [], remote.data);
      aliases = merged;
      await saveLocal('aliases', aliases);
    }
  }

  cachedAliases = aliases || [];
  return cachedAliases;
};

/**
 * エイリアスを追加
 */
export const addProjectAlias = async (alias: LearnedAlias): Promise<void> => {
  const aliases = await getProjectAliases();
  const exists = aliases.some(a => a.from === alias.from && a.to === alias.to);
  if (!exists) {
    aliases.push(alias);
    cachedAliases = aliases;
    await saveLocal('aliases', aliases);
    pendingChanges = true;
  }
};

/**
 * GitHubに同期
 */
export const syncToGitHub = async (): Promise<SyncResult> => {
  const token = getGitHubToken();
  const repoInfo = getRepoInfo();

  if (!token || !repoInfo) {
    return {
      success: false,
      pushed: 0,
      pulled: 0,
      error: 'GitHub未設定',
    };
  }

  let pushed = 0;
  let pulled = 0;

  try {
    // 設定を同期
    const config = await getProjectConfig();
    const remoteConfig = await fetchFromGitHub<ProjectConfig>(
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
        '[GASPM] Update project config',
        remoteConfig?.sha
      );
      if (result.success) pushed++;
    } else if (remoteConfig.data.version > config.version) {
      cachedConfig = remoteConfig.data;
      await saveLocal('config', remoteConfig.data);
      pulled++;
    }

    // ルールを同期
    const rules = await getProjectRules();
    const remoteRules = await fetchFromGitHub<LearnedRule[]>(
      token,
      repoInfo.owner,
      repoInfo.repo,
      FILES.rules
    );

    const mergedRules = mergeArraysById(rules, remoteRules?.data || []);
    if (mergedRules.length > (remoteRules?.data?.length || 0)) {
      const result = await saveToGitHub(
        token,
        repoInfo.owner,
        repoInfo.repo,
        FILES.rules,
        mergedRules,
        '[GASPM] Update learned rules',
        remoteRules?.sha
      );
      if (result.success) pushed++;
    }
    cachedRules = mergedRules;
    await saveLocal('rules', mergedRules);

    // エイリアスを同期
    const aliases = await getProjectAliases();
    const remoteAliases = await fetchFromGitHub<LearnedAlias[]>(
      token,
      repoInfo.owner,
      repoInfo.repo,
      FILES.aliases
    );

    const mergedAliases = mergeArraysById(aliases, remoteAliases?.data || []);
    if (mergedAliases.length > (remoteAliases?.data?.length || 0)) {
      const result = await saveToGitHub(
        token,
        repoInfo.owner,
        repoInfo.repo,
        FILES.aliases,
        mergedAliases,
        '[GASPM] Update aliases',
        remoteAliases?.sha
      );
      if (result.success) pushed++;
    }
    cachedAliases = mergedAliases;
    await saveLocal('aliases', mergedAliases);

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
  cachedRules = null;
  cachedAliases = null;
};

// ============================================
// ヘルパー関数
// ============================================

const createDefaultConfig = (): ProjectConfig => ({
  version: 0,
  updatedAt: new Date().toISOString(),
});

const mergeArraysById = <T extends { id: string; createdAt?: string }>(
  local: T[],
  remote: T[]
): T[] => {
  const map = new Map<string, T>();

  // ローカルを追加
  local.forEach((item) => map.set(item.id, item));

  // リモートをマージ（新しい方を優先）
  remote.forEach((item) => {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
    } else if (item.createdAt && existing.createdAt && item.createdAt > existing.createdAt) {
      map.set(item.id, item);
    }
  });

  return Array.from(map.values());
};
