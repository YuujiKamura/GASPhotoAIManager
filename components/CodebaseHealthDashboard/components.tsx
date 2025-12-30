import React, { useState } from 'react';
import {
  CheckCircle, AlertTriangle, AlertCircle, ChevronDown, ChevronRight,
  Network, Copy, Check
} from 'lucide-react';
import {
  Priority, Status, PRIORITY_STYLES, CATEGORY_COLORS, EFFORT_LABELS,
  generateTaskPrompt
} from './constants';

export const StatusIcon: React.FC<{ status: Status }> = ({ status }) => {
  const icons = {
    ok: <CheckCircle className="w-5 h-5 text-green-500" />,
    warning: <AlertTriangle className="w-5 h-5 text-yellow-500" />,
    error: <AlertCircle className="w-5 h-5 text-red-500" />
  };
  return icons[status];
};

export const SectionToggle: React.FC<{
  expanded: boolean;
  onClick: () => void;
  children: React.ReactNode
}> = ({ expanded, onClick, children }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-4 hover:text-blue-600 transition-colors"
  >
    {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
    {children}
  </button>
);

export const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label = '📋 指示をコピー' }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={`text-xs px-3 py-1.5 rounded flex items-center gap-1 transition-colors ${
        copied ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
      }`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'コピー済み' : label}
    </button>
  );
};

export const TaskCard: React.FC<{ task: any }> = ({ task }) => {
  const style = PRIORITY_STYLES[task.priority as Priority] || PRIORITY_STYLES.low;
  return (
    <div className={`rounded-xl border-2 p-4 ${style.border} ${style.bg}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded border ${style.badge}`}>
              {task.priority.toUpperCase()}
            </span>
            <span className="font-mono text-sm bg-gray-200 px-2 py-0.5 rounded">{task.id}</span>
          </div>
          <p className="mt-2 text-gray-900 font-semibold">{task.title}</p>
          <p className="mt-1 text-sm text-gray-600">{task.description}</p>
          {task.estimatedLines > 0 && (
            <p className="mt-2 text-xs text-green-700">💡 削減見込み: {task.estimatedLines.toLocaleString()}行</p>
          )}
        </div>
        <button
          onClick={() => navigator.clipboard.writeText(generateTaskPrompt(task))}
          className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 whitespace-nowrap"
        >
          📋 指示をコピー
        </button>
      </div>
    </div>
  );
};

export const SuggestionCard: React.FC<{ suggestion: any; lang: 'en' | 'ja' }> = ({ suggestion, lang }) => {
  const [expanded, setExpanded] = useState(false);
  const categoryStyle = CATEGORY_COLORS[suggestion.category] || CATEGORY_COLORS.maintainability;
  const effortStyle = EFFORT_LABELS[suggestion.effort] || EFFORT_LABELS.medium;
  const priorityStyle = PRIORITY_STYLES[suggestion.priority as Priority] || PRIORITY_STYLES.low;

  return (
    <div className={`rounded-xl border-2 p-4 ${categoryStyle.bg} ${categoryStyle.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded border ${priorityStyle.badge}`}>
              {suggestion.priority.toUpperCase()}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded ${categoryStyle.text} bg-white/50`}>
              {suggestion.category}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded ${effortStyle.color}`}>
              工数: {effortStyle.label}
            </span>
          </div>
          <p className="text-gray-900 font-semibold">{suggestion.title}</p>
          <p className="mt-1 text-sm text-gray-600">{suggestion.description}</p>
          {suggestion.files && suggestion.files.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {suggestion.files.slice(0, 3).map((f: string, i: number) => (
                <span key={i} className="text-xs bg-white/70 px-2 py-0.5 rounded font-mono">{f}</span>
              ))}
              {suggestion.files.length > 3 && (
                <span className="text-xs text-gray-500">+{suggestion.files.length - 3}</span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <CopyButton text={suggestion.prompt} />
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-gray-600 hover:text-gray-900">
            {expanded ? '詳細を隠す' : '詳細を見る'}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-4 p-3 bg-white/70 rounded-lg">
          <pre className="text-xs text-gray-700 whitespace-pre-wrap overflow-auto max-h-64">
            {suggestion.prompt}
          </pre>
        </div>
      )}
    </div>
  );
};

