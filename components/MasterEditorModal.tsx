import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Save, Check, Search, ChevronRight, Trash2, Edit2, X, Plus } from 'lucide-react';
import { CONSTRUCTION_HIERARCHY } from '../utils/constructionMaster';

interface Props {
  onClose: () => void;
  lang: 'en' | 'ja';
}

interface WorkTypeData {
  name: string;
  categories: Map<string, any>;
}

type ViewMode = 'list' | 'detail';

// カスタマイズデータの型
interface CustomizationData {
  deletedPaths: string[]; // 削除されたパス（例: "舗装工/舗装打換え工/表層工"）
  renamedPaths: { [path: string]: string }; // パス → 新しい名前
  addedEntries: { parentPath: string; name: string }[]; // 追加されたエントリー
}

const ENABLED_WORK_TYPES_KEY = 'construction_enabled_work_types';
const CUSTOMIZATION_KEY = 'construction_customization';

// 有効な工種をlocalStorageから取得
const loadEnabledWorkTypes = (): string[] => {
  try {
    const saved = localStorage.getItem(ENABLED_WORK_TYPES_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
    return Array.from(collectAllWorkTypes().keys());
  } catch {
    return Array.from(collectAllWorkTypes().keys());
  }
};

// 有効な工種をlocalStorageに保存
const saveEnabledWorkTypes = (types: string[]) => {
  localStorage.setItem(ENABLED_WORK_TYPES_KEY, JSON.stringify(types));
};

// カスタマイズデータを読み込み
const loadCustomization = (): CustomizationData => {
  try {
    const saved = localStorage.getItem(CUSTOMIZATION_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // ignore
  }
  return { deletedPaths: [], renamedPaths: {}, addedEntries: [] };
};

// カスタマイズデータを保存
const saveCustomization = (data: CustomizationData) => {
  localStorage.setItem(CUSTOMIZATION_KEY, JSON.stringify(data));
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

// 有効な工種のみ含むマスタを取得（カスタマイズ適用済み）
export const getFilteredMaster = (): any => {
  const enabledTypes = loadEnabledWorkTypes();
  const customization = loadCustomization();
  const root = JSON.parse(JSON.stringify(CONSTRUCTION_HIERARCHY["直接工事費"]));

  // 無効な工種を削除
  for (const categoryKey in root) {
    const category = root[categoryKey];
    for (const workTypeKey in category) {
      if (!enabledTypes.includes(workTypeKey)) {
        delete category[workTypeKey];
      }
    }
  }

  // カスタマイズを適用（削除されたパス）
  for (const deletedPath of customization.deletedPaths) {
    const parts = deletedPath.split('/');
    for (const categoryKey in root) {
      let current = root[categoryKey];
      let found = true;
      for (let i = 0; i < parts.length - 1; i++) {
        if (current && current[parts[i]]) {
          current = current[parts[i]];
        } else {
          found = false;
          break;
        }
      }
      if (found && current && current[parts[parts.length - 1]]) {
        delete current[parts[parts.length - 1]];
      }
    }
  }

  // リネームを適用
  for (const [path, newName] of Object.entries(customization.renamedPaths)) {
    const parts = path.split('/');
    const oldName = parts[parts.length - 1];
    for (const categoryKey in root) {
      let current = root[categoryKey];
      let found = true;
      for (let i = 0; i < parts.length - 1; i++) {
        if (current && current[parts[i]]) {
          current = current[parts[i]];
        } else {
          found = false;
          break;
        }
      }
      if (found && current && current[oldName]) {
        current[newName] = current[oldName];
        delete current[oldName];
      }
    }
  }

  return { "直接工事費": root };
};

// 互換性のためにgetMergedMasterをエクスポート
export const getMergedMaster = getFilteredMaster;

// 編集可能なツリービューコンポーネント
interface EditableTreeViewProps {
  data: any;
  path: string;
  customization: CustomizationData;
  onDelete: (path: string) => void;
  onRename: (path: string, newName: string) => void;
  onAdd: (parentPath: string, name: string) => void;
  depth?: number;
}

const EditableTreeView: React.FC<EditableTreeViewProps> = ({
  data,
  path,
  customization,
  onDelete,
  onRename,
  onAdd,
  depth = 0
}) => {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newEntryName, setNewEntryName] = useState('');

  if (!data || typeof data !== 'object') return null;

  const keys = Object.keys(data).filter(k => k !== 'aliases');

  // 削除されたパスをフィルタリング
  const visibleKeys = keys.filter(key => {
    const fullPath = path ? `${path}/${key}` : key;
    return !customization.deletedPaths.includes(fullPath);
  });

  // 追加されたエントリーを含める
  const addedKeys = customization.addedEntries
    .filter(e => e.parentPath === path)
    .map(e => e.name);

  const allKeys = [...visibleKeys, ...addedKeys];

  if (allKeys.length === 0) return null;

  const startEdit = (key: string) => {
    const displayName = customization.renamedPaths[path ? `${path}/${key}` : key] || key;
    setEditingKey(key);
    setEditValue(displayName);
  };

  const saveEdit = (originalKey: string) => {
    if (editValue.trim() && editValue !== originalKey) {
      onRename(path ? `${path}/${originalKey}` : originalKey, editValue.trim());
    }
    setEditingKey(null);
    setEditValue('');
  };

  const handleAddEntry = () => {
    if (newEntryName.trim()) {
      onAdd(path, newEntryName.trim());
      setAddingTo(null);
      setNewEntryName('');
    }
  };

  return (
    <div className="text-sm">
      {allKeys.map((key, idx) => {
        const fullPath = path ? `${path}/${key}` : key;
        const displayName = customization.renamedPaths[fullPath] || key;
        const isEditing = editingKey === key;
        const childData = data[key];
        const isAdded = addedKeys.includes(key);

        return (
          <div key={key} className="group">
            <div className="flex items-center gap-1 py-1 hover:bg-gray-100 rounded px-1">
              <div className="flex-shrink-0 w-4 text-gray-300">
                {idx === allKeys.length - 1 ? '└' : '├'}
              </div>

              {isEditing ? (
                <div className="flex-1 flex items-center gap-1">
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit(key);
                      if (e.key === 'Escape') setEditingKey(null);
                    }}
                    className="flex-1 px-2 py-0.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                  <button
                    onClick={() => saveEdit(key)}
                    className="p-1 text-green-600 hover:bg-green-100 rounded"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setEditingKey(null)}
                    className="p-1 text-gray-600 hover:bg-gray-200 rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <>
                  <div className={`flex-1 ${isAdded ? 'text-green-600' : 'text-gray-700'}`}>
                    {displayName}
                    {displayName !== key && (
                      <span className="text-xs text-gray-400 ml-1">(変更済)</span>
                    )}
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                    <button
                      onClick={() => startEdit(key)}
                      className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                      title="名前を変更"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onDelete(fullPath)}
                      className="p-1 text-red-600 hover:bg-red-100 rounded"
                      title="削除"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    {childData && typeof childData === 'object' && (
                      <button
                        onClick={() => {
                          setAddingTo(fullPath);
                          setNewEntryName('');
                        }}
                        className="p-1 text-green-600 hover:bg-green-100 rounded"
                        title="子項目を追加"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* 子項目追加フォーム */}
            {addingTo === fullPath && (
              <div className="ml-8 flex items-center gap-1 py-1">
                <input
                  type="text"
                  value={newEntryName}
                  onChange={(e) => setNewEntryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddEntry();
                    if (e.key === 'Escape') setAddingTo(null);
                  }}
                  placeholder="新しい項目名..."
                  className="flex-1 px-2 py-0.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoFocus
                />
                <button
                  onClick={handleAddEntry}
                  className="p-1 text-green-600 hover:bg-green-100 rounded"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setAddingTo(null)}
                  className="p-1 text-gray-600 hover:bg-gray-200 rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* 子要素 */}
            {childData && typeof childData === 'object' && !isAdded && (
              <div className="ml-5 border-l border-gray-200 pl-1">
                <EditableTreeView
                  data={childData}
                  path={fullPath}
                  customization={customization}
                  onDelete={onDelete}
                  onRename={onRename}
                  onAdd={onAdd}
                  depth={depth + 1}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const MasterEditorModal: React.FC<Props> = ({ onClose, lang }) => {
  const [allWorkTypes] = useState<Map<string, WorkTypeData>>(() => collectAllWorkTypes());
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedWorkType, setSelectedWorkType] = useState<WorkTypeData | null>(null);
  const [customization, setCustomization] = useState<CustomizationData>({ deletedPaths: [], renamedPaths: {}, addedEntries: [] });

  const txt = {
    title: lang === 'ja' ? '工種セット管理' : 'Work Type Sets',
    detailTitle: lang === 'ja' ? 'エントリー編集' : 'Edit Entries',
    search: lang === 'ja' ? '工種を検索...' : 'Search work types...',
    save: lang === 'ja' ? '保存' : 'Save',
    selectAll: lang === 'ja' ? '全選択' : 'Select All',
    clear: lang === 'ja' ? '全解除' : 'Clear All',
    unsaved: lang === 'ja' ? '未保存' : 'Unsaved',
    enabled: lang === 'ja' ? '有効' : 'Enabled',
    hint: lang === 'ja'
      ? 'チェックで工種を有効/無効に。右矢印で詳細編集。'
      : 'Check to enable/disable. Arrow for detail edit.',
    editHint: lang === 'ja'
      ? '項目の削除・名前変更ができます。変更は保存が必要です。'
      : 'Delete or rename entries. Save required.',
    back: lang === 'ja' ? '戻る' : 'Back',
    edit: lang === 'ja' ? '編集' : 'Edit',
    resetCustomization: lang === 'ja' ? 'リセット' : 'Reset',
  };

  useEffect(() => {
    const enabled = loadEnabledWorkTypes();
    setEnabledTypes(new Set(enabled));
    setCustomization(loadCustomization());
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
    saveCustomization(customization);
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

  const openDetailEdit = (workType: WorkTypeData, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedWorkType(workType);
    setViewMode('detail');
  };

  const handleDelete = useCallback((path: string) => {
    setCustomization(prev => ({
      ...prev,
      deletedPaths: [...prev.deletedPaths, path]
    }));
    setHasChanges(true);
  }, []);

  const handleRename = useCallback((path: string, newName: string) => {
    setCustomization(prev => ({
      ...prev,
      renamedPaths: { ...prev.renamedPaths, [path]: newName }
    }));
    setHasChanges(true);
  }, []);

  const handleAdd = useCallback((parentPath: string, name: string) => {
    setCustomization(prev => ({
      ...prev,
      addedEntries: [...prev.addedEntries, { parentPath, name }]
    }));
    setHasChanges(true);
  }, []);

  const handleResetCustomization = () => {
    if (selectedWorkType) {
      // 選択した工種に関するカスタマイズをリセット
      const workTypeName = selectedWorkType.name;
      setCustomization(prev => ({
        deletedPaths: prev.deletedPaths.filter(p => !p.startsWith(workTypeName + '/') && p !== workTypeName),
        renamedPaths: Object.fromEntries(
          Object.entries(prev.renamedPaths).filter(([p]) => !p.startsWith(workTypeName + '/') && p !== workTypeName)
        ),
        addedEntries: prev.addedEntries.filter(e => !e.parentPath.startsWith(workTypeName + '/') && e.parentPath !== workTypeName)
      }));
      setHasChanges(true);
    }
  };

  // 工種をカテゴリ別に並べ替え（舗装系→構造物系→上下水道系→その他）
  // 未分類の工種は末尾に配置
  const UNCATEGORIZED_ORDER = 100;
  const workTypeCategoryOrder: Record<string, number> = {
    // 舗装系
    '舗装工': 1,
    '区画線工': 2,
    // 構造物系
    '道路土工': 10,
    '排水構造物工': 11,
    '構造物撤去工': 12,
    // 上下水道系
    '人孔改良工': 20,
    // その他
    '仮設工': 30,
  };

  const workTypeList = Array.from(allWorkTypes.values())
    .filter(w => w.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      const orderA = workTypeCategoryOrder[a.name] ?? UNCATEGORIZED_ORDER;
      const orderB = workTypeCategoryOrder[b.name] ?? UNCATEGORIZED_ORDER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.name.localeCompare(b.name, 'ja');
    });

  const categoryShortNames: Record<string, string> = {
    '着手前及び完成写真': '着工/完成',
    '施工状況写真': '施工状況',
    '安全管理写真': '安全',
    '使用材料写真': '材料',
    '品質管理写真': '品質',
    '出来形管理写真': '出来形',
  };

  // 詳細編集画面
  if (viewMode === 'detail' && selectedWorkType) {
    return (
      <div className="min-h-screen w-full bg-gray-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setViewMode('list')}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h3 className="text-lg font-bold">{selectedWorkType.name}</h3>
              <p className="text-xs text-indigo-200">{txt.detailTitle}</p>
            </div>
            {hasChanges && (
              <span className="text-amber-400 text-xs bg-amber-900/30 px-2 py-0.5 rounded">
                {txt.unsaved}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetCustomization}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white/20 hover:bg-white/30 text-white transition-colors"
            >
              {txt.resetCustomization}
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                hasChanges
                  ? 'bg-green-500 hover:bg-green-600 text-white'
                  : 'bg-white/20 text-white/50 cursor-not-allowed'
              }`}
            >
              <Save className="w-4 h-4" />
              {txt.save}
            </button>
          </div>
        </div>

        {/* Hint */}
        <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100">
          <p className="text-xs text-indigo-600">{txt.editHint}</p>
        </div>

        {/* Tree Content - Full Expansion */}
        <div className="flex-1 overflow-auto p-4">
          {Array.from(selectedWorkType.categories.entries()).map(([catName, catData]) => (
            <div key={catName} className="mb-6 bg-white rounded-lg border shadow-sm">
              <div className="px-4 py-2 bg-gray-50 border-b rounded-t-lg">
                <span className="font-medium text-gray-700">
                  {categoryShortNames[catName] || catName}
                </span>
              </div>
              <div className="p-4">
                <EditableTreeView
                  data={catData}
                  path={selectedWorkType.name}
                  customization={customization}
                  onDelete={handleDelete}
                  onRename={handleRename}
                  onAdd={handleAdd}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 工種リスト画面（フォールド状態）
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

      {/* Work Types List - Folded */}
      <div className="flex-1 overflow-auto">
        {workTypeList.map(workType => {
          const isEnabled = enabledTypes.has(workType.name);
          const hasCustomization =
            customization.deletedPaths.some(p => p.startsWith(workType.name + '/') || p === workType.name) ||
            Object.keys(customization.renamedPaths).some(p => p.startsWith(workType.name + '/') || p === workType.name) ||
            customization.addedEntries.some(e => e.parentPath.startsWith(workType.name + '/') || e.parentPath === workType.name);

          return (
            <div
              key={workType.name}
              className={`border-b ${isEnabled ? 'bg-white' : 'bg-gray-50'}`}
            >
              <div
                className={`flex items-center gap-3 px-4 py-3 transition-colors`}
              >
                {/* Checkbox */}
                <div
                  onClick={(e) => toggleWorkType(workType.name, e)}
                  className={`w-6 h-6 rounded-md border-2 flex-shrink-0 flex items-center justify-center cursor-pointer transition-colors ${
                    isEnabled
                      ? 'bg-blue-500 border-blue-500'
                      : 'border-gray-300 bg-white hover:border-blue-300'
                  }`}
                >
                  {isEnabled && <Check className="w-4 h-4 text-white" />}
                </div>

                {/* Work Type Name & Categories */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold text-base ${isEnabled ? 'text-gray-900' : 'text-gray-400'}`}>
                      {workType.name}
                    </span>
                    {hasCustomization && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                        編集済
                      </span>
                    )}
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

                {/* Edit Button */}
                <button
                  onClick={(e) => openDetailEdit(workType, e)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    isEnabled
                      ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  <span className="text-xs">{txt.edit}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MasterEditorModal;
