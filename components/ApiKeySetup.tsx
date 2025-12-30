import React from 'react';
import { ArrowLeft, Camera, Loader2 } from 'lucide-react';
import { useApiKeySetup } from '../hooks/useApiKeySetup';
import { UnlockModeView, NewModeView } from './ApiKeySetup/index';

interface ApiKeySetupProps {
  onComplete: (apiKey: string) => void;
  onCancel?: () => void;
  onImportPdf?: () => void;
}

const ApiKeySetup: React.FC<ApiKeySetupProps> = ({ onComplete, onCancel, onImportPdf }) => {
  const { state, validation, actions } = useApiKeySetup(onComplete);
  const { mode, apiKey, masterPassword, confirmPassword, error, loading } = state;
  const { isValidKey, isValidPassword, passwordsMatch } = validation;

  if (mode === 'check') {
    return (
      <div className="fixed inset-0 bg-slate-900 z-[130] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900 z-[130] flex flex-col">
      {/* ヘッダー */}
      <div className="flex items-center p-4 border-b border-slate-800">
        {onCancel && (
          <button
            onClick={onCancel}
            className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
            <span className="text-sm">戻る</span>
          </button>
        )}
      </div>

      {/* メインコンテンツ */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto space-y-6">
          {/* ロゴ・タイトル */}
          <div className="text-center pt-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500/20 rounded-full mb-4">
              <Camera size={32} className="text-blue-500" />
            </div>
            <h2 className="text-xl font-black text-white mb-2">工事写真帳メーカー</h2>
            <p className="text-sm text-slate-400">
              {mode === 'unlock' ? 'パスワードでアンロック' : 'AIで工事写真を自動分類・整理します'}
            </p>
          </div>

          {mode === 'unlock' && (
            <UnlockModeView
              masterPassword={masterPassword}
              error={error}
              loading={loading}
              onPasswordChange={actions.setMasterPassword}
              onUnlock={actions.handleUnlock}
              onResetKey={actions.handleResetKey}
            />
          )}

          {mode === 'new' && (
            <NewModeView
              apiKey={apiKey}
              masterPassword={masterPassword}
              confirmPassword={confirmPassword}
              error={error}
              onApiKeyChange={actions.setApiKey}
              onPasswordChange={actions.setMasterPassword}
              onConfirmPasswordChange={actions.setConfirmPassword}
              onImportPdf={onImportPdf}
            />
          )}
        </div>
      </div>

      {/* フッター */}
      {mode === 'new' && (
        <div className="p-4 border-t border-slate-800 bg-slate-900">
          <div className="max-w-md mx-auto">
            <button
              onClick={actions.handleSubmit}
              disabled={!isValidKey || !isValidPassword || !passwordsMatch || loading}
              className="w-full bg-blue-500 hover:bg-blue-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : null}
              暗号化して保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApiKeySetup;
