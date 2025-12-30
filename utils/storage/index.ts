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

// Category Utils
export { detectPhotoCategory } from './categoryUtils';

// Examples
export {
  saveExample,
  getExamples,
  getRelevantExamples
} from './examples';

// Sessions
export {
  getSession,
  getActiveSessionId,
  clearActiveSession,
  getActiveSession
} from './sessions';

// Station History
export {
  getStationHistory,
  addStationToHistory
} from './stationHistory';

// WorkType History
export {
  getWorkTypeHistory,
  addWorkTypeToHistory
} from './workTypeHistory';

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
  getAnalysisHistory,
  getAnalysisHistoryEntry,
  deleteAnalysisHistory,
  toggleHistoryAsExample,
  updateHistoryName,
  setActiveExampleHistory,
  getActiveExampleHistoryId
} from './history';

// Issues
export {
  saveAnalysisIssue,
  getAnalysisIssues,
  getIssuesByStatus
} from './issues';
