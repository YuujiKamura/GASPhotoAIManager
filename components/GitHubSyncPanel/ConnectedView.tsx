import React from 'react';
import { Check, Download, Upload, RefreshCw } from 'lucide-react';
import { SyncStatus } from '../../services/githubSync';

interface ConnectedViewProps {
  username: string | null;
  syncStatus: SyncStatus | null;
  isSyncing: boolean;
  onPull: () => void;
  onPush: () => void;
  onRefreshStatus: () => void;
  onDisconnect: () => void;
}

export const ConnectedView: React.FC<ConnectedViewProps> = ({
  username, syncStatus, isSyncing, onPull, onPush, onRefreshStatus, onDisconnect
}) => (
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

    {syncStatus && (
      <div className="bg-slate-700/50 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">同期ステータス</span>
          <button
            onClick={onRefreshStatus}
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

    <div className="grid grid-cols-2 gap-3">
      <button
        onClick={onPull}
        disabled={isSyncing}
        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white py-3 rounded-xl transition-colors"
      >
        <Download size={18} />
        プル
      </button>
      <button
        onClick={onPush}
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

    <button
      onClick={onDisconnect}
      className="w-full text-slate-400 hover:text-red-400 text-sm py-2 transition-colors"
    >
      接続を解除
    </button>
  </>
);
