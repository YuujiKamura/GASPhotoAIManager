import { useState, useEffect, useCallback } from 'react';
import { hasEncryptedApiKey, loadApiKeyEncrypted, setApiKeyEncrypted } from '../services/geminiService';
import { hashPassword } from '../utils/crypto';

type SetupMode = 'check' | 'unlock' | 'new';

interface ApiKeySetupState {
  mode: SetupMode;
  apiKey: string;
  masterPassword: string;
  confirmPassword: string;
  error: string;
  loading: boolean;
}

interface ApiKeySetupActions {
  setApiKey: (value: string) => void;
  setMasterPassword: (value: string) => void;
  setConfirmPassword: (value: string) => void;
  handleUnlock: (onComplete: (key: string) => void) => Promise<void>;
  handleSubmit: (onComplete: (key: string) => void) => Promise<void>;
  handleResetKey: () => void;
}

interface ApiKeySetupValidation {
  isValidKey: boolean;
  isValidPassword: boolean;
  passwordsMatch: boolean;
}

export function useApiKeySetupState(): ApiKeySetupState & ApiKeySetupActions & ApiKeySetupValidation {
  const [mode, setMode] = useState<SetupMode>('check');
  const [apiKey, setApiKey] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isValidKey = apiKey.trim().startsWith('AIza') && apiKey.trim().length >= 39;
  const isValidPassword = masterPassword.length >= 4;
  const passwordsMatch = masterPassword === confirmPassword;

  // 初期化: 暗号化されたキーがあるかチェック
  useEffect(() => {
    if (hasEncryptedApiKey()) {
      setMode('unlock');
    } else {
      setMode('new');
    }
  }, []);

  // アンロック処理
  const handleUnlock = useCallback(async (onComplete: (key: string) => void) => {
    if (!masterPassword) {
      setError('パスワードを入力してください');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const success = await loadApiKeyEncrypted(masterPassword);
      if (success) {
        const { getApiKey } = await import('../services/geminiService');
        const key = getApiKey();
        if (key) {
          onComplete(key);
        } else {
          setError('キーの読み込みに失敗しました');
        }
      } else {
        setError('パスワードが違います');
      }
    } catch {
      setError('復号に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [masterPassword]);

  // 新規設定処理
  const handleSubmit = useCallback(async (onComplete: (key: string) => void) => {
    if (!isValidKey) {
      setError('有効なAPIキーを入力してください');
      return;
    }
    if (!isValidPassword) {
      setError('パスワードは4文字以上で入力してください');
      return;
    }
    if (!passwordsMatch) {
      setError('パスワードが一致しません');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const hash = await hashPassword(masterPassword);
      localStorage.setItem('gaspm_master_hash', hash);
      await setApiKeyEncrypted(apiKey.trim(), masterPassword);
      onComplete(apiKey.trim());
    } catch (e: any) {
      setError('保存に失敗しました: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [apiKey, masterPassword, isValidKey, isValidPassword, passwordsMatch]);

  // 新規設定に切り替え（暗号化キーを破棄）
  const handleResetKey = useCallback(() => {
    if (window.confirm('保存されたAPIキーを削除しますか？新しいキーを設定できます。')) {
      localStorage.removeItem('gaspm_encrypted_api_key');
      localStorage.removeItem('gaspm_master_hash');
      setMode('new');
      setMasterPassword('');
      setError('');
    }
  }, []);

  return {
    mode,
    apiKey,
    masterPassword,
    confirmPassword,
    error,
    loading,
    isValidKey,
    isValidPassword,
    passwordsMatch,
    setApiKey,
    setMasterPassword,
    setConfirmPassword,
    handleUnlock,
    handleSubmit,
    handleResetKey,
  };
}
