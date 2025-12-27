import React, { useState, useEffect } from 'react';
import { ExternalLink, Key, Camera, Loader2, CheckCircle, XCircle, Cpu, AlertTriangle, Ban, Search, Shield, Fingerprint, Smartphone } from 'lucide-react';
import { validateAllModels, AVAILABLE_MODELS, ModelType, ModelStatus, ModelAvailability, getSelectedModel, setSelectedModel, getBestAvailableModel, setTrustedSession } from '../services/geminiService';
import { isBiometricAvailable, hasRegisteredPasskey, registerPasskey, authenticateWithPasskey, removePasskey } from '../services/webAuthnService';

interface ApiKeySetupProps {
  onComplete: (apiKey: string) => void;
  onCancel?: () => void;
  onImportPdf?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const ApiKeySetup: React.FC<ApiKeySetupProps> = ({ onComplete, onCancel, onImportPdf }) => {
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModelState] = useState<ModelType>(getSelectedModel());
  const pdfInputRef = React.useRef<HTMLInputElement>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [modelAvailabilities, setModelAvailabilities] = useState<ModelAvailability[]>([]);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [trustSession, setTrustSession] = useState(true); // デフォルトON（推奨）

  // 生体認証関連
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [registerBiometric, setRegisterBiometric] = useState(true); // 生体認証を登録するかどうか
  const [biometricError, setBiometricError] = useState<string | null>(null);

  // 生体認証の可否をチェック
  useEffect(() => {
    const checkBiometric = async () => {
      const available = await isBiometricAvailable();
      setBiometricSupported(available);
      if (available) {
        setHasPasskey(hasRegisteredPasskey());
      }
    };
    checkBiometric();
  }, []);

  // 生体認証でログイン
  const handleBiometricLogin = async () => {
    setIsAuthenticating(true);
    setBiometricError(null);

    const result = await authenticateWithPasskey();

    if (result.success && result.apiKey) {
      // 認証成功 - APIキーを取得してセッションを開始
      setTrustedSession(true); // 生体認証成功=信頼セッション
      onComplete(result.apiKey);
    } else {
      setBiometricError(result.error || '認証に失敗しました');
    }

    setIsAuthenticating(false);
  };

  // パスキーを削除
  const handleRemovePasskey = () => {
    if (confirm('登録済みの生体認証を削除しますか？')) {
      removePasskey();
      setHasPasskey(false);
    }
  };

  // NOTE: 自動バリデーションを削除 - 明示的な「検証」ボタンで実行
  // セキュリティ上、暗黙的なAPI呼び出しを防止

  const validateModels = async () => {
    if (!apiKey.trim() || !apiKey.startsWith('AIza')) return;

    setIsValidating(true);
    setKeyError(null);
    setModelAvailabilities(AVAILABLE_MODELS.map(m => ({ ...m, status: 'checking' as ModelStatus })));

    const results = await validateAllModels(apiKey.trim(), (modelId, status, error) => {
      setModelAvailabilities(prev =>
        prev.map(m => m.id === modelId ? { ...m, status, error } : m)
      );
    });

    setModelAvailabilities(results);
    setIsValidating(false);

    // Check if all models failed with invalid key
    const allInvalid = results.every(r => r.error?.includes('無効'));
    if (allInvalid) {
      setKeyError('APIキーが無効です');
    }

    // Auto-select best available model
    const bestModel = getBestAvailableModel(results);
    if (bestModel) {
      setSelectedModelState(bestModel);
    }
  };

  const handleSubmit = async () => {
    const selectedAvailability = modelAvailabilities.find(m => m.id === selectedModel);
    const finalApiKey = apiKey.trim();

    if (!selectedAvailability || selectedAvailability.status !== 'available') {
      // Try to find any available model
      const bestModel = getBestAvailableModel(modelAvailabilities);
      if (bestModel) {
        setSelectedModel(bestModel);
      } else {
        return;
      }
    } else {
      setSelectedModel(selectedModel);
    }

    // 生体認証を登録する場合
    if (biometricSupported && registerBiometric && !hasPasskey) {
      const result = await registerPasskey(finalApiKey);
      if (result.success) {
        setHasPasskey(true);
      } else {
        // 登録に失敗しても続行（オプション機能なので）
        console.warn('Passkey registration failed:', result.error);
      }
    }

    // 信頼セッションを設定
    setTrustedSession(trustSession);
    onComplete(finalApiKey);
  };

