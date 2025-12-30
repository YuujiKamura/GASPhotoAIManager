import React from 'react';
import { X, ChevronDown, ChevronRight, Brain } from 'lucide-react';
import { AppMode } from '../../types';
import { PromptLayer } from './types';

interface DashboardHeaderProps {
  onClose: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({ onClose }) => (
  <div className="flex items-center justify-between p-4 border-b">
    <div className="flex items-center gap-3">
      <Brain className="text-purple-600" size={24} />
      <div>
        <h2 className="text-lg font-bold">AI Framework Dashboard</h2>
        <p className="text-sm text-gray-500">Full control over prompts, flow, and parameters</p>
      </div>
    </div>
    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded"><X size={20} /></button>
  </div>
);

interface TabBarProps {
  tabs: { id: string; label: string; icon: React.ReactNode }[];
  activeTab: string;
  onTabChange: (id: string) => void;
}

export const TabBar: React.FC<TabBarProps> = ({ tabs, activeTab, onTabChange }) => (
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

interface DashboardFooterProps {
  appMode: AppMode;
  onClose: () => void;
}

export const DashboardFooter: React.FC<DashboardFooterProps> = ({ appMode, onClose }) => (
  <div className="flex items-center justify-between p-4 border-t bg-gray-50">
    <div className="text-sm text-gray-500">Current mode: <span className="font-medium">{appMode === 'construction' ? 'Construction' : 'General'}</span></div>
    <button onClick={onClose} className="px-4 py-2 text-sm border rounded hover:bg-gray-100">Close</button>
  </div>
);

interface PromptLayerItemProps {
  layer: PromptLayer;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  content: React.ReactNode;
}

export const PromptLayerItem: React.FC<PromptLayerItemProps> = ({ layer, index, isExpanded, onToggle, content }) => (
  <div className="border rounded">
    <button onClick={onToggle} className="w-full flex items-center gap-2 p-3 hover:bg-gray-50 text-left">
      <span className="text-gray-400 text-sm w-6">{index + 1}</span>
      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      <span className="text-gray-600">{layer.icon}</span>
      <span className="font-medium flex-1">{layer.name}</span>
      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Editable</span>
    </button>
    {isExpanded && (
      <div className="px-3 pb-3 border-t bg-gray-50">
        <div className="text-xs text-gray-500 mb-2 mt-2">{layer.description}</div>
        {content}
      </div>
    )}
  </div>
);
