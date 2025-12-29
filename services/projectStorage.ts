/**
 * プロジェクトストレージ
 * プロジェクトリポジトリ内の .gaspm/ ディレクトリにデータを保存
 */

import {
  ProjectConfig,
  LearnedRule,
  LearnedAlias,
  SyncResult,
} from '../types';

const GASPM_DIR = '.gaspm';
const FILES = {
  config: `${GASPM_DIR}/project-config.json`,
  rules: `${GASPM_DIR}/learned-rules.json`,
  aliases: `${GASPM_DIR}/aliases.json`,
} as const;

type DataType = keyof typeof FILES;

const DB_NAME = 'GASPMProjectStorage';
const DB_VERSION = 1;
const STORE_NAME = 'projectData';

// 統一キャッシュ
const cache: { config: ProjectConfig | null; rules: LearnedRule[] | null; aliases: LearnedAlias[] | null } = {
  config: null, rules: null, aliases: null,
};
let pendingChanges = false;

// IndexedDB操作
const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'key' });
    };
    request.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    request.onerror = (e) => reject((e.target as IDBOpenDBRequest).error);
  });

const saveLocal = async <T>(key: string, data: T): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
    const req = store.put({ key, data, updatedAt: new Date().toISOString() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

const loadLocal = async <T>(key: string): Promise<T | null> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result?.data || null);
      req.onerror = () => reject(req.error);
    });
  } catch { return null; }
};

// GitHub API
const getGitHubToken = (): string | null => localStorage.getItem('github_token');

const getRepoInfo = (): { owner: string; repo: string } | null => {
  try { return JSON.parse(localStorage.getItem('gaspm_project_repo') || 'null'); }
  catch { return null; }
};

export const setProjectRepo = (owner: string, repo: string): void => {
  localStorage.setItem('gaspm_project_repo', JSON.stringify({ owner, repo }));
};

const githubFetch = async <T>(path: string): Promise<{ data: T; sha: string } | null> => {
  const token = getGitHubToken(), repoInfo = getRepoInfo();
  if (!token || !repoInfo) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    const result = await res.json();
    return { data: JSON.parse(atob(result.content)) as T, sha: result.sha };
  } catch (e) { console.warn(`[ProjectStorage] Failed to fetch ${path}:`, e); return null; }
};

const githubSave = async <T>(path: string, data: T, message: string, sha?: string): Promise<{ success: boolean; sha?: string }> => {
  const token = getGitHubToken(), repoInfo = getRepoInfo();
  if (!token || !repoInfo) return { success: false };
  try {
    const body: Record<string, unknown> = { message, content: btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2)))), branch: 'main' };
    if (sha) body.sha = sha;
    const res = await fetch(`https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/${path}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json()).message || `GitHub API error: ${res.status}`);
    return { success: true, sha: (await res.json()).content?.sha };
  } catch (e) { console.error(`[ProjectStorage] Failed to save ${path}:`, e); return { success: false }; }
};

// ヘルパー
const mergeArraysById = <T extends { id: string; createdAt?: string }>(local: T[], remote: T[]): T[] => {
  const map = new Map<string, T>();
  local.forEach(item => map.set(item.id, item));
  remote.forEach(item => {
    const existing = map.get(item.id);
    if (!existing || (item.createdAt && existing.createdAt && item.createdAt > existing.createdAt)) {
      map.set(item.id, item);
    }
  });
  return Array.from(map.values());
};

const createDefaultConfig = (): ProjectConfig => ({ version: 0, updatedAt: new Date().toISOString() });

// 汎用データ取得
const getData = async <T>(type: DataType, merge: (local: T, remote: T) => T, defaultVal: T): Promise<T> => {
  if (cache[type]) return cache[type] as T;
  let data = await loadLocal<T>(type);
  const remote = await githubFetch<T>(FILES[type]);
  if (remote) {
    data = merge(data || defaultVal, remote.data);
    await saveLocal(type, data);
  }
  cache[type] = data || defaultVal;
  return cache[type] as T;
};

// 公開API
export const getProjectConfig = async (): Promise<ProjectConfig> =>
  getData('config', (local, remote) => remote.version > local.version ? remote : local, createDefaultConfig());

export const saveProjectConfig = async (config: ProjectConfig): Promise<void> => {
  config.version++;
  config.updatedAt = new Date().toISOString();
  cache.config = config;
  await saveLocal('config', config);
  pendingChanges = true;
};

export const getProjectRules = async (): Promise<LearnedRule[]> =>
  getData('rules', mergeArraysById, []);

export const addProjectRule = async (rule: LearnedRule): Promise<void> => {
  const rules = await getProjectRules();
  rules.push(rule);
  cache.rules = rules;
  await saveLocal('rules', rules);
  pendingChanges = true;
};

export const getProjectAliases = async (): Promise<LearnedAlias[]> =>
  getData('aliases', mergeArraysById, []);

export const addProjectAlias = async (alias: LearnedAlias): Promise<void> => {
  const aliases = await getProjectAliases();
  if (!aliases.some(a => a.from === alias.from && a.to === alias.to)) {
    aliases.push(alias);
    cache.aliases = aliases;
    await saveLocal('aliases', aliases);
    pendingChanges = true;
  }
};

// 同期
const syncEntity = async <T>(
  type: DataType,
  getData: () => Promise<T>,
  merge: (local: T, remote: T) => T,
  shouldPush: (local: T, remote: T | undefined) => boolean,
  message: string
): Promise<{ pushed: boolean; pulled: boolean }> => {
  const local = await getData();
  const remote = await githubFetch<T>(FILES[type]);
  const merged = remote ? merge(local, remote.data) : local;

  if (shouldPush(merged, remote?.data)) {
    const result = await githubSave(FILES[type], merged, message, remote?.sha);
    if (result.success) {
      (cache as Record<string, unknown>)[type] = merged;
      await saveLocal(type, merged);
      return { pushed: true, pulled: false };
    }
  }
  (cache as Record<string, unknown>)[type] = merged;
  await saveLocal(type, merged);
  return { pushed: false, pulled: !!remote };
};

export const syncToGitHub = async (): Promise<SyncResult> => {
  if (!getGitHubToken() || !getRepoInfo()) {
    return { success: false, pushed: 0, pulled: 0, error: 'GitHub未設定' };
  }

  let pushed = 0, pulled = 0;
  try {
    // Config
    const configResult = await syncEntity<ProjectConfig>(
      'config', getProjectConfig,
      (local, remote) => remote.version > local.version ? remote : local,
      (local, remote) => !remote || local.version > remote.version,
      '[GASPM] Update project config'
    );
    if (configResult.pushed) pushed++; if (configResult.pulled) pulled++;

    // Rules
    const rulesResult = await syncEntity<LearnedRule[]>(
      'rules', getProjectRules, mergeArraysById,
      (merged, remote) => merged.length > (remote?.length || 0),
      '[GASPM] Update learned rules'
    );
    if (rulesResult.pushed) pushed++;

    // Aliases
    const aliasesResult = await syncEntity<LearnedAlias[]>(
      'aliases', getProjectAliases, mergeArraysById,
      (merged, remote) => merged.length > (remote?.length || 0),
      '[GASPM] Update aliases'
    );
    if (aliasesResult.pushed) pushed++;

    pendingChanges = false;
    return { success: true, pushed, pulled };
  } catch (e: unknown) {
    return { success: false, pushed, pulled, error: e instanceof Error ? e.message : String(e) };
  }
};

export const hasPendingChanges = (): boolean => pendingChanges;

export const clearCache = (): void => {
  cache.config = null;
  cache.rules = null;
  cache.aliases = null;
};
