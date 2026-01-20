import { useState, useCallback, useEffect } from 'react';
import { setApiKey as saveApiKey, hasApiKey, getMaskedApiKey, clearApiKey } from '../services/geminiService';

type SetupMode = 'new';  // 常に新規設定モード（パスワードロックは廃止）

interface ApiKeySetupState {
  mode: SetupMode;
  apiKey: string;
  masterPassword: string;      // 後方互換性のため残す（使用しない）
  confirmPassword: string;     // 後方互換性のため残す（使用しない）
  error: string;
  loading: boolean;
  existingKeyMasked: string | null;  // 既存キーのマスク表示
  hasExistingKey: boolean;           // 既存キーがあるか
}

interface ApiKeySetupActions {
  setApiKey: (value: string) => void;
  setMasterPassword: (value: string) => void;
  setConfirmPassword: (value: string) => void;
  handleUnlock: (onComplete: (key: string) => void) => Promise<void>;
  handleSubmit: (onComplete: (key: string) => void) => void;
  handleResetKey: () => void;
  handleClearKey: () => void;  // キーをクリアする
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
  const [existingKeyMasked, setExistingKeyMasked] = useState<string | null>(null);
  const [hasExistingKey, setHasExistingKey] = useState(false);

  // 初期化時に既存キーの状態をチェック
  useEffect(() => {
    const checkExistingKey = () => {
      const exists = hasApiKey();
      setHasExistingKey(exists);
      if (exists) {
        setExistingKeyMasked(getMaskedApiKey());
      }
    };
    checkExistingKey();
  }, []);

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

  // キーをクリア
  const handleClearKey = useCallback(() => {
    if (window.confirm('保存されたAPIキーを削除しますか？\n次回起動時に再入力が必要になります。')) {
      clearApiKey();
      localStorage.removeItem('gaspm_encrypted_api_key');
      localStorage.removeItem('gaspm_master_hash');
      // 生体認証データもクリア
      localStorage.removeItem('construction_album_passkey_credential');
      localStorage.removeItem('construction_album_protected_api_key');
      setHasExistingKey(false);
      setExistingKeyMasked(null);
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
    existingKeyMasked,
    hasExistingKey,
    isValidKey,
    isValidPassword,
    passwordsMatch,
    setApiKey,
    setMasterPassword,
    setConfirmPassword,
    handleUnlock,
    handleSubmit,
    handleResetKey,
    handleClearKey,
  };
}
