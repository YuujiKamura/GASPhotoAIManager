import { useState, useCallback } from 'react';
import { getApiKey, setApiKey as saveApiKey } from '../services/geminiService';

/**
 * APIキー管理のカスタムフック
 */
export function useApiKey() {
  // 初期化を同期的に行う（useEffectだと一瞬「キー未設定」が表示される）
  const [apiKey, setApiKeyState] = useState<string | null>(() => getApiKey());
  const [pendingApiKey, setPendingApiKey] = useState<string | null>(null);
  // 起動時ロックは廃止（パスワードはAPIキー変更時のみ使用）
  const [isLocked, setIsLocked] = useState<boolean>(false);

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