export const ComponentAnalysisCard: React.FC<{ component: any }> = ({ component }) => {
  const hasIssues = component.issues && component.issues.length > 0;

  return (
    <div className={`rounded-lg border p-3 ${hasIssues ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="font-mono text-sm text-gray-900">{component.path}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Props: {component.propsCount}</span>
            <span className={`px-2 py-0.5 rounded ${component.stateCount > 3 ? 'bg-yellow-200 text-yellow-800' : 'bg-gray-200 text-gray-700'}`}>
              useState: {component.stateCount}
            </span>
            <span className={`px-2 py-0.5 rounded ${component.effectCount > 2 ? 'bg-yellow-200 text-yellow-800' : 'bg-gray-200 text-gray-700'}`}>
              useEffect: {component.effectCount}
            </span>
            <span className={`px-2 py-0.5 rounded ${component.jsxDepth > 6 ? 'bg-yellow-200 text-yellow-800' : 'bg-gray-200 text-gray-700'}`}>
              JSX深度: {component.jsxDepth}
            </span>
          </div>
          {hasIssues && (
            <div className="mt-2">
              {component.issues.map((issue: string, i: number) => (
                <p key={i} className="text-xs text-yellow-700">⚠️ {issue}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const DependencyGraph: React.FC<{ modules: any[] }> = ({ modules }) => {
  const categoryStats = {
    components: { count: 0, totalImports: 0, totalImportedBy: 0 },
    services: { count: 0, totalImports: 0, totalImportedBy: 0 },
    hooks: { count: 0, totalImports: 0, totalImportedBy: 0 },
    utils: { count: 0, totalImports: 0, totalImportedBy: 0 },
    other: { count: 0, totalImports: 0, totalImportedBy: 0 },
  };

  for (const mod of modules) {
    const cat = mod.category as keyof typeof categoryStats;
    if (categoryStats[cat]) {
      categoryStats[cat].count++;
      categoryStats[cat].totalImports += mod.imports?.length || 0;
      categoryStats[cat].totalImportedBy += mod.importedBy?.length || 0;
    }
  }

  const categories = [
    { key: 'components', label: 'Components', color: 'bg-blue-500' },
    { key: 'hooks', label: 'Hooks', color: 'bg-purple-500' },
    { key: 'services', label: 'Services', color: 'bg-green-500' },
    { key: 'utils', label: 'Utils', color: 'bg-orange-500' },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Network className="w-4 h-4 text-purple-500" />
        モジュール依存関係サマリー
      </h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {categories.map(cat => {
          const stats = categoryStats[cat.key as keyof typeof categoryStats];
          return (
            <div key={cat.key} className="text-center p-3 bg-gray-50 rounded-lg">
              <div className={`w-12 h-12 ${cat.color} rounded-full mx-auto mb-2 flex items-center justify-center text-white font-bold`}>
                {stats.count}
              </div>
              <p className="text-sm font-medium text-gray-900">{cat.label}</p>
              <p className="text-xs text-gray-500">→ {stats.totalImports} imports</p>
              <p className="text-xs text-gray-500">← {stats.totalImportedBy} refs</p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t">
        <h5 className="text-sm font-medium text-gray-700 mb-2">🔥 高影響モジュール（参照数Top5）</h5>
        <div className="space-y-1">
          {modules
            .filter(m => m.importedBy && m.importedBy.length > 0)
            .sort((a, b) => (b.importedBy?.length || 0) - (a.importedBy?.length || 0))
            .slice(0, 5)
            .map((mod, i) => (
              <div key={i} className="flex items-center justify-between text-sm bg-gray-50 rounded px-3 py-1">
                <span className="font-mono text-xs truncate flex-1">{mod.path}</span>
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded ml-2">
                  {mod.importedBy?.length || 0} refs
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};
