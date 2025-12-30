import React from 'react';
import { Shield, Fingerprint, Loader2, XCircle } from 'lucide-react';

interface OptionsSectionProps {
  trustSession: boolean;
  onTrustSessionChange: (value: boolean) => void;
  biometricSupported: boolean;
  hasPasskey: boolean;
  isAuthenticating: boolean;
  registerBiometric: boolean;
  biometricError: string | null;
  onRegisterBiometricChange: (value: boolean) => void;
  onBiometricLogin: () => void;
  onRemovePasskey: () => void;
}

export const OptionsSection: React.FC<OptionsSectionProps> = ({
  trustSession, onTrustSessionChange, biometricSupported, hasPasskey,
  isAuthenticating, registerBiometric, biometricError,
  onRegisterBiometricChange, onBiometricLogin, onRemovePasskey
}) => (
  <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700 space-y-3">
    <div className="text-xs font-medium text-slate-400 mb-2">オプション</div>

    {/* 信頼セッション */}
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={trustSession}
        onChange={(e) => onTrustSessionChange(e.target.checked)}
        className="mt-1 w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
      />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-green-400" />
          <span className="text-sm font-medium text-white">このセッションを信頼する</span>
          <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">推奨</span>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          ブラウザを閉じるまで、自動的なAPI呼び出しを許可します
        </p>
      </div>
    </label>

    {/* 生体認証 - 登録済みの場合はログインボタン */}
    {biometricSupported && hasPasskey && (
      <>
        <div className="h-px bg-slate-700"></div>
        <div className="space-y-2">
          <button
            onClick={onBiometricLogin}
            disabled={isAuthenticating}
            className="w-full bg-purple-500 hover:bg-purple-400 disabled:bg-purple-600 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {isAuthenticating ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                認証中...
              </>
            ) : (
              <>
                <Fingerprint size={20} />
                指紋/顔認証でログイン
              </>
            )}
          </button>
          {biometricError && (
            <div className="flex items-center gap-2 text-red-400 text-xs justify-center">
              <XCircle size={14} />
              <span>{biometricError}</span>
            </div>
          )}
          <button
            onClick={onRemovePasskey}
            className="w-full text-xs text-slate-500 hover:text-slate-400"
          >
            登録を解除する
          </button>
        </div>
      </>
    )}

    {/* 生体認証 - 未登録の場合は登録オプション */}
    {biometricSupported && !hasPasskey && (
      <>
        <div className="h-px bg-slate-700"></div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={registerBiometric}
            onChange={(e) => onRegisterBiometricChange(e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-slate-600 bg-slate-900 text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Fingerprint size={16} className="text-purple-400" />
              <span className="text-sm font-medium text-white">指紋/顔認証を登録</span>
              <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">便利</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              次回から指紋や顔認証だけでログインできます
            </p>
          </div>
        </label>
      </>
    )}
  </div>
);
