import React from 'react';
import { getSystemInstruction } from '../../../services/gemini/systemPrompts';
import { formatHierarchyForPrompt } from '../../../utils/constructionMaster';
import { AppMode } from '../../../types';
import { RuleSettings } from '../../../utils/analysisRules';

interface SystemLayerProps {
  systemOverride: string;
  saveSystemOverride: (value: string) => void;
  appMode: AppMode;
  ruleSettings: RuleSettings;
}

export const SystemLayer: React.FC<SystemLayerProps> = ({
  systemOverride,
  saveSystemOverride,
  appMode,
  ruleSettings,
}) => {
  const handleLoadDefault = () => {
    const defaultPrompt = getSystemInstruction(appMode, '', formatHierarchyForPrompt(), ruleSettings);
    saveSystemOverride(defaultPrompt);
  };

  return (
    <div className="space-y-3">
      <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
        ⚠️ 空欄の場合はデフォルトのシステムプロンプトが使用されます
      </div>
      <textarea
        value={systemOverride}
        onChange={(e) => saveSystemOverride(e.target.value)}
        placeholder="システムプロンプトをオーバーライド（上級者向け）..."
        className="w-full h-40 text-xs font-mono border rounded p-2 resize-none bg-gray-50"
      />
      <div className="flex gap-2">
        <button
          onClick={handleLoadDefault}
          className="text-xs px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
        >
          デフォルトを読み込む
        </button>
        <button
          onClick={() => saveSystemOverride('')}
          className="text-xs px-3 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
        >
          クリア
        </button>
      </div>
    </div>
  );
};
