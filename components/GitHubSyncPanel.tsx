import React from 'react';
import { Github, Upload, Download, Check, X, AlertCircle, ExternalLink, Key, RefreshCw } from 'lucide-react';
import { useGitHubSyncState } from '../hooks/useGitHubSyncState';

interface GitHubSyncPanelProps {
  onClose: () => void;
}

const GitHubSyncPanel: React.FC<GitHubSyncPanelProps> = ({ onClose }) => {
  const {
    step,
    token,
    username,
    isValidating,
    error,
    syncStatus,
    isSyncing,
    lastCommitUrl,
    successMessage,
    setToken,
    handleValidateToken,
    handleDisconnect,
    handlePush,
    handlePull,
    handleRefreshStatus,
  } = useGitHubSyncState();

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Github size={24} className="text-white" />
            <h2 className="text-lg font-bold text-white">GitHub同期</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="p-4 space-y-4">
          {/* エラー表示 */}
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* 成功メッセージ */}
          {successMessage && (
            <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-3 flex items-start gap-2">
              <Check size={18} className="text-green-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-green-300">{successMessage}</p>
                {lastCommitUrl && (
                  <a
                    href={lastCommitUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:underline flex items-center gap-1 mt-1"
                  >
                    コミットを確認 <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* セットアップ画面 */}
          {step === 'setup' && (
            <>
              <div className="bg-slate-700/50 rounded-xl p-4 space-y-3">
                <p className="text-sm text-slate-300">
                  GitHubと連携すると、AIの学習データを恒久的に保存できます。
                </p>
                <div className="text-xs text-slate-400 space-y-1">
                  <p>1. GitHubでPersonal Access Tokenを作成</p>
                  <p>2. 権限: <code className="bg-slate-600 px-1 rounded">repo</code> が必要</p>
                </div>
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo&description=GASPhotoAIManager"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-slate-600 hover:bg-slate-500 text-white py-2 rounded-lg transition-colors text-sm"
                >
                  トークンを作成 <ExternalLink size={14} />
                </a>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-slate-400">Personal Access Token</label>
                <div className="flex items-center gap-2">
                  <Key size={18} className="text-slate-500 shrink-0" />
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="ghp_xxxx または github_pat_xxxx"
                    className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm font-mono"
                  />
                </div>
              </div>

              <button
                onClick={handleValidateToken}
                disabled={!token.trim() || isValidating}
                className="w-full bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {isValidating ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    検証中...
                  </>
                ) : (
                  <>
                    <Github size={18} />
                    接続
                  </>
                )}
              </button>
            </>
          )}

          {/* 接続済み画面 */}
          {step === 'connected' && (
            <>
              <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Check size={18} className="text-green-400" />
                  <span className="text-green-300 font-bold">接続済み</span>
                </div>
                {username && (
                  <p className="text-sm text-slate-300">
                    ユーザー: <span className="font-mono text-white">@{username}</span>
                  </p>
                )}
              </div>

              {/* 同期ステータス */}
              {syncStatus && (
                <div className="bg-slate-700/50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">同期ステータス</span>
                    <button
                      onClick={handleRefreshStatus}
                      disabled={isSyncing}
                      className="p-1 hover:bg-slate-600 rounded transition-colors"
                    >
                      <RefreshCw size={14} className={`text-slate-400 ${isSyncing ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-800 rounded p-2">
                      <p className="text-slate-500">ローカル版</p>
                      <p className="text-white font-mono">v{syncStatus.localVersion}</p>
                    </div>
                    <div className="bg-slate-800 rounded p-2">
                      <p className="text-slate-500">リモート版</p>
                      <p className="text-white font-mono">v{syncStatus.remoteVersion}</p>
                    </div>
                  </div>
                  {syncStatus.lastSynced && (
                    <p className="text-xs text-slate-500">
                      最終同期: {new Date(syncStatus.lastSynced).toLocaleString('ja-JP')}
                    </p>
                  )}
                </div>
              )}

              {/* アクションボタン */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handlePull}
                  disabled={isSyncing}
                  className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white py-3 rounded-xl transition-colors"
                >
                  <Download size={18} />
                  プル
                </button>
                <button
                  onClick={handlePush}
                  disabled={isSyncing}
                  className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 text-white py-3 rounded-xl transition-colors"
                >
                  <Upload size={18} />
                  プッシュ
                </button>
              </div>

              <p className="text-xs text-slate-500 text-center">
                プッシュすると <code className="bg-slate-700 px-1 rounded">data/learned-settings</code> ブランチに保存され、自動でmainにマージされます
              </p>

              {/* 切断ボタン */}
              <button
                onClick={handleDisconnect}
                className="w-full text-slate-400 hover:text-red-400 text-sm py-2 transition-colors"
              >
                接続を解除
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default GitHubSyncPanel;
