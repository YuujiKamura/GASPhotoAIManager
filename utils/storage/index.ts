// Re-export all storage utilities from the split modules

// DB Core
export { openDB } from './dbCore';

// Project Data
export { saveProjectData, loadProjectData, clearProjectData } from './projectData';

// Analysis Cache
export { getFileKey, generateSessionKey, getCachedAnalysis, cacheAnalysis, clearAnalysisCache } from './analysisCache';

// Rules
export { saveRule, getRules, deleteRule } from './rules';
export type { AnalysisRule } from './rules';

// Examples
export {
  detectPhotoCategory,
  saveExample,
  getExamples,
  getExamplesByCategory,
  updateExample,
  deleteExample,
  clearExamples,
  getRelevantExamples
} from './examples';

// Sessions
export {
  saveCurrentSessionAsExample,
  getSessions,
  getSession,
  deleteSession,
  clearSessions,
  setActiveSession,
  getActiveSessionId,
  clearActiveSession,
  getActiveSession
} from './sessions';

// Station History
export {
  getStationHistory,
  addStationToHistory,
  addStationsToHistory,
  clearStationHistory
} from './stationHistory';

// Export/Import
export {
  exportDataToJson,
  importDataFromJson,
  exportRulesToJson,
  importRulesFromJson
} from './exportImport';

// History
export {
  saveAnalysisHistory,
  addToHistoryIfNew,
  getAnalysisHistory,
  getAnalysisHistoryEntry,
  deleteAnalysisHistory,
  clearAnalysisHistory,
  toggleHistoryAsExample,
  updateHistoryName,
  getExampleHistoryEntries,
  setActiveExampleHistory,
  getActiveExampleHistoryId,
  getActiveExampleHistory
} from './history';

// Issues
export {
  saveAnalysisIssue,
  getAnalysisIssues,
  getIssuesByStatus,
  updateAnalysisIssue,
  deleteAnalysisIssue,
  getOpenIssueCount
} from './issues';
