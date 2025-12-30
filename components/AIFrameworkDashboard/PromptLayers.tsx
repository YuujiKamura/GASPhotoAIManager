import React from 'react';
import { Edit3, Trash2, Save, RefreshCw } from 'lucide-react';
import { getSystemInstruction } from '../../services/gemini/systemPrompts';
import { formatHierarchyForPrompt } from '../../utils/constructionMaster';
import { ANALYSIS_RULES, RULE_CATEGORIES } from '../../utils/analysisRules';
import { AppMode } from '../../types';

interface SystemLayerProps {
  systemOverride: string;
  saveSystemOverride: (value: string) => void;
  appMode: AppMode;
  ruleSettings: Record<string, boolean>;
}

export const SystemLayer: React.FC<SystemLayerProps> = ({ systemOverride, saveSystemOverride, appMode, ruleSettings }) => (
  <div className="space-y-3">
    <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
      Warning: Empty will use default system prompt
    </div>
    <textarea
      value={systemOverride}
      onChange={(e) => saveSystemOverride(e.target.value)}
      placeholder="Override system prompt (advanced)..."
      className="w-full h-40 text-xs font-mono border rounded p-2 resize-none bg-gray-50"
    />
    <div className="flex gap-2">
      <button
        onClick={() => {
          const defaultPrompt = getSystemInstruction(appMode, '', formatHierarchyForPrompt(), ruleSettings);
          saveSystemOverride(defaultPrompt);
        }}
        className="text-xs px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
      >
        Load default
      </button>
      <button onClick={() => saveSystemOverride('')} className="text-xs px-3 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200">
        Clear
      </button>
    </div>
  </div>
);

interface HierarchyLayerProps {
  editingHierarchy: boolean;
  setEditingHierarchy: (value: boolean) => void;
  hierarchyOverride: string;
  saveHierarchyOverride: (value: string) => void;
  hierarchyError: string;
  CONSTRUCTION_HIERARCHY: any;
  STORAGE_KEYS: { hierarchyOverride: string };
}

export const HierarchyLayer: React.FC<HierarchyLayerProps> = ({
  editingHierarchy, setEditingHierarchy, hierarchyOverride,
  saveHierarchyOverride, hierarchyError, CONSTRUCTION_HIERARCHY, STORAGE_KEYS
}) => {
  if (!editingHierarchy) {
    return (
      <div className="space-y-3">
        <div className="text-xs text-gray-600 font-mono bg-gray-50 p-3 rounded max-h-40 overflow-auto">
          <pre className="whitespace-pre-wrap">
            {(hierarchyOverride || JSON.stringify(formatHierarchyForPrompt(), null, 2)).slice(0, 1000)}...
          </pre>
        </div>
        <button
          onClick={() => {
            if (!hierarchyOverride) saveHierarchyOverride(JSON.stringify(CONSTRUCTION_HIERARCHY, null, 2));
            setEditingHierarchy(true);
          }}
          className="flex items-center gap-1 text-xs px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
        >
          <Edit3 size={12} /> JSON Edit Mode
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <textarea
        value={hierarchyOverride}
        onChange={(e) => saveHierarchyOverride(e.target.value)}
        className={`w-full h-60 text-xs font-mono border rounded p-2 resize-none ${hierarchyError ? 'border-red-500' : ''}`}
      />
      {hierarchyError && <div className="text-xs text-red-600">{hierarchyError}</div>}
      <div className="flex gap-2">
        <button onClick={() => setEditingHierarchy(false)} className="text-xs px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200">
          <Save size={12} className="inline mr-1" />Save & Close
        </button>
        <button
          onClick={() => { saveHierarchyOverride(''); localStorage.removeItem(STORAGE_KEYS.hierarchyOverride); setEditingHierarchy(false); }}
          className="text-xs px-3 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
        >
          Reset to default
        </button>
      </div>
    </div>
  );
};

interface RulesLayerProps {
  ruleSettings: Record<string, boolean>;
  handleRuleToggle: (ruleId: string) => void;
}

export const RulesLayer: React.FC<RulesLayerProps> = ({ ruleSettings, handleRuleToggle }) => (
  <div className="space-y-3">
    {RULE_CATEGORIES.map(category => (
      <RuleCategorySection key={category.id} category={category} ruleSettings={ruleSettings} handleRuleToggle={handleRuleToggle} />
    ))}
  </div>
);

interface RuleCategorySectionProps {
  category: typeof RULE_CATEGORIES[0];
  ruleSettings: Record<string, boolean>;
  handleRuleToggle: (ruleId: string) => void;
}

const RuleCategorySection: React.FC<RuleCategorySectionProps> = ({ category, ruleSettings, handleRuleToggle }) => (
  <div className="border rounded p-2">
    <div className="font-medium text-sm flex items-center gap-2 mb-2">
      <span>{category.icon}</span><span>{category.label}</span>
    </div>
    <div className="space-y-1">
      {ANALYSIS_RULES.filter(r => r.category === category.id).map(rule => (
        <RuleItem key={rule.id} rule={rule} checked={ruleSettings[rule.id]} onToggle={() => handleRuleToggle(rule.id)} />
      ))}
    </div>
  </div>
);

interface RuleItemProps {
  rule: typeof ANALYSIS_RULES[0];
  checked: boolean;
  onToggle: () => void;
}

const RuleItem: React.FC<RuleItemProps> = ({ rule, checked, onToggle }) => (
  <label className="flex items-center gap-2 text-xs p-1 rounded hover:bg-gray-50 cursor-pointer">
    <input type="checkbox" checked={checked} onChange={onToggle} className="rounded" />
    <span className="flex-1">
      <span className="font-medium">{rule.label}</span>
      {rule.isFixed && <span className="ml-1 text-gray-400">🔒</span>}
      <span className="block text-gray-500">{rule.description}</span>
    </span>
  </label>
);

interface ExamplesLayerProps {
  examples: any[];
  handleClearExamples: () => void;
  handleDeleteExample: (id: string) => void;
}

export const ExamplesLayer: React.FC<ExamplesLayerProps> = ({ examples, handleClearExamples, handleDeleteExample }) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <div className="text-sm text-gray-600">Registered examples: {examples.length}</div>
      {examples.length > 0 && (
        <button onClick={handleClearExamples} className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded">
          <Trash2 size={12} className="inline mr-1" />Delete all
        </button>
      )}
    </div>
    {examples.length > 0 ? (
      <div className="space-y-2 max-h-60 overflow-auto">
        {examples.map((ex) => (
          <ExampleItem key={ex.id} example={ex} onDelete={() => handleDeleteExample(ex.id)} />
        ))}
      </div>
    ) : (
      <div className="text-gray-500 italic text-sm">No examples registered. Right-click analysis results to add.</div>
    )}
  </div>
);

