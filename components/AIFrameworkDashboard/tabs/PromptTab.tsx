import React from 'react';
import { ChevronDown, ChevronRight, Edit3, Eye, FileText, Layers, Settings, BookOpen, Brain } from 'lucide-react';
import { PromptLayerType, AIFrameworkState } from '../../../hooks/useAIFrameworkState';
import { AppMode } from '../../../types';
import {
  SystemLayer,
  HierarchyLayer,
  RulesLayer,
  ExamplesLayer,
  LearnedLayer,
  CustomLayer,
} from '../layers';

interface PromptLayer {
  id: PromptLayerType;
  name: string;
  icon: React.ReactNode;
  description: string;
}

const PROMPT_LAYERS: PromptLayer[] = [
  { id: 'system', name: 'システムプロンプト', icon: <FileText size={16} />, description: '基本的なAI指示をカスタマイズ' },
  { id: 'hierarchy', name: '階層マスタ', icon: <Layers size={16} />, description: '工種→種別→細別→備考の構造をJSON編集' },
  { id: 'rules', name: '分析ルール', icon: <Settings size={16} />, description: '有効/無効を切り替え、新規追加も可能' },
  { id: 'examples', name: 'お手本（Few-shot）', icon: <BookOpen size={16} />, description: '正解例の追加・削除' },
  { id: 'learned', name: '学習ルール', icon: <Brain size={16} />, description: '学習済みルールの編集・削除' },
  { id: 'custom', name: 'カスタム指示', icon: <Edit3 size={16} />, description: 'ユーザー指定の追加指示' },
];

interface PromptTabProps {
  state: AIFrameworkState;
  appMode: AppMode;
}

export const PromptTab: React.FC<PromptTabProps> = ({ state, appMode }) => {
  const renderLayerContent = (layerId: PromptLayerType): React.ReactNode => {
    switch (layerId) {
      case 'system':
        return (
          <SystemLayer
            systemOverride={state.systemOverride}
            saveSystemOverride={state.saveSystemOverride}
            appMode={appMode}
            ruleSettings={state.ruleSettings}
          />
        );
      case 'hierarchy':
        return (
          <HierarchyLayer
            hierarchyOverride={state.hierarchyOverride}
            saveHierarchyOverride={state.saveHierarchyOverride}
            editingHierarchy={state.editingHierarchy}
            setEditingHierarchy={state.setEditingHierarchy}
            hierarchyError={state.hierarchyError}
            CONSTRUCTION_HIERARCHY={state.CONSTRUCTION_HIERARCHY}
            STORAGE_KEYS={state.STORAGE_KEYS}
          />
        );
      case 'rules':
        return (
          <RulesLayer
            ruleSettings={state.ruleSettings}
            handleRuleToggle={state.handleRuleToggle}
          />
        );
      case 'examples':
        return (
          <ExamplesLayer
            examples={state.examples}
            handleClearExamples={state.handleClearExamples}
            handleDeleteExample={state.handleDeleteExample}
          />
        );
      case 'learned':
        return (
          <LearnedLayer
            learnedSettings={state.learnedSettings}
            handleClearLearnedData={state.handleClearLearnedData}
            handleDeleteLearnedRule={state.handleDeleteLearnedRule}
            handleDeleteLearnedAlias={state.handleDeleteLearnedAlias}
          />
        );
      case 'custom':
        return (
          <CustomLayer
            customInstruction={state.customInstruction}
            saveCustomInstruction={state.saveCustomInstruction}
          />
        );
    }
  };

  return (
    <div className="space-y-3">
      <div className="bg-green-50 border border-green-200 rounded p-3 text-sm">
        <div className="flex items-center gap-2 font-medium text-green-800">
          <Edit3 size={16} />全レイヤー編集可能
        </div>
        <div className="text-green-600 mt-1">
          各レイヤーを展開して編集できます。変更は即座に保存されます。
        </div>
      </div>

      {PROMPT_LAYERS.map((layer, index) => (
        <div key={layer.id} className="border rounded">
          <button
            onClick={() => state.toggleLayer(layer.id)}
            className="w-full flex items-center gap-2 p-3 hover:bg-gray-50 text-left"
          >
            <span className="text-gray-400 text-sm w-6">{index + 1}</span>
            {state.expandedLayers.has(layer.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span className="text-gray-600">{layer.icon}</span>
            <span className="font-medium flex-1">{layer.name}</span>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">編集可</span>
          </button>
          {state.expandedLayers.has(layer.id) && (
            <div className="px-3 pb-3 border-t bg-gray-50">
              <div className="text-xs text-gray-500 mb-2 mt-2">{layer.description}</div>
              {renderLayerContent(layer.id)}
            </div>
          )}
        </div>
      ))}

      <button
        onClick={() => state.setShowFullPreview(!state.showFullPreview)}
        className="w-full flex items-center justify-center gap-2 p-2 border rounded hover:bg-gray-50"
      >
        <Eye size={16} />
        {state.showFullPreview ? '合成プロンプトを隠す' : '合成プロンプトをプレビュー'}
      </button>

      {state.showFullPreview && (
        <div className="border rounded p-3 bg-gray-900 text-green-400 text-xs font-mono max-h-96 overflow-auto">
          <pre className="whitespace-pre-wrap">{state.generatePreview}</pre>
        </div>
      )}
    </div>
  );
};
