import React from 'react';
import { Github, ExternalLink, Key, RefreshCw } from 'lucide-react';

interface SetupViewProps {
  token: string;
  isValidating: boolean;
  onTokenChange: (value: string) => void;
  onValidate: () => void;
}

export const SetupView: React.FC<SetupViewProps> = ({
  token, isValidating, onTokenChange, onValidate
}) => (
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
          onChange={(e) => onTokenChange(e.target.value)}
          placeholder="ghp_xxxx または github_pat_xxxx"
          className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm font-mono"
        />
      </div>
    </div>

    <button
      onClick={onValidate}
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
);
