/**
 * APIキー管理モジュール
 * - APIキーの保存・取得・暗号化
 * - 信頼セッション管理
 */

import { encrypt, decrypt } from '../../utils/crypto';

// ============================================
// ストレージキー定数
// ============================================
const API_KEY_STORAGE_KEY = 'construction_album_api_key';
const ENCRYPTED_KEY_STORAGE = 'gaspm_encrypted_api_key';
const MASTER_HASH_KEY = 'gaspm_master_hash';
const TRUSTED_SESSION_KEY = 'construction_album_trusted_session';
const AUTO_API_SETTINGS_KEY = 'construction_album_auto_api_settings';

// ============================================
// メモリキャッシュ
// ============================================
let cachedApiKey: string | null = null;

// ============================================
// APIキー管理
// ============================================

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

// ============================================
// エラーメッセージのサニタイズ
// ============================================

export const sanitizeErrorMessage = (message: string, apiKey?: string): string => {
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
