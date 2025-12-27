import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ChevronRight, ChevronDown, Plus, Trash2, Save, RotateCcw, Search, AlertTriangle, Download, Upload, Copy, FolderTree, FileJson, Check, Edit2, X } from 'lucide-react';
import { CONSTRUCTION_HIERARCHY } from '../utils/constructionMaster';

interface Props {
  onClose: () => void;
  lang: 'en' | 'ja';
}

interface TreeNode {
  key: string;
  children: TreeNode[];
  path: string[];
  isCustom?: boolean;
  isDefault?: boolean; // デフォルトに存在するか
}

type TabType = 'tree' | 'templates';

const CUSTOM_MASTER_KEY = 'construction_custom_master';
const DELETED_PATHS_KEY = 'construction_deleted_paths';

// カスタムマスタをlocalStorageから取得
const loadCustomMaster = (): Record<string, any> => {
  try {
    const saved = localStorage.getItem(CUSTOM_MASTER_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
};

// カスタムマスタをlocalStorageに保存
const saveCustomMaster = (data: Record<string, any>) => {
  localStorage.setItem(CUSTOM_MASTER_KEY, JSON.stringify(data));
};

// 削除済みパスをlocalStorageから取得
const loadDeletedPaths = (): string[] => {
  try {
    const saved = localStorage.getItem(DELETED_PATHS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

// 削除済みパスをlocalStorageに保存
const saveDeletedPaths = (paths: string[]) => {
  localStorage.setItem(DELETED_PATHS_KEY, JSON.stringify(paths));
};

// デフォルトのパスセットを収集
const collectDefaultPaths = (obj: any, path: string[] = [], paths: Set<string> = new Set()): Set<string> => {
  if (!obj || typeof obj !== 'object') return paths;
  for (const key in obj) {
    const currentPath = [...path, key];
    paths.add(currentPath.join('/'));
    collectDefaultPaths(obj[key], currentPath, paths);
  }
  return paths;
};

// 階層をツリー構造に変換
const buildTree = (obj: any, path: string[] = [], customPaths: Set<string>, defaultPaths: Set<string>): TreeNode[] => {
  if (!obj || typeof obj !== 'object') return [];

  return Object.keys(obj).map(key => {
    const currentPath = [...path, key];
    const pathStr = currentPath.join('/');
    return {
      key,
      path: currentPath,
      children: buildTree(obj[key], currentPath, customPaths, defaultPaths),
      isCustom: customPaths.has(pathStr),
      isDefault: defaultPaths.has(pathStr)
    };
  });
};

// パスを指定してオブジェクトから削除
const deleteAtPath = (obj: any, pathArr: string[]): void => {
  if (!obj || pathArr.length === 0) return;
  let current = obj;
  for (let i = 0; i < pathArr.length - 1; i++) {
    if (!current[pathArr[i]]) return;
    current = current[pathArr[i]];
  }
  delete current[pathArr[pathArr.length - 1]];
};

// マージしたマスタを取得（削除済みパスを除外）
export const getMergedMaster = (): any => {
  const custom = loadCustomMaster();
  const deletedPaths = loadDeletedPaths();
  const merged = deepMerge(JSON.parse(JSON.stringify(CONSTRUCTION_HIERARCHY)), custom);

  // 削除済みパスを除外
  for (const pathStr of deletedPaths) {
    const pathArr = pathStr.split('/');
    deleteAtPath(merged, pathArr);
  }

  return merged;
};

// 深いマージ
const deepMerge = (target: any, source: any): any => {
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
};

// カスタムパスを収集
const collectCustomPaths = (obj: any, path: string[] = [], paths: Set<string> = new Set()): Set<string> => {
  if (!obj || typeof obj !== 'object') return paths;
  for (const key in obj) {
    const currentPath = [...path, key];
    paths.add(currentPath.join('/'));
    collectCustomPaths(obj[key], currentPath, paths);
  }
  return paths;
};


// プリセットテンプレート
const TEMPLATES = {
  minimal: {
    name: '最小構成',
    description: '基本的な写真区分のみ',
    data: {}
  },
  asphalt: {
    name: 'アスファルト舗装工事',
    description: '舗装工事向けの追加エントリー',
    data: {
      "品質管理写真": {
        "舗装工": {
          "舗装打換え工": {
            "表層工": {
              "アスファルト混合物温度測定": {
                "aliases": ["温度管理", "合材温度", "出荷温度", "到着温度", "敷均し温度"]
              }
            }
          }
        }
      }
    }
  },
  drainage: {
    name: '排水構造物工事',
    description: '排水・側溝工事向けの追加エントリー',
    data: {
      "施工状況写真": {
        "排水構造物工": {
          "管渠工": {
            "管布設": {
              "管布設状況": {},
              "接合状況": {},
              "完了": {}
            }
          }
        }
      }
    }
  }
};

const MasterEditorModal: React.FC<Props> = ({ onClose, lang }) => {
  const [customMaster, setCustomMaster] = useState<Record<string, any>>({});
  const [deletedPaths, setDeletedPaths] = useState<string[]>([]);
  const [mergedMaster, setMergedMaster] = useState<any>({});
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['直接工事費']));
  const [searchTerm, setSearchTerm] = useState('');
  const [newEntryPath, setNewEntryPath] = useState<string[] | null>(null);
  const [newEntryName, setNewEntryName] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('tree');
  const [editingEntry, setEditingEntry] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const txt = {
    title: lang === 'ja' ? 'マスタデータ管理' : 'Master Data Management',
    search: lang === 'ja' ? '検索...' : 'Search...',
    addEntry: lang === 'ja' ? '追加' : 'Add',
    save: lang === 'ja' ? '保存' : 'Save',
    reset: lang === 'ja' ? 'リセット' : 'Reset',
    close: lang === 'ja' ? '閉じる' : 'Close',
    customLabel: lang === 'ja' ? 'カスタム' : 'Custom',
    defaultLabel: lang === 'ja' ? 'デフォルト' : 'Default',
    confirmReset: lang === 'ja' ? 'カスタム追加分をすべて削除しますか？\nデフォルトのマスタデータに戻ります。' : 'Delete all custom entries?\nThis will revert to default master data.',
    placeholder: lang === 'ja' ? '新しいエントリー名' : 'New entry name',
    noResults: lang === 'ja' ? '該当なし' : 'No results',
    unsavedWarning: lang === 'ja' ? '未保存' : 'Unsaved',
    tabTree: lang === 'ja' ? '階層' : 'Tree',
    tabTemplates: lang === 'ja' ? '雛形' : 'Templates',
    exportBtn: lang === 'ja' ? '出力' : 'Export',
    importBtn: lang === 'ja' ? '読込' : 'Import',
    applyTemplate: lang === 'ja' ? '適用' : 'Apply',
    pathHint: lang === 'ja' ? '階層: 写真区分 > 工種 > 種別 > 細別 > 備考' : 'Hierarchy: Category > WorkType > Variety > Detail > Remarks',
    deleteConfirm: lang === 'ja' ? 'このエントリーを削除しますか？' : 'Delete this entry?'
  };

  useEffect(() => {
    const custom = loadCustomMaster();
    const deleted = loadDeletedPaths();
    setCustomMaster(custom);
    setDeletedPaths(deleted);
    setMergedMaster(getMergedMaster());
  }, []);

  const defaultPaths = collectDefaultPaths(CONSTRUCTION_HIERARCHY["直接工事費"], ['直接工事費']);
  const customPaths = collectCustomPaths(customMaster, ['直接工事費']);

  const toggleExpand = (pathStr: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(pathStr)) {
        next.delete(pathStr);
      } else {
        next.add(pathStr);
      }
      return next;
    });
  };

  const handleAddEntry = (path: string[]) => {
    setNewEntryPath(path);
    setNewEntryName('');
    // 親を展開
    const pathStr = path.join('/');
    setExpandedPaths(prev => new Set([...prev, pathStr]));
  };

  const confirmAddEntry = () => {
    if (!newEntryPath || !newEntryName.trim()) return;

    const newCustom = JSON.parse(JSON.stringify(customMaster));
    let current = newCustom;

    // パスをたどる（直接工事費は除く）
    const relativePath = newEntryPath.slice(1);
    for (const key of relativePath) {
      if (!current[key]) current[key] = {};
      current = current[key];
    }
    current[newEntryName.trim()] = {};

    setCustomMaster(newCustom);
    setMergedMaster(deepMerge(JSON.parse(JSON.stringify(CONSTRUCTION_HIERARCHY)), newCustom));
    setNewEntryPath(null);
    setNewEntryName('');
    setHasChanges(true);
  };

  const handleDeleteEntry = (path: string[], isDefault: boolean) => {
    if (!confirm(txt.deleteConfirm)) return;

    const pathStr = path.join('/');

    if (isDefault) {
      // デフォルトエントリーは削除済みリストに追加
      const newDeletedPaths = [...deletedPaths, pathStr];
      setDeletedPaths(newDeletedPaths);

      // マージされたマスタを更新
      const merged = deepMerge(JSON.parse(JSON.stringify(CONSTRUCTION_HIERARCHY)), customMaster);
      for (const dp of newDeletedPaths) {
        deleteAtPath(merged, dp.split('/'));
      }
      setMergedMaster(merged);
    } else {
      // カスタムエントリーはcustomMasterから削除
      const newCustom = JSON.parse(JSON.stringify(customMaster));
      const relativePath = path.slice(1);

      if (relativePath.length === 0) return;

      let current = newCustom;
      for (let i = 0; i < relativePath.length - 1; i++) {
        if (!current[relativePath[i]]) return;
        current = current[relativePath[i]];
      }

      delete current[relativePath[relativePath.length - 1]];

      // 空のオブジェクトを親から削除
      cleanEmptyObjects(newCustom);

      setCustomMaster(newCustom);

      // マージされたマスタを更新
      const merged = deepMerge(JSON.parse(JSON.stringify(CONSTRUCTION_HIERARCHY)), newCustom);
      for (const dp of deletedPaths) {
        deleteAtPath(merged, dp.split('/'));
      }
      setMergedMaster(merged);
    }

    setHasChanges(true);
  };

  // エントリ名の編集開始
  const handleStartEdit = (pathStr: string, currentName: string) => {
    setEditingEntry(pathStr);
    setEditingName(currentName);
  };

  // エントリ名の編集確定
  const handleConfirmEdit = (path: string[], isDefault: boolean) => {
    if (!editingName.trim() || editingName === path[path.length - 1]) {
      setEditingEntry(null);
      setEditingName('');
      return;
    }

    const newCustom = JSON.parse(JSON.stringify(customMaster));
    const relativePath = path.slice(1);
    const newKey = editingName.trim();
    let newDeletedPaths = [...deletedPaths];

    if (relativePath.length === 0) {
      setEditingEntry(null);
      return;
    }

    if (isDefault) {
      // デフォルトエントリーの編集：元のパスを削除済みにし、新しい名前でカスタムエントリーを作成
      const oldPathStr = path.join('/');
      newDeletedPaths = [...deletedPaths, oldPathStr];
      setDeletedPaths(newDeletedPaths);

      // 親パスをたどってカスタムエントリーを作成
      let current = newCustom;
      const parentPath = relativePath.slice(0, -1);
      for (const key of parentPath) {
        if (!current[key]) current[key] = {};
        current = current[key];
      }

      // デフォルトから子要素を取得してコピー
      let defaultCurrent = CONSTRUCTION_HIERARCHY["直接工事費"];
      for (const key of relativePath) {
        if (defaultCurrent && defaultCurrent[key]) {
          defaultCurrent = defaultCurrent[key];
        } else {
          defaultCurrent = {};
          break;
        }
      }
      current[newKey] = JSON.parse(JSON.stringify(defaultCurrent || {}));
    } else {
      // カスタムエントリーの編集
      let current = newCustom;
      for (let i = 0; i < relativePath.length - 1; i++) {
        if (!current[relativePath[i]]) {
          setEditingEntry(null);
          return;
        }
        current = current[relativePath[i]];
      }

      const oldKey = relativePath[relativePath.length - 1];

      // 名前変更（古いキーの値を新しいキーにコピーして古いキーを削除）
      if (current[oldKey] !== undefined) {
        current[newKey] = current[oldKey];
        delete current[oldKey];
      }
    }

    setCustomMaster(newCustom);

    // マージされたマスタを更新
    const merged = deepMerge(JSON.parse(JSON.stringify(CONSTRUCTION_HIERARCHY)), newCustom);
    for (const dp of newDeletedPaths) {
      deleteAtPath(merged, dp.split('/'));
    }
    setMergedMaster(merged);

    setHasChanges(true);
    setEditingEntry(null);
    setEditingName('');
  };

  // 空のオブジェクトを再帰的に削除
  const cleanEmptyObjects = (obj: any): boolean => {
    if (!obj || typeof obj !== 'object') return false;

    for (const key in obj) {
      if (cleanEmptyObjects(obj[key])) {
        delete obj[key];
      }
    }

    return Object.keys(obj).length === 0;
  };

  const handleSave = () => {
    saveCustomMaster(customMaster);
    saveDeletedPaths(deletedPaths);
    setHasChanges(false);
  };

  const handleReset = () => {
    if (confirm(txt.confirmReset)) {
      setCustomMaster({});
      setDeletedPaths([]);
      saveCustomMaster({});
      saveDeletedPaths([]);
      setMergedMaster(JSON.parse(JSON.stringify(CONSTRUCTION_HIERARCHY)));
      setHasChanges(false);
    }
  };

  const handleExport = () => {
    const data = JSON.stringify(customMaster, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `master_custom_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        const merged = deepMerge(JSON.parse(JSON.stringify(customMaster)), data);
        setCustomMaster(merged);
        setMergedMaster(deepMerge(JSON.parse(JSON.stringify(CONSTRUCTION_HIERARCHY)), merged));
        setHasChanges(true);
        alert(lang === 'ja' ? 'インポートしました' : 'Imported successfully');
      } catch (err) {
        alert(lang === 'ja' ? 'JSONファイルの読み込みに失敗しました' : 'Failed to parse JSON file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleApplyTemplate = (templateKey: keyof typeof TEMPLATES) => {
    const template = TEMPLATES[templateKey];
    const merged = deepMerge(JSON.parse(JSON.stringify(customMaster)), template.data);
    setCustomMaster(merged);
    setMergedMaster(deepMerge(JSON.parse(JSON.stringify(CONSTRUCTION_HIERARCHY)), merged));
    setHasChanges(true);
  };

  const handleCopyToClipboard = () => {
    const data = JSON.stringify(customMaster, null, 2);
    navigator.clipboard.writeText(data);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filterTree = (nodes: TreeNode[], term: string): TreeNode[] => {
    if (!term) return nodes;

    return nodes.reduce<TreeNode[]>((acc, node) => {
      const matchesSearch = node.key.toLowerCase().includes(term.toLowerCase());
      const filteredChildren = filterTree(node.children, term);

      if (matchesSearch || filteredChildren.length > 0) {
        acc.push({
          ...node,
          children: matchesSearch ? node.children : filteredChildren
        });
      }
      return acc;
    }, []);
  };

  const renderTree = (nodes: TreeNode[], depth: number = 0) => {
    const filteredNodes = filterTree(nodes, searchTerm);

    if (filteredNodes.length === 0 && searchTerm) {
      return <div className="text-gray-400 text-sm py-2 pl-4">{txt.noResults}</div>;
    }

    return filteredNodes.map(node => {
      const pathStr = node.path.join('/');
      const isExpanded = expandedPaths.has(pathStr);
      const hasChildren = node.children.length > 0;
      const isAddingHere = newEntryPath && newEntryPath.join('/') === pathStr;

      // 深さに応じた色
      const depthColors = [
        'border-l-blue-400',
        'border-l-green-400',
        'border-l-amber-400',
        'border-l-purple-400',
        'border-l-pink-400'
      ];

      return (
        <div key={pathStr} className="select-none">
          <div
            className={`flex items-center gap-1 py-1.5 px-2 hover:bg-gray-100 rounded group cursor-pointer border-l-2 ${
              depthColors[Math.min(depth, depthColors.length - 1)]
            } ${node.isCustom && !node.isDefault ? 'bg-green-50' : ''}`}
            style={{ marginLeft: `${depth * 16}px` }}
          >
            {/* 展開/折りたたみボタン */}
            <button
              onClick={() => toggleExpand(pathStr)}
              className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600"
            >
              {hasChildren ? (
                isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
              ) : (
                <span className="w-4" />
              )}
            </button>

            {/* ノード名（編集モード対応） */}
            {editingEntry === pathStr ? (
              <div className="flex-1 flex items-center gap-1">
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmEdit(node.path, !!node.isDefault);
                    if (e.key === 'Escape') { setEditingEntry(null); setEditingName(''); }
                  }}
                  className="flex-1 px-2 py-0.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  onClick={(e) => { e.stopPropagation(); handleConfirmEdit(node.path, !!node.isDefault); }}
                  className="p-0.5 text-green-600 hover:bg-green-100 rounded"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingEntry(null); setEditingName(''); }}
                  className="p-0.5 text-gray-500 hover:bg-gray-200 rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <span
                className={`flex-1 text-sm font-medium ${node.key === '' ? 'text-gray-400 italic' : 'text-gray-700'}`}
                onClick={() => hasChildren && toggleExpand(pathStr)}
              >
                {node.key || '(空白)'}
              </span>
            )}

            {/* ラベル */}
            {node.isCustom && !node.isDefault && editingEntry !== pathStr && (
              <span className="text-[10px] bg-green-500 text-white px-1.5 py-0.5 rounded font-medium">
                {txt.customLabel}
              </span>
            )}

            {/* アクションボタン */}
            {editingEntry !== pathStr && (
              <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                <button
                  onClick={() => handleAddEntry(node.path)}
                  className="p-1 text-blue-500 hover:bg-blue-100 rounded"
                  title={txt.addEntry}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleStartEdit(pathStr, node.key)}
                  className="p-1 text-amber-500 hover:bg-amber-100 rounded"
                  title="Edit"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDeleteEntry(node.path, !!node.isDefault)}
                  className="p-1 text-red-500 hover:bg-red-100 rounded"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* 新規エントリー入力 */}
          {isAddingHere && (
            <div
              className="flex items-center gap-2 py-2 px-3 bg-blue-50 rounded-lg mx-2 my-1 border border-blue-200"
              style={{ marginLeft: `${(depth + 1) * 16}px` }}
            >
              <input
                type="text"
                value={newEntryName}
                onChange={(e) => setNewEntryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmAddEntry();
                  if (e.key === 'Escape') setNewEntryPath(null);
                }}
                placeholder={txt.placeholder}
                className="flex-1 px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <button
                onClick={confirmAddEntry}
                disabled={!newEntryName.trim()}
                className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1"
              >
                <Check className="w-4 h-4" />
                OK
              </button>
              <button
                onClick={() => setNewEntryPath(null)}
                className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* 子ノード */}
          {isExpanded && hasChildren && (
            <div>{renderTree(node.children, depth + 1)}</div>
          )}
        </div>
      );
    });
  };

  const tree = buildTree(mergedMaster["直接工事費"], ['直接工事費'], customPaths, defaultPaths);

  const renderTemplates = () => {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          {lang === 'ja'
            ? 'テンプレートを適用すると、対応するエントリーがカスタムマスタに追加されます。'
            : 'Applying a template will add corresponding entries to your custom master.'}
        </p>
        {Object.entries(TEMPLATES).map(([key, template]) => (
          <div
            key={key}
            className="p-4 border rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-gray-800">{template.name}</h4>
                <p className="text-sm text-gray-500 mt-1">{template.description}</p>
              </div>
              <button
                onClick={() => handleApplyTemplate(key as keyof typeof TEMPLATES)}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {txt.applyTemplate}
              </button>
            </div>
            {Object.keys(template.data).length > 0 && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs text-gray-400 mb-2">
                  {lang === 'ja' ? '含まれるエントリー:' : 'Includes:'}
                </p>
                <div className="text-xs text-gray-600 font-mono bg-gray-100 p-2 rounded max-h-32 overflow-auto">
                  <pre>{JSON.stringify(template.data, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-700 to-slate-800 text-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            title="戻る"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <FolderTree className="w-5 h-5" />
          <h3 className="text-lg font-bold">{txt.title}</h3>
          {hasChanges && (
            <span className="flex items-center gap-1 text-amber-400 text-xs bg-amber-900/30 px-2 py-0.5 rounded">
              <AlertTriangle className="w-3 h-3" />
              {txt.unsavedWarning}
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

      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">

        {/* Tabs */}
        <div className="flex border-b bg-gray-50">
          <button
            onClick={() => setActiveTab('tree')}
            className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'tree'
                ? 'bg-white border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <FolderTree className="w-4 h-4" />
            {txt.tabTree}
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'templates'
                ? 'bg-white border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileJson className="w-4 h-4" />
            {txt.tabTemplates}
          </button>
        </div>

        {/* Search (only for tree tab) */}
        {activeTab === 'tree' && (
          <div className="px-6 py-3 border-b bg-gray-50">
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
            <p className="text-xs text-gray-400 mt-2">{txt.pathHint}</p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {activeTab === 'tree' && renderTree(tree)}
          {activeTab === 'templates' && renderTemplates()}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap gap-2 px-4 py-3 border-t bg-white">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm"
            title={txt.exportBtn}
          >
            <Download className="w-4 h-4" />
            {txt.exportBtn}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm"
            title={txt.importBtn}
          >
            <Upload className="w-4 h-4" />
            {txt.importBtn}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
          <button
            onClick={handleCopyToClipboard}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              copied ? 'bg-green-500 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
            title="Copy"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>

          <div className="flex-1" />

          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            {txt.reset}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MasterEditorModal;
