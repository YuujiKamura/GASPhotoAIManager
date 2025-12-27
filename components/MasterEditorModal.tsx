import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Check, Search } from 'lucide-react';
import { CONSTRUCTION_HIERARCHY } from '../utils/constructionMaster';

interface Props {
  onClose: () => void;
  lang: 'en' | 'ja';
}

interface WorkTypeData {
  name: string;
  categories: Map<string, any>; // 写真区分 → その下の階層データ
}

const ENABLED_WORK_TYPES_KEY = 'construction_enabled_work_types';

// 有効な工種をlocalStorageから取得
const loadEnabledWorkTypes = (): string[] => {
  try {
    const saved = localStorage.getItem(ENABLED_WORK_TYPES_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
    // 初回はすべて有効
    return Array.from(collectAllWorkTypes().keys());
  } catch {
    return Array.from(collectAllWorkTypes().keys());
  }
};

// 有効な工種をlocalStorageに保存
const saveEnabledWorkTypes = (types: string[]) => {
  localStorage.setItem(ENABLED_WORK_TYPES_KEY, JSON.stringify(types));
};

// マスタから全工種とその階層データを収集
function collectAllWorkTypes(): Map<string, WorkTypeData> {
  const workTypeMap = new Map<string, WorkTypeData>();
  const root = CONSTRUCTION_HIERARCHY["直接工事費"] as any;

  for (const categoryKey in root) {
    const category = root[categoryKey];
    for (const workTypeKey in category) {
      if (workTypeKey && workTypeKey.trim() !== '') {
        if (!workTypeMap.has(workTypeKey)) {
          workTypeMap.set(workTypeKey, {
            name: workTypeKey,
            categories: new Map()
          });
        }
        workTypeMap.get(workTypeKey)!.categories.set(categoryKey, category[workTypeKey]);
      }
    }
  }

  return workTypeMap;
}

// 有効な工種のみ含むマスタを取得（外部から使用）
export const getFilteredMaster = (): any => {
  const enabledTypes = loadEnabledWorkTypes();
  const root = JSON.parse(JSON.stringify(CONSTRUCTION_HIERARCHY["直接工事費"]));

  for (const categoryKey in root) {
    const category = root[categoryKey];
    for (const workTypeKey in category) {
      if (!enabledTypes.includes(workTypeKey)) {
        delete category[workTypeKey];
      }
    }
  }

  return { "直接工事費": root };
};

// 互換性のためにgetMergedMasterをエクスポート
export const getMergedMaster = getFilteredMaster;

// 階層をツリー表示するコンポーネント
const TreeView: React.FC<{ data: any; depth?: number; dimmed?: boolean }> = ({ data, depth = 0, dimmed = false }) => {
  if (!data || typeof data !== 'object') return null;

  const keys = Object.keys(data).filter(k => k !== 'aliases');
  if (keys.length === 0) return null;

  return (
    <div className={`text-xs ${dimmed ? 'text-gray-400' : 'text-gray-600'}`}>
      {keys.map((key, idx) => (
        <div key={key} className="flex">
          <div className="flex-shrink-0 w-4 text-gray-300">
            {idx === keys.length - 1 ? '└' : '├'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="truncate">{key}</div>
            {data[key] && typeof data[key] === 'object' && (
              <div className="ml-2 border-l border-gray-200 pl-1">
                <TreeView data={data[key]} depth={depth + 1} dimmed={dimmed} />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

const MasterEditorModal: React.FC<Props> = ({ onClose, lang }) => {
  const [allWorkTypes] = useState<Map<string, WorkTypeData>>(() => collectAllWorkTypes());
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const txt = {
    title: lang === 'ja' ? '工種セット管理' : 'Work Type Sets',
    search: lang === 'ja' ? '工種を検索...' : 'Search work types...',
    save: lang === 'ja' ? '保存' : 'Save',
    selectAll: lang === 'ja' ? '全選択' : 'Select All',
    clear: lang === 'ja' ? '全解除' : 'Clear All',
    unsaved: lang === 'ja' ? '未保存' : 'Unsaved',
    enabled: lang === 'ja' ? '有効' : 'Enabled',
    hint: lang === 'ja'
      ? 'チェックで工種を有効/無効に。有効な工種のみAI分類で使用。'
      : 'Check to enable/disable. Only enabled types used in AI.',
  };

  useEffect(() => {
    const enabled = loadEnabledWorkTypes();
    setEnabledTypes(new Set(enabled));
  }, []);

  const toggleWorkType = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEnabledTypes(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
    setHasChanges(true);
  };

  const handleSave = () => {
    saveEnabledWorkTypes(Array.from(enabledTypes));
    setHasChanges(false);
  };

  const handleSelectAll = () => {
    setEnabledTypes(new Set(allWorkTypes.keys()));
    setHasChanges(true);
  };

  const handleClearAll = () => {
    setEnabledTypes(new Set());
    setHasChanges(true);
  };

  const workTypeList = Array.from(allWorkTypes.values())
    .filter(w => w.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  const categoryShortNames: Record<string, string> = {
    '着手前及び完成写真': '着工/完成',
    '施工状況写真': '施工状況',
    '安全管理写真': '安全',
    '使用材料写真': '材料',
    '品質管理写真': '品質',
    '出来形管理写真': '出来形',
  };

  return (
    <div className="min-h-screen w-full bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-700 to-slate-800 text-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h3 className="text-lg font-bold">{txt.title}</h3>
          {hasChanges && (
            <span className="text-amber-400 text-xs bg-amber-900/30 px-2 py-0.5 rounded">
              {txt.unsaved}
            </span>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            hasChanges
              ? 'bg-blue-500 hover:bg-blue-600 text-white'
              : 'bg-white/20 text-white/50 cursor-not-allowed'
          }`}
        >
          <Save className="w-4 h-4" />
          {txt.save}
        </button>
      </div>

      {/* Stats & Actions */}
      <div className="px-4 py-2 bg-white border-b flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {txt.enabled}: <span className="font-bold text-blue-600">{enabledTypes.size}</span> / {allWorkTypes.size}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSelectAll}
            className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
          >
            {txt.selectAll}
          </button>
          <button
            onClick={handleClearAll}
            className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            {txt.clear}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-2 bg-gray-50 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={txt.search}
            className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">{txt.hint}</p>
      </div>

      {/* Work Types List with Tree */}
      <div className="flex-1 overflow-auto">
        {workTypeList.map(workType => {
          const isEnabled = enabledTypes.has(workType.name);
          return (
            <div
              key={workType.name}
              className={`border-b ${isEnabled ? 'bg-white' : 'bg-gray-50'}`}
            >
              {/* Work Type Header */}
              <div
                onClick={(e) => toggleWorkType(workType.name, e)}
                className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors active:bg-gray-100`}
              >
                {/* Checkbox */}
                <div
                  className={`w-6 h-6 mt-0.5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    isEnabled
                      ? 'bg-blue-500 border-blue-500'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {isEnabled && <Check className="w-4 h-4 text-white" />}
                </div>

                {/* Work Type Name & Categories */}
                <div className="flex-1 min-w-0">
                  <div className={`font-bold text-base ${isEnabled ? 'text-gray-900' : 'text-gray-400'}`}>
                    {workType.name}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Array.from(workType.categories.keys()).map(cat => (
                      <span
                        key={cat}
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          isEnabled
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-200 text-gray-500'
                        }`}
                      >
                        {categoryShortNames[cat] || cat}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tree Content - Always Expanded */}
              <div className={`px-4 pb-3 pl-14 ${isEnabled ? '' : 'opacity-50'}`}>
                {Array.from(workType.categories.entries()).map(([catName, catData]) => (
                  <div key={catName} className="mb-2">
                    <div className={`text-xs font-medium mb-1 ${isEnabled ? 'text-gray-500' : 'text-gray-400'}`}>
                      [{categoryShortNames[catName] || catName}]
                    </div>
                    <TreeView data={catData} dimmed={!isEnabled} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MasterEditorModal;
