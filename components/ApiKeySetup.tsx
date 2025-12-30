import React from 'react';
import { ExternalLink, Key, Camera, ArrowLeft, Lock, Shield, Loader2 } from 'lucide-react';
import { useApiKeySetupState } from '../hooks/useApiKeySetupState';

interface ApiKeySetupProps {
  onComplete: (apiKey: string) => void;
  onUnlock?: (apiKey: string) => void;  // ロック解除時のコールバック（モデル検証スキップ用）
  onCancel?: () => void;
  onImportPdf?: () => void;
}

const ApiKeySetup: React.FC<ApiKeySetupProps> = ({ onComplete, onUnlock, onCancel, onImportPdf }) => {
  const {
    mode,
    apiKey,
    masterPassword,
    confirmPassword,
    error,
    loading,
    isValidKey,
    isValidPassword,
    passwordsMatch,
    setApiKey,
    setMasterPassword,
    setConfirmPassword,
    handleUnlock,
    handleSubmit,
    handleResetKey,
  } = useApiKeySetupState();

  // ロック解除時のコールバック（onUnlockがあればそちらを使う）
  const handleUnlockComplete = onUnlock || onComplete;

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

          {/* アンロックモード */}
          {mode === 'unlock' && (
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
                      onChange={(e) => setMasterPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleUnlock(handleUnlockComplete)}
                      placeholder="マスターパスワード"
                      className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                      autoFocus
                    />
                  </div>
                  {error && (
                    <p className="text-red-400 text-xs text-center">{error}</p>
                  )}
                  <button
                    onClick={() => handleUnlock(handleUnlockComplete)}
                    disabled={loading || !masterPassword}
                    className="w-full bg-blue-500 hover:bg-blue-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                    アンロック
                  </button>
                </div>
              </div>
              <button
                onClick={handleResetKey}
                className="w-full text-slate-500 hover:text-slate-300 text-xs py-2 transition-colors"
              >
                キーを再設定する
              </button>
            </div>
          )}

          {/* 新規設定モード */}
          {mode === 'new' && (
            <>
              {/* PDF読み込みオプション */}
              {onImportPdf && (
                <>
                  <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-2xl p-4">
                    <p className="text-sm text-amber-200 mb-3 text-center">
                      共有されたPDFをお持ちですか？
                    </p>
                    <button
                      onClick={onImportPdf}
                      className="w-full bg-amber-500 hover:bg-amber-400 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      PDFからセッションを復元
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-slate-700"></div>
                    <span className="text-xs text-slate-500">または新規で始める</span>
                    <div className="flex-1 h-px bg-slate-700"></div>
                  </div>
                </>
              )}

              {/* ステップ1: キーを取得 */}
              <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 bg-blue-500 text-white text-xs font-bold rounded-full flex items-center justify-center">1</span>
                  <span className="text-sm font-bold text-white">キーを取得する</span>
                </div>
                <div className="text-xs text-slate-400 mb-3 space-y-1.5">
                  <p>下のボタンからGoogle AI Studioを開きます。</p>
                  <div className="bg-slate-900/50 rounded-lg p-2 space-y-1">
                    <p className="text-slate-300">① Googleアカウントでログイン</p>
                    <p className="text-slate-300">②「<span className="text-blue-400 font-bold">APIキーを作成</span>」をクリック</p>
                    <p className="text-slate-300">③ 表示されたキーをコピー</p>
                  </div>
                </div>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all"
                >
                  Google AI Studioを開く <ExternalLink size={16} />
                </a>
              </div>

              {/* ステップ2: キーを貼り付け */}
              <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 bg-blue-500 text-white text-xs font-bold rounded-full flex items-center justify-center">2</span>
                  <span className="text-sm font-bold text-white">コピーしたキーを貼り付け</span>
                </div>
                <p className="text-[10px] text-slate-500 mb-2">
                  キーは <span className="text-yellow-400 font-mono">AIza...</span> で始まる39文字の文字列です
                </p>
                <div className="flex items-center gap-2">
                  <Key size={18} className="text-slate-500 shrink-0" />
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="AIza..."
                    className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm font-mono"
                  />
                </div>
              </div>

              {/* ステップ3: マスターパスワード */}
              <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 bg-green-500 text-white text-xs font-bold rounded-full flex items-center justify-center">3</span>
                  <span className="text-sm font-bold text-white">マスターパスワードを設定</span>
                </div>
                <p className="text-[10px] text-slate-500 mb-2">
                  APIキーを暗号化して安全に保存します
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Lock size={18} className="text-slate-500 shrink-0" />
                    <input
                      type="password"
                      value={masterPassword}
                      onChange={(e) => setMasterPassword(e.target.value)}
                      placeholder="パスワード（4文字以上）"
                      className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Lock size={18} className="text-slate-500 shrink-0" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="パスワード（確認）"
                      className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                    />
                  </div>
                </div>
              </div>

              {error && (
                <p className="text-red-400 text-xs text-center">{error}</p>
              )}

              {/* 注意事項 */}
              <p className="text-[10px] text-slate-500 text-center">
                キーは暗号化されてこのブラウザに保存されます
              </p>
            </>
          )}
        </div>
      </div>

      {/* フッター */}
      {mode === 'new' && (
        <div className="p-4 border-t border-slate-800 bg-slate-900">
          <div className="max-w-md mx-auto">
            <button
              onClick={() => handleSubmit(onComplete)}
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
