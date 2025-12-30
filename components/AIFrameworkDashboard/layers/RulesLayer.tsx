import React from 'react';
import { ANALYSIS_RULES, RULE_CATEGORIES } from '../../../utils/analysisRules';

interface RulesLayerProps {
  ruleSettings: Record<string, boolean>;
  handleRuleToggle: (ruleId: string) => void;
}

const RuleItem: React.FC<{
  rule: typeof ANALYSIS_RULES[0];
  checked: boolean;
  onToggle: () => void;
}> = ({ rule, checked, onToggle }) => (
  <label className="flex items-center gap-2 text-xs p-1 rounded hover:bg-gray-50 cursor-pointer">
    <input type="checkbox" checked={checked} onChange={onToggle} className="rounded" />
    <span className="flex-1">
      <span className="font-medium">{rule.label}</span>
      {rule.isFixed && <span className="ml-1 text-gray-400">🔒</span>}
      <span className="block text-gray-500">{rule.description}</span>
    </span>
  </label>
);

const RuleCategorySection: React.FC<{
  category: typeof RULE_CATEGORIES[0];
  ruleSettings: Record<string, boolean>;
  handleRuleToggle: (ruleId: string) => void;
}> = ({ category, ruleSettings, handleRuleToggle }) => (
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

export const RulesLayer: React.FC<RulesLayerProps> = ({ ruleSettings, handleRuleToggle }) => (
  <div className="space-y-3">
    {RULE_CATEGORIES.map(category => (
      <RuleCategorySection key={category.id} category={category} ruleSettings={ruleSettings} handleRuleToggle={handleRuleToggle} />
    ))}
  </div>
);
