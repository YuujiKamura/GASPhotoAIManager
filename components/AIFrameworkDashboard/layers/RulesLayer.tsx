import React from 'react';
import { ANALYSIS_RULES, RULE_CATEGORIES, RuleSettings } from '../../../utils/analysisRules';

interface RulesLayerProps {
  ruleSettings: RuleSettings;
  handleRuleToggle: (ruleId: string) => void;
}

export const RulesLayer: React.FC<RulesLayerProps> = ({
  ruleSettings,
  handleRuleToggle,
}) => (
  <div className="space-y-3">
    {RULE_CATEGORIES.map(category => (
      <div key={category.id} className="border rounded p-2">
        <div className="font-medium text-sm flex items-center gap-2 mb-2">
          <span>{category.icon}</span>
          <span>{category.label}</span>
        </div>
        <div className="space-y-1">
          {ANALYSIS_RULES.filter(r => r.category === category.id).map(rule => (
            <label
              key={rule.id}
              className="flex items-center gap-2 text-xs p-1 rounded hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={ruleSettings[rule.id]}
                onChange={() => handleRuleToggle(rule.id)}
                className="rounded"
              />
              <span className="flex-1">
                <span className="font-medium">{rule.label}</span>
                {rule.isFixed && <span className="ml-1 text-gray-400">🔒</span>}
                <span className="block text-gray-500">{rule.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    ))}
  </div>
);
