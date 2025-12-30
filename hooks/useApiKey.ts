import { useState, useEffect, useCallback } from 'react';
import { getApiKey, setApiKey as saveApiKey, hasEncryptedApiKey } from '../services/geminiService';

/**
 * APIキー管理のカスタムフック
 */
export function useApiKey() {
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [pendingApiKey, setPendingApiKey] = useState<string | null>(null);
  // 暗号化されたキーが存在するかどうか（ロック状態）
  const [isLocked, setIsLocked] = useState<boolean>(false);

  // Initialize API key from localStorage on mount
  useEffect(() => {
    const storedKey = getApiKey();
    if (storedKey) {
      setApiKeyState(storedKey);
    } else if (hasEncryptedApiKey()) {
      // 暗号化されたキーがあるがメモリ上にキーがない = ロック状態
      setIsLocked(true);
    }
  }, []);

  // ApiKeySetup → ModelValidation への遷移用
  const handleApiKeyInput = useCallback((key: string) => {
    setPendingApiKey(key);
  }, []);

  // ModelValidation 完了時
  const handleModelValidationComplete = useCallback((key: string) => {
    saveApiKey(key);
    setApiKeyState(key);
    setPendingApiKey(null);
    setIsLocked(false);
  }, []);

  // ロック解除完了時（モデル検証スキップ）
  const handleUnlockComplete = useCallback((key: string) => {
    saveApiKey(key);
    setApiKeyState(key);
    setIsLocked(false);
  }, []);

  // ModelValidation から戻る
  const handleModelValidationBack = useCallback(() => {
    setPendingApiKey(null);
  }, []);

  // APIキーを直接設定
  const setApiKey = useCallback((key: string) => {
    saveApiKey(key);
    setApiKeyState(key);
  }, []);

  // APIキーをクリア
  const clearApiKey = useCallback(() => {
    setApiKeyState(null);
    setPendingApiKey(null);
  }, []);

  return {
    apiKey,
    pendingApiKey,
    setPendingApiKey,
    isLocked,
    handleApiKeyInput,
    handleModelValidationComplete,
    handleModelValidationBack,
    handleUnlockComplete,
    setApiKey,
    clearApiKey,
    hasApiKey: !!apiKey,
  };
}
