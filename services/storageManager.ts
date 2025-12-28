/**
 * ストレージマネージャー
 *
 * 2層ストレージ（プロジェクト / 個人）を統合管理
 */

import {
  ProjectConfig,
  PersonalConfig,
  LearnedRule,
  LearnedAlias,
  SessionData,
  SyncResult,
  StorageState,
} from '../types';

import * as projectStorage from './projectStorage';
import * as personalStorage from './personalStorage';

// 自動同期の間隔（ミリ秒）
const AUTO_SYNC_INTERVAL = 60000; // 1分

let autoSyncTimer: ReturnType<typeof setInterval> | null = null;
let initialized = false;

// ============================================
// 初期化
// ============================================

/**
 * ストレージマネージャーを初期化
 */
export const initialize = async (): Promise<void> => {
  if (initialized) return;

  console.log('[StorageManager] Initializing...');

  // 自動同期を開始
  startAutoSync();

  initialized = true;
  console.log('[StorageManager] Initialized');
};

/**
 * 自動同期を開始
 */
const startAutoSync = (): void => {
  if (autoSyncTimer) return;

  autoSyncTimer = setInterval(async () => {
    if (projectStorage.hasPendingChanges() || personalStorage.hasPendingChanges()) {
      console.log('[StorageManager] Auto-syncing...');
      await syncAll();
    }
  }, AUTO_SYNC_INTERVAL);
};

/**
 * 自動同期を停止
 */
export const stopAutoSync = (): void => {
  if (autoSyncTimer) {
    clearInterval(autoSyncTimer);
    autoSyncTimer = null;
  }
};

// ============================================
// プロジェクトストレージAPI
// ============================================

export const project = {
  /**
   * プロジェクト設定を取得
   */
  getConfig: async (): Promise<ProjectConfig> => {
    return projectStorage.getProjectConfig();
  },

  /**
   * プロジェクト設定を保存
   */
  saveConfig: async (config: ProjectConfig): Promise<void> => {
    return projectStorage.saveProjectConfig(config);
  },

  /**
   * 学習ルールを取得
   */
  getRules: async (): Promise<LearnedRule[]> => {
    return projectStorage.getProjectRules();
  },

  /**
   * 学習ルールを追加
   */
  addRule: async (rule: LearnedRule): Promise<void> => {
    return projectStorage.addProjectRule(rule);
  },

  /**
   * エイリアスを取得
   */
  getAliases: async (): Promise<LearnedAlias[]> => {
    return projectStorage.getProjectAliases();
  },

  /**
   * エイリアスを追加
   */
  addAlias: async (alias: LearnedAlias): Promise<void> => {
    return projectStorage.addProjectAlias(alias);
  },

  /**
   * プロジェクトリポジトリを設定
   */
  setRepo: (owner: string, repo: string): void => {
    projectStorage.setProjectRepo(owner, repo);
  },

  /**
   * GitHubに同期
   */
  sync: async (): Promise<SyncResult> => {
    return projectStorage.syncToGitHub();
  },

  /**
   * 未同期の変更があるか
   */
  hasPendingChanges: (): boolean => {
    return projectStorage.hasPendingChanges();
  },
};

// ============================================
// 個人ストレージAPI
// ============================================

