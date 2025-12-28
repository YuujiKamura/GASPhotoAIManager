/**
 * 暗号化ユーティリティ
 *
 * Web Crypto APIを使用してAES-256-GCMで暗号化
 * マスターパスワードからPBKDF2で鍵を導出
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

/**
 * パスワードから暗号化キーを導出
 */
const deriveKey = async (
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> => {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  // パスワードをインポート
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // PBKDF2で鍵を導出
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
};

/**
 * 文字列を暗号化
 */
export const encrypt = async (
  plaintext: string,
  password: string
): Promise<{ encrypted: string; iv: string; salt: string }> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  // ランダムなソルトとIVを生成
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // 鍵を導出
  const key = await deriveKey(password, salt);

  // 暗号化
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    data
  );

  // Base64エンコード
  const encrypted = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
  const ivBase64 = btoa(String.fromCharCode(...iv));
  const saltBase64 = btoa(String.fromCharCode(...salt));

  return { encrypted, iv: ivBase64, salt: saltBase64 };
};

/**
 * 暗号文を復号
 */
export const decrypt = async (
  encrypted: string,
  password: string,
  ivBase64: string,
  saltBase64: string
): Promise<string> => {
  // Base64デコード
  const encryptedBuffer = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
  const salt = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));

  // 鍵を導出
  const key = await deriveKey(password, salt);

  // 復号
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    encryptedBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
};

/**
 * パスワードのハッシュを生成（検証用）
 */
export const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
};

/**
 * マスターパスワードを検証
 */
export const verifyPassword = async (
  password: string,
  storedHash: string
): Promise<boolean> => {
  const hash = await hashPassword(password);
  return hash === storedHash;
};

/**
 * 暗号化されたJSONオブジェクトを保存/復元するヘルパー
 */
export const encryptObject = async <T>(
  obj: T,
  password: string
): Promise<{ encrypted: string; iv: string; salt: string }> => {
  const json = JSON.stringify(obj);
  return encrypt(json, password);
};

export const decryptObject = async <T>(
  encrypted: string,
  password: string,
  iv: string,
  salt: string
): Promise<T> => {
  const json = await decrypt(encrypted, password, iv, salt);
  return JSON.parse(json) as T;
};
