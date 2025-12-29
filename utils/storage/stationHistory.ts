// Station history (測点履歴) management

const KEY_STATION_HISTORY = 'stationHistory';
const MAX_STATION_HISTORY = 20;

/**
 * Get station history
 */
export const getStationHistory = (): string[] => {
  try {
    const data = localStorage.getItem(KEY_STATION_HISTORY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

/**
 * Add station to history
 */
export const addStationToHistory = (station: string): void => {
  if (!station || station.trim() === '') return;

  const history = getStationHistory();
  const filtered = history.filter(s => s !== station);
  const newHistory = [station, ...filtered].slice(0, MAX_STATION_HISTORY);
  localStorage.setItem(KEY_STATION_HISTORY, JSON.stringify(newHistory));
};

/**
 * Add multiple stations to history
 */
const addStationsToHistory = (stations: string[]): void => {
  const validStations = stations.filter(s => s && s.trim() !== '');
  if (validStations.length === 0) return;

  const history = getStationHistory();
  const combined = [...validStations, ...history];
  const unique = [...new Set(combined)].slice(0, MAX_STATION_HISTORY);
  localStorage.setItem(KEY_STATION_HISTORY, JSON.stringify(unique));
};

/**
 * Clear station history
 */
const clearStationHistory = (): void => {
  localStorage.removeItem(KEY_STATION_HISTORY);
};
