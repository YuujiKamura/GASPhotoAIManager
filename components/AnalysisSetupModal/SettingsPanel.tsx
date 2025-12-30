import React from 'react';
import { Settings } from 'lucide-react';
import { SortPolicy, SORT_POLICIES } from '../../types';
import { AVAILABLE_MODELS, ModelType } from '../../services/geminiService';
import { formatCostJPY } from '../../services/usageTracker';

interface SettingsPanelProps {
  lang: 'ja' | 'en';
  selectedCount: number;
  totalCount: number;
  cost: { typical: number };
  model: ModelType;
  setModel: (model: ModelType) => void;
  sortPolicy: SortPolicy;
  setSortPolicy: (policy: SortPolicy) => void;
  useCache: boolean;
  setUseCache: (value: boolean) => void;
  enabledWorkTypes: string[];
  onOpenMasterEditor: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  lang,
  selectedCount,
  totalCount,
  cost,
  model,
  setModel,
  sortPolicy,
  setSortPolicy,
  useCache,
  setUseCache,
  enabledWorkTypes,
  onOpenMasterEditor,
}) => {
  const txt = {
    selected: lang === 'ja' ? '選択' : 'Selected',
    cost: lang === 'ja' ? '推定コスト' : 'Est. Cost',
    model: lang === 'ja' ? 'モデル' : 'Model',
    sort: lang === 'ja' ? '並び替え' : 'Sort',
    cache: lang === 'ja' ? 'キャッシュ' : 'Cache',
    workTypes: lang === 'ja' ? '工種' : 'Work Types',
    noWorkTypes: lang === 'ja' ? '工種未設定' : 'No work types',
  };

  return (
    <div className="px-4 py-3 border-t bg-gray-50 space-y-2">
      {/* Stats Row */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">
          {txt.selected}: <b className="text-blue-600">{selectedCount}/{totalCount}</b>
        </span>
        <span className="text-gray-600">
          {txt.cost}: <b className="text-blue-600">${cost.typical.toFixed(3)} ({formatCostJPY(cost.typical)})</b>
        </span>
      </div>

      {/* Model + Sort */}
      <div className="flex gap-2">
        <div className="flex-1">
          <div className="text-[10px] text-gray-500 mb-1">{txt.model}</div>
          <div className="flex gap-1">
            {AVAILABLE_MODELS.map(m => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={`flex-1 py-1 text-xs rounded ${
                  model === m.id ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {m.name.replace('Gemini ', '')}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1">
          <div className="text-[10px] text-gray-500 mb-1">{txt.sort}</div>
          <select
            value={sortPolicy}
            onChange={e => setSortPolicy(e.target.value as SortPolicy)}
            className="w-full py-1 px-2 text-xs border rounded bg-white"
          >
            {SORT_POLICIES.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Cache + WorkTypes */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={useCache} onChange={e => setUseCache(e.target.checked)} />
          {txt.cache}
        </label>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span>{txt.workTypes}:</span>
          {enabledWorkTypes.length > 0 ? (
            <span className="text-blue-600 font-medium">{enabledWorkTypes.length}件</span>
          ) : (
            <span className="text-red-500">{txt.noWorkTypes}</span>
          )}
          <button onClick={onOpenMasterEditor} className="p-1 hover:bg-gray-200 rounded">
            <Settings className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
