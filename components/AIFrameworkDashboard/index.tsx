/**
 * AIフレームワークダッシュボード
 * AI解析のプロンプト・フロー・パラメータを可視化・コントロール
 */

import React from 'react';
import { useAIFrameworkState } from '../../hooks/useAIFrameworkState';
import { AppMode } from '../../types';
import { DashboardHeader, TabBar, DashboardFooter, TAB_ITEMS } from './ui';
import { PromptTab, FlowTab, ParamsTab, DebugTab } from './tabs';

interface AIFrameworkDashboardProps {
  onClose: () => void;
  appMode: AppMode;
}

const AIFrameworkDashboard: React.FC<AIFrameworkDashboardProps> = ({ onClose, appMode }) => {
  const state = useAIFrameworkState(appMode);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <DashboardHeader onClose={onClose} />
        <TabBar tabs={TAB_ITEMS} activeTab={state.activeTab} onTabChange={(id) => state.setActiveTab(id as typeof state.activeTab)} />
        <div className="flex-1 overflow-auto p-4">
          {state.activeTab === 'prompt' && <PromptTab state={state} appMode={appMode} />}
          {state.activeTab === 'flow' && <FlowTab state={state} />}
          {state.activeTab === 'params' && <ParamsTab state={state} />}
          {state.activeTab === 'debug' && <DebugTab state={state} appMode={appMode} />}
        </div>
        <DashboardFooter appMode={appMode} onClose={onClose} />
      </div>
    </div>
  );
};

export default AIFrameworkDashboard;
