/**
 * Gemini API - Core Module
 *
 * analysis.tsの依存を削減するため、サブモジュールを統合
 * - apiKey
 * - models
 * - helpers
 * - systemPrompts
 * - workTypeSelector
 */

// ============================================
// API Key (apiKey.ts)
// ============================================
export { hasApiKey } from './apiKey';

// ============================================
// Models (models.ts)
// ============================================
export {
  getSelectedModel,
  PRIMARY_MODEL,
  FALLBACK_MODEL,
} from './models';
export type { ModelType } from './models';

// ============================================
// Helpers (helpers.ts)
// ============================================
export {
  checkAbort,
  formatDuration,
  formatExamplesForPrompt,
  trackFieldChange,
  sleep,
  MAX_RETRIES,
  RETRY_DELAY_MS,
  BATCH_ANALYSIS_SCHEMA,
  createBatchAnalysisSchema,
  parseAIResponse,
  mapToAnalysisResults,
  matchResultsToRecords,
  applyContextRelay,
  validateResults,
} from './helpers';
export type { AbortChecker, LogFunction } from './helpers';

// ============================================
// System Prompts (systemPrompts.ts)
// ============================================
export { getSystemInstruction, REMARKS_CATEGORIES } from './systemPrompts';

// ============================================
// Work Type Selector (workTypeSelector.ts)
// ============================================
export { selectWorkTypes, getFilteredHierarchy } from './workTypeSelector';
