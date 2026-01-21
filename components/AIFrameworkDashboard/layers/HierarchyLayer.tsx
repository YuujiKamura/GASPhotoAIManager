import React from 'react';
import { Edit3, Save } from 'lucide-react';

interface HierarchyLayerProps {
  editingHierarchy: boolean;
  setEditingHierarchy: (value: boolean) => void;
  hierarchyOverride: string;
  saveHierarchyOverride: (value: string) => void;
  hierarchyError: string;
  CONSTRUCTION_HIERARCHY: any;
  STORAGE_KEYS: { hierarchyOverride: string };
}

export const HierarchyLayer: React.FC<HierarchyLayerProps> = ({
  editingHierarchy, setEditingHierarchy, hierarchyOverride,
  saveHierarchyOverride, hierarchyError, CONSTRUCTION_HIERARCHY, STORAGE_KEYS
}) => {
  if (!editingHierarchy) {
    return (
      <div className="space-y-3">
        <div className="text-xs text-gray-600 font-mono bg-gray-50 p-3 rounded max-h-40 overflow-auto">
          <pre className="whitespace-pre-wrap">
            {(hierarchyOverride || JSON.stringify(CONSTRUCTION_HIERARCHY, null, 2)).slice(0, 1000)}...
          </pre>
        </div>
        <button
          onClick={() => {
            if (!hierarchyOverride) saveHierarchyOverride(JSON.stringify(CONSTRUCTION_HIERARCHY, null, 2));
            setEditingHierarchy(true);
          }}
          className="flex items-center gap-1 text-xs px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
        >
          <Edit3 size={12} /> JSON編集モード
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <textarea
        value={hierarchyOverride}
        onChange={(e) => saveHierarchyOverride(e.target.value)}
        className={`w-full h-60 text-xs font-mono border rounded p-2 resize-none ${hierarchyError ? 'border-red-500' : ''}`}
      />
      {hierarchyError && <div className="text-xs text-red-600">{hierarchyError}</div>}
      <div className="flex gap-2">
        <button onClick={() => setEditingHierarchy(false)} className="text-xs px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200">
          <Save size={12} className="inline mr-1" />保存して閉じる
        </button>
        <button
          onClick={() => { saveHierarchyOverride(''); localStorage.removeItem(STORAGE_KEYS.hierarchyOverride); setEditingHierarchy(false); }}
          className="text-xs px-3 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
        >
          デフォルトに戻す
        </button>
      </div>
    </div>
  );
};
