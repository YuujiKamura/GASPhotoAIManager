import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { ANALYSIS_RULES } from '../../utils/analysisRules';
import { AppMode } from '../../types';
import { useAIFrameworkState } from '../../hooks/useAIFrameworkState';

interface DebugSummaryProps {
  state: ReturnType<typeof useAIFrameworkState>;
  appMode: AppMode;
}

export const DebugSummary: React.FC<DebugSummaryProps> = ({ state, appMode }) => (
  <div className="border rounded p-4">
    <div className="font-medium mb-3">Current Settings Summary</div>
    <div className="text-sm space-y-1 font-mono bg-gray-50 p-3 rounded">
      <div>appMode: {appMode}</div>
      <div>model: {state.selectedModel}</div>
      <div>temperature: {state.temperature}</div>
      <div>enabledRules: {Object.entries(state.ruleSettings).filter(([, v]) => v).length}/{ANALYSIS_RULES.length}</div>
      <div>examples: {state.examples.length}</div>
      <div>learnedRules: {state.learnedSettings?.rules.length || 0}</div>
      <div>learnedAliases: {state.learnedSettings?.aliases.length || 0}</div>
      <div>systemOverride: {state.systemOverride ? 'set' : 'none'}</div>
      <div>hierarchyOverride: {state.hierarchyOverride ? 'set' : 'none'}</div>
      <div>customInstruction: {state.customInstruction ? 'set' : 'none'}</div>
    </div>
  </div>
);

interface ResetPanelProps {
  resetRuleSettings: () => void;
  resetCustomizations: () => void;
}

export const ResetPanel: React.FC<ResetPanelProps> = ({ resetRuleSettings, resetCustomizations }) => (
  <div className="border rounded p-4 border-red-200">
    <div className="font-medium mb-3 text-red-600">Reset Settings</div>
    <div className="space-y-2">
      <button onClick={resetRuleSettings} className="w-full flex items-center justify-center gap-2 p-2 border border-red-200 text-red-600 rounded hover:bg-red-50 text-sm">
        <RefreshCw size={14} />Reset Rule Settings
      </button>
      <button onClick={resetCustomizations} className="w-full flex items-center justify-center gap-2 p-2 border border-red-200 text-red-600 rounded hover:bg-red-50 text-sm">
        <RefreshCw size={14} />Reset Customizations
      </button>
    </div>
  </div>
);

interface DebugTabContentProps {
  state: ReturnType<typeof useAIFrameworkState>;
  appMode: AppMode;
}

export const DebugTabContent: React.FC<DebugTabContentProps> = ({ state, appMode }) => (
  <div className="space-y-4">
    <div className="bg-orange-50 border border-orange-200 rounded p-3 text-sm">
      <div className="flex items-center gap-2 font-medium text-orange-800"><AlertTriangle size={16} />Debug Information</div>
      <div className="text-orange-600 mt-1">For AI analysis troubleshooting</div>
    </div>
    <DebugSummary state={state} appMode={appMode} />
    <ResetPanel resetRuleSettings={state.resetRuleSettings} resetCustomizations={state.resetCustomizations} />
  </div>
);