interface ExampleItemProps {
  example: any;
  onDelete: () => void;
}

const ExampleItem: React.FC<ExampleItemProps> = ({ example, onDelete }) => (
  <div className="bg-gray-50 p-2 rounded flex items-start gap-2">
    <div className="flex-1">
      <div className="font-medium text-sm">{example.name}</div>
      <div className="text-xs text-gray-500">{example.analysis.workType} / {example.analysis.variety} / {example.analysis.detail}</div>
      <div className="text-xs text-gray-400">Notes: {example.analysis.remarks}</div>
    </div>
    <button onClick={onDelete} className="p-1 text-red-500 hover:bg-red-100 rounded"><Trash2 size={14} /></button>
  </div>
);

interface LearnedLayerProps {
  learnedSettings: { rules: any[]; aliases: any[] } | null;
  handleClearLearnedData: () => void;
  handleDeleteLearnedRule: (id: string) => void;
  handleDeleteLearnedAlias: (id: string) => void;
}

export const LearnedLayer: React.FC<LearnedLayerProps> = ({
  learnedSettings, handleClearLearnedData, handleDeleteLearnedRule, handleDeleteLearnedAlias
}) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <div className="text-sm text-gray-600">Rules: {learnedSettings?.rules.length || 0} / Aliases: {learnedSettings?.aliases.length || 0}</div>
      {(learnedSettings?.rules.length || learnedSettings?.aliases.length) ? (
        <button onClick={handleClearLearnedData} className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded">
          <RefreshCw size={12} className="inline mr-1" />Reset
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
      <div className="text-gray-500 italic text-sm">No learned data yet. Manual corrections are automatically learned.</div>
    )}
  </div>
);

const LearnedRulesSection: React.FC<{ rules: any[]; onDelete: (id: string) => void }> = ({ rules, onDelete }) => (
  <div>
    <div className="text-xs font-medium mb-1">Correction rules:</div>
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
    <div className="text-xs font-medium mb-1">Aliases:</div>
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

interface CustomLayerProps {
  customInstruction: string;
  saveCustomInstruction: (value: string) => void;
}

export const CustomLayer: React.FC<CustomLayerProps> = ({ customInstruction, saveCustomInstruction }) => (
  <div className="space-y-2">
    <textarea
      value={customInstruction}
      onChange={(e) => saveCustomInstruction(e.target.value)}
      placeholder="Enter additional instructions..."
      className="w-full h-32 text-sm border rounded p-2 resize-none"
    />
    <div className="text-xs text-gray-500">This instruction applies to all analyses</div>
  </div>
);
