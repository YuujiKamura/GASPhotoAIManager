import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Save, Check, Search, ChevronRight, Trash2, Edit2, X, Plus, Replace, ToggleLeft, ToggleRight, RefreshCw } from 'lucide-react';
import { CONSTRUCTION_HIERARCHY } from '../utils/constructionMaster';
import {
  loadAliasSettings,
  saveAliasSettings,
  applyPreset,
  clearAliasSettings,
  PRESET_ALIASES,
  AliasSettings,
  PresetKey
} from '../utils/workTypeAliases';

interface Props {
  onClose: () => void;
  lang: 'en' | 'ja';
  onApplyAliasesToSession?: () => { modifiedCount: number }; // セッション全体にエイリアス適用
}

interface WorkTypeData {
  name: string;
  categories: Map<string, any>;
}

type ViewMode = 'list' | 'detail' | 'alias';

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

const MasterEditorModal: React.FC<Props> = ({ onClose, lang, onApplyAliasesToSession }) => {
  const [allWorkTypes] = useState<Map<string, WorkTypeData>>(() => collectAllWorkTypes());
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedWorkType, setSelectedWorkType] = useState<WorkTypeData | null>(null);
  const [customization, setCustomization] = useState<CustomizationData>({ deletedPaths: [], renamedPaths: {}, addedEntries: [] });

  // Alias settings state
  const [aliasSettings, setAliasSettings] = useState<AliasSettings>(loadAliasSettings());
  const [newWorkTypeFrom, setNewWorkTypeFrom] = useState('');
  const [newWorkTypeTo, setNewWorkTypeTo] = useState('');
  const [newVarietyFrom, setNewVarietyFrom] = useState('');
  const [newVarietyTo, setNewVarietyTo] = useState('');

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
    // Alias translations
    aliasTitle: lang === 'ja' ? '名称エイリアス' : 'Name Aliases',
    aliasDescription: lang === 'ja' ? '工種・種別名を別名に変換' : 'Convert names to aliases',
    aliasEnabled: lang === 'ja' ? '有効' : 'Enabled',
    aliasDisabled: lang === 'ja' ? '無効' : 'Disabled',
    workTypeAliases: lang === 'ja' ? '工種エイリアス' : 'Work Type Aliases',
    varietyAliases: lang === 'ja' ? '種別エイリアス' : 'Variety Aliases',
    from: lang === 'ja' ? '元の名前' : 'Original',
    to: lang === 'ja' ? '変換後' : 'Alias',
    add: lang === 'ja' ? '追加' : 'Add',
    presets: lang === 'ja' ? 'プリセット' : 'Presets',
    noAliases: lang === 'ja' ? 'エイリアスなし' : 'No aliases',
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

  // Alias handlers
  const handleToggleAliasEnabled = () => {
    setAliasSettings(prev => {
      const updated = { ...prev, enabled: !prev.enabled };
      saveAliasSettings(updated);
      return updated;
    });
  };

  const handleApplyPreset = (presetKey: PresetKey) => {
    const newSettings = applyPreset(presetKey);
    setAliasSettings(newSettings);
  };

  const handleResetAliases = () => {
    const newSettings = clearAliasSettings();
    setAliasSettings(newSettings);
  };

  const handleAddWorkTypeAlias = () => {
    if (newWorkTypeFrom.trim() && newWorkTypeTo.trim()) {
      setAliasSettings(prev => {
        const updated = {
          ...prev,
          mappings: {
            ...prev.mappings,
            workType: {
              ...prev.mappings.workType,
              [newWorkTypeFrom.trim()]: newWorkTypeTo.trim()
            }
          },
          activePreset: undefined
        };
        saveAliasSettings(updated);
        return updated;
      });
      setNewWorkTypeFrom('');
      setNewWorkTypeTo('');
    }
  };

  const handleAddVarietyAlias = () => {
    if (newVarietyFrom.trim() && newVarietyTo.trim()) {
      setAliasSettings(prev => {
        const updated = {
          ...prev,
          mappings: {
            ...prev.mappings,
            variety: {
              ...prev.mappings.variety,
              [newVarietyFrom.trim()]: newVarietyTo.trim()
            }
          },
          activePreset: undefined
        };
        saveAliasSettings(updated);
        return updated;
      });
      setNewVarietyFrom('');
      setNewVarietyTo('');
    }
  };

  const handleRemoveWorkTypeAlias = (key: string) => {
    setAliasSettings(prev => {
      const newWorkType = { ...prev.mappings.workType };
      delete newWorkType[key];
      const updated = {
        ...prev,
        mappings: { ...prev.mappings, workType: newWorkType },
        activePreset: undefined
      };
      saveAliasSettings(updated);
      return updated;
    });
  };

  const handleRemoveVarietyAlias = (key: string) => {
    setAliasSettings(prev => {
      const newVariety = { ...prev.mappings.variety };
      delete newVariety[key];
      const updated = {
        ...prev,
        mappings: { ...prev.mappings, variety: newVariety },
        activePreset: undefined
      };
      saveAliasSettings(updated);
      return updated;
    });
  };

  const workTypeAliasEntries = Object.entries(aliasSettings.mappings.workType);
  const varietyAliasEntries = Object.entries(aliasSettings.mappings.variety);
  const hasAnyAliases = workTypeAliasEntries.length > 0 || varietyAliasEntries.length > 0;

  // セッションへの適用結果
  const [applyResult, setApplyResult] = useState<{ modifiedCount: number } | null>(null);

  const handleApplyToSession = () => {
    if (onApplyAliasesToSession) {
      const result = onApplyAliasesToSession();
      setApplyResult(result);
      // 3秒後にメッセージをクリア
      setTimeout(() => setApplyResult(null), 3000);
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

  // エイリアス設定画面
  if (viewMode === 'alias') {
    return (
      <div className="min-h-screen w-full bg-gray-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-600 to-amber-700 text-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setViewMode('list')}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h3 className="text-lg font-bold">{txt.aliasTitle}</h3>
              <p className="text-xs text-amber-200">{txt.aliasDescription}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Enable/Disable Toggle */}
          <div className="bg-white rounded-lg border shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-gray-900">エイリアス変換</h4>
                <p className="text-sm text-gray-500">解析済みデータに一括適用</p>
              </div>
              <button
                onClick={handleToggleAliasEnabled}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  aliasSettings.enabled
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {aliasSettings.enabled ? (
                  <>
                    <ToggleRight className="w-5 h-5" />
                    {txt.aliasEnabled}
                  </>
                ) : (
                  <>
                    <ToggleLeft className="w-5 h-5" />
                    {txt.aliasDisabled}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Presets */}
          <div className="bg-white rounded-lg border shadow-sm p-4">
            <h4 className="font-medium text-gray-900 mb-3">{txt.presets}</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(PRESET_ALIASES).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => handleApplyPreset(key as PresetKey)}
                  className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                    aliasSettings.activePreset === key
                      ? 'bg-amber-100 text-amber-700 border-2 border-amber-300'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                  }`}
                >
                  <div className="font-medium">{preset.name}</div>
                  <div className="text-xs text-gray-500">{preset.description}</div>
                </button>
              ))}
              <button
                onClick={handleResetAliases}
                className="px-3 py-2 rounded-lg text-sm bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 flex items-center gap-1"
              >
                <RefreshCw className="w-4 h-4" />
                {txt.resetCustomization}
              </button>
            </div>
          </div>

          {/* Work Type Aliases */}
          <div className="bg-white rounded-lg border shadow-sm p-4">
            <h4 className="font-medium text-gray-900 mb-3">{txt.workTypeAliases}</h4>

            {workTypeAliasEntries.length > 0 ? (
              <div className="space-y-2 mb-4">
                {workTypeAliasEntries.map(([from, to]) => (
                  <div key={from} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    <span className="flex-1 text-sm font-medium text-gray-700">{from}</span>
                    <span className="text-gray-400">→</span>
                    <span className="flex-1 text-sm text-amber-600 font-medium">{to}</span>
                    <button
                      onClick={() => handleRemoveWorkTypeAlias(from)}
                      className="p-1 text-red-500 hover:bg-red-100 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 mb-4">{txt.noAliases}</p>
            )}

            {/* Add new work type alias */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newWorkTypeFrom}
                onChange={(e) => setNewWorkTypeFrom(e.target.value)}
                placeholder={txt.from}
                className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <span className="text-gray-400">→</span>
              <input
                type="text"
                value={newWorkTypeTo}
                onChange={(e) => setNewWorkTypeTo(e.target.value)}
                placeholder={txt.to}
                className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                onClick={handleAddWorkTypeAlias}
                disabled={!newWorkTypeFrom.trim() || !newWorkTypeTo.trim()}
                className="px-3 py-2 rounded-lg text-sm bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                {txt.add}
              </button>
            </div>
          </div>

          {/* Variety Aliases */}
          <div className="bg-white rounded-lg border shadow-sm p-4">
            <h4 className="font-medium text-gray-900 mb-3">{txt.varietyAliases}</h4>

            {varietyAliasEntries.length > 0 ? (
              <div className="space-y-2 mb-4">
                {varietyAliasEntries.map(([from, to]) => (
                  <div key={from} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    <span className="flex-1 text-sm font-medium text-gray-700">{from}</span>
                    <span className="text-gray-400">→</span>
                    <span className="flex-1 text-sm text-amber-600 font-medium">{to}</span>
                    <button
                      onClick={() => handleRemoveVarietyAlias(from)}
                      className="p-1 text-red-500 hover:bg-red-100 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 mb-4">{txt.noAliases}</p>
            )}

            {/* Add new variety alias */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newVarietyFrom}
                onChange={(e) => setNewVarietyFrom(e.target.value)}
                placeholder={txt.from}
                className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <span className="text-gray-400">→</span>
              <input
                type="text"
                value={newVarietyTo}
                onChange={(e) => setNewVarietyTo(e.target.value)}
                placeholder={txt.to}
                className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                onClick={handleAddVarietyAlias}
                disabled={!newVarietyFrom.trim() || !newVarietyTo.trim()}
                className="px-3 py-2 rounded-lg text-sm bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                {txt.add}
              </button>
            </div>
          </div>

          {/* Preview & Apply Section */}
          {hasAnyAliases && aliasSettings.enabled && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h4 className="font-medium text-amber-800 mb-2">変換プレビュー</h4>
              <div className="text-sm text-amber-700 mb-4">
                <p>以下の変換が適用されます：</p>
                <ul className="mt-2 space-y-1 list-disc list-inside">
                  {workTypeAliasEntries.map(([from, to]) => (
                    <li key={`wt-${from}`}>工種: {from} → {to}</li>
                  ))}
                  {varietyAliasEntries.map(([from, to]) => (
                    <li key={`var-${from}`}>種別: {from} → {to}</li>
                  ))}
                </ul>
              </div>

              {/* Apply to Session Button */}
              {onApplyAliasesToSession && (
                <div className="border-t border-amber-200 pt-4 mt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-amber-800">現在のセッションに適用</p>
                      <p className="text-xs text-amber-600">解析済みの写真データを一括変換します</p>
                    </div>
                    <button
                      onClick={handleApplyToSession}
                      className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2"
                    >
                      <Replace className="w-4 h-4" />
                      適用
                    </button>
                  </div>
                  {applyResult && (
                    <div className={`mt-3 p-2 rounded text-sm ${
                      applyResult.modifiedCount > 0
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {applyResult.modifiedCount > 0
                        ? `${applyResult.modifiedCount}件のデータを変換しました`
                        : '変換対象のデータがありませんでした'}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
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
            onClick={() => setViewMode('alias')}
            className={`px-3 py-1 text-xs rounded flex items-center gap-1 ${
              hasAnyAliases && aliasSettings.enabled
                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Replace className="w-3 h-3" />
            {txt.aliasTitle}
            {hasAnyAliases && aliasSettings.enabled && (
              <span className="w-2 h-2 bg-amber-500 rounded-full" />
            )}
          </button>
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
