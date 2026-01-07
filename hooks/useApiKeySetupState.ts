import { useState, useCallback } from 'react';
import { setApiKey as saveApiKey } from '../services/geminiService';

type SetupMode = 'new';  // 常に新規設定モード（パスワードロックは廃止）

interface ApiKeySetupState {
  mode: SetupMode;
  apiKey: string;
  masterPassword: string;      // 後方互換性のため残す（使用しない）
  confirmPassword: string;     // 後方互換性のため残す（使用しない）
  error: string;
  loading: boolean;
}

interface ApiKeySetupActions {
  setApiKey: (value: string) => void;
  setMasterPassword: (value: string) => void;
  setConfirmPassword: (value: string) => void;
  handleUnlock: (onComplete: (key: string) => void) => Promise<void>;
  handleSubmit: (onComplete: (key: string) => void) => void;
  handleResetKey: () => void;
}

interface ApiKeySetupValidation {
  isValidKey: boolean;
  isValidPassword: boolean;    // 常にtrue（パスワード不要）
  passwordsMatch: boolean;     // 常にtrue（パスワード不要）
}

export function useApiKeySetupState(): ApiKeySetupState & ApiKeySetupActions & ApiKeySetupValidation {
  const [mode] = useState<SetupMode>('new');  // 常に新規設定モード
  const [apiKey, setApiKey] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading] = useState(false);

  const isValidKey = apiKey.trim().startsWith('AIza') && apiKey.trim().length >= 39;
  const isValidPassword = true;   // パスワード不要
  const passwordsMatch = true;    // パスワード不要

  // アンロック処理（後方互換性のため残す - 実際には使用されない）
  const handleUnlock = useCallback(async (_onComplete: (key: string) => void) => {
    // パスワードロックは廃止されたため何もしない
  }, []);

  // 新規設定処理（パスワードなしでlocalStorageに保存）
  const handleSubmit = useCallback((onComplete: (key: string) => void) => {
    if (!isValidKey) {
      setError('有効なAPIキーを入力してください');
      return;
    }

    const trimmedKey = apiKey.trim();
    saveApiKey(trimmedKey);
    // 旧暗号化データがあれば削除
    localStorage.removeItem('gaspm_encrypted_api_key');
    localStorage.removeItem('gaspm_master_hash');
    onComplete(trimmedKey);
  }, [apiKey, isValidKey]);

  // キーリセット（後方互換性のため残す）
  const handleResetKey = useCallback(() => {
    if (window.confirm('保存されたAPIキーを削除しますか？')) {
      localStorage.removeItem('construction_album_api_key');
      localStorage.removeItem('gaspm_encrypted_api_key');
      localStorage.removeItem('gaspm_master_hash');
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
