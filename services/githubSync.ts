/**
 * GitHub同期サービス - 学習データとコードのGitHub連携
 */
import { LearnedSettings, LearnedRule, LearnedAlias } from '../types';

const GITHUB_API = 'https://api.github.com';
const OWNER = 'YuujiKamura';
const REPO = 'GASPhotoAIManager';
const DATA_BRANCH = 'data/learned-settings';
const CODE_BRANCH = 'ai/code-edit';
const DATA_PATH = 'src/data/learned-settings.json';
const TOKEN_KEY = 'github_pat';
const BRANCH_NOT_EXISTS_KEY = 'github_data_branch_not_exists';

const headers = (token: string, json = false) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github.v3+json',
  ...(json && { 'Content-Type': 'application/json' })
});

const repoUrl = (path: string) => `${GITHUB_API}/repos/${OWNER}/${REPO}/${path}`;

export const getGitHubToken = (): string | null => sessionStorage.getItem(TOKEN_KEY);
export const setGitHubToken = (token: string): void => sessionStorage.setItem(TOKEN_KEY, token);
export const clearGitHubToken = (): void => sessionStorage.removeItem(TOKEN_KEY);
export const hasGitHubToken = (): boolean => {
  const t = getGitHubToken();
  return !!t && (t.startsWith('ghp_') || t.startsWith('github_pat_'));
};

const isDataBranchKnownMissing = (): boolean => sessionStorage.getItem(BRANCH_NOT_EXISTS_KEY) === 'true';
const markDataBranchMissing = (): void => sessionStorage.setItem(BRANCH_NOT_EXISTS_KEY, 'true');
const clearDataBranchMissingFlag = (): void => sessionStorage.removeItem(BRANCH_NOT_EXISTS_KEY);

export const validateGitHubToken = async (token: string): Promise<{ valid: boolean; username?: string; error?: string }> => {
  try {
    const res = await fetch(`${GITHUB_API}/user`, { headers: headers(token) });
    if (res.ok) return { valid: true, username: (await res.json()).login };
    return { valid: false, error: res.status === 401 ? 'トークンが無効です' : `エラー: ${res.status}` };
  } catch (e: any) {
    return { valid: false, error: e.message || 'ネットワークエラー' };
  }
};

const ensureBranch = async (token: string, branch: string): Promise<boolean> => {
  try {
    if ((await fetch(repoUrl(`branches/${branch}`), { headers: headers(token) })).ok) return true;
    const mainRes = await fetch(repoUrl('git/refs/heads/main'), { headers: headers(token) });
    if (!mainRes.ok) return false;
    const sha = (await mainRes.json()).object.sha;
    return (await fetch(repoUrl('git/refs'), {
      method: 'POST', headers: headers(token, true),
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha })
    })).ok;
  } catch (e) { console.error(`ensureBranch(${branch}) error:`, e); return false; }
};

export const createEmptySettings = (): LearnedSettings => ({
  version: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  rules: [], aliases: [], examples: []
});

export const fetchLearnedSettings = async (token: string): Promise<LearnedSettings | null> => {
  if (isDataBranchKnownMissing()) return createEmptySettings();
  try {
    const res = await fetch(repoUrl(`contents/${DATA_PATH}?ref=${DATA_BRANCH}`), { headers: headers(token) });
    if (!res.ok) { if (res.status === 404) { markDataBranchMissing(); return createEmptySettings(); } return null; }
    return JSON.parse(atob((await res.json()).content)) as LearnedSettings;
  } catch (e) { console.error('fetchLearnedSettings error:', e); return null; }
};

export const pushLearnedSettings = async (
  token: string, settings: LearnedSettings, commitMessage?: string
): Promise<{ success: boolean; commitUrl?: string; error?: string }> => {
  try {
    if (!await ensureBranch(token, DATA_BRANCH)) return { success: false, error: 'dataブランチの作成に失敗しました' };
    const fileRes = await fetch(repoUrl(`contents/${DATA_PATH}?ref=${DATA_BRANCH}`), { headers: headers(token) });
    const sha = fileRes.ok ? (await fileRes.json()).sha : undefined;
    const updated: LearnedSettings = { ...settings, version: settings.version + 1, updatedAt: new Date().toISOString() };
    const res = await fetch(repoUrl(`contents/${DATA_PATH}`), {
      method: 'PUT', headers: headers(token, true),
      body: JSON.stringify({
        message: commitMessage || `chore: update learned settings (v${updated.version})`,
        content: btoa(unescape(encodeURIComponent(JSON.stringify(updated, null, 2)))),
        branch: DATA_BRANCH, ...(sha && { sha })
      })
    });
    if (res.ok) return { success: true, commitUrl: (await res.json()).commit.html_url };
    return { success: false, error: (await res.json()).message || `HTTP ${res.status}` };
  } catch (e: any) { return { success: false, error: e.message || 'プッシュに失敗しました' }; }
};

