import React from 'react';
import { Check, Trash2, Edit2, X, Plus } from 'lucide-react';
import { CustomizationData } from '../utils/masterEditorStorage';
import { useTreeEditing } from '../hooks/useTreeEditing';

// Grouped tree actions for cleaner interface
export interface TreeActions {
  onDelete: (path: string) => void;
  onRename: (path: string, newName: string) => void;
  onAdd: (parentPath: string, name: string) => void;
}

// Legacy props for backwards compatibility
export interface EditableTreeViewProps {
  data: any;
  path: string;
  customization: CustomizationData;
  onDelete: (path: string, key: string, deletedValue: any) => void;
  onRename: (path: string, oldKey: string, newKey: string) => void;
  onAdd: (path: string, key: string, value: any) => void;
  depth?: number;
}

// --- Sub-components ---

interface EditInputProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

const EditInput: React.FC<EditInputProps> = ({ value, onChange, onSave, onCancel }) => (
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
    <button onClick={onSave} className="p-1 text-green-600 hover:bg-green-100 rounded">
      <Check className="w-3 h-3" />
    </button>
    <button onClick={onCancel} className="p-1 text-gray-600 hover:bg-gray-200 rounded">
      <X className="w-3 h-3" />
    </button>
  </div>
);

interface TreeItemActionsProps {
  onEdit: () => void;
  onDelete: () => void;
  onAdd?: () => void;
  hasChildren: boolean;
}

const TreeItemActions: React.FC<TreeItemActionsProps> = ({ onEdit, onDelete, onAdd, hasChildren }) => (
  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
    <button onClick={onEdit} className="p-1 text-blue-600 hover:bg-blue-100 rounded" title="名前を変更">
      <Edit2 className="w-3 h-3" />
    </button>
    <button onClick={onDelete} className="p-1 text-red-600 hover:bg-red-100 rounded" title="削除">
      <Trash2 className="w-3 h-3" />
    </button>
    {hasChildren && onAdd && (
      <button onClick={onAdd} className="p-1 text-green-600 hover:bg-green-100 rounded" title="子項目を追加">
        <Plus className="w-3 h-3" />
      </button>
    )}
  </div>
);

interface TreeItemLabelProps {
  displayName: string;
  originalKey: string;
  isAdded: boolean;
}

const TreeItemLabel: React.FC<TreeItemLabelProps> = ({ displayName, originalKey, isAdded }) => (
  <div className={`flex-1 ${isAdded ? 'text-green-600' : 'text-gray-700'}`}>
    {displayName}
    {displayName !== originalKey && (
      <span className="text-xs text-gray-400 ml-1">(変更済)</span>
    )}
  </div>
);

interface AddEntryFormProps {
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  onCancel: () => void;
}

const AddEntryForm: React.FC<AddEntryFormProps> = ({ value, onChange, onAdd, onCancel }) => (
  <div className="ml-8 flex items-center gap-1 py-1">
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onAdd();
        if (e.key === 'Escape') onCancel();
      }}
      placeholder="新しい項目名..."
      className="flex-1 px-2 py-0.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
      autoFocus
    />
    <button onClick={onAdd} className="p-1 text-green-600 hover:bg-green-100 rounded">
      <Check className="w-3 h-3" />
    </button>
    <button onClick={onCancel} className="p-1 text-gray-600 hover:bg-gray-200 rounded">
      <X className="w-3 h-3" />
    </button>
  </div>
);

// --- Internal Component ---

interface InternalProps {
  data: any;
  path: string;
  customization: CustomizationData;
  onDelete: (path: string, key: string, deletedValue: any) => void;
  onRename: (path: string, oldKey: string, newKey: string) => void;
  onAdd: (path: string, key: string, value: any) => void;
  depth?: number;
}

const EditableTreeViewInner: React.FC<InternalProps> = ({
  data,
  path,
  customization,
  onDelete,
  onRename,
  onAdd,
  depth = 0
}) => {
  const { state, setters, actions } = useTreeEditing(
    path,
    customization,
    (p, newName) => onRename(p, state.editingKey || '', newName),
    (p, name) => onAdd(p, name, null)
  );

  if (!data || typeof data !== 'object') return null;

  const keys = Object.keys(data).filter(k => k !== 'aliases');

  const visibleKeys = keys.filter(key => {
    const fullPath = path ? `${path}/${key}` : key;
    return !customization.deletedPaths.includes(fullPath);
  });

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
        const isEditing = state.editingKey === key;
        const childData = data[key];
        const isAdded = addedKeys.includes(key);
        const isLastItem = idx === allKeys.length - 1;
        const hasChildren = childData && typeof childData === 'object';

        return (
          <div key={key} className="group">
            <div className="flex items-center gap-1 py-1 hover:bg-gray-100 rounded px-1">
              <div className="flex-shrink-0 w-4 text-gray-300">
                {isLastItem ? '└' : '├'}
              </div>
              {isEditing ? (
                <EditInput
                  value={state.editValue}
                  onChange={setters.setEditValue}
                  onSave={() => actions.saveEdit(key)}
                  onCancel={actions.cancelEdit}
                />
              ) : (
                <>
                  <TreeItemLabel displayName={displayName} originalKey={key} isAdded={isAdded} />
                  <TreeItemActions
                    onEdit={() => actions.startEdit(key)}
                    onDelete={() => onDelete(fullPath, key, childData)}
                    onAdd={hasChildren ? () => actions.startAdding(fullPath) : undefined}
                    hasChildren={!!hasChildren}
                  />
                </>
              )}
            </div>
            {state.addingTo === fullPath && (
              <AddEntryForm
                value={state.newEntryName}
                onChange={setters.setNewEntryName}
                onAdd={actions.handleAddEntry}
                onCancel={actions.cancelAdding}
              />
            )}
            {hasChildren && !isAdded && (
              <div className="ml-5 border-l border-gray-200 pl-1">
                <EditableTreeViewInner
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

// --- Public Component ---

export const EditableTreeView: React.FC<EditableTreeViewProps> = ({
  data, path, customization, onDelete, onRename, onAdd, depth = 0
}) => (
  <EditableTreeViewInner
    data={data}
    path={path}
    customization={customization}
    onDelete={onDelete}
    onRename={onRename}
    onAdd={onAdd}
    depth={depth}
  />
);
