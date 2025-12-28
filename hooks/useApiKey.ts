import { useState, useEffect, useCallback } from 'react';
import { getApiKey, setApiKey as saveApiKey } from '../services/geminiService';

/**
 * APIキー管理のカスタムフック
 */
export function useApiKey() {
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [pendingApiKey, setPendingApiKey] = useState<string | null>(null);

  // Initialize API key from localStorage on mount
  useEffect(() => {
    const storedKey = getApiKey();
    if (storedKey) {
      setApiKeyState(storedKey);
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
    handleApiKeyInput,
    handleModelValidationComplete,
    handleModelValidationBack,
    setApiKey,
    clearApiKey,
    hasApiKey: !!apiKey,
  };
}
