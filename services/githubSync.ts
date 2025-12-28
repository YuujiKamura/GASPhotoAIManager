/**
 * GitHub同期サービス
 *
 * アプリ内で学習したデータをGitHubにプッシュし、
 * 恒久的にコードベースに反映させる仕組み
 */

import { LearnedSettings, LearnedRule, LearnedAlias } from '../types';

// GitHub設定
const GITHUB_API = 'https://api.github.com';
const OWNER = 'YuujiKamura';
const REPO = 'GASPhotoAIManager';
const DATA_BRANCH = 'data/learned-settings';
const DATA_PATH = 'src/data/learned-settings.json';

// Token管理（sessionStorageに保存 - ブラウザ閉じたら消える）
const TOKEN_KEY = 'github_pat';

export const getGitHubToken = (): string | null => {
  return sessionStorage.getItem(TOKEN_KEY);
};

export const setGitHubToken = (token: string): void => {
  sessionStorage.setItem(TOKEN_KEY, token);
};

export const clearGitHubToken = (): void => {
  sessionStorage.removeItem(TOKEN_KEY);
};

export const hasGitHubToken = (): boolean => {
  const token = getGitHubToken();
  return !!token && (token.startsWith('ghp_') || token.startsWith('github_pat_'));
};

/**
 * トークンの有効性を検証
 */
export const validateGitHubToken = async (token: string): Promise<{ valid: boolean; username?: string; error?: string }> => {
  try {
    const response = await fetch(`${GITHUB_API}/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    if (response.ok) {
      const user = await response.json();
      return { valid: true, username: user.login };
    } else if (response.status === 401) {
      return { valid: false, error: 'トークンが無効です' };
    } else {
      return { valid: false, error: `エラー: ${response.status}` };
    }
  } catch (e: any) {
    return { valid: false, error: e.message || 'ネットワークエラー' };
  }
};

/**
 * dataブランチが存在するか確認し、なければ作成
 */
const ensureDataBranch = async (token: string): Promise<boolean> => {
  try {
    // ブランチの存在確認
    const branchResponse = await fetch(
      `${GITHUB_API}/repos/${OWNER}/${REPO}/branches/${DATA_BRANCH}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );

    if (branchResponse.ok) {
      return true; // 既に存在
    }

    // mainブランチのSHAを取得
    const mainResponse = await fetch(
      `${GITHUB_API}/repos/${OWNER}/${REPO}/git/refs/heads/main`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );

    if (!mainResponse.ok) {
      console.error('Failed to get main branch');
      return false;
    }

    const mainData = await mainResponse.json();
    const mainSha = mainData.object.sha;

    // 新しいブランチを作成
    const createResponse = await fetch(
      `${GITHUB_API}/repos/${OWNER}/${REPO}/git/refs`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ref: `refs/heads/${DATA_BRANCH}`,
          sha: mainSha
        })
      }
    );

    return createResponse.ok;
  } catch (e) {
    console.error('ensureDataBranch error:', e);
    return false;
  }
};

/**
 * 現在の学習データをGitHubから取得
 */
