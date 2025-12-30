// Remarks history (備考履歴) management

const KEY_REMARKS_HISTORY = 'remarksHistory';
const MAX_REMARKS_HISTORY = 30;

/**
 * Get remarks history
 */
export const getRemarksHistory = (): string[] => {
  try {
    const data = localStorage.getItem(KEY_REMARKS_HISTORY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

/**
 * Add remarks to history
 */
export const addRemarksToHistory = (remarks: string): void => {
  if (!remarks || remarks.trim() === '') return;

  const history = getRemarksHistory();
  const filtered = history.filter(s => s !== remarks);
  const newHistory = [remarks, ...filtered].slice(0, MAX_REMARKS_HISTORY);
  localStorage.setItem(KEY_REMARKS_HISTORY, JSON.stringify(newHistory));
};