  const handleModelChange = (model: ModelType) => {
    const availability = modelAvailabilities.find(m => m.id === model);
    if (availability?.status === 'available') {
      setSelectedModelState(model);
    }
  };

  const getStatusIcon = (status: ModelStatus) => {
    switch (status) {
      case 'available':
        return <CheckCircle size={18} className="text-green-400" />;
      case 'quota_exceeded':
        return <AlertTriangle size={18} className="text-yellow-400" />;
      case 'unavailable':
        return <Ban size={18} className="text-red-400" />;
      case 'checking':
        return <Loader2 size={18} className="animate-spin text-blue-400" />;
      default:
        return <XCircle size={18} className="text-gray-400" />;
    }
  };

  const getStatusText = (status: ModelStatus, error?: string) => {
    switch (status) {
      case 'available':
        return '利用可能';
      case 'quota_exceeded':
        return '制限超過';
      case 'unavailable':
        return error || '利用不可';
      case 'checking':
        return '確認中...';
      default:
        return error || 'エラー';
    }
  };

  const hasAnyAvailable = modelAvailabilities.some(m => m.status === 'available');
  const isSelectedAvailable = modelAvailabilities.find(m => m.id === selectedModel)?.status === 'available';

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[130] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md p-6 space-y-5">
        {/* ヘッダー */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500/20 rounded-full mb-4">
            <Camera size={32} className="text-blue-500" />
          </div>
          <h2 className="text-xl font-black text-white mb-2">工事写真帳メーカー</h2>
          <p className="text-sm text-slate-400">
            AIで工事写真を自動分類・整理します。
          </p>
        </div>

        {/* 生体認証でログイン（パスキー登録済みの場合） */}
        {biometricSupported && hasPasskey && (
          <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-2xl p-4">
            <p className="text-sm text-purple-200 mb-3 text-center">
              登録済みの指紋/顔認証でログイン
            </p>
            <button
              onClick={handleBiometricLogin}
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
              <div className="mt-2 flex items-center gap-2 text-red-400 text-xs justify-center">
                <XCircle size={14} />
                <span>{biometricError}</span>
              </div>
            )}
            <button
              onClick={handleRemovePasskey}
              className="mt-2 w-full text-xs text-slate-500 hover:text-slate-400"
            >
              登録を解除する
            </button>
          </div>
        )}

        {biometricSupported && hasPasskey && (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-700"></div>
            <span className="text-xs text-slate-500">または手動で入力</span>
            <div className="flex-1 h-px bg-slate-700"></div>
          </div>
        )}

        {/* PDF読み込みオプション - 最初の選択肢として */}
        {onImportPdf && (
          <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-2xl p-4">
            <p className="text-sm text-amber-200 mb-3 text-center">
              共有されたPDFをお持ちですか？
            </p>
            <button
              onClick={() => pdfInputRef.current?.click()}
              className="w-full bg-amber-500 hover:bg-amber-400 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              PDFからセッションを復元
            </button>
            <input
              type="file"
              ref={pdfInputRef}
              onChange={onImportPdf}
              className="hidden"
              accept=".pdf"
            />
          </div>
        )}

        {onImportPdf && (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-700"></div>
            <span className="text-xs text-slate-500">または新規で始める</span>
            <div className="flex-1 h-px bg-slate-700"></div>
          </div>
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
              onChange={(e) => {
                setApiKey(e.target.value);
                setKeyError(null);
                setModelAvailabilities([]);
              }}
              placeholder="AIza..."
              className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm font-mono"
            />
          </div>
          {/* 検証ボタン - 明示的にAPIを呼び出す */}
          <button
            onClick={validateModels}
            disabled={!apiKey.trim().startsWith('AIza') || apiKey.trim().length < 39 || isValidating}
            className="mt-3 w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 text-white font-medium py-2 rounded-lg transition-all text-sm"
          >
            {isValidating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                検証中...
              </>
            ) : (
              <>
                <Search size={16} />
                キーを検証（APIを呼び出します）
              </>
            )}
          </button>
          {keyError && (
            <div className="mt-2 flex items-center gap-2 text-red-400 text-xs">
              <XCircle size={14} />
              <span>{keyError}</span>
            </div>
          )}
          {hasAnyAvailable && (
            <div className="mt-2 flex items-center gap-2 text-green-400 text-xs">
              <CheckCircle size={14} />
              <span>キーが有効です - 下のモデル状況を確認してください</span>
            </div>
          )}
        </div>

        {/* ステップ3: モデル選択 */}
        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 bg-blue-500 text-white text-xs font-bold rounded-full flex items-center justify-center">3</span>
            <span className="text-sm font-bold text-white">使用するモデルを選択</span>
          </div>
          {modelAvailabilities.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-4">
              「キーを検証」ボタンを押してモデルの利用可否を確認
            </div>
          ) : (
            <div className="space-y-2">
              {modelAvailabilities.map((model) => {
                const isAvailable = model.status === 'available';
                const isSelected = selectedModel === model.id;
                return (
                  <button
                    key={model.id}
                    onClick={() => handleModelChange(model.id)}
                    disabled={!isAvailable}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      isSelected && isAvailable
                        ? 'bg-blue-500/20 border-blue-500 text-white'
                        : isAvailable
                        ? 'bg-slate-900/50 border-slate-600 text-slate-300 hover:border-slate-500'
                        : 'bg-slate-900/30 border-slate-700 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <Cpu size={18} className={isSelected && isAvailable ? 'text-blue-400' : 'text-slate-500'} />
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium">{model.name}</div>
                      <div className="text-xs text-slate-400">{model.description}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${
                        model.status === 'available' ? 'text-green-400' :
                        model.status === 'quota_exceeded' ? 'text-yellow-400' :
                        model.status === 'checking' ? 'text-blue-400' :
                        'text-red-400'
                      }`}>
                        {getStatusText(model.status, model.error)}
                      </span>
                      {getStatusIcon(model.status)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {modelAvailabilities.length > 0 && !hasAnyAvailable && !isValidating && (
            <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <div className="flex items-center gap-2 text-yellow-400 text-xs">
                <AlertTriangle size={14} />
                <span>全モデルが制限に達しています。時間をおいて再試行するか、有料プランをご検討ください。</span>
              </div>
            </div>
          )}
        </div>

        {/* 信頼セッション設定 */}
        {hasAnyAvailable && (
          <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={trustSession}
                onChange={(e) => setTrustSession(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Shield size={16} className="text-green-400" />
                  <span className="text-sm font-medium text-white">このセッションを信頼する</span>
                  <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">推奨</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  ブラウザを閉じるまで、自動的なAPI呼び出しを許可します。
                  共有PCでは無効にしてください。
                </p>
              </div>
            </label>

            {/* 生体認証の登録オプション */}
            {biometricSupported && !hasPasskey && (
              <>
                <div className="h-px bg-slate-700"></div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={registerBiometric}
                    onChange={(e) => setRegisterBiometric(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-slate-600 bg-slate-900 text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Fingerprint size={16} className="text-purple-400" />
                      <span className="text-sm font-medium text-white">指紋/顔認証を登録</span>
                      <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">便利</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      次回から指紋や顔認証だけでログインできます。
                      APIキーはこのデバイスに安全に保存されます。
                    </p>
                  </div>
                </label>
              </>
            )}
          </div>
        )}

        {/* ボタン */}
        <div className="flex gap-3">
          {onCancel && (
            <button
              onClick={onCancel}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold py-3 rounded-xl transition-all"
            >
              戻る
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={!apiKey.trim() || !apiKey.startsWith('AIza') || isValidating || !hasAnyAvailable}
            className={`${onCancel ? 'flex-1' : 'w-full'} bg-blue-500 hover:bg-blue-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2`}
          >
            {isValidating ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                モデル確認中...
              </>
            ) : hasAnyAvailable ? (
              `${modelAvailabilities.find(m => m.id === selectedModel)?.name || 'モデル'}で開始`
            ) : modelAvailabilities.length > 0 ? (
              '利用可能なモデルがありません'
            ) : (
              '設定完了'
            )}
          </button>
        </div>

        {/* 注意事項 */}
        <p className="text-[10px] text-slate-500 text-center">
          キーはこのブラウザに保存され、外部には送信されません。
        </p>
      </div>
    </div>
  );
};

export default ApiKeySetup;
