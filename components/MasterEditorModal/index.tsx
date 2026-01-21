import React from 'react';
import { ArrowLeft, Save, Check, Search, ChevronRight } from 'lucide-react';
import { CATEGORY_SHORT_NAMES } from '../../utils/masterEditorStorage';
import { useMasterEditorState } from '../../hooks/useMasterEditorState';
import { DetailEditView } from './DetailEditView';

// Re-export for backwards compatibility
export { getFilteredMaster } from '../../utils/masterEditorStorage';

interface Props {
  onClose: () => void;
  lang: 'en' | 'ja';
}

const getTexts = (lang: 'en' | 'ja') => ({
  title: lang === 'ja' ? '工種セット管理' : 'Work Type Sets',
  detailTitle: lang === 'ja' ? 'エントリー編集' : 'Edit Entries',
  search: lang === 'ja' ? '工種を検索...' : 'Search work types...',
  save: lang === 'ja' ? '保存' : 'Save',
  selectAll: lang === 'ja' ? '全選択' : 'Select All',
  clear: lang === 'ja' ? '全解除' : 'Clear All',
  unsaved: lang === 'ja' ? '未保存' : 'Unsaved',
  enabled: lang === 'ja' ? '有効' : 'Enabled',
  hint: lang === 'ja' ? 'チェックで工種を有効/無効に。右矢印で詳細編集。' : 'Check to enable/disable. Arrow for detail edit.',
  editHint: lang === 'ja' ? '項目の削除・名前変更ができます。変更は保存が必要です。' : 'Delete or rename entries. Save required.',
  back: lang === 'ja' ? '戻る' : 'Back',
  edit: lang === 'ja' ? '編集' : 'Edit',
  resetCustomization: lang === 'ja' ? 'リセット' : 'Reset',
});

interface WorkTypeListItemProps {
  workType: { name: string; categories: Map<string, unknown> };
  isEnabled: boolean;
  hasCustomization: boolean;
  onToggle: (e: React.MouseEvent) => void;
  onEdit: (e: React.MouseEvent) => void;
  editLabel: string;
}

const WorkTypeListItem: React.FC<WorkTypeListItemProps> = ({ workType, isEnabled, hasCustomization, onToggle, onEdit, editLabel }) => (
  <div className={`border-b ${isEnabled ? 'bg-white' : 'bg-gray-50'}`}>
    <div className="flex items-center gap-3 px-4 py-3 transition-colors">
      <div
        onClick={onToggle}
        className={`w-6 h-6 rounded-md border-2 flex-shrink-0 flex items-center justify-center cursor-pointer transition-colors ${isEnabled ? 'bg-blue-500 border-blue-500' : 'border-gray-300 bg-white hover:border-blue-300'}`}
      >
        {isEnabled && <Check className="w-4 h-4 text-white" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-bold text-base ${isEnabled ? 'text-gray-900' : 'text-gray-400'}`}>{workType.name}</span>
          {hasCustomization && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">編集済</span>}
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {Array.from(workType.categories.keys()).map((cat: string) => (
            <span key={cat} className={`text-[10px] px-1.5 py-0.5 rounded ${isEnabled ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'}`}>
              {CATEGORY_SHORT_NAMES[cat] || cat}
            </span>
          ))}
        </div>
      </div>

      <button
        onClick={onEdit}
        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${isEnabled ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
      >
        <span className="text-xs">{editLabel}</span>
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  </div>
);

const MasterEditorModal: React.FC<Props> = ({ onClose, lang }) => {
  const state = useMasterEditorState();
  const txt = getTexts(lang);

  // 詳細編集画面
  if (state.viewMode === 'detail' && state.selectedWorkType) {
    return (
      <DetailEditView
        workType={state.selectedWorkType}
        customization={state.customization}
        hasChanges={state.hasChanges}
        onBack={() => state.setViewMode('list')}
        onSave={state.handleSave}
        onResetCustomization={state.handleResetCustomization}
        onDelete={state.handleDelete}
        onRename={state.handleRename}
        onAdd={state.handleAdd}
        txt={{ detailTitle: txt.detailTitle, unsaved: txt.unsaved, resetCustomization: txt.resetCustomization, save: txt.save, editHint: txt.editHint }}
      />
    );
  }

  // 工種リスト画面
  return (
    <div className="min-h-screen w-full bg-gray-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-700 to-slate-800 text-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h3 className="text-lg font-bold">{txt.title}</h3>
          {state.hasChanges && <span className="text-amber-400 text-xs bg-amber-900/30 px-2 py-0.5 rounded">{txt.unsaved}</span>}
        </div>
        <button
          onClick={state.handleSave}
          disabled={!state.hasChanges}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${state.hasChanges ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-white/20 text-white/50 cursor-not-allowed'}`}
        >
          <Save className="w-4 h-4" />
          {txt.save}
        </button>
      </div>

      <div className="px-4 py-2 bg-white border-b flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {txt.enabled}: <span className="font-bold text-blue-600">{state.enabledTypes.size}</span> / {state.allWorkTypes.size}
        </div>
        <div className="flex gap-2">
          <button onClick={state.handleSelectAll} className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200">{txt.selectAll}</button>
          <button onClick={state.handleClearAll} className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200">{txt.clear}</button>
        </div>
      </div>

      <div className="px-4 py-2 bg-gray-50 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={state.searchTerm}
            onChange={(e) => state.setSearchTerm(e.target.value)}
            placeholder={txt.search}
            className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">{txt.hint}</p>
      </div>

      <div className="flex-1 overflow-auto">
        {state.workTypeList.map(workType => (
          <WorkTypeListItem
            key={workType.name}
            workType={workType}
            isEnabled={state.enabledTypes.has(workType.name)}
            hasCustomization={state.hasWorkTypeCustomization(workType.name)}
            onToggle={(e) => state.toggleWorkType(workType.name, e)}
            onEdit={(e) => state.openDetailEdit(workType, e)}
            editLabel={txt.edit}
          />
        ))}
      </div>
    </div>
  );
};

export default MasterEditorModal;
