/**
 * Gemini サービスモジュール
 * 各サブモジュールを再エクスポート
 */

// ============================================
// APIキー管理 (apiKey.ts)
// ============================================
export {
  getApiKey,
  setApiKey,
  setApiKeyEncrypted,
  loadApiKeyEncrypted,
  hasEncryptedApiKey,
  clearApiKey,
  hasApiKey,
  sanitizeErrorMessage,
  // 信頼セッション
  isTrustedSession,
  setTrustedSession,
  revokeTrust,
  getAutoApiSettings,
  setAutoApiSettings,
  isAutoApiEnabled,
} from './apiKey';

export type { AutoApiSettings } from './apiKey';

// ============================================
// モデル管理 (models.ts)
// ============================================
export {
  AVAILABLE_MODELS,
  getSelectedModel,
  setSelectedModel,
  validateApiKey,
  validateAllModels,
  getBestAvailableModel,
  PRIMARY_MODEL,
  FALLBACK_MODEL,
  SELECTOR_MODEL,
} from './models';

export type { ModelType, ModelStatus, ModelAvailability } from './models';

// ============================================
// 解析関連 (analysis.ts)
// ============================================
export {
  // 中断処理
  checkAbort,
  type AbortChecker,

  // 解析関数
  analyzePhotoBatch,
  analyzePhotoInteractive,
  identifyTargetPhotos,
  selectWorkTypes,
  getFilteredHierarchy,
  getSystemInstruction,

  // Types
  type InteractiveMessage,
  type InteractiveAnalysisResult,
} from './analysis';

// ============================================
// 正規化関連 (normalization.ts)
// ============================================
export {
  // 正規化関数
  getNormalizationProposals,
  applyNormalizationCorrections,

  // シーン割当
  assignSceneIds,

  // Types
  type NormalizationCorrection,
  type NormalizationResult,
} from './normalization';
