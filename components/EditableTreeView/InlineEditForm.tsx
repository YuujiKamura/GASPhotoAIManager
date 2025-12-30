import React from 'react';
import { Check, X } from 'lucide-react';

interface InlineEditFormProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  placeholder?: string;
}

export const InlineEditForm: React.FC<InlineEditFormProps> = ({
  value,
  onChange,
  onSave,
  onCancel,
  placeholder = '',
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSave();
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className="flex-1 flex items-center gap-1">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="flex-1 px-2 py-0.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        autoFocus
      />
      <button
        onClick={onSave}
        className="p-1 text-green-600 hover:bg-green-100 rounded"
      >
        <Check className="w-3 h-3" />
      </button>
      <button
        onClick={onCancel}
        className="p-1 text-gray-600 hover:bg-gray-200 rounded"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};
