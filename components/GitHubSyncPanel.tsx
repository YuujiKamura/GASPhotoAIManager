import React from 'react';
import { Github, Check, X, AlertCircle, ExternalLink } from 'lucide-react';
import { useGitHubSync } from '../hooks/useGitHubSync';
import { SetupView, ConnectedView } from './GitHubSyncPanel/index';

interface GitHubSyncPanelProps {
  onClose: () => void;
}

const GitHubSyncPanel: React.FC<GitHubSyncPanelProps> = ({ onClose }) => {
  const { state, actions } = useGitHubSync();
  const { step, token, username, isValidating, error, syncStatus, isSyncing, lastCommitUrl, successMessage } = state;

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

          {step === 'setup' && (
            <SetupView
              token={token}
              isValidating={isValidating}
              onTokenChange={actions.setToken}
              onValidate={actions.handleValidateToken}
            />
          )}

          {step === 'connected' && (
            <ConnectedView
              username={username}
              syncStatus={syncStatus}
              isSyncing={isSyncing}
              onPull={actions.handlePull}
              onPush={actions.handlePush}
              onRefreshStatus={actions.handleRefreshStatus}
              onDisconnect={actions.handleDisconnect}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default GitHubSyncPanel;