export const fetchLearnedSettings = async (token: string): Promise<LearnedSettings | null> => {
  try {
    // まずdataブランチから取得を試みる
    let response = await fetch(
      `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/${DATA_PATH}?ref=${DATA_BRANCH}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );

    // dataブランチになければmainから
    if (!response.ok) {
      response = await fetch(
        `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/${DATA_PATH}?ref=main`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json'
          }
        }
      );
    }

    if (!response.ok) {
      // ファイルが存在しない場合は空の設定を返す
      if (response.status === 404) {
        return createEmptySettings();
      }
      return null;
    }

    const data = await response.json();
    const content = atob(data.content);
    return JSON.parse(content) as LearnedSettings;
  } catch (e) {
    console.error('fetchLearnedSettings error:', e);
    return null;
  }
};

/**
 * 学習データをGitHubにプッシュ
 */
export const pushLearnedSettings = async (
  token: string,
  settings: LearnedSettings,
  commitMessage?: string
): Promise<{ success: boolean; commitUrl?: string; error?: string }> => {
  try {
    // dataブランチを確認/作成
    const branchReady = await ensureDataBranch(token);
    if (!branchReady) {
      return { success: false, error: 'dataブランチの作成に失敗しました' };
    }

    // 現在のファイルのSHAを取得（更新の場合に必要）
    let sha: string | undefined;
    const currentFileResponse = await fetch(
      `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/${DATA_PATH}?ref=${DATA_BRANCH}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );

    if (currentFileResponse.ok) {
      const currentData = await currentFileResponse.json();
      sha = currentData.sha;
    }

    // 設定を更新
    const updatedSettings: LearnedSettings = {
      ...settings,
      version: settings.version + 1,
      updatedAt: new Date().toISOString()
    };

    const content = btoa(unescape(encodeURIComponent(JSON.stringify(updatedSettings, null, 2))));
    const message = commitMessage || `chore: update learned settings (v${updatedSettings.version})`;

    // ファイルを更新/作成
    const response = await fetch(
      `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/${DATA_PATH}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message,
          content,
          branch: DATA_BRANCH,
          ...(sha && { sha })
        })
      }
    );

    if (response.ok) {
      const result = await response.json();
      return {
        success: true,
        commitUrl: result.commit.html_url
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        error: error.message || `HTTP ${response.status}`
      };
    }
  } catch (e: any) {
    return {
      success: false,
      error: e.message || 'プッシュに失敗しました'
    };
  }
};

/**
 * 空の設定を作成
 */
export const createEmptySettings = (): LearnedSettings => ({
  version: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  rules: [],
  aliases: [],
  examples: []
});

/**
 * ローカルのIndexedDBからLearnedSettingsを構築
 */
export const buildLearnedSettingsFromLocal = async (): Promise<LearnedSettings> => {
  // storage.tsの関数をインポートして使用
  const { getAnalysisIssues, getExamples } = await import('../utils/storage');
  const { loadRuleSettings, ANALYSIS_RULES } = await import('../utils/analysisRules');

  const issues = await getAnalysisIssues();
  const examples = await getExamples();
  const ruleSettings = loadRuleSettings();

  // 問題ケースからルールを抽出
  const rulesFromIssues: LearnedRule[] = issues
    .filter(issue => issue.status === 'resolved' && issue.expectedValues)
    .map(issue => ({
      id: `rule_${issue.id}`,
      description: issue.issueDescription,
      condition: {
        workType: issue.actualAnalysis.workType,
        remarks: issue.actualAnalysis.remarks
      },
      correction: issue.expectedValues!,
      createdAt: new Date(issue.createdAt).toISOString(),
      source: 'issue' as const
    }));

  // エイリアスを抽出（例: 「温度測定」→「到着温度」のマッピング）
  const aliasesFromIssues: LearnedAlias[] = issues
    .filter(issue =>
      issue.status === 'resolved' &&
      issue.expectedValues?.remarks &&
      issue.actualAnalysis.remarks !== issue.expectedValues.remarks
    )
    .map(issue => ({
      id: `alias_${issue.id}`,
      from: issue.actualAnalysis.remarks,
      to: issue.expectedValues!.remarks!,
      context: issue.actualAnalysis.workType,
      createdAt: new Date(issue.createdAt).toISOString()
    }));

  // お手本をエクスポート形式に変換
  const exportedExamples = examples.map(ex => ({
    id: ex.id,
    name: ex.name,
    analysis: {
      workType: ex.analysis.workType,
      variety: ex.analysis.variety,
      detail: ex.analysis.detail,
      station: ex.analysis.station,
      remarks: ex.analysis.remarks,
      description: ex.analysis.description
    },
    category: ex.category,
    tags: ex.tags,
    createdAt: new Date(ex.createdAt).toISOString()
  }));

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    rules: rulesFromIssues,
    aliases: aliasesFromIssues,
    examples: exportedExamples,
    ruleSettings: Object.entries(ruleSettings)
      .filter(([id, enabled]) => {
        const rule = ANALYSIS_RULES.find(r => r.id === id);
        return rule && enabled !== rule.defaultEnabled;
      })
      .reduce((acc, [id, enabled]) => ({ ...acc, [id]: enabled }), {})
  };
};

/**
 * GitHubからの設定をローカルにマージ
 */
export const mergeSettingsToLocal = async (settings: LearnedSettings): Promise<void> => {
  // TODO: 将来的にはここでIndexedDBにマージする処理を実装
  // 現在はローカルの設定が優先される
  console.log('Merging settings from GitHub:', settings);
};

/**
 * 同期ステータス
 */
export interface SyncStatus {
  lastSynced: string | null;
  localVersion: number;
  remoteVersion: number;
  hasLocalChanges: boolean;
}

/**
 * 同期ステータスを取得
 */
export const getSyncStatus = async (token: string): Promise<SyncStatus> => {
  const local = await buildLearnedSettingsFromLocal();
  const remote = await fetchLearnedSettings(token);

  return {
    lastSynced: remote?.updatedAt || null,
    localVersion: local.version,
    remoteVersion: remote?.version || 0,
    hasLocalChanges: local.version > (remote?.version || 0)
  };
};

// ============================================================
// コード編集機能（AIによる自己書き換え用）
// ============================================================

/**
 * GitHubからコードファイルを取得
 */
export const fetchCodeFile = async (
  token: string,
  filePath: string,
  branch: string = 'main'
): Promise<{ content: string; sha: string } | null> => {
  try {
    const response = await fetch(
      `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/${filePath}?ref=${branch}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null; // ファイルが存在しない
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const content = decodeURIComponent(escape(atob(data.content)));
    return { content, sha: data.sha };
  } catch (e) {
    console.error('fetchCodeFile error:', e);
    return null;
  }
};

/**
 * リポジトリのディレクトリ一覧を取得
 */
export const listDirectory = async (
  token: string,
  dirPath: string = '',
  branch: string = 'main'
): Promise<Array<{ name: string; path: string; type: 'file' | 'dir' }> | null> => {
  try {
    const url = dirPath
      ? `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/${dirPath}?ref=${branch}`
      : `${GITHUB_API}/repos/${OWNER}/${REPO}/contents?ref=${branch}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.map((item: any) => ({
      name: item.name,
      path: item.path,
      type: item.type === 'dir' ? 'dir' : 'file'
    }));
  } catch (e) {
    console.error('listDirectory error:', e);
    return null;
  }
};

/**
 * コードファイルをGitHubにプッシュ（更新または新規作成）
 */
export const pushCodeEdit = async (
  token: string,
  filePath: string,
  newContent: string,
  commitMessage: string,
  branch: string = 'main'
): Promise<{ success: boolean; commitUrl?: string; error?: string }> => {
  try {
    // 現在のファイルのSHAを取得（更新の場合に必要）
    let sha: string | undefined;
    const currentFile = await fetchCodeFile(token, filePath, branch);
    if (currentFile) {
      sha = currentFile.sha;
    }

    // Base64エンコード（UTF-8対応）
    const content = btoa(unescape(encodeURIComponent(newContent)));

    // ファイルを更新/作成
    const response = await fetch(
      `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/${filePath}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: commitMessage,
          content,
          branch,
          ...(sha && { sha })
        })
      }
    );

    if (response.ok) {
      const result = await response.json();
      return {
        success: true,
        commitUrl: result.commit.html_url
      };
    } else {
      const error = await response.json();
      return {
        success: false,
        error: error.message || `HTTP ${response.status}`
      };
    }
  } catch (e: any) {
    return {
      success: false,
      error: e.message || 'コードのプッシュに失敗しました'
    };
  }
};

/**
 * ファイル検索（リポジトリ内のコードを検索）
 */
export const searchCode = async (
  token: string,
  query: string
): Promise<Array<{ path: string; matchLines: string[] }> | null> => {
  try {
    const response = await fetch(
      `${GITHUB_API}/search/code?q=${encodeURIComponent(query)}+repo:${OWNER}/${REPO}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.items.map((item: any) => ({
      path: item.path,
      matchLines: item.text_matches?.map((m: any) => m.fragment) || []
    }));
  } catch (e) {
    console.error('searchCode error:', e);
    return null;
  }
};
