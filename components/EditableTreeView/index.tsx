import React, { useState } from 'react';
import { CustomizationData } from '../../utils/masterEditorStorage';
import { InlineEditForm } from './InlineEditForm';
import { TreeNodeActions } from './TreeNodeActions';

export interface EditableTreeViewProps {
  data: Record<string, unknown>;
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
    const fullPath = path ? `${path}/${key}` : key;
    const displayName = customization.renamedPaths[fullPath] || key;
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

  const startAdd = (fullPath: string) => {
    setAddingTo(fullPath);
    setNewEntryName('');
  };

  return (
    <div className="text-sm">
      {allKeys.map((key, idx) => {
        const fullPath = path ? `${path}/${key}` : key;
        const displayName = customization.renamedPaths[fullPath] || key;
        const isEditing = editingKey === key;
        const childData = data[key];
        const isAdded = addedKeys.includes(key);
        const hasChildren = childData && typeof childData === 'object';
        const isLast = idx === allKeys.length - 1;

        return (
          <div key={key} className="group">
            <div className="flex items-center gap-1 py-1 hover:bg-gray-100 rounded px-1">
              <div className="flex-shrink-0 w-4 text-gray-300">
                {isLast ? '└' : '├'}
              </div>

              {isEditing ? (
                <InlineEditForm
                  value={editValue}
                  onChange={setEditValue}
                  onSave={() => saveEdit(key)}
                  onCancel={() => setEditingKey(null)}
                />
              ) : (
                <>
                  <div className={`flex-1 ${isAdded ? 'text-green-600' : 'text-gray-700'}`}>
                    {displayName}
                    {displayName !== key && (
                      <span className="text-xs text-gray-400 ml-1">(変更済)</span>
                    )}
                  </div>
                  <TreeNodeActions
                    onEdit={() => startEdit(key)}
                    onDelete={() => onDelete(fullPath)}
                    onAdd={() => startAdd(fullPath)}
                    showAddButton={!!hasChildren}
                  />
                </>
              )}
            </div>

            {/* 子項目追加フォーム */}
            {addingTo === fullPath && (
              <div className="ml-8 flex items-center gap-1 py-1">
                <InlineEditForm
                  value={newEntryName}
                  onChange={setNewEntryName}
                  onSave={handleAddEntry}
                  onCancel={() => setAddingTo(null)}
                  placeholder="新しい項目名..."
                />
              </div>
            )}

            {/* 子要素 */}
            {hasChildren && !isAdded && (
              <div className="ml-5 border-l border-gray-200 pl-1">
                <EditableTreeView
                  data={childData as Record<string, unknown>}
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
