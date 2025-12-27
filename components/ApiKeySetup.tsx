import React, { useState } from 'react';
import { ExternalLink, Key, Camera, Loader2, CheckCircle, XCircle, Cpu } from 'lucide-react';
import { validateApiKey, AVAILABLE_MODELS, ModelType, getSelectedModel, setSelectedModel } from '../services/geminiService';

interface ApiKeySetupProps {
  onComplete: (apiKey: string) => void;
  onCancel?: () => void;
}

const ApiKeySetup: React.FC<ApiKeySetupProps> = ({ onComplete, onCancel }) => {
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModelState] = useState<ModelType>(getSelectedModel());
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; error?: string } | null>(null);

  const handleSubmit = async () => {
    if (!apiKey.trim() || !apiKey.startsWith('AIza')) return;

    setIsValidating(true);
    setValidationResult(null);

    const result = await validateApiKey(apiKey.trim());
    setValidationResult(result);
    setIsValidating(false);

    if (result.valid) {
      setSelectedModel(selectedModel);
      onComplete(apiKey.trim());
    }
  };

  const handleModelChange = (model: ModelType) => {
    setSelectedModelState(model);
  };

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
            利用にはGoogle AIのキーが必要です（無料）。
          </p>
        </div>

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
              type="text"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setValidationResult(null);
              }}
              placeholder="AIza..."
              className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm font-mono"
            />
          </div>
          {validationResult && !validationResult.valid && (
            <div className="mt-2 flex items-center gap-2 text-red-400 text-xs">
              <XCircle size={14} />
              <span>{validationResult.error}</span>
            </div>
          )}
          {validationResult?.valid && (
            <div className="mt-2 flex items-center gap-2 text-green-400 text-xs">
              <CheckCircle size={14} />
              <span>キーが有効です</span>
            </div>
          )}
        </div>

        {/* ステップ3: モデル選択 */}
        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 bg-blue-500 text-white text-xs font-bold rounded-full flex items-center justify-center">3</span>
            <span className="text-sm font-bold text-white">使用するモデルを選択</span>
          </div>
          <div className="space-y-2">
            {AVAILABLE_MODELS.map((model) => (
              <button
                key={model.id}
                onClick={() => handleModelChange(model.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  selectedModel === model.id
                    ? 'bg-blue-500/20 border-blue-500 text-white'
                    : 'bg-slate-900/50 border-slate-600 text-slate-300 hover:border-slate-500'
                }`}
              >
                <Cpu size={18} className={selectedModel === model.id ? 'text-blue-400' : 'text-slate-500'} />
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium">{model.name}</div>
                  <div className="text-xs text-slate-400">{model.description}</div>
                </div>
                {selectedModel === model.id && (
                  <CheckCircle size={18} className="text-blue-400" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ボタン */}
        <div className="flex gap-3">
          {onCancel && (
            <button
              onClick={onCancel}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold py-3 rounded-xl transition-all"
            >
              キャンセル
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={!apiKey.trim() || !apiKey.startsWith('AIza') || isValidating}
            className={`${onCancel ? 'flex-1' : 'w-full'} bg-blue-500 hover:bg-blue-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2`}
          >
            {isValidating ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                検証中...
              </>
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
