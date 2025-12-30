/**
 * AIフレームワークダッシュボード
 * AI解析のプロンプト・フロー・パラメータを可視化・コントロール
 */

import React from 'react';
import { X, Brain, FileText, GitBranch, Settings, AlertTriangle } from 'lucide-react';
import { useAIFrameworkState } from '../../hooks/useAIFrameworkState';
import { AppMode } from '../../types';
import { PromptTab, FlowTab, ParamsTab, DebugTab } from './tabs';

interface AIFrameworkDashboardProps {
  onClose: () => void;
  appMode: AppMode;
}

interface TabConfig {
  id: 'prompt' | 'flow' | 'params' | 'debug';
  label: string;
  icon: React.ReactNode;
}

const TABS: TabConfig[] = [
  { id: 'prompt', label: 'プロンプト構成', icon: <FileText size={16} /> },
  { id: 'flow', label: '処理フロー', icon: <GitBranch size={16} /> },
  { id: 'params', label: 'パラメータ', icon: <Settings size={16} /> },
  { id: 'debug', label: 'デバッグ', icon: <AlertTriangle size={16} /> },
];

const AIFrameworkDashboard: React.FC<AIFrameworkDashboardProps> = ({ onClose, appMode }) => {
  const state = useAIFrameworkState(appMode);

  const renderTabContent = () => {
    switch (state.activeTab) {
      case 'prompt':
        return <PromptTab state={state} appMode={appMode} />;
      case 'flow':
        return <FlowTab state={state} />;
      case 'params':
        return <ParamsTab state={state} />;
      case 'debug':
        return <DebugTab state={state} appMode={appMode} />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <Brain className="text-purple-600" size={24} />
            <div>
              <h2 className="text-lg font-bold">AIフレームワーク ダッシュボード</h2>
              <p className="text-sm text-gray-500">プロンプト・フロー・パラメータの完全コントロール</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => state.setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                state.activeTab === tab.id
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {renderTabContent()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t bg-gray-50">
          <div className="text-sm text-gray-500">
            現在のモード: <span className="font-medium">{appMode === 'construction' ? '工事写真' : '汎用'}</span>
          </div>
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded hover:bg-gray-100">
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIFrameworkDashboard;