export const personal = {
  /**
   * 個人ストレージが設定済みか
   */
  isConfigured: (): boolean => {
    return personalStorage.isPersonalStorageConfigured();
  },

  /**
   * 個人リポジトリを設定
   */
  configure: async (
    repoUrl: string,
    masterPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    return personalStorage.configurePersonalRepo(repoUrl, masterPassword);
  },

  /**
   * マスターパスワードでアンロック
   */
  unlock: async (password: string): Promise<boolean> => {
    return personalStorage.unlock(password);
  },

  /**
   * アンロック状態か
   */
  isUnlocked: (): boolean => {
    return personalStorage.isUnlocked();
  },

  /**
   * 認証情報を取得
   */
  getCredential: async (key: string): Promise<string | null> => {
    return personalStorage.getCredential(key);
  },

  /**
   * 認証情報を保存
   */
  setCredential: async (
    key: string,
    value: string,
    password?: string
  ): Promise<void> => {
    return personalStorage.setCredential(key, value, password);
  },

  /**
   * 個人設定を取得
   */
  getConfig: async (): Promise<PersonalConfig> => {
    return personalStorage.getPersonalConfig();
  },

  /**
   * 個人設定を保存
   */
  saveConfig: async (config: PersonalConfig): Promise<void> => {
    return personalStorage.savePersonalConfig(config);
  },

  /**
   * セッションを保存
   */
  saveSession: async (session: SessionData): Promise<void> => {
    return personalStorage.saveSession(session);
  },

  /**
   * プロジェクトのセッション一覧を取得
   */
  getSessions: async (projectId: string): Promise<SessionData[]> => {
    return personalStorage.getSessions(projectId);
  },

  /**
   * GitHubに同期
   */
  sync: async (): Promise<SyncResult> => {
    return personalStorage.syncToGitHub();
  },

  /**
   * 未同期の変更があるか
   */
  hasPendingChanges: (): boolean => {
    return personalStorage.hasPendingChanges();
  },
};

// ============================================
// 統合API
// ============================================

/**
 * すべてのストレージを同期
 */
export const syncAll = async (): Promise<{
  project: SyncResult;
  personal: SyncResult;
}> => {
  const [projectResult, personalResult] = await Promise.all([
    project.sync(),
    personal.sync(),
  ]);

  return {
    project: projectResult,
    personal: personalResult,
  };
};

/**
 * ストレージの状態を取得
 */
export const getState = (): StorageState => {
  const personalRepoStr = localStorage.getItem('gaspm_personal_repo');
  let personalRepoUrl: string | undefined;
  if (personalRepoStr) {
    try {
      const { owner, repo } = JSON.parse(personalRepoStr);
      personalRepoUrl = `https://github.com/${owner}/${repo}`;
    } catch {
      // ignore
    }
  }

  return {
    projectConfigured: !!localStorage.getItem('gaspm_project_repo'),
    personalConfigured: personal.isConfigured(),
    personalRepoUrl,
    lastSyncAt: localStorage.getItem('gaspm_last_sync') || undefined,
    pendingChanges: project.hasPendingChanges() || personal.hasPendingChanges(),
  };
};

/**
 * キャッシュをクリア
 */
export const clearAllCache = (): void => {
  projectStorage.clearCache();
  personalStorage.clearCache();
};

// ============================================
// マイグレーション
// ============================================

/**
 * 既存データをマイグレーション
 */
export const migrateFromLegacy = async (): Promise<{
  migrated: string[];
  errors: string[];
}> => {
  const migrated: string[] = [];
  const errors: string[] = [];

  try {
    // localStorage から gemini_api_key をマイグレーション
    const geminiKey = localStorage.getItem('gemini_api_key');
    if (geminiKey) {
      await personal.setCredential('gemini_api_key', geminiKey);
      migrated.push('gemini_api_key');
    }

    // github_token はそのまま（暗号化は後で）
    const githubToken = localStorage.getItem('github_token');
    if (githubToken) {
      migrated.push('github_token (kept in localStorage)');
    }

    // learningService のデータをマイグレーション
    // TODO: learningService.ts から getLearnedSettings を呼び出してマイグレーション

    console.log('[StorageManager] Migration completed:', migrated);
  } catch (e: any) {
    errors.push(e.message);
    console.error('[StorageManager] Migration error:', e);
  }

  return { migrated, errors };
};

// ============================================
// デフォルトエクスポート
// ============================================

export default {
  initialize,
  stopAutoSync,
  project,
  personal,
  syncAll,
  getState,
  clearAllCache,
  migrateFromLegacy,
};
