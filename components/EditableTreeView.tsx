import React from 'react';
import { Check, Trash2, Edit2, X, Plus } from 'lucide-react';
import { CustomizationData } from '../utils/masterEditorStorage';
import { useTreeEditing } from '../hooks/useTreeEditing';

// --- Grouped interfaces ---

/** Callback handlers for tree operations */
interface TreeHandlers {
  onDelete: (path: string, key: string, deletedValue: any) => void;
  onRename: (path: string, oldKey: string, newKey: string) => void;
  onAdd: (path: string, key: string, value: any) => void;
}

export interface EditableTreeViewProps {
  data: any;
  path: string;
  customization: CustomizationData;
  handlers: TreeHandlers;
  depth?: number;
}

// Legacy props for backwards compatibility
export interface EditableTreeViewPropsLegacy {
  data: any;
  path: string;
  customization: CustomizationData;
  onDelete: (path: string, key: string, deletedValue: any) => void;
  onRename: (path: string, oldKey: string, newKey: string) => void;
  onAdd: (path: string, key: string, value: any) => void;
  depth?: number;
}

// --- Atomic Sub-components ---

const EditInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}> = ({ value, onChange, onSave, onCancel }) => (
  <div className="flex-1 flex items-center gap-1">
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSave();
        if (e.key === 'Escape') onCancel();
      }}
      className="flex-1 px-2 py-0.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
      autoFocus
    />
    <button onClick={onSave} className="p-1 text-green-600 hover:bg-green-100 rounded"><Check className="w-3 h-3" /></button>
    <button onClick={onCancel} className="p-1 text-gray-600 hover:bg-gray-200 rounded"><X className="w-3 h-3" /></button>
  </div>
);

const TreeItemActions: React.FC<{
  onEdit: () => void;
  onDelete: () => void;
  onAdd?: () => void;
}> = ({ onEdit, onDelete, onAdd }) => (
  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
    <button onClick={onEdit} className="p-1 text-blue-600 hover:bg-blue-100 rounded" title="名前を変更"><Edit2 className="w-3 h-3" /></button>
    <button onClick={onDelete} className="p-1 text-red-600 hover:bg-red-100 rounded" title="削除"><Trash2 className="w-3 h-3" /></button>
    {onAdd && <button onClick={onAdd} className="p-1 text-green-600 hover:bg-green-100 rounded" title="子項目を追加"><Plus className="w-3 h-3" /></button>}
  </div>
);

const TreeItemLabel: React.FC<{ displayName: string; originalKey: string; isAdded: boolean }> = ({ displayName, originalKey, isAdded }) => (
  <div className={`flex-1 ${isAdded ? 'text-green-600' : 'text-gray-700'}`}>
    {displayName}
    {displayName !== originalKey && <span className="text-xs text-gray-400 ml-1">(変更済)</span>}
  </div>
);

const AddEntryForm: React.FC<{
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  onCancel: () => void;
}> = ({ value, onChange, onAdd, onCancel }) => (
  <div className="ml-8 flex items-center gap-1 py-1">
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') onAdd(); if (e.key === 'Escape') onCancel(); }}
      placeholder="新しい項目名..."
      className="flex-1 px-2 py-0.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
      autoFocus
    />
    <button onClick={onAdd} className="p-1 text-green-600 hover:bg-green-100 rounded"><Check className="w-3 h-3" /></button>
    <button onClick={onCancel} className="p-1 text-gray-600 hover:bg-gray-200 rounded"><X className="w-3 h-3" /></button>
  </div>
);

// --- TreeItem Component (extracted to reduce JSX depth) ---

interface TreeItemProps {
  itemKey: string;
  fullPath: string;
  displayName: string;
  childData: any;
  isAdded: boolean;
  isLastItem: boolean;
  isEditing: boolean;
  editValue: string;
  addingTo: string | null;
  newEntryName: string;
  customization: CustomizationData;
  handlers: TreeHandlers;
  depth: number;
  onEditValueChange: (value: string) => void;
  onNewEntryNameChange: (value: string) => void;
  onStartEdit: (key: string) => void;
  onSaveEdit: (key: string) => void;
  onCancelEdit: () => void;
  onStartAdding: (path: string) => void;
  onAddEntry: () => void;
  onCancelAdding: () => void;
}

