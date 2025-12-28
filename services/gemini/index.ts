/**
 * Gemini サービスモジュール
 * 各サブモジュールを再エクスポート
 */

// APIキー管理
export {
  getApiKey,
  setApiKey,
  setApiKeyEncrypted,
  loadApiKeyEncrypted,
  hasEncryptedApiKey,
  hasMasterPassword,
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

// モデル管理
export {
  AVAILABLE_MODELS,
  getSelectedModel,
  setSelectedModel,
  validateApiKey,
  validateAllModels,
  getBestAvailableModel,
  getPrimaryModel,
  PRIMARY_MODEL,
  COMPLEX_MODEL,
  FALLBACK_MODEL,
  SELECTOR_MODEL,
} from './models';

export type { ModelType, ModelStatus, ModelAvailability } from './models';
