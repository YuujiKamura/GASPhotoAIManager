import { GoogleGenAI } from "@google/genai";

// ============================================
// 中断処理の共通インターフェース
// ============================================
export type AbortChecker = () => boolean;

/**
 * 中断チェックを行い、中断が要求されている場合はエラーをスロー
 * @param shouldAbort - 中断チェック関数
 * @param context - エラーメッセージに含めるコンテキスト
 */
export const checkAbort = (shouldAbort?: AbortChecker, context?: string): void => {
  if (shouldAbort?.()) {
    const msg = context ? `処理が中断されました: ${context}` : '処理が中断されました';
    throw new Error(msg);
  }
};

// API Key Management (暗号化対応)
import { encrypt, decrypt } from '../utils/crypto';

const API_KEY_STORAGE_KEY = 'construction_album_api_key';
const ENCRYPTED_KEY_STORAGE = 'gaspm_encrypted_api_key';
const MASTER_HASH_KEY = 'gaspm_master_hash';

// メモリキャッシュ（同期アクセス用）
let cachedApiKey: string | null = null;

export const getApiKey = (): string | null => {
  // メモリキャッシュがあればそれを返す
  if (cachedApiKey) return cachedApiKey;
  // フォールバック: 平文localStorage（移行期間）
  return localStorage.getItem(API_KEY_STORAGE_KEY);
};

export const setApiKey = (key: string): void => {
  cachedApiKey = key;
  // 平文でも保存（移行期間・フォールバック用）
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
};

// 暗号化してAPIキーを保存
export const setApiKeyEncrypted = async (key: string, masterPassword: string): Promise<void> => {
  cachedApiKey = key;
  const { encrypted, iv, salt } = await encrypt(key, masterPassword);
  localStorage.setItem(ENCRYPTED_KEY_STORAGE, JSON.stringify({ encrypted, iv, salt }));
  // 平文版を削除
  localStorage.removeItem(API_KEY_STORAGE_KEY);
};