const TreeItem: React.FC<TreeItemProps> = ({
  itemKey, fullPath, displayName, childData, isAdded, isLastItem, isEditing,
  editValue, addingTo, newEntryName, customization, handlers, depth,
  onEditValueChange, onNewEntryNameChange, onStartEdit, onSaveEdit, onCancelEdit,
  onStartAdding, onAddEntry, onCancelAdding
}) => {
  const hasChildren = childData && typeof childData === 'object';

  return (
    <div className="group">
      <div className="flex items-center gap-1 py-1 hover:bg-gray-100 rounded px-1">
        <div className="flex-shrink-0 w-4 text-gray-300">{isLastItem ? '└' : '├'}</div>
        {isEditing ? (
          <EditInput value={editValue} onChange={onEditValueChange} onSave={() => onSaveEdit(itemKey)} onCancel={onCancelEdit} />
        ) : (
          <>
            <TreeItemLabel displayName={displayName} originalKey={itemKey} isAdded={isAdded} />
            <TreeItemActions
              onEdit={() => onStartEdit(itemKey)}
              onDelete={() => handlers.onDelete(fullPath, itemKey, childData)}
              onAdd={hasChildren ? () => onStartAdding(fullPath) : undefined}
            />
          </>
        )}
      </div>
      {addingTo === fullPath && (
        <AddEntryForm value={newEntryName} onChange={onNewEntryNameChange} onAdd={onAddEntry} onCancel={onCancelAdding} />
      )}
      {hasChildren && !isAdded && (
        <div className="ml-5 border-l border-gray-200 pl-1">
          <EditableTreeViewCore data={childData} path={fullPath} customization={customization} handlers={handlers} depth={depth + 1} />
        </div>
      )}
    </div>
  );
};

// --- Core Component ---

const EditableTreeViewCore: React.FC<EditableTreeViewProps> = ({ data, path, customization, handlers, depth = 0 }) => {
  const { state, setters, actions } = useTreeEditing(
    path,
    customization,
    (p, newName) => handlers.onRename(p, state.editingKey || '', newName),
    (p, name) => handlers.onAdd(p, name, null)
  );

  if (!data || typeof data !== 'object') return null;

  const keys = Object.keys(data).filter(k => k !== 'aliases');
  const visibleKeys = keys.filter(key => {
    const fullPath = path ? `${path}/${key}` : key;
    return !customization.deletedPaths.includes(fullPath);
  });
  const addedKeys = customization.addedEntries.filter(e => e.parentPath === path).map(e => e.name);
  const allKeys = [...visibleKeys, ...addedKeys];

  if (allKeys.length === 0) return null;

  return (
    <div className="text-sm">
      {allKeys.map((key, idx) => {
        const fullPath = path ? `${path}/${key}` : key;
        return (
          <TreeItem
            key={key}
            itemKey={key}
            fullPath={fullPath}
            displayName={customization.renamedPaths[fullPath] || key}
            childData={data[key]}
            isAdded={addedKeys.includes(key)}
            isLastItem={idx === allKeys.length - 1}
            isEditing={state.editingKey === key}
            editValue={state.editValue}
            addingTo={state.addingTo}
            newEntryName={state.newEntryName}
            customization={customization}
            handlers={handlers}
            depth={depth}
            onEditValueChange={setters.setEditValue}
            onNewEntryNameChange={setters.setNewEntryName}
            onStartEdit={actions.startEdit}
            onSaveEdit={actions.saveEdit}
            onCancelEdit={actions.cancelEdit}
            onStartAdding={actions.startAdding}
            onAddEntry={actions.handleAddEntry}
            onCancelAdding={actions.cancelAdding}
          />
        );
      })}
    </div>
  );
};

// --- Public Component ---

export const EditableTreeView: React.FC<EditableTreeViewPropsLegacy> = ({
  data, path, customization, onDelete, onRename, onAdd, depth = 0
}) => (
  <EditableTreeViewCore
    data={data}
    path={path}
    customization={customization}
    handlers={{ onDelete, onRename, onAdd }}
    depth={depth}
  />
);
