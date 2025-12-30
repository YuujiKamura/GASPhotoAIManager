// Measurements history (測定値履歴) management

const KEY_MEASUREMENTS_HISTORY = 'measurementsHistory';
const MAX_MEASUREMENTS_HISTORY = 30;

/**
 * Get measurements history
 */
export const getMeasurementsHistory = (): string[] => {
  try {
    const data = localStorage.getItem(KEY_MEASUREMENTS_HISTORY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

/**
 * Add measurements to history
 */
export const addMeasurementsToHistory = (measurements: string): void => {
  if (!measurements || measurements.trim() === '') return;

  const history = getMeasurementsHistory();
  const filtered = history.filter(s => s !== measurements);
  const newHistory = [measurements, ...filtered].slice(0, MAX_MEASUREMENTS_HISTORY);
  localStorage.setItem(KEY_MEASUREMENTS_HISTORY, JSON.stringify(newHistory));
};
