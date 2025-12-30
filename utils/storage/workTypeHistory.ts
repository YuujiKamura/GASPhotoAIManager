// WorkType history (工種履歴) management

const KEY_WORKTYPE_HISTORY = 'workTypeHistory';
const MAX_WORKTYPE_HISTORY = 20;

/**
 * Get workType history
 */
export const getWorkTypeHistory = (): string[] => {
  try {
    const data = localStorage.getItem(KEY_WORKTYPE_HISTORY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

/**
 * Add workType to history
 */
export const addWorkTypeToHistory = (workType: string): void => {
  if (!workType || workType.trim() === '') return;

  const history = getWorkTypeHistory();
  const filtered = history.filter(s => s !== workType);
  const newHistory = [workType, ...filtered].slice(0, MAX_WORKTYPE_HISTORY);
  localStorage.setItem(KEY_WORKTYPE_HISTORY, JSON.stringify(newHistory));
};
