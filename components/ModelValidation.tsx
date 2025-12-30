import React from 'react';
import { ArrowLeft, Cpu, Loader2, Search, XCircle, AlertTriangle } from 'lucide-react';
import { useModelValidation } from '../hooks/useModelValidation';
import { useBiometricAuth } from '../hooks/useBiometricAuth';
import { ModelList, OptionsSection } from './ModelValidation/index';

interface ModelValidationProps {
  apiKey: string;
  onComplete: (apiKey: string) => void;
  onBack: () => void;
}

const ModelValidation: React.FC<ModelValidationProps> = ({ apiKey, onComplete, onBack }) => {
  const { state: modelState, actions: modelActions } = useModelValidation(apiKey);
  const { state: bioState, actions: bioActions } = useBiometricAuth();

  const { selectedModel, isValidating, modelAvailabilities, keyError, trustSession, hasAnyAvailable } = modelState;
  const { biometricSupported, hasPasskey, isAuthenticating, registerBiometric, biometricError } = bioState;

  const handleSubmit = () => {
    modelActions.handleSubmit(
      registerBiometric,
      hasPasskey,
      bioActions.handleRegisterPasskey,
      onComplete
    );
  };

  return (
    <div className="fixed inset-0 bg-slate-900 z-[130] flex flex-col">
      {/* ヘッダー */}
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

      {/* メインコンテンツ */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto space-y-4">
          {/* モデル検証セクション */}
          <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
            <div className="flex items-center gap-2 mb-3">
              <Cpu size={20} className="text-blue-400" />
              <span className="text-sm font-bold text-white">使用するモデルを選択</span>
            </div>

            <button
              onClick={modelActions.validateModels}
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

            <ModelList
              modelAvailabilities={modelAvailabilities}
              selectedModel={selectedModel}
              onModelChange={modelActions.handleModelChange}
            />

            {modelAvailabilities.length > 0 && !hasAnyAvailable && !isValidating && (
              <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <div className="flex items-center gap-2 text-yellow-400 text-xs">
                  <AlertTriangle size={14} />
                  <span>全モデルが制限に達しています。時間をおいて再試行するか、有料プランをご検討ください。</span>
                </div>
              </div>
            )}
          </div>

          {/* オプションセクション */}
          {hasAnyAvailable && (
            <OptionsSection
              trustSession={trustSession}
              onTrustSessionChange={modelActions.setTrustSession}
              biometricSupported={biometricSupported}
              hasPasskey={hasPasskey}
              isAuthenticating={isAuthenticating}
              registerBiometric={registerBiometric}
              biometricError={biometricError}
              onRegisterBiometricChange={bioActions.setRegisterBiometric}
              onBiometricLogin={() => bioActions.handleBiometricLogin(onComplete)}
              onRemovePasskey={bioActions.handleRemovePasskey}
            />
          )}
        </div>
      </div>

      {/* フッター */}
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
