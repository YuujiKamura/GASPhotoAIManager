import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useAIFrameworkState } from '../../../hooks/useAIFrameworkState';
import { ANALYSIS_RULES } from '../../../utils/analysisRules';
import { AppMode } from '../../../types';

const DebugSummary: React.FC<{
  state: ReturnType<typeof useAIFrameworkState>;
  appMode: AppMode;
}> = ({ state, appMode }) => (
  <div className="border rounded p-4">
    <div className="font-medium mb-3">現在の設定サマリ</div>
    <div className="text-sm space-y-1 font-mono bg-gray-50 p-3 rounded">
      <div>appMode: {appMode}</div>
      <div>model: {state.selectedModel}</div>
      <div>temperature: {state.temperature}</div>
      <div>enabledRules: {Object.entries(state.ruleSettings).filter(([, v]) => v).length}/{ANALYSIS_RULES.length}</div>
      <div>examples: {state.examples.length}件</div>
      <div>learnedRules: {state.learnedSettings?.rules.length || 0}件</div>
      <div>learnedAliases: {state.learnedSettings?.aliases.length || 0}件</div>
      <div>systemOverride: {state.systemOverride ? '設定あり' : 'なし'}</div>
      <div>hierarchyOverride: {state.hierarchyOverride ? '設定あり' : 'なし'}</div>
      <div>customInstruction: {state.customInstruction ? '設定あり' : 'なし'}</div>
    </div>
  </div>
);

const ResetPanel: React.FC<{
  resetRuleSettings: () => void;
  resetCustomizations: () => void;
}> = ({ resetRuleSettings, resetCustomizations }) => (
  <div className="border rounded p-4 border-red-200">
    <div className="font-medium mb-3 text-red-600">設定リセット</div>
    <div className="space-y-2">
      <button onClick={resetRuleSettings} className="w-full flex items-center justify-center gap-2 p-2 border border-red-200 text-red-600 rounded hover:bg-red-50 text-sm">
        <RefreshCw size={14} />ルール設定をリセット
      </button>
      <button onClick={resetCustomizations} className="w-full flex items-center justify-center gap-2 p-2 border border-red-200 text-red-600 rounded hover:bg-red-50 text-sm">
        <RefreshCw size={14} />カスタマイズをリセット
      </button>
    </div>
  </div>
);

interface DebugTabProps {
  state: ReturnType<typeof useAIFrameworkState>;
  appMode: AppMode;
}

export const DebugTab: React.FC<DebugTabProps> = ({ state, appMode }) => (
  <div className="space-y-4">
    <div className="bg-orange-50 border border-orange-200 rounded p-3 text-sm">
      <div className="flex items-center gap-2 font-medium text-orange-800"><AlertTriangle size={16} />デバッグ情報</div>
      <div className="text-orange-600 mt-1">AI解析のトラブルシューティング用</div>
    </div>
    <DebugSummary state={state} appMode={appMode} />
    <ResetPanel resetRuleSettings={state.resetRuleSettings} resetCustomizations={state.resetCustomizations} />
  </div>
);
