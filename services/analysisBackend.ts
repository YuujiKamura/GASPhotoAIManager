export type AnalysisBackend = 'gemini' | 'local' | 'none';

const STORAGE_KEY = 'analysis_backend';

export function getAnalysisBackend(): AnalysisBackend | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === 'gemini' || raw === 'local' || raw === 'none') {
    return raw;
  }
  return null;
}

export function setAnalysisBackend(value: AnalysisBackend) {
  localStorage.setItem(STORAGE_KEY, value);
}

export function clearAnalysisBackend() {
  localStorage.removeItem(STORAGE_KEY);
}
