import React from 'react';
import { Edit2, Trash2, Plus } from 'lucide-react';

interface TreeNodeActionsProps {
  onEdit: () => void;
  onDelete: () => void;
  onAdd?: () => void;
  showAddButton: boolean;
}

export const TreeNodeActions: React.FC<TreeNodeActionsProps> = ({
  onEdit,
  onDelete,
  onAdd,
  showAddButton,
}) => (
  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
    <button
      onClick={onEdit}
      className="p-1 text-blue-600 hover:bg-blue-100 rounded"
      title="名前を変更"
    >
      <Edit2 className="w-3 h-3" />
    </button>
    <button
      onClick={onDelete}
      className="p-1 text-red-600 hover:bg-red-100 rounded"
      title="削除"
    >
      <Trash2 className="w-3 h-3" />
    </button>
    {showAddButton && onAdd && (
      <button
        onClick={onAdd}
        className="p-1 text-green-600 hover:bg-green-100 rounded"
        title="子項目を追加"
      >
        <Plus className="w-3 h-3" />
      </button>
    )}
  </div>
);
