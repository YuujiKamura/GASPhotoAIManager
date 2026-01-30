export type AnalysisBackend = 'gemini' | 'local' | 'none';

const STORAGE_KEY = 'analysis_backend';

// GitHub Pages判定
const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.includes('github.io');

export function getAnalysisBackend(): AnalysisBackend | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === 'gemini' || raw === 'local' || raw === 'none') {
    // GitHub Pagesで'local'が保存されていた場合は無効化
    if (isGitHubPages && raw === 'local') {
      return 'gemini';
    }
    return raw;
  }
  // GitHub Pagesでは初回からgeminiをデフォルトに
  if (isGitHubPages) {
    return 'gemini';
  }
  return null;
}

export function setAnalysisBackend(value: AnalysisBackend) {
  localStorage.setItem(STORAGE_KEY, value);
}

export function clearAnalysisBackend() {
  localStorage.removeItem(STORAGE_KEY);
}
