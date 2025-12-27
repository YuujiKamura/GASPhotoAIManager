import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Lock, Settings } from 'lucide-react';
import {
  RULE_CATEGORIES,
  ANALYSIS_RULES,
  getRulesByCategory,
  RuleSettings,
  RuleCategory
} from '../utils/analysisRules';

interface Props {
  settings: RuleSettings;
  onChange: (settings: RuleSettings) => void;
  collapsed?: boolean;
}

const AnalysisRulesPanel: React.FC<Props> = ({ settings, onChange, collapsed = true }) => {
  const [isOpen, setIsOpen] = useState(!collapsed);
  const [expandedCategories, setExpandedCategories] = useState<Set<RuleCategory>>(new Set());

  const toggleCategory = (categoryId: RuleCategory) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const toggleRule = (ruleId: string, isFixed: boolean) => {
    if (isFixed) return; // 固定ルールは変更不可
    onChange({
      ...settings,
      [ruleId]: !settings[ruleId]
    });
  };

  const totalRules = ANALYSIS_RULES.length;
  const enabledRules = ANALYSIS_RULES.filter(r => settings[r.id]).length;
  const fixedRules = ANALYSIS_RULES.filter(r => r.isFixed).length;

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm">
      {/* Header - Always visible */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isOpen ? (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-500" />
          )}
          <span className="font-medium text-gray-800">解析設定</span>
          <span className="text-sm text-gray-500">
            ({enabledRules}/{totalRules} 有効)
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Lock className="w-3 h-3" />
          <span>{fixedRules}項目 固定</span>
        </div>
      </button>

      {/* Collapsible Content */}
      {isOpen && (
        <div className="border-t border-gray-200 divide-y divide-gray-100">
          {RULE_CATEGORIES.map(category => {
            const rules = getRulesByCategory(category.id);
            const isExpanded = expandedCategories.has(category.id);
            const enabledInCat = rules.filter(r => settings[r.id]).length;
            const fixedInCat = rules.filter(r => r.isFixed).length;

            return (
              <div key={category.id}>
                {/* Category Header */}
                <button
                  onClick={() => toggleCategory(category.id)}
                  className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                    <span className="text-lg">{category.icon}</span>
                    <span className="text-sm font-medium text-gray-700">
                      {category.label}
                    </span>
                    <span className="text-xs text-gray-400">
                      [{enabledInCat}項目]
                    </span>
                  </div>
                  {fixedInCat === rules.length ? (
                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      全固定
                    </span>
                  ) : (
                    <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded flex items-center gap-1">
                      <Settings className="w-3 h-3" />
                      一部変更可
                    </span>
                  )}
                </button>

                {/* Rules List */}
                {isExpanded && (
                  <div className="bg-gray-50 px-4 py-2 space-y-1">
                    {rules.map(rule => (
                      <label
                        key={rule.id}
                        className={`flex items-start gap-3 py-1.5 px-2 rounded ${
                          rule.isFixed
                            ? 'cursor-not-allowed opacity-75'
                            : 'cursor-pointer hover:bg-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={settings[rule.id] ?? rule.defaultEnabled}
                          onChange={() => toggleRule(rule.id, rule.isFixed)}
                          disabled={rule.isFixed}
                          className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-800">
                              {rule.label}
                            </span>
                            {rule.isFixed && (
                              <Lock className="w-3 h-3 text-amber-500" />
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {rule.description}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AnalysisRulesPanel;
