import React, { useState, useEffect } from 'react';
import { ArrowLeft, Cpu, Loader2, CheckCircle, XCircle, AlertTriangle, Ban, Search, Shield, Fingerprint } from 'lucide-react';
import { validateAllModels, AVAILABLE_MODELS, ModelType, ModelStatus, ModelAvailability, getSelectedModel, setSelectedModel, getBestAvailableModel, setTrustedSession } from '../services/geminiService';
import { isBiometricAvailable, hasRegisteredPasskey, registerPasskey, authenticateWithPasskey, removePasskey } from '../services/webAuthnService';

interface ModelValidationProps {
  apiKey: string;
  onComplete: (apiKey: string) => void;
  onBack: () => void;
}

const ModelValidation: React.FC<ModelValidationProps> = ({ apiKey, onComplete, onBack }) => {
  const [selectedModel, setSelectedModelState] = useState<ModelType>(getSelectedModel());
  const [isValidating, setIsValidating] = useState(false);
  const [modelAvailabilities, setModelAvailabilities] = useState<ModelAvailability[]>([]);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [trustSession, setTrustSession] = useState(true);

  // 生体認証関連
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [registerBiometric, setRegisterBiometric] = useState(true);
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

  const validateModels = async () => {
    setIsValidating(true);
    setKeyError(null);
    setModelAvailabilities(AVAILABLE_MODELS.map(m => ({ ...m, status: 'checking' as ModelStatus })));

    const results = await validateAllModels(apiKey, (modelId, status, error) => {
      setModelAvailabilities(prev =>
        prev.map(m => m.id === modelId ? { ...m, status, error } : m)
      );
    });

    setModelAvailabilities(results);
    setIsValidating(false);

    const allInvalid = results.every(r => r.error?.includes('無効'));
    if (allInvalid) {
      setKeyError('APIキーが無効です');
    }

    const bestModel = getBestAvailableModel(results);
    if (bestModel) {
      setSelectedModelState(bestModel);
    }
  };

  // 生体認証でログイン
  const handleBiometricLogin = async () => {
    setIsAuthenticating(true);
    setBiometricError(null);

    const result = await authenticateWithPasskey();

    if (result.success && result.apiKey) {
      setTrustedSession(true);
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

  const handleSubmit = async () => {
    const selectedAvailability = modelAvailabilities.find(m => m.id === selectedModel);

    if (!selectedAvailability || selectedAvailability.status !== 'available') {
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
      const result = await registerPasskey(apiKey);
      if (result.success) {
        setHasPasskey(true);
      } else {
        console.warn('Passkey registration failed:', result.error);
      }
    }

    setTrustedSession(trustSession);
    onComplete(apiKey);
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

  return (
    <div className="fixed inset-0 bg-slate-900 z-[130] flex flex-col">
      {/* ヘッダー - 戻るボタン左上 */}
      <div className="flex items-center p-4 border-b border-slate-800">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
          <span className="text-sm">戻る</span>
        </button>
        <h1 className="flex-1 text-center text-white font-bold pr-12">モデル設定</h1>
      </div>

      {/* メインコンテンツ - スクロール可能 */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto space-y-4">

          {/* モデル検証セクション */}
          <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
            <div className="flex items-center gap-2 mb-3">
              <Cpu size={20} className="text-blue-400" />
              <span className="text-sm font-bold text-white">使用するモデルを選択</span>
            </div>

            {/* 検証ボタン */}
            <button
              onClick={validateModels}
              disabled={isValidating}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-medium py-3 rounded-xl transition-all text-sm mb-4"
            >
              {isValidating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  検証中...
                </>
              ) : (
                <>
                  <Search size={16} />
                  モデルの利用可否を確認
                </>
              )}
            </button>

            {keyError && (
              <div className="mb-3 flex items-center gap-2 text-red-400 text-xs">
                <XCircle size={14} />
                <span>{keyError}</span>
              </div>
            )}

            {/* モデル一覧 */}
            {modelAvailabilities.length === 0 ? (
              <div className="text-center text-slate-400 text-sm py-4">
                上のボタンを押してモデルの利用可否を確認してください
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

          {/* オプションセクション - 下部にまとめ */}
          {hasAnyAvailable && (
            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700 space-y-3">
              <div className="text-xs font-medium text-slate-400 mb-2">オプション</div>

              {/* 信頼セッション */}
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
                      <div className="flex items-center gap-2 text-red-400 text-xs justify-center">
                        <XCircle size={14} />
                        <span>{biometricError}</span>
                      </div>
                    )}
                    <button
                      onClick={handleRemovePasskey}
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
                        次回から指紋や顔認証だけでログインできます
                      </p>
                    </div>
                  </label>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* フッター - 開始ボタン固定 */}
      <div className="p-4 border-t border-slate-800 bg-slate-900">
        <div className="max-w-md mx-auto">
          <button
            onClick={handleSubmit}
            disabled={isValidating || !hasAnyAvailable}
            className="w-full bg-blue-500 hover:bg-blue-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
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
              'モデルを検証してください'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModelValidation;
