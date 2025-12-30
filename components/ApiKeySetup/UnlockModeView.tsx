import React from 'react';
import { Lock, Shield, Loader2 } from 'lucide-react';

interface UnlockModeViewProps {
  masterPassword: string;
  error: string;
  loading: boolean;
  onPasswordChange: (value: string) => void;
  onUnlock: () => void;
  onResetKey: () => void;
}

export const UnlockModeView: React.FC<UnlockModeViewProps> = ({
  masterPassword, error, loading, onPasswordChange, onUnlock, onResetKey
}) => (
  <div className="space-y-4">
    <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
      <div className="flex items-center justify-center mb-4">
        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
          <Shield size={32} className="text-green-500" />
        </div>
      </div>
      <p className="text-center text-sm text-slate-300 mb-4">
        暗号化されたAPIキーが保存されています
      </p>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Lock size={18} className="text-slate-500 shrink-0" />
          <input
            type="password"
            value={masterPassword}
            onChange={(e) => onPasswordChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onUnlock()}
            placeholder="マスターパスワード"
            className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
            autoFocus
          />
        </div>
        {error && <p className="text-red-400 text-xs text-center">{error}</p>}
        <button
          onClick={onUnlock}
          disabled={loading || !masterPassword}
          className="w-full bg-blue-500 hover:bg-blue-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : null}
          アンロック
        </button>
      </div>
    </div>
    <button
      onClick={onResetKey}
      className="w-full text-slate-500 hover:text-slate-300 text-xs py-2 transition-colors"
    >
      キーを再設定する
    </button>
  </div>
);
