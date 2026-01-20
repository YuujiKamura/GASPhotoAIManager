/**
 * WebAuthn Service - 生体認証（指紋/顔認証）でAPIキーを保護
 *
 * フロー:
 * 1. 初回: APIキー入力 → 生体認証を登録 → APIキーを暗号化して永続保存
 * 2. 次回以降: 生体認証でログイン → 暗号化されたAPIキーを復号
 */

import { encryptWithAppKey, decryptWithAppKey } from '../utils/crypto';

// ストレージキー
const CREDENTIAL_ID_KEY = 'construction_album_credential_id';
const PROTECTED_API_KEY = 'construction_album_protected_api_key';

// WebAuthnがサポートされているか確認
export const isWebAuthnSupported = (): boolean => {
  return !!(
    window.PublicKeyCredential &&
    navigator.credentials &&
    navigator.credentials.create &&
    navigator.credentials.get
  );
};

// 生体認証が利用可能か確認（プラットフォーム認証器）
export const isBiometricAvailable = async (): Promise<boolean> => {
  if (!isWebAuthnSupported()) return false;

  try {
    // プラットフォーム認証器（指紋/顔認証）が利用可能か確認
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return available;
  } catch (e) {
    console.warn('Biometric check failed:', e);
    return false;
  }
};

// 登録済みのパスキーがあるか確認
export const hasRegisteredPasskey = (): boolean => {
  return !!(localStorage.getItem(CREDENTIAL_ID_KEY) && localStorage.getItem(PROTECTED_API_KEY));
};

// 保存されているAPIキーを取得（生体認証後に使用）
const getProtectedApiKey = (): string | null => {
  return localStorage.getItem(PROTECTED_API_KEY);
};

// チャレンジを生成
const generateChallenge = (): Uint8Array => {
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  return challenge;
};

// Uint8Arrayをbase64urlに変換
const bufferToBase64url = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

// base64urlをUint8Arrayに変換
const base64urlToBuffer = (base64url: string): Uint8Array => {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

/**
 * パスキーを登録（初回セットアップ時）
 * @param apiKey 保護するAPIキー
 * @returns 成功したらtrue
 */
export const registerPasskey = async (apiKey: string): Promise<{ success: boolean; error?: string }> => {
  if (!isWebAuthnSupported()) {
    return { success: false, error: 'このブラウザはWebAuthnをサポートしていません' };
  }

  try {
    const challenge = generateChallenge();

    // ユーザーID（ランダム生成）
    const userId = new Uint8Array(16);
    crypto.getRandomValues(userId);

    const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
      challenge,
      rp: {
        name: '工事写真帳メーカー',
        id: window.location.hostname,
      },
      user: {
        id: userId,
        name: 'user@construction-album',
        displayName: '工事写真帳ユーザー',
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },   // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // プラットフォーム認証器（指紋/顔）のみ
        userVerification: 'required',        // 生体認証必須
        residentKey: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
    };

    const credential = await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions,
    }) as PublicKeyCredential;

    if (!credential) {
      return { success: false, error: '認証がキャンセルされました' };
    }

    // 認証情報を保存
    const credentialId = bufferToBase64url(credential.rawId);
    localStorage.setItem(CREDENTIAL_ID_KEY, credentialId);

    // APIキーを暗号化して保存（平文では保存しない）
    const encryptedKey = await encryptWithAppKey(apiKey);
    localStorage.setItem(PROTECTED_API_KEY, encryptedKey);

    return { success: true };
  } catch (e: any) {
    console.error('Passkey registration failed:', e);
    if (e.name === 'NotAllowedError') {
      return { success: false, error: '認証がキャンセルされました' };
    }
    if (e.name === 'SecurityError') {
      return { success: false, error: 'セキュリティエラー（HTTPSが必要な場合があります）' };
    }
    return { success: false, error: e.message || '登録に失敗しました' };
  }
};

/**
 * パスキーで認証（ログイン時）
 * @returns 成功したらAPIキーを返す
 */
export const authenticateWithPasskey = async (): Promise<{ success: boolean; apiKey?: string; error?: string }> => {
  if (!isWebAuthnSupported()) {
    return { success: false, error: 'このブラウザはWebAuthnをサポートしていません' };
  }

  const storedCredentialId = localStorage.getItem(CREDENTIAL_ID_KEY);
  if (!storedCredentialId) {
    return { success: false, error: 'パスキーが登録されていません' };
  }

  try {
    const challenge = generateChallenge();

    const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
      challenge,
      allowCredentials: [{
        id: base64urlToBuffer(storedCredentialId),
        type: 'public-key',
        transports: ['internal'], // プラットフォーム認証器
      }],
      userVerification: 'required',
      timeout: 60000,
    };

    const assertion = await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions,
    }) as PublicKeyCredential;

    if (!assertion) {
      return { success: false, error: '認証がキャンセルされました' };
    }

    // 認証成功 - 暗号化されたAPIキーを復号して返す
    const encrypted = localStorage.getItem(PROTECTED_API_KEY);
    if (!encrypted) {
      return { success: false, error: 'APIキーが見つかりません' };
    }

    // 復号を試みる
    const apiKey = await decryptWithAppKey(encrypted);
    if (!apiKey) {
      // 旧形式（平文）の場合はそのまま使用（マイグレーション対応）
      if (encrypted.startsWith('AIza')) {
        return { success: true, apiKey: encrypted };
      }
      return { success: false, error: 'APIキーの復号に失敗しました' };
    }

    return { success: true, apiKey };
  } catch (e: any) {
    console.error('Passkey authentication failed:', e);
    if (e.name === 'NotAllowedError') {
      return { success: false, error: '認証がキャンセルされました' };
    }
    return { success: false, error: e.message || '認証に失敗しました' };
  }
};

/**
 * パスキーを削除
 */
export const removePasskey = (): void => {
  localStorage.removeItem(CREDENTIAL_ID_KEY);
  localStorage.removeItem(PROTECTED_API_KEY);
};

/**
 * 既存の平文APIキーを暗号化形式にマイグレーション
 * アプリ起動時に一度だけ実行する
 * @returns マイグレーションが実行されたらtrue
 */
export const migratePasskeyStorage = async (): Promise<boolean> => {
  const stored = localStorage.getItem(PROTECTED_API_KEY);

  // 保存されていない場合はスキップ
  if (!stored) {
    return false;
  }

  // 既に暗号化形式の場合はスキップ（JSONで始まる）
  if (stored.startsWith('{')) {
    return false;
  }

  // 平文のAPIキー形式の場合（AIzaで始まる）
  if (stored.startsWith('AIza')) {
    console.log('Migrating plain text API key to encrypted format...');
    const encrypted = await encryptWithAppKey(stored);
    localStorage.setItem(PROTECTED_API_KEY, encrypted);
    console.log('Migration completed.');
    return true;
  }

  return false;
};

/**
 * 旧形式の平文APIキーをlocalStorageから削除
 * セキュリティ向上のため、起動時に呼び出す
 */
export const clearLegacyPlainTextApiKey = (): void => {
  const legacyKey = 'construction_album_api_key';
  if (localStorage.getItem(legacyKey)) {
    console.log('Removing legacy plain text API key from localStorage...');
    localStorage.removeItem(legacyKey);
  }
};
