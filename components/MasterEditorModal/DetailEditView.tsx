import React from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { CATEGORY_SHORT_NAMES } from '../../utils/masterEditorStorage';
import { EditableTreeView } from '../EditableTreeView';

interface WorkType {
  name: string;
  categories: Map<string, any>;
}

interface Props {
  workType: WorkType;
  customization: any;
  hasChanges: boolean;
  onBack: () => void;
  onSave: () => void;
  onResetCustomization: () => void;
  onDelete: (path: string, key: string, deletedValue: any) => void;
  onRename: (path: string, oldKey: string, newKey: string) => void;
  onAdd: (path: string, key: string, value: any) => void;
  txt: {
    detailTitle: string;
    unsaved: string;
    resetCustomization: string;
    save: string;
    editHint: string;
  };
}

export const DetailEditView: React.FC<Props> = ({
  workType,
  customization,
  hasChanges,
  onBack,
  onSave,
  onResetCustomization,
  onDelete,
  onRename,
  onAdd,
  txt,
}) => (
  <div className="min-h-screen w-full bg-gray-50 flex flex-col">
    <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h3 className="text-lg font-bold">{workType.name}</h3>
          <p className="text-xs text-indigo-200">{txt.detailTitle}</p>
        </div>
        {hasChanges && <span className="text-amber-400 text-xs bg-amber-900/30 px-2 py-0.5 rounded">{txt.unsaved}</span>}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onResetCustomization} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white/20 hover:bg-white/30 text-white transition-colors">
          {txt.resetCustomization}
        </button>
        <button
          onClick={onSave}
          disabled={!hasChanges}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${hasChanges ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-white/20 text-white/50 cursor-not-allowed'}`}
        >
          <Save className="w-4 h-4" />
          {txt.save}
        </button>
      </div>
    </div>

    <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100">
      <p className="text-xs text-indigo-600">{txt.editHint}</p>
    </div>

    <div className="flex-1 overflow-auto p-4">
      {Array.from(workType.categories.entries()).map(([catName, catData]) => (
        <div key={catName} className="mb-6 bg-white rounded-lg border shadow-sm">
          <div className="px-4 py-2 bg-gray-50 border-b rounded-t-lg">
            <span className="font-medium text-gray-700">{CATEGORY_SHORT_NAMES[catName] || catName}</span>
          </div>
          <div className="p-4">
            <EditableTreeView
              data={catData}
              path={workType.name}
              customization={customization}
              onDelete={onDelete}
              onRename={onRename}
              onAdd={onAdd}
            />
          </div>
        </div>
      ))}
    </div>
  </div>
);
