import React from 'react';
import { GitBranch, ArrowRight, FileText, Eye, Layers, Cpu, CheckCircle, RefreshCw, Zap } from 'lucide-react';
import { useAIFrameworkState } from '../../../hooks/useAIFrameworkState';
import { FlowStep } from '../types';

const FlowStepItem: React.FC<{
  step: FlowStep;
  index: number;
  isLast: boolean;
  onToggle: () => void;
}> = ({ step, index, isLast, onToggle }) => (
  <div className="flex items-start gap-3 mb-4">
    <div className="flex flex-col items-center">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
        !step.enabled ? 'bg-gray-200 text-gray-400' : step.optional ? 'bg-yellow-500 text-white' : 'bg-blue-600 text-white'
      }`}>{index + 1}</div>
      {!isLast && <div className={`w-0.5 h-8 ${step.enabled ? 'bg-blue-200' : 'bg-gray-200'}`} />}
    </div>
    <div className={`flex-1 p-3 rounded border ${
      !step.enabled ? 'border-gray-200 bg-gray-50 opacity-50' : step.optional ? 'border-yellow-200 bg-yellow-50' : 'border-gray-200 bg-white'
    }`}>
      <div className="flex items-center gap-2">
        <span className="text-gray-500">{step.icon}</span>
        <span className="font-medium">{step.name}</span>
        {step.optional && (
          <label className="flex items-center gap-1 ml-auto cursor-pointer">
            <input type="checkbox" checked={step.enabled} onChange={onToggle} className="rounded" />
            <span className="text-xs text-gray-500">有効</span>
          </label>
        )}
      </div>
      <div className="text-sm text-gray-600 mt-1">{step.description}</div>
    </div>
  </div>
);

const FlowSummary: React.FC<{ flowSettings: any }> = ({ flowSettings }) => (
  <div className="border rounded p-4 bg-gray-50">
    <div className="text-sm font-medium mb-3">処理フロー概要</div>
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="px-2 py-1 bg-blue-100 rounded">📷 写真</span>
      <ArrowRight size={14} className="text-gray-400" />
      <span className={`px-2 py-1 rounded ${flowSettings.detect ? 'bg-yellow-100' : 'bg-gray-200 line-through'}`}>🔍 黒板判定</span>
      <ArrowRight size={14} className="text-gray-400" />
      <span className="px-2 py-1 bg-green-100 rounded">🤖 Gemini API</span>
      <ArrowRight size={14} className="text-gray-400" />
      <span className="px-2 py-1 bg-purple-100 rounded">✅ 検証</span>
      <ArrowRight size={14} className="text-gray-400" />
      <span className="px-2 py-1 bg-orange-100 rounded">📋 結果</span>
    </div>
  </div>
);

interface FlowTabProps {
  state: ReturnType<typeof useAIFrameworkState>;
}

export const FlowTab: React.FC<FlowTabProps> = ({ state }) => {
  const flowSteps: FlowStep[] = [
    { id: 'upload', name: '写真アップロード', description: 'Base64エンコード', icon: <FileText size={16} />, enabled: true },
    { id: 'detect', name: '黒板判定', description: 'スマートフローで3枚サンプル', icon: <Eye size={16} />, optional: true, enabled: state.flowSettings.detect },
    { id: 'worktype', name: '工種選択', description: '階層サブセット作成', icon: <Layers size={16} />, optional: true, enabled: state.flowSettings.worktype },
    { id: 'batch', name: 'バッチ解析', description: 'Gemini APIでストリーミング解析', icon: <Cpu size={16} />, enabled: true },
    { id: 'context', name: 'コンテキスト継承', description: '前の写真から情報を継承', icon: <GitBranch size={16} />, enabled: true },
    { id: 'validate', name: 'バリデーション', description: 'マスタ照合・警告生成', icon: <CheckCircle size={16} />, enabled: true },
    { id: 'normalize', name: '正規化提案', description: 'テキスト正規化の提案', icon: <RefreshCw size={16} />, optional: true, enabled: state.flowSettings.normalize },
    { id: 'scene', name: 'シーンID割当', description: 'ペアリング・グループ化', icon: <Zap size={16} />, optional: true, enabled: state.flowSettings.scene },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-purple-50 border border-purple-200 rounded p-3 text-sm">
        <div className="flex items-center gap-2 font-medium text-purple-800"><GitBranch size={16} />AI処理パイプライン（編集可能）</div>
        <div className="text-purple-600 mt-1">オプションステップの有効/無効を切り替えできます</div>
      </div>
      <div className="relative">
        {flowSteps.map((step, index) => (
          <FlowStepItem
            key={step.id}
            step={step}
            index={index}
            isLast={index === flowSteps.length - 1}
            onToggle={() => state.handleFlowToggle(step.id)}
          />
        ))}
      </div>
      <FlowSummary flowSettings={state.flowSettings} />
    </div>
  );
};