export const buildLearnedSettingsFromLocal = async (): Promise<LearnedSettings> => {
  const { getAnalysisIssues, getExamples } = await import('../utils/storage');
  const { loadRuleSettings, ANALYSIS_RULES } = await import('../utils/analysisRules');
  const [issues, examples, ruleSettings] = await Promise.all([getAnalysisIssues(), getExamples(), Promise.resolve(loadRuleSettings())]);

  const rules: LearnedRule[] = issues.filter(i => i.status === 'resolved' && i.expectedValues).map(i => ({
    id: `rule_${i.id}`, description: i.issueDescription,
    condition: { workType: i.actualAnalysis.workType, remarks: i.actualAnalysis.remarks },
    correction: i.expectedValues!, createdAt: new Date(i.createdAt).toISOString(), source: 'issue' as const
  }));

  const aliases: LearnedAlias[] = issues
    .filter(i => i.status === 'resolved' && i.expectedValues?.remarks && i.actualAnalysis.remarks !== i.expectedValues.remarks)
    .map(i => ({
      id: `alias_${i.id}`, from: i.actualAnalysis.remarks, to: i.expectedValues!.remarks!,
      context: i.actualAnalysis.workType, createdAt: new Date(i.createdAt).toISOString()
    }));

  const exs = examples.map(e => ({
    id: e.id, name: e.name, category: e.category, tags: e.tags, createdAt: new Date(e.createdAt).toISOString(),
    analysis: { workType: e.analysis.workType, variety: e.analysis.variety, detail: e.analysis.detail,
      station: e.analysis.station, remarks: e.analysis.remarks, description: e.analysis.description }
  }));

  return {
    version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    rules, aliases, examples: exs,
    ruleSettings: Object.entries(ruleSettings)
      .filter(([id, en]) => { const r = ANALYSIS_RULES.find(r => r.id === id); return r && en !== r.defaultEnabled; })
      .reduce((a, [id, en]) => ({ ...a, [id]: en }), {})
  };
};

const mergeSettingsToLocal = async (settings: LearnedSettings): Promise<void> => {
  console.log('Merging settings from GitHub:', settings);
};

export interface SyncStatus { lastSynced: string | null; localVersion: number; remoteVersion: number; hasLocalChanges: boolean; }

export const getSyncStatus = async (token: string): Promise<SyncStatus> => {
  const [local, remote] = await Promise.all([buildLearnedSettingsFromLocal(), fetchLearnedSettings(token)]);
  return { lastSynced: remote?.updatedAt || null, localVersion: local.version,
    remoteVersion: remote?.version || 0, hasLocalChanges: local.version > (remote?.version || 0) };
};

export const fetchCodeFile = async (token: string, filePath: string, branch = 'main'): Promise<{ content: string; sha: string } | null> => {
  try {
    const res = await fetch(repoUrl(`contents/${filePath}?ref=${branch}`), { headers: headers(token) });
    if (!res.ok) return res.status === 404 ? null : (() => { throw new Error(`HTTP ${res.status}`); })();
    const d = await res.json();
    return { content: decodeURIComponent(escape(atob(d.content))), sha: d.sha };
  } catch (e) { console.error('fetchCodeFile error:', e); return null; }
};

export const listDirectory = async (token: string, dirPath = '', branch = 'main'): Promise<Array<{ name: string; path: string; type: 'file' | 'dir' }> | null> => {
  try {
    const url = dirPath ? repoUrl(`contents/${dirPath}?ref=${branch}`) : repoUrl(`contents?ref=${branch}`);
    const res = await fetch(url, { headers: headers(token) });
    if (!res.ok) return null;
    return (await res.json()).map((i: any) => ({ name: i.name, path: i.path, type: i.type === 'dir' ? 'dir' : 'file' }));
  } catch (e) { console.error('listDirectory error:', e); return null; }
};

export const pushCodeEdit = async (
  token: string, filePath: string, newContent: string, commitMessage: string, branch = CODE_BRANCH
): Promise<{ success: boolean; commitUrl?: string; error?: string }> => {
  try {
    if (branch === CODE_BRANCH && !await ensureBranch(token, CODE_BRANCH)) return { success: false, error: 'ai/code-editブランチの作成に失敗しました' };
    const cur = await fetchCodeFile(token, filePath, branch);
    const res = await fetch(repoUrl(`contents/${filePath}`), {
      method: 'PUT', headers: headers(token, true),
      body: JSON.stringify({ message: commitMessage, content: btoa(unescape(encodeURIComponent(newContent))), branch, ...(cur && { sha: cur.sha }) })
    });
    if (res.ok) return { success: true, commitUrl: (await res.json()).commit.html_url };
    return { success: false, error: (await res.json()).message || `HTTP ${res.status}` };
  } catch (e: any) { return { success: false, error: e.message || 'コードのプッシュに失敗しました' }; }
};

export const searchCode = async (token: string, query: string): Promise<Array<{ path: string; matchLines: string[] }> | null> => {
  try {
    const res = await fetch(`${GITHUB_API}/search/code?q=${encodeURIComponent(query)}+repo:${OWNER}/${REPO}`, { headers: headers(token) });
    if (!res.ok) return null;
    return (await res.json()).items.map((i: any) => ({ path: i.path, matchLines: i.text_matches?.map((m: any) => m.fragment) || [] }));
  } catch (e) { console.error('searchCode error:', e); return null; }
};
