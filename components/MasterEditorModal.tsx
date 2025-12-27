import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, RotateCcw, Check, Search } from 'lucide-react';
import { CONSTRUCTION_HIERARCHY } from '../utils/constructionMaster';

interface Props {
  onClose: () => void;
  lang: 'en' | 'ja';
}

interface WorkTypeInfo {
  name: string;
  categories: string[]; // このworkTypeが存在する写真区分のリスト
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
    return getAllWorkTypes().map(w => w.name);
  } catch {
    return getAllWorkTypes().map(w => w.name);
  }
};

// 有効な工種をlocalStorageに保存
const saveEnabledWorkTypes = (types: string[]) => {
  localStorage.setItem(ENABLED_WORK_TYPES_KEY, JSON.stringify(types));
};

// マスタから全工種を抽出（写真区分をまたいで）
function getAllWorkTypes(): WorkTypeInfo[] {
  const workTypeMap = new Map<string, Set<string>>();
  const root = CONSTRUCTION_HIERARCHY["直接工事費"] as any;

  for (const categoryKey in root) {
    const category = root[categoryKey];
    for (const workTypeKey in category) {
      if (workTypeKey && workTypeKey.trim() !== '') {
        if (!workTypeMap.has(workTypeKey)) {
          workTypeMap.set(workTypeKey, new Set());
        }
        workTypeMap.get(workTypeKey)!.add(categoryKey);
      }
    }
  }

  return Array.from(workTypeMap.entries())
    .map(([name, categories]) => ({
      name,
      categories: Array.from(categories)
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
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
    // 空になったカテゴリは削除しない（着手前写真などは残す）
  }

  return { "直接工事費": root };
};

// 互換性のためにgetMergedMasterをエクスポート
export const getMergedMaster = getFilteredMaster;

const MasterEditorModal: React.FC<Props> = ({ onClose, lang }) => {
  const [allWorkTypes] = useState<WorkTypeInfo[]>(() => getAllWorkTypes());
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const txt = {
    title: lang === 'ja' ? '工種セット管理' : 'Work Type Sets',
    search: lang === 'ja' ? '工種を検索...' : 'Search work types...',
    save: lang === 'ja' ? '保存' : 'Save',
    reset: lang === 'ja' ? '全選択' : 'Select All',
    clear: lang === 'ja' ? '全解除' : 'Clear All',
    unsaved: lang === 'ja' ? '未保存' : 'Unsaved',
    enabled: lang === 'ja' ? '有効' : 'Enabled',
    categories: lang === 'ja' ? '関連区分' : 'Categories',
    hint: lang === 'ja'
      ? 'タップで工種を有効/無効に切り替え。有効な工種のみがAI分類で使用されます。'
      : 'Tap to enable/disable work types. Only enabled types are used in AI classification.',
  };

  useEffect(() => {
    const enabled = loadEnabledWorkTypes();
    setEnabledTypes(new Set(enabled));
  }, []);

  const toggleWorkType = (name: string) => {
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
    setEnabledTypes(new Set(allWorkTypes.map(w => w.name)));
    setHasChanges(true);
  };

  const handleClearAll = () => {
    setEnabledTypes(new Set());
    setHasChanges(true);
  };

  const filteredWorkTypes = allWorkTypes.filter(w =>
    w.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
      <div className="px-4 py-3 bg-white border-b flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {txt.enabled}: <span className="font-bold text-blue-600">{enabledTypes.size}</span> / {allWorkTypes.length}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSelectAll}
            className="px-3 py-1.5 text-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
          >
            {txt.reset}
          </button>
          <button
            onClick={handleClearAll}
            className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            {txt.clear}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3 bg-gray-50 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={txt.search}
            className="w-full pl-9 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <p className="text-xs text-gray-400 mt-2">{txt.hint}</p>
      </div>

      {/* Work Types List */}
      <div className="flex-1 overflow-auto">
        {filteredWorkTypes.map(workType => {
          const isEnabled = enabledTypes.has(workType.name);
          return (
            <div
              key={workType.name}
              onClick={() => toggleWorkType(workType.name)}
              className={`flex items-center gap-3 px-4 py-3 border-b cursor-pointer transition-colors active:bg-gray-100 ${
                isEnabled ? 'bg-blue-50' : 'bg-white'
              }`}
            >
              {/* Checkbox */}
              <div
                className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
                  isEnabled
                    ? 'bg-blue-500 border-blue-500'
                    : 'border-gray-300'
                }`}
              >
                {isEnabled && <Check className="w-4 h-4 text-white" />}
              </div>

              {/* Work Type Info */}
              <div className="flex-1 min-w-0">
                <div className={`font-medium ${isEnabled ? 'text-gray-900' : 'text-gray-500'}`}>
                  {workType.name}
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {workType.categories.map(cat => (
                    <span
                      key={cat}
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        isEnabled
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {categoryShortNames[cat] || cat}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MasterEditorModal;
