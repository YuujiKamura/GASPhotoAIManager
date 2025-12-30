import React from 'react';
import { Trash2, RefreshCw } from 'lucide-react';

interface LearnedLayerProps {
  learnedSettings: { rules: any[]; aliases: any[] } | null;
  handleClearLearnedData: () => void;
  handleDeleteLearnedRule: (id: string) => void;
  handleDeleteLearnedAlias: (id: string) => void;
}

const LearnedRulesSection: React.FC<{ rules: any[]; onDelete: (id: string) => void }> = ({ rules, onDelete }) => (
  <div>
    <div className="text-xs font-medium mb-1">修正ルール:</div>
    <div className="space-y-1 max-h-40 overflow-auto">
      {rules.map((rule) => (
        <div key={rule.id} className="bg-gray-50 p-2 rounded flex items-center gap-2 text-xs">
          <div className="flex-1 font-mono">{rule.description}</div>
          <button onClick={() => onDelete(rule.id)} className="p-1 text-red-500 hover:bg-red-100 rounded"><Trash2 size={12} /></button>
        </div>
      ))}
    </div>
  </div>
);

const LearnedAliasesSection: React.FC<{ aliases: any[]; onDelete: (id: string) => void }> = ({ aliases, onDelete }) => (
  <div>
    <div className="text-xs font-medium mb-1">エイリアス:</div>
    <div className="space-y-1 max-h-40 overflow-auto">
      {aliases.map((alias) => (
        <div key={alias.id} className="bg-blue-50 p-2 rounded flex items-center gap-2 text-xs">
          <div className="flex-1 font-mono">"{alias.from}" → "{alias.to}"{alias.context && <span className="text-gray-500"> ({alias.context})</span>}</div>
          <button onClick={() => onDelete(alias.id)} className="p-1 text-red-500 hover:bg-red-100 rounded"><Trash2 size={12} /></button>
        </div>
      ))}
    </div>
  </div>
);

export const LearnedLayer: React.FC<LearnedLayerProps> = ({
  learnedSettings, handleClearLearnedData, handleDeleteLearnedRule, handleDeleteLearnedAlias
}) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <div className="text-sm text-gray-600">ルール: {learnedSettings?.rules.length || 0}件 / エイリアス: {learnedSettings?.aliases.length || 0}件</div>
      {(learnedSettings?.rules.length || learnedSettings?.aliases.length) ? (
        <button onClick={handleClearLearnedData} className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded">
          <RefreshCw size={12} className="inline mr-1" />リセット
        </button>
      ) : null}
    </div>
    {learnedSettings && learnedSettings.rules.length > 0 && (
      <LearnedRulesSection rules={learnedSettings.rules} onDelete={handleDeleteLearnedRule} />
    )}
    {learnedSettings && learnedSettings.aliases.length > 0 && (
      <LearnedAliasesSection aliases={learnedSettings.aliases} onDelete={handleDeleteLearnedAlias} />
    )}
    {(!learnedSettings || (learnedSettings.rules.length === 0 && learnedSettings.aliases.length === 0)) && (
      <div className="text-gray-500 italic text-sm">学習データはまだありません。解析結果を手動で修正すると自動的に学習されます。</div>
    )}
  </div>
);
