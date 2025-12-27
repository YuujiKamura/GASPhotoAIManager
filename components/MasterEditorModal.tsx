import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronDown, Plus, Trash2, Save, RotateCcw, Search, AlertTriangle } from 'lucide-react';
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
}

const CUSTOM_MASTER_KEY = 'construction_custom_master';

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

// 階層をツリー構造に変換
const buildTree = (obj: any, path: string[] = [], customPaths: Set<string>): TreeNode[] => {
  if (!obj || typeof obj !== 'object') return [];

  return Object.keys(obj).map(key => {
    const currentPath = [...path, key];
    const pathStr = currentPath.join('/');
    return {
      key,
      path: currentPath,
      children: buildTree(obj[key], currentPath, customPaths),
      isCustom: customPaths.has(pathStr)
    };
  });
};

// マージしたマスタを取得
export const getMergedMaster = (): any => {
  const custom = loadCustomMaster();
  return deepMerge(JSON.parse(JSON.stringify(CONSTRUCTION_HIERARCHY)), custom);
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

const MasterEditorModal: React.FC<Props> = ({ onClose, lang }) => {
  const [customMaster, setCustomMaster] = useState<Record<string, any>>({});
  const [mergedMaster, setMergedMaster] = useState<any>({});
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['直接工事費']));
  const [searchTerm, setSearchTerm] = useState('');
  const [newEntryPath, setNewEntryPath] = useState<string[] | null>(null);
  const [newEntryName, setNewEntryName] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  const txt = {
    title: lang === 'ja' ? 'マスタデータ管理' : 'Master Data Management',
    search: lang === 'ja' ? '検索...' : 'Search...',
    addEntry: lang === 'ja' ? '追加' : 'Add',
    save: lang === 'ja' ? '保存' : 'Save',
    reset: lang === 'ja' ? 'リセット' : 'Reset',
    close: lang === 'ja' ? '閉じる' : 'Close',
    customLabel: lang === 'ja' ? 'カスタム' : 'Custom',
    confirmReset: lang === 'ja' ? 'カスタム追加分をすべて削除しますか？' : 'Delete all custom entries?',
    placeholder: lang === 'ja' ? '新しいエントリー名' : 'New entry name',
    noResults: lang === 'ja' ? '該当なし' : 'No results',
    unsavedWarning: lang === 'ja' ? '保存されていない変更があります' : 'Unsaved changes'
  };

  useEffect(() => {
    const custom = loadCustomMaster();
    setCustomMaster(custom);
    setMergedMaster(getMergedMaster());
  }, []);

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
  };

  const confirmAddEntry = () => {
    if (!newEntryPath || !newEntryName.trim()) return;

    const newCustom = { ...customMaster };
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

  const handleDeleteCustomEntry = (path: string[]) => {
    const newCustom = { ...customMaster };
    const relativePath = path.slice(1);

    if (relativePath.length === 0) return;

    let current = newCustom;
    for (let i = 0; i < relativePath.length - 1; i++) {
      if (!current[relativePath[i]]) return;
      current = current[relativePath[i]];
    }

    delete current[relativePath[relativePath.length - 1]];

    setCustomMaster(newCustom);
    setMergedMaster(deepMerge(JSON.parse(JSON.stringify(CONSTRUCTION_HIERARCHY)), newCustom));
    setHasChanges(true);
  };

  const handleSave = () => {
    saveCustomMaster(customMaster);
    setHasChanges(false);
  };

  const handleReset = () => {
    if (confirm(txt.confirmReset)) {
      setCustomMaster({});
      saveCustomMaster({});
      setMergedMaster(JSON.parse(JSON.stringify(CONSTRUCTION_HIERARCHY)));
      setHasChanges(false);
    }
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

      return (
        <div key={pathStr} className="select-none">
          <div
            className={`flex items-center gap-1 py-1 px-2 hover:bg-gray-100 rounded group cursor-pointer ${
              node.isCustom ? 'bg-green-50' : ''
            }`}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
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

            {/* ノード名 */}
            <span
              className={`flex-1 text-sm ${node.key === '' ? 'text-gray-400 italic' : ''}`}
              onClick={() => hasChildren && toggleExpand(pathStr)}
            >
              {node.key || '(空白)'}
            </span>

            {/* カスタムラベル */}
            {node.isCustom && (
              <span className="text-[10px] bg-green-500 text-white px-1.5 py-0.5 rounded">
                {txt.customLabel}
              </span>
            )}

            {/* アクションボタン */}
            <div className="opacity-0 group-hover:opacity-100 flex gap-1">
              <button
                onClick={() => handleAddEntry(node.path)}
                className="p-1 text-blue-500 hover:bg-blue-100 rounded"
                title={txt.addEntry}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              {node.isCustom && (
                <button
                  onClick={() => handleDeleteCustomEntry(node.path)}
                  className="p-1 text-red-500 hover:bg-red-100 rounded"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* 新規エントリー入力 */}
          {isAddingHere && (
            <div
              className="flex items-center gap-2 py-1 px-2 bg-blue-50 rounded mx-2 my-1"
              style={{ marginLeft: `${depth * 16 + 24}px` }}
            >
              <input
                type="text"
                value={newEntryName}
                onChange={(e) => setNewEntryName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmAddEntry()}
                placeholder={txt.placeholder}
                className="flex-1 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <button
                onClick={confirmAddEntry}
                disabled={!newEntryName.trim()}
                className="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 disabled:opacity-50"
              >
                OK
              </button>
              <button
                onClick={() => setNewEntryPath(null)}
                className="px-2 py-1 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400"
              >
                Cancel
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

  const tree = buildTree(mergedMaster["直接工事費"], ['直接工事費'], customPaths);

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-bold text-gray-800">{txt.title}</h3>
            {hasChanges && (
              <span className="flex items-center gap-1 text-amber-600 text-sm">
                <AlertTriangle className="w-4 h-4" />
                {txt.unsavedWarning}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b">
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
        </div>

        {/* Tree View */}
        <div className="flex-1 overflow-auto px-4 py-2">
          <div className="text-xs text-gray-500 mb-2 px-2">
            直接工事費 / カテゴリ / 工種 / 種別 / 細別 / 備考
          </div>
          {renderTree(tree)}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t bg-gray-50">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg"
          >
            <RotateCcw className="w-4 h-4" />
            {txt.reset}
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg"
          >
            {txt.close}
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              hasChanges
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Save className="w-4 h-4" />
            {txt.save}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MasterEditorModal;
