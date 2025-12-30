import React from 'react';
import { ChevronDown, ChevronRight, Eye } from 'lucide-react';
import { useAIFrameworkState, PromptLayerType } from '../../../hooks/useAIFrameworkState';
import { ANALYSIS_RULES } from '../../../utils/analysisRules';
import { SystemLayer, HierarchyLayer, RulesLayer, ExamplesLayer, LearnedLayer, CustomLayer } from '../layers';
import { PromptLayer } from '../types';
import { AppMode } from '../../../types';

const PROMPT_LAYERS: PromptLayer[] = [
  { id: 'system', name: 'システムプロンプト', icon: '📄', description: '基本的なAI指示をカスタマイズ' },
  { id: 'hierarchy', name: '階層マスタ', icon: '📊', description: '工種→種別→細別→備考の構造をJSON編集' },
  { id: 'rules', name: '分析ルール', icon: '⚙️', description: '有効/無効を切り替え、新規追加も可能' },
  { id: 'examples', name: 'お手本（Few-shot）', icon: '📚', description: '正解例の追加・削除' },
  { id: 'learned', name: '学習ルール', icon: '🧠', description: '学習済みルールの編集・削除' },
  { id: 'custom', name: 'カスタム指示', icon: '✏️', description: 'ユーザー指定の追加指示' },
];

interface PromptLayerItemProps {
  layer: PromptLayer;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  content: React.ReactNode;
}

const PromptLayerItem: React.FC<PromptLayerItemProps> = ({ layer, index, isExpanded, onToggle, content }) => (
  <div className="border rounded">
    <button onClick={onToggle} className="w-full flex items-center gap-2 p-3 hover:bg-gray-50 text-left">
      <span className="text-gray-400 text-sm w-6">{index + 1}</span>
      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      <span className="text-gray-600">{layer.icon}</span>
      <span className="font-medium flex-1">{layer.name}</span>
      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">編集可</span>
    </button>
    {isExpanded && (
      <div className="px-3 pb-3 border-t bg-gray-50">
        <div className="text-xs text-gray-500 mb-2 mt-2">{layer.description}</div>
        {content}
      </div>
    )}
  </div>
);

interface PromptTabProps {
  state: ReturnType<typeof useAIFrameworkState>;
  appMode: AppMode;
}

export const PromptTab: React.FC<PromptTabProps> = ({ state, appMode }) => {
  const enabledRulesCount = Object.entries(state.ruleSettings).filter(([, v]) => v).length;

  const getLayerContent = (layer: PromptLayerType): React.ReactNode => {
    switch (layer) {
      case 'system':
        return <SystemLayer systemOverride={state.systemOverride} saveSystemOverride={state.saveSystemOverride} appMode={appMode} ruleSettings={state.ruleSettings} />;
      case 'hierarchy':
        return <HierarchyLayer editingHierarchy={state.editingHierarchy} setEditingHierarchy={state.setEditingHierarchy} hierarchyOverride={state.hierarchyOverride} saveHierarchyOverride={state.saveHierarchyOverride} hierarchyError={state.hierarchyError} CONSTRUCTION_HIERARCHY={state.CONSTRUCTION_HIERARCHY} STORAGE_KEYS={state.STORAGE_KEYS} />;
      case 'rules':
        return <RulesLayer ruleSettings={state.ruleSettings} handleRuleToggle={state.handleRuleToggle} />;
      case 'examples':
        return <ExamplesLayer examples={state.examples} handleClearExamples={state.handleClearExamples} handleDeleteExample={state.handleDeleteExample} />;
      case 'learned':
        return <LearnedLayer learnedSettings={state.learnedSettings} handleClearLearnedData={state.handleClearLearnedData} handleDeleteLearnedRule={state.handleDeleteLearnedRule} handleDeleteLearnedAlias={state.handleDeleteLearnedAlias} />;
      case 'custom':
        return <CustomLayer customInstruction={state.customInstruction} saveCustomInstruction={state.saveCustomInstruction} />;
    }
  };

  return (
    <div className="space-y-3">
      <div className="bg-blue-50 border border-blue-200 rounded p-3">
        <div className="text-sm font-medium text-blue-800 mb-2">現在のAI設定</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="bg-white rounded p-2 border">
            <div className="text-gray-500">有効ルール</div>
            <div className="text-lg font-bold text-blue-600">{enabledRulesCount}/{ANALYSIS_RULES.length}</div>
          </div>
          <div className="bg-white rounded p-2 border">
            <div className="text-gray-500">お手本</div>
            <div className="text-lg font-bold text-purple-600">{state.examples.length}件</div>
          </div>
          <div className="bg-white rounded p-2 border">
            <div className="text-gray-500">学習ルール</div>
            <div className="text-lg font-bold text-green-600">{state.learnedSettings?.rules.length || 0}件</div>
          </div>
          <div className="bg-white rounded p-2 border">
            <div className="text-gray-500">モデル</div>
            <div className="text-sm font-bold text-gray-700">{state.selectedModel.replace('gemini-', '')}</div>
          </div>
        </div>
      </div>
      {PROMPT_LAYERS.map((layer, index) => (
        <PromptLayerItem
          key={layer.id}
          layer={layer}
          index={index}
          isExpanded={state.expandedLayers.has(layer.id)}
          onToggle={() => state.toggleLayer(layer.id)}
          content={getLayerContent(layer.id)}
        />
      ))}
      <button onClick={() => state.setShowFullPreview(!state.showFullPreview)} className="w-full flex items-center justify-center gap-2 p-2 border rounded hover:bg-gray-50">
        <Eye size={16} />{state.showFullPreview ? '合成プロンプトを隠す' : '合成プロンプトをプレビュー'}
      </button>
      {state.showFullPreview && (
        <div className="border rounded p-3 bg-gray-900 text-green-400 text-xs font-mono max-h-96 overflow-auto">
          <pre className="whitespace-pre-wrap">{state.generatePreview}</pre>
        </div>
      )}
    </div>
  );
};