// 暗号化されたAPIキーを復号してロード
export const loadApiKeyEncrypted = async (masterPassword: string): Promise<boolean> => {
  const stored = localStorage.getItem(ENCRYPTED_KEY_STORAGE);
  if (!stored) return false;

  try {
    const { encrypted, iv, salt } = JSON.parse(stored);
    const decrypted = await decrypt(encrypted, masterPassword, iv, salt);
    if (decrypted && decrypted.startsWith('AIza')) {
      cachedApiKey = decrypted;
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

// 暗号化されたAPIキーが存在するか
export const hasEncryptedApiKey = (): boolean => {
  return !!localStorage.getItem(ENCRYPTED_KEY_STORAGE);
};

// マスターパスワードが設定済みか
export const hasMasterPassword = (): boolean => {
  return !!localStorage.getItem(MASTER_HASH_KEY);
};

export const clearApiKey = (): void => {
  cachedApiKey = null;
  localStorage.removeItem(API_KEY_STORAGE_KEY);
  localStorage.removeItem(ENCRYPTED_KEY_STORAGE);
};

export const hasApiKey = (): boolean => {
  const key = getApiKey();
  return !!key && key.startsWith('AIza');
};

// Sanitize error messages to prevent API key leakage in logs
const sanitizeErrorMessage = (message: string, apiKey?: string): string => {
  if (!message) return message;
  let sanitized = message;
  // Remove API key if present
  if (apiKey) {
    sanitized = sanitized.replace(new RegExp(apiKey, 'g'), '[API_KEY_REDACTED]');
  }
  // Also redact any AIza... patterns
  sanitized = sanitized.replace(/AIza[A-Za-z0-9_-]{30,}/g, '[API_KEY_REDACTED]');
  return sanitized;
};

// ============================================
// 信頼セッション方式（GitHub Passkey風）
// - 初回のみ明示的な承認が必要
// - 「信頼する」を選択するとセッション中は自動許可
// - ブラウザを閉じると信頼状態がリセット
// ============================================
const TRUSTED_SESSION_KEY = 'construction_album_trusted_session';
const AUTO_API_SETTINGS_KEY = 'construction_album_auto_api_settings';

export interface AutoApiSettings {
  autoValidateModels: boolean;     // モデル自動検証（APIキー入力時）
  autoSelectWorkTypes: boolean;    // 工種自動選択（バッチ解析時）
  autoNormalization: boolean;      // 自動正規化（解析後）
  autoSceneAssignment: boolean;    // 自動シーン割当（ペアリング時）
}

// 信頼セッション: sessionStorageに保存（ブラウザ閉じるとリセット）
export const isTrustedSession = (): boolean => {
  return sessionStorage.getItem(TRUSTED_SESSION_KEY) === 'true';
};

export const setTrustedSession = (trusted: boolean): void => {
  if (trusted) {
    sessionStorage.setItem(TRUSTED_SESSION_KEY, 'true');
  } else {
    sessionStorage.removeItem(TRUSTED_SESSION_KEY);
  }
};

export const revokeTrust = (): void => {
  sessionStorage.removeItem(TRUSTED_SESSION_KEY);
};

// 永続設定（localStorageに保存）: 信頼セッションでない場合のデフォルト動作
const DEFAULT_AUTO_API_SETTINGS: AutoApiSettings = {
  autoValidateModels: false,
  autoSelectWorkTypes: false,
  autoNormalization: false,
  autoSceneAssignment: false,
};

export const getAutoApiSettings = (): AutoApiSettings => {
  try {
    const saved = localStorage.getItem(AUTO_API_SETTINGS_KEY);
    if (saved) {
      return { ...DEFAULT_AUTO_API_SETTINGS, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Failed to load auto API settings:', e);
  }
  return DEFAULT_AUTO_API_SETTINGS;
};

export const setAutoApiSettings = (settings: Partial<AutoApiSettings>): void => {
  const current = getAutoApiSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem(AUTO_API_SETTINGS_KEY, JSON.stringify(updated));
};

// 信頼セッションの場合は全機能を自動許可、そうでなければ個別設定を参照
export const isAutoApiEnabled = (feature: keyof AutoApiSettings): boolean => {
  // 信頼セッションなら全て許可
  if (isTrustedSession()) {
    return true;
  }
  // そうでなければ個別設定を参照
  return getAutoApiSettings()[feature];
};

// Model Selection
export type ModelType = 'gemini-3.0-flash' | 'gemini-3.0-pro' | 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-2.0-flash';
const MODEL_STORAGE_KEY = 'construction_album_model';

export const AVAILABLE_MODELS: { id: ModelType; name: string; description: string }[] = [
  { id: 'gemini-3.0-flash', name: 'Gemini 3.0 Flash', description: '最新・高性能（推奨）' },
  { id: 'gemini-3.0-pro', name: 'Gemini 3.0 Pro', description: '最新・最高精度' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: '高速・低コスト' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: '高精度・高コスト' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: '最速・最低コスト' },
];

export const getSelectedModel = (): ModelType => {
  const saved = localStorage.getItem(MODEL_STORAGE_KEY);
  if (saved && AVAILABLE_MODELS.some(m => m.id === saved)) {
    return saved as ModelType;
  }
  return 'gemini-3.0-flash'; // デフォルト
};

export const setSelectedModel = (model: ModelType): void => {
  localStorage.setItem(MODEL_STORAGE_KEY, model);
};

// API Key Validation - Single Model
export const validateApiKey = async (apiKey: string, model?: ModelType): Promise<{ valid: boolean; error?: string }> => {
  const testModel = model || 'gemini-2.0-flash';
  try {
    const ai = new GoogleGenAI({ apiKey });
    await ai.models.generateContent({
      model: testModel,
      contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
    });
    return { valid: true };
  } catch (e: any) {
    // Sanitize error message to prevent API key leakage
    const safeMessage = sanitizeErrorMessage(e.message || '', apiKey);
    console.error(`API Key validation failed for ${testModel}:`, safeMessage);
    if (e.message?.includes('API_KEY_INVALID') || e.message?.includes('401')) {
      return { valid: false, error: 'APIキーが無効です' };
    }
    if (e.message?.includes('quota') || e.message?.includes('429')) {
      return { valid: false, error: '利用制限に達しました' };
    }
    if (e.message?.includes('not found') || e.message?.includes('404')) {
      return { valid: false, error: 'モデルが利用不可' };
    }
    return { valid: false, error: safeMessage || '接続エラー' };
  }
};

// Model Availability Status
export type ModelStatus = 'available' | 'quota_exceeded' | 'unavailable' | 'checking' | 'unknown';

export interface ModelAvailability {
  id: ModelType;
  name: string;
  description: string;
  status: ModelStatus;
  error?: string;
}

// Validate all models and return their availability
export const validateAllModels = async (
  apiKey: string,
  onProgress?: (modelId: ModelType, status: ModelStatus, error?: string) => void
): Promise<ModelAvailability[]> => {
  const results: ModelAvailability[] = AVAILABLE_MODELS.map(m => ({
    ...m,
    status: 'checking' as ModelStatus
  }));

  // Test models in parallel
  const checks = AVAILABLE_MODELS.map(async (model, index) => {
    onProgress?.(model.id, 'checking');
    const result = await validateApiKey(apiKey, model.id);

    let status: ModelStatus;
    if (result.valid) {
      status = 'available';
    } else if (result.error?.includes('制限')) {
      status = 'quota_exceeded';
    } else if (result.error?.includes('不可') || result.error?.includes('無効')) {
      status = 'unavailable';
    } else {
      status = 'unknown';
    }

    results[index] = {
      ...model,
      status,
      error: result.error
    };

    onProgress?.(model.id, status, result.error);
    return results[index];
  });

  await Promise.all(checks);
  return results;
};

// Get the best available model (first available in priority order)
export const getBestAvailableModel = (availabilities: ModelAvailability[]): ModelType | null => {
  // Priority: 3.0 Flash > 3.0 Pro > 2.5 Flash > 2.5 Pro > 2.0 Flash
  const priority: ModelType[] = ['gemini-3.0-flash', 'gemini-3.0-pro', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'];

  for (const modelId of priority) {
    const model = availabilities.find(m => m.id === modelId);
    if (model?.status === 'available') {
      return modelId;
    }
  }
  return null;
};

// ============================================
// 解析・正規化関連の関数を再エクスポート
// (services/gemini/ から)
// ============================================
export {
  // Analysis Functions
  analyzePhotoBatch,
  analyzePhotoInteractive,
  identifyTargetPhotos,
  selectWorkTypes,
  getFilteredHierarchy,
  getSystemInstruction,

  // Normalization Functions
  getNormalizationProposals,
  applyNormalizationCorrections,
  normalizeDataConsistency,
  assignSceneIds,
  refinePairContext,
  sortPhotosByScene,

  // Types
  type InteractiveMessage,
  type InteractiveAnalysisResult,
  type NormalizationCorrection,
  type NormalizationResult,
} from './gemini';
