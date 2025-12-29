import React from 'react';
import { Coins, X, AlertCircle, Database, ArrowUpDown, Play, MousePointer } from 'lucide-react';
import { SortPolicy, SORT_POLICIES } from '../types';
import { formatCostJPY } from '../services/usageTracker';
import { AVAILABLE_MODELS, ModelType } from '../services/geminiService';
import AnalysisRulesPanel from './AnalysisRulesPanel';
import { RuleSettings } from '../utils/analysisRules';

interface CostEstimate {
  min: number;
  typical: number;
  max: number;
}

interface CostEstimationPanelProps {
  pendingFiles: File[];
  costEstimate: CostEstimate;
  selectedModel: ModelType;
  sortPolicy: SortPolicy;
  useCache: boolean;
  ruleSettings: RuleSettings;
  onModelChange: (model: ModelType) => void;
  onSortPolicyChange: (policy: SortPolicy) => void;
  onUseCacheChange: (useCache: boolean) => void;
  onRuleSettingsChange: (settings: RuleSettings) => void;
  onCancel: () => void;
  onTestOne: () => void;
  onStartAll: () => void;
  onManualPairing?: () => void;
}

const CostEstimationPanel: React.FC<CostEstimationPanelProps> = ({
  pendingFiles,
  costEstimate,
  selectedModel,
  sortPolicy,
  useCache,
  ruleSettings,
  onModelChange,
  onSortPolicyChange,
  onUseCacheChange,
  onRuleSettingsChange,
  onCancel,
  onTestOne,
  onStartAll,
  onManualPairing,
}) => {
  return (
    <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5" />
            <h3 className="font-bold text-lg">コスト見積もり</h3>
          </div>
          <button onClick={onCancel} className="p-1 hover:bg-white/20 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* File Info */}
          <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
            <span className="text-gray-600">選択された画像</span>
            <span className="font-bold text-gray-800">{pendingFiles.length}枚</span>
          </div>

          {/* Cost Estimate */}
          <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
            <div className="flex items-start gap-2 mb-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <span className="font-bold">推定APIコスト</span>
                <p className="text-xs mt-1 text-yellow-700">実際のコストは写真の内容により変動します</p>
              </div>
            </div>
            <div className="space-y-2">
              {[
                { label: '最小', value: costEstimate.min, bold: false },
                { label: '典型的', value: costEstimate.typical, bold: true },
                { label: '最大', value: costEstimate.max, bold: false },
              ].map(({ label, value, bold }) => (
                <div key={label} className={`flex justify-between text-sm ${bold ? 'font-bold' : ''}`}>
                  <span className={bold ? 'text-gray-700' : 'text-gray-600'}>{label}</span>
                  <span className={`font-mono ${bold ? 'text-blue-600' : 'text-gray-800'}`}>
                    ${value.toFixed(4)} ({formatCostJPY(value)})
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Settings Section */}
          <div className="space-y-3 border-t border-gray-200 pt-4">
            {/* Model Selection */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">使用モデル</label>
              <div className="grid grid-cols-3 gap-2">
                {AVAILABLE_MODELS.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => onModelChange(model.id)}
                    className={`p-2 rounded-lg border text-xs transition-all ${
                      selectedModel === model.id
                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium truncate">{model.name.replace('Gemini ', '')}</div>
                    <div className="text-[10px] text-gray-400 truncate">{model.description.split('（')[0]}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Sort Policy Selection */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3" />
                並び替え
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SORT_POLICIES.map((policy) => (
                  <button
                    key={policy.id}
                    onClick={() => onSortPolicyChange(policy.id)}
                    className={`p-2 rounded-lg border text-xs text-left transition-all ${
                      sortPolicy === policy.id
                        ? 'bg-purple-50 border-purple-500 text-purple-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium">{policy.name}</div>
                    <div className="text-[10px] text-gray-400">{policy.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Cache Toggle */}
            <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-700">キャッシュを使用</span>
              </div>
              <button
                onClick={() => onUseCacheChange(!useCache)}
                className={`relative w-11 h-6 rounded-full transition-colors ${useCache ? 'bg-blue-500' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${useCache ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
            {useCache && <p className="text-[10px] text-green-600 pl-1">解析済みの写真はスキップしてAPI消費を抑えます</p>}

            {/* Analysis Rules Panel */}
            <AnalysisRulesPanel settings={ruleSettings} onChange={onRuleSettingsChange} collapsed={true} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 p-4 bg-gray-50 border-t border-gray-100">
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100 transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={onTestOne}
              className="flex-1 px-4 py-2.5 border-2 border-green-500 text-green-700 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-green-50 transition-colors"
              title="1枚だけテスト解析して結果を確認"
            >
              🧪 テスト(1枚)
            </button>
            <button
              onClick={onStartAll}
              className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
            >
              <Play className="w-4 h-4" />
              全解析
            </button>
          </div>
          {onManualPairing && (
            <button
              onClick={onManualPairing}
              className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
            >
              <MousePointer className="w-4 h-4" />
              手動ペアリング（AI解析スキップ）
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CostEstimationPanel;
