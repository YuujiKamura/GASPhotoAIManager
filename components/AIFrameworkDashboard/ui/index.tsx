import React from 'react';
import { X, Brain, FileText, GitBranch, Settings, AlertTriangle } from 'lucide-react';
import { AppMode } from '../../../types';
import { TabItem } from '../types';

export const TAB_ITEMS: TabItem[] = [
  { id: 'prompt', label: 'プロンプト構成', icon: <FileText size={16} /> },
  { id: 'flow', label: '処理フロー', icon: <GitBranch size={16} /> },
  { id: 'params', label: 'パラメータ', icon: <Settings size={16} /> },
  { id: 'debug', label: 'デバッグ', icon: <AlertTriangle size={16} /> },
];

export const DashboardHeader: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="flex items-center justify-between p-4 border-b">
    <div className="flex items-center gap-3">
      <Brain className="text-purple-600" size={24} />
      <div>
        <h2 className="text-lg font-bold">AIフレームワーク ダッシュボード</h2>
        <p className="text-sm text-gray-500">プロンプト・フロー・パラメータの完全コントロール</p>
      </div>
    </div>
    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded"><X size={20} /></button>
  </div>
);

export const TabBar: React.FC<{
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
}> = ({ tabs, activeTab, onTabChange }) => (
  <div className="flex border-b">
    {tabs.map(tab => (
      <button
        key={tab.id}
        onClick={() => onTabChange(tab.id)}
        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
          activeTab === tab.id ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-600 hover:text-gray-900'
        }`}
      >
        {tab.icon}{tab.label}
      </button>
    ))}
  </div>
);

export const DashboardFooter: React.FC<{ appMode: AppMode; onClose: () => void }> = ({ appMode, onClose }) => (
  <div className="flex items-center justify-between p-4 border-t bg-gray-50">
    <div className="text-sm text-gray-500">現在のモード: <span className="font-medium">{appMode === 'construction' ? '工事写真' : '汎用'}</span></div>
    <button onClick={onClose} className="px-4 py-2 text-sm border rounded hover:bg-gray-100">閉じる</button>
  </div>
);
