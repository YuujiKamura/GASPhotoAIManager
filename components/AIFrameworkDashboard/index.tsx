/**
 * AIFrameworkDashboard
 * Visualize and control AI analysis prompts, flow, and parameters
 */

import React from 'react';
import { FileText, Layers, Settings, BookOpen, Brain, Edit3, GitBranch, Eye, Cpu, AlertTriangle } from 'lucide-react';
import { useAIFrameworkState, PromptLayerType } from '../../hooks/useAIFrameworkState';
import { AppMode } from '../../types';
import { DashboardHeader, TabBar, DashboardFooter } from './CommonComponents';
import { SystemLayer, HierarchyLayer, RulesLayer, ExamplesLayer, LearnedLayer, CustomLayer } from './PromptLayers';
import { PromptTabContent, FlowTabContent, ParamsTabContent } from './TabContent';
import { DebugTabContent } from './DebugComponents';
import { FlowStep, TabItem } from './types';

interface AIFrameworkDashboardProps {
  onClose: () => void;
  appMode: AppMode;
}

const TAB_ITEMS: TabItem[] = [
  { id: 'prompt', label: 'Prompts', icon: <FileText size={16} /> },
  { id: 'flow', label: 'Flow', icon: <GitBranch size={16} /> },
  { id: 'params', label: 'Parameters', icon: <Settings size={16} /> },
  { id: 'debug', label: 'Debug', icon: <AlertTriangle size={16} /> },
];

const AIFrameworkDashboard: React.FC<AIFrameworkDashboardProps> = ({ onClose, appMode }) => {
  const state = useAIFrameworkState(appMode);

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

  const FLOW_STEPS: FlowStep[] = [
    { id: 'upload', name: 'Photo Upload', description: 'Base64 encoding', icon: <FileText size={16} />, enabled: true },
    { id: 'detect', name: 'Board Detection', description: 'Smart flow with 3 samples', icon: <Eye size={16} />, optional: true, enabled: state.flowSettings.detect },
    { id: 'worktype', name: 'Work Type Selection', description: 'Create hierarchy subset', icon: <Layers size={16} />, optional: true, enabled: state.flowSettings.worktype },
    { id: 'batch', name: 'Batch Analysis', description: 'Streaming analysis via Gemini API', icon: <Cpu size={16} />, enabled: true },
    { id: 'context', name: 'Context Inheritance', description: 'Inherit info from previous photos', icon: <GitBranch size={16} />, enabled: true },
    { id: 'validate', name: 'Validation', description: 'Master matching & warning generation', icon: <Settings size={16} />, enabled: true },
    { id: 'normalize', name: 'Normalization', description: 'Text normalization suggestions', icon: <BookOpen size={16} />, optional: true, enabled: state.flowSettings.normalize },
    { id: 'scene', name: 'Scene ID Assignment', description: 'Pairing & grouping', icon: <Brain size={16} />, optional: true, enabled: state.flowSettings.scene },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <DashboardHeader onClose={onClose} />
        <TabBar tabs={TAB_ITEMS} activeTab={state.activeTab} onTabChange={(id) => state.setActiveTab(id as typeof state.activeTab)} />
        <div className="flex-1 overflow-auto p-4">
          {state.activeTab === 'prompt' && <PromptTabContent state={state} getLayerContent={getLayerContent} />}
          {state.activeTab === 'flow' && <FlowTabContent flowSteps={FLOW_STEPS} flowSettings={state.flowSettings} handleFlowToggle={state.handleFlowToggle} />}
          {state.activeTab === 'params' && <ParamsTabContent state={state} />}
          {state.activeTab === 'debug' && <DebugTabContent state={state} appMode={appMode} />}
        </div>
        <DashboardFooter appMode={appMode} onClose={onClose} />
      </div>
    </div>
  );
};

export default AIFrameworkDashboard;
