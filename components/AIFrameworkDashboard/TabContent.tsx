import React from 'react';
import { Eye, FileText, Layers, Settings, BookOpen, Brain, Edit3, GitBranch } from 'lucide-react';
import { useAIFrameworkState, PromptLayerType } from '../../hooks/useAIFrameworkState';
import { ANALYSIS_RULES } from '../../utils/analysisRules';
import { PromptLayerItem } from './CommonComponents';
import { FlowStepItem, FlowSummary } from './FlowComponents';
import { ModelSelector, TemperatureSlider, APISettingsPanel } from './ParamsComponents';
import { PromptLayer, FlowStep } from './types';

const PROMPT_LAYERS: PromptLayer[] = [
  { id: 'system', name: 'System Prompt', icon: <FileText size={16} />, description: 'Customize basic AI instructions' },
  { id: 'hierarchy', name: 'Hierarchy Master', icon: <Layers size={16} />, description: 'Edit JSON structure' },
  { id: 'rules', name: 'Analysis Rules', icon: <Settings size={16} />, description: 'Toggle enable/disable, add new rules' },
  { id: 'examples', name: 'Examples (Few-shot)', icon: <BookOpen size={16} />, description: 'Add/delete example data' },
  { id: 'learned', name: 'Learned Rules', icon: <Brain size={16} />, description: 'Edit/delete learned rules' },
  { id: 'custom', name: 'Custom Instructions', icon: <Edit3 size={16} />, description: 'User-specified additional instructions' },
];

interface PromptTabContentProps {
  state: ReturnType<typeof useAIFrameworkState>;
  getLayerContent: (layer: PromptLayerType) => React.ReactNode;
}

export const PromptTabContent: React.FC<PromptTabContentProps> = ({ state, getLayerContent }) => {
  const enabledRulesCount = Object.entries(state.ruleSettings).filter(([, v]) => v).length;
  return (
    <div className="space-y-3">
      <CurrentSettingsSummary
        enabledRulesCount={enabledRulesCount}
        totalRules={ANALYSIS_RULES.length}
        examplesCount={state.examples.length}
        learnedRulesCount={state.learnedSettings?.rules.length || 0}
        selectedModel={state.selectedModel}
      />
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
        <Eye size={16} />{state.showFullPreview ? 'Hide Preview' : 'Preview Combined Prompt'}
      </button>
      {state.showFullPreview && (
        <div className="border rounded p-3 bg-gray-900 text-green-400 text-xs font-mono max-h-96 overflow-auto">
          <pre className="whitespace-pre-wrap">{state.generatePreview}</pre>
        </div>
      )}
    </div>
  );
};

interface CurrentSettingsSummaryProps {
  enabledRulesCount: number;
  totalRules: number;
  examplesCount: number;
  learnedRulesCount: number;
  selectedModel: string;
}

const CurrentSettingsSummary: React.FC<CurrentSettingsSummaryProps> = ({
  enabledRulesCount, totalRules, examplesCount, learnedRulesCount, selectedModel
}) => (
  <div className="bg-blue-50 border border-blue-200 rounded p-3">
    <div className="text-sm font-medium text-blue-800 mb-2">Current AI Settings</div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
      <div className="bg-white rounded p-2 border">
        <div className="text-gray-500">Enabled Rules</div>
        <div className="text-lg font-bold text-blue-600">{enabledRulesCount}/{totalRules}</div>
      </div>
      <div className="bg-white rounded p-2 border">
        <div className="text-gray-500">Examples</div>
        <div className="text-lg font-bold text-purple-600">{examplesCount}</div>
      </div>
      <div className="bg-white rounded p-2 border">
        <div className="text-gray-500">Learned Rules</div>
        <div className="text-lg font-bold text-green-600">{learnedRulesCount}</div>
      </div>
      <div className="bg-white rounded p-2 border">
        <div className="text-gray-500">Model</div>
        <div className="text-sm font-bold text-gray-700">{selectedModel.replace('gemini-', '')}</div>
      </div>
    </div>
  </div>
);

interface FlowTabContentProps {
  flowSteps: FlowStep[];
  flowSettings: { detect: boolean; worktype: boolean; normalize: boolean; scene: boolean };
  handleFlowToggle: (id: string) => void;
}

export const FlowTabContent: React.FC<FlowTabContentProps> = ({ flowSteps, flowSettings, handleFlowToggle }) => (
  <div className="space-y-4">
    <div className="bg-purple-50 border border-purple-200 rounded p-3 text-sm">
      <div className="flex items-center gap-2 font-medium text-purple-800"><GitBranch size={16} />AI Processing Pipeline (Editable)</div>
      <div className="text-purple-600 mt-1">Toggle optional steps on/off</div>
    </div>
    <div className="relative">
      {flowSteps.map((step, index) => (
        <FlowStepItem
          key={step.id}
          step={step}
          index={index}
          isLast={index === flowSteps.length - 1}
          onToggle={() => handleFlowToggle(step.id)}
        />
      ))}
    </div>
    <FlowSummary flowSettings={flowSettings} />
  </div>
);

interface ParamsTabContentProps {
  state: ReturnType<typeof useAIFrameworkState>;
}

export const ParamsTabContent: React.FC<ParamsTabContentProps> = ({ state }) => (
  <div className="space-y-4">
    <ModelSelector selectedModel={state.selectedModel} handleModelChange={state.handleModelChange} />
    <TemperatureSlider temperature={state.temperature} saveTemperature={state.saveTemperature} />
    <APISettingsPanel />
  </div>
);
