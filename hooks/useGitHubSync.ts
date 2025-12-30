import { useState, useEffect, useCallback } from 'react';
import {
  getGitHubToken,
  setGitHubToken,
  clearGitHubToken,
  hasGitHubToken,
  validateGitHubToken,
  fetchLearnedSettings,
  pushLearnedSettings,
  buildLearnedSettingsFromLocal,
  getSyncStatus,
  SyncStatus
} from '../services/githubSync';

export type GitHubSyncStep = 'setup' | 'connected' | 'syncing';

export function useGitHubSync() {
  const [step, setStep] = useState<GitHubSyncStep>('setup');
  const [token, setToken] = useState('');
  const [username, setUsername] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastCommitUrl, setLastCommitUrl] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 初期化
  useEffect(() => {
    const init = async () => {
      if (hasGitHubToken()) {
        const savedToken = getGitHubToken()!;
        const result = await validateGitHubToken(savedToken);
        if (result.valid) {
          setUsername(result.username || null);
          setStep('connected');
          const status = await getSyncStatus(savedToken);
          setSyncStatus(status);
        } else {
          clearGitHubToken();
        }
      }
    };
    init();
  }, []);

  const handleValidateToken = useCallback(async () => {
    if (!token.trim()) return;

    setIsValidating(true);
    setError(null);

    const result = await validateGitHubToken(token.trim());

    if (result.valid) {
      setGitHubToken(token.trim());
      setUsername(result.username || null);
      setStep('connected');
      const status = await getSyncStatus(token.trim());
      setSyncStatus(status);
    } else {
      setError(result.error || 'トークンの検証に失敗しました');
    }

    setIsValidating(false);
  }, [token]);

  const handleDisconnect = useCallback(() => {
    clearGitHubToken();
    setUsername(null);
    setToken('');
    setSyncStatus(null);
    setStep('setup');
  }, []);

  const handlePush = useCallback(async () => {
    const savedToken = getGitHubToken();
    if (!savedToken) return;

    setIsSyncing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const settings = await buildLearnedSettingsFromLocal();
      const result = await pushLearnedSettings(savedToken, settings);

      if (result.success) {
        setLastCommitUrl(result.commitUrl || null);
        setSuccessMessage('学習データをGitHubにプッシュしました');
        const status = await getSyncStatus(savedToken);
        setSyncStatus(status);
      } else {
        setError(result.error || 'プッシュに失敗しました');
      }
    } catch (e: any) {
      setError(e.message || 'プッシュ中にエラーが発生しました');
    }

    setIsSyncing(false);
  }, []);

  const handlePull = useCallback(async () => {
    const savedToken = getGitHubToken();
    if (!savedToken) return;

    setIsSyncing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const settings = await fetchLearnedSettings(savedToken);
      if (settings) {
        setSuccessMessage(`GitHubから設定を取得しました (v${settings.version})`);
        const status = await getSyncStatus(savedToken);
        setSyncStatus(status);
      } else {
        setError('設定の取得に失敗しました');
      }
    } catch (e: any) {
      setError(e.message || 'プル中にエラーが発生しました');
    }

    setIsSyncing(false);
  }, []);

  const handleRefreshStatus = useCallback(async () => {
    const savedToken = getGitHubToken();
    if (!savedToken) return;

    setIsSyncing(true);
    const status = await getSyncStatus(savedToken);
    setSyncStatus(status);
    setIsSyncing(false);
  }, []);

  return {
    state: { step, token, username, isValidating, error, syncStatus, isSyncing, lastCommitUrl, successMessage },
    actions: {
      setToken,
      handleValidateToken,
      handleDisconnect,
      handlePush,
      handlePull,
      handleRefreshStatus,
    },
  };
}
