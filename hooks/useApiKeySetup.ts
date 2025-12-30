import { useState, useEffect } from 'react';
import { hasEncryptedApiKey, loadApiKeyEncrypted, setApiKeyEncrypted } from '../services/geminiService';
import { hashPassword } from '../utils/crypto';

export type SetupMode = 'check' | 'unlock' | 'new';

export interface ApiKeySetupState {
  mode: SetupMode;
  apiKey: string;
  masterPassword: string;
  confirmPassword: string;
  error: string;
  loading: boolean;
}

export interface ApiKeySetupActions {
  setApiKey: (value: string) => void;
  setMasterPassword: (value: string) => void;
  setConfirmPassword: (value: string) => void;
  handleUnlock: () => Promise<void>;
  handleSubmit: () => Promise<void>;
  handleResetKey: () => void;
}

export interface ApiKeySetupValidation {
  isValidKey: boolean;
  isValidPassword: boolean;
  passwordsMatch: boolean;
}

export function useApiKeySetup(onComplete: (apiKey: string) => void) {
  const [mode, setMode] = useState<SetupMode>('check');
  const [apiKey, setApiKey] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isValidKey = apiKey.trim().startsWith('AIza') && apiKey.trim().length >= 39;
  const isValidPassword = masterPassword.length >= 4;
  const passwordsMatch = masterPassword === confirmPassword;

  useEffect(() => {
    if (hasEncryptedApiKey()) {
      setMode('unlock');
    } else {
      setMode('new');
    }
  }, []);

  const handleUnlock = async () => {
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
  };

  const handleSubmit = async () => {
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
  };

  const handleResetKey = () => {
    if (window.confirm('保存されたAPIキーを削除しますか？新しいキーを設定できます。')) {
      localStorage.removeItem('gaspm_encrypted_api_key');
      localStorage.removeItem('gaspm_master_hash');
      setMode('new');
      setMasterPassword('');
      setError('');
    }
  };

  return {
    state: { mode, apiKey, masterPassword, confirmPassword, error, loading },
    validation: { isValidKey, isValidPassword, passwordsMatch },
    actions: {
      setApiKey,
      setMasterPassword,
      setConfirmPassword,
      handleUnlock,
      handleSubmit,
      handleResetKey,
    },
  };
}
