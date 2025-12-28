import React, { useState, useEffect } from 'react';
import {
  Database,
  Lock,
  Unlock,
  Github,
  Check,
  AlertTriangle,
  RefreshCw,
  X,
} from 'lucide-react';
import storageManager from '../services/storageManager';
import { StorageState } from '../types';

interface PersonalStorageSetupProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'en' | 'ja';
}

type SetupStep = 'status' | 'configure' | 'unlock';

const PersonalStorageSetup: React.FC<PersonalStorageSetupProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  const [step, setStep] = useState<SetupStep>('status');
  const [state, setState] = useState<StorageState | null>(null);
  const [repoUrl, setRepoUrl] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const txt = {
    title: lang === 'ja' ? '個人ストレージ設定' : 'Personal Storage Setup',
    status: lang === 'ja' ? 'ステータス' : 'Status',
    configure: lang === 'ja' ? '設定' : 'Configure',
    unlock: lang === 'ja' ? 'アンロック' : 'Unlock',
    projectRepo: lang === 'ja' ? 'プロジェクトリポジトリ' : 'Project Repository',
    personalRepo: lang === 'ja' ? '個人リポジトリ' : 'Personal Repository',
    notConfigured: lang === 'ja' ? '未設定' : 'Not configured',
    configured: lang === 'ja' ? '設定済み' : 'Configured',
    locked: lang === 'ja' ? 'ロック中' : 'Locked',
    unlocked: lang === 'ja' ? 'アンロック済み' : 'Unlocked',
    pendingChanges: lang === 'ja' ? '未同期の変更あり' : 'Pending changes',
    syncNow: lang === 'ja' ? '今すぐ同期' : 'Sync now',
    repoUrlLabel: lang === 'ja' ? 'GitHubリポジトリURL' : 'GitHub Repository URL',
    repoUrlPlaceholder: 'https://github.com/username/my-gaspm-data',
    passwordLabel: lang === 'ja' ? 'マスターパスワード' : 'Master Password',
    passwordHint:
      lang === 'ja'
        ? 'APIキーなどの暗号化に使用します'
        : 'Used to encrypt API keys and credentials',
    confirmLabel: lang === 'ja' ? 'パスワード確認' : 'Confirm Password',
    save: lang === 'ja' ? '保存' : 'Save',
    cancel: lang === 'ja' ? 'キャンセル' : 'Cancel',
    close: lang === 'ja' ? '閉じる' : 'Close',
    setupNow: lang === 'ja' ? '今すぐ設定' : 'Setup Now',
    unlockBtn: lang === 'ja' ? 'アンロック' : 'Unlock',
    passwordMismatch: lang === 'ja' ? 'パスワードが一致しません' : 'Passwords do not match',
    enterPassword: lang === 'ja' ? 'パスワードを入力' : 'Enter password',
  };

  useEffect(() => {
    if (isOpen) {
      refreshState();
    }
  }, [isOpen]);

  const refreshState = () => {
    const s = storageManager.getState();
    setState(s);

    if (!s.personalConfigured) {
      setStep('status');
    } else if (!storageManager.personal.isUnlocked()) {
      setStep('unlock');
    } else {
      setStep('status');
    }
  };

  const handleConfigure = async () => {
    setError('');

    if (!repoUrl) {
      setError(lang === 'ja' ? 'リポジトリURLを入力してください' : 'Please enter repository URL');
      return;
    }

    if (!masterPassword) {
      setError(lang === 'ja' ? 'パスワードを入力してください' : 'Please enter password');
      return;
    }

    if (masterPassword !== confirmPassword) {
      setError(txt.passwordMismatch);
      return;
    }

    setLoading(true);
    try {
      const result = await storageManager.personal.configure(repoUrl, masterPassword);
      if (result.success) {
        refreshState();
        setRepoUrl('');
        setMasterPassword('');
        setConfirmPassword('');
        setStep('status');
      } else {
        setError(result.error || 'Configuration failed');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async () => {
    setError('');
    setLoading(true);

    try {
      const success = await storageManager.personal.unlock(masterPassword);
      if (success) {
        refreshState();
        setMasterPassword('');
        setStep('status');
      } else {
        setError(lang === 'ja' ? 'パスワードが違います' : 'Invalid password');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await storageManager.syncAll();
      refreshState();
    } catch (e) {
      console.error('Sync failed:', e);
    } finally {
      setSyncing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-600" />
            {txt.title}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="p-6">
          {/* ステータス表示 */}
          {step === 'status' && state && (
            <div className="space-y-4">
              {/* プロジェクトリポジトリ */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Github className="w-5 h-5 text-gray-600" />
                    <span className="font-medium">{txt.projectRepo}</span>
                  </div>
                  <span
                    className={`text-sm ${
                      state.projectConfigured ? 'text-green-600' : 'text-gray-500'
                    }`}
                  >
                    {state.projectConfigured ? txt.configured : txt.notConfigured}
                  </span>
                </div>
              </div>

              {/* 個人リポジトリ */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {storageManager.personal.isUnlocked() ? (
                      <Unlock className="w-5 h-5 text-green-600" />
                    ) : (
                      <Lock className="w-5 h-5 text-gray-600" />
                    )}
                    <span className="font-medium">{txt.personalRepo}</span>
                  </div>
                  <span
                    className={`text-sm ${
                      state.personalConfigured
                        ? storageManager.personal.isUnlocked()
                          ? 'text-green-600'
                          : 'text-amber-600'
                        : 'text-gray-500'
                    }`}
                  >
                    {state.personalConfigured
                      ? storageManager.personal.isUnlocked()
                        ? txt.unlocked
                        : txt.locked
                      : txt.notConfigured}
                  </span>
                </div>
                {state.personalRepoUrl && (
                  <div className="mt-2 text-xs text-gray-500 truncate">
                    {state.personalRepoUrl}
                  </div>
                )}
              </div>

              {/* 同期状態 */}
              {state.pendingChanges && (
                <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-2 text-amber-700">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-sm">{txt.pendingChanges}</span>
                  </div>
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                    {txt.syncNow}
                  </button>
                </div>
              )}

              {/* アクションボタン */}
              {!state.personalConfigured && (
                <button
                  onClick={() => setStep('configure')}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  {txt.setupNow}
                </button>
              )}

              {state.personalConfigured && !storageManager.personal.isUnlocked() && (
                <button
                  onClick={() => setStep('unlock')}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  {txt.unlockBtn}
                </button>
              )}
            </div>
          )}

          {/* 設定フォーム */}
          {step === 'configure' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {txt.repoUrlLabel}
                </label>
                <input
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder={txt.repoUrlPlaceholder}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {txt.passwordLabel}
                </label>
                <input
                  type="password"
                  value={masterPassword}
                  onChange={(e) => setMasterPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">{txt.passwordHint}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {txt.confirmLabel}
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setStep('status');
                    setError('');
                  }}
                  className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  {txt.cancel}
                </button>
                <button
                  onClick={handleConfigure}
                  disabled={loading}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  {txt.save}
                </button>
              </div>
            </div>
          )}

          {/* アンロックフォーム */}
          {step === 'unlock' && (
            <div className="space-y-4">
              <div className="text-center">
                <Lock className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600">{txt.enterPassword}</p>
              </div>

              <div>
                <input
                  type="password"
                  value={masterPassword}
                  onChange={(e) => setMasterPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                  placeholder={txt.passwordLabel}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center"
                  autoFocus
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm text-center">
                  {error}
                </div>
              )}

              <button
                onClick={handleUnlock}
                disabled={loading}
                className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Unlock className="w-4 h-4" />
                )}
                {txt.unlockBtn}
              </button>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex justify-end p-4 border-t bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors"
          >
            {txt.close}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PersonalStorageSetup;
