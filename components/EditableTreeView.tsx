import React from 'react';
import { Check, Trash2, Edit2, X, Plus } from 'lucide-react';
import { CustomizationData } from '../utils/masterEditorStorage';
import { useTreeViewEdit } from '../hooks/useTreeViewEdit';

export interface EditableTreeViewProps {
  data: any;
  path: string;
  customization: CustomizationData;
  onDelete: (path: string) => void;
  onRename: (path: string, newName: string) => void;
  onAdd: (parentPath: string, name: string) => void;
  depth?: number;
}

export const EditableTreeView: React.FC<EditableTreeViewProps> = ({
  data,
  path,
  customization,
  onDelete,
  onRename,
  onAdd,
  depth = 0
}) => {
  const {
    editingKey,
    editValue,
    addingTo,
    newEntryName,
    setNewEntryName,
    startEdit,
    setEditValueDirect,
    saveEdit,
    cancelEdit,
    startAdding,
    handleAddEntry,
    cancelAdding,
  } = useTreeViewEdit();

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
                    onChange={(e) => setEditValueDirect(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit(key, path, onRename);
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    className="flex-1 px-2 py-0.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                  <button
                    onClick={() => saveEdit(key, path, onRename)}
                    className="p-1 text-green-600 hover:bg-green-100 rounded"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button
                    onClick={cancelEdit}
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
                      onClick={() => startEdit(key, displayName)}
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
                        onClick={() => startAdding(fullPath)}
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
                    if (e.key === 'Enter') handleAddEntry(path, onAdd);
                    if (e.key === 'Escape') cancelAdding();
                  }}
                  placeholder="新しい項目名..."
                  className="flex-1 px-2 py-0.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoFocus
                />
                <button
                  onClick={() => handleAddEntry(path, onAdd)}
                  className="p-1 text-green-600 hover:bg-green-100 rounded"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  onClick={cancelAdding}
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
