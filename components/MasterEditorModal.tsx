import React from 'react';
import { ArrowLeft, Save, Check, Search, ChevronRight, Trash2, Plus, Replace, ToggleLeft, ToggleRight, RefreshCw } from 'lucide-react';
import { PRESET_ALIASES, PresetKey } from '../utils/workTypeAliases';
import { CATEGORY_SHORT_NAMES } from '../utils/masterEditorStorage';
import { useMasterEditorState } from '../hooks/useMasterEditorState';
import { useMasterEditorAlias } from '../hooks/useMasterEditorAlias';
import { EditableTreeView } from './EditableTreeView';

// Re-export for backwards compatibility
export { getFilteredMaster } from '../utils/masterEditorStorage';

interface Props {
  onClose: () => void;
  lang: 'en' | 'ja';
  onApplyAliasesToSession?: () => { modifiedCount: number };
}

const MasterEditorModal: React.FC<Props> = ({ onClose, lang, onApplyAliasesToSession }) => {
  const state = useMasterEditorState();
  const alias = useMasterEditorAlias(onApplyAliasesToSession);

  const txt = {
    title: lang === 'ja' ? '工種セット管理' : 'Work Type Sets',
    detailTitle: lang === 'ja' ? 'エントリー編集' : 'Edit Entries',
    search: lang === 'ja' ? '工種を検索...' : 'Search work types...',
    save: lang === 'ja' ? '保存' : 'Save',
    selectAll: lang === 'ja' ? '全選択' : 'Select All',
    clear: lang === 'ja' ? '全解除' : 'Clear All',
    unsaved: lang === 'ja' ? '未保存' : 'Unsaved',
    enabled: lang === 'ja' ? '有効' : 'Enabled',
    hint: lang === 'ja'
      ? 'チェックで工種を有効/無効に。右矢印で詳細編集。'
      : 'Check to enable/disable. Arrow for detail edit.',
    editHint: lang === 'ja'
      ? '項目の削除・名前変更ができます。変更は保存が必要です。'
      : 'Delete or rename entries. Save required.',
    back: lang === 'ja' ? '戻る' : 'Back',
    edit: lang === 'ja' ? '編集' : 'Edit',
    resetCustomization: lang === 'ja' ? 'リセット' : 'Reset',
    aliasTitle: lang === 'ja' ? '名称エイリアス' : 'Name Aliases',
    aliasDescription: lang === 'ja' ? '工種・種別名を別名に変換' : 'Convert names to aliases',
    aliasEnabled: lang === 'ja' ? '有効' : 'Enabled',
    aliasDisabled: lang === 'ja' ? '無効' : 'Disabled',
    workTypeAliases: lang === 'ja' ? '工種エイリアス' : 'Work Type Aliases',
    varietyAliases: lang === 'ja' ? '種別エイリアス' : 'Variety Aliases',
    from: lang === 'ja' ? '元の名前' : 'Original',
    to: lang === 'ja' ? '変換後' : 'Alias',
    add: lang === 'ja' ? '追加' : 'Add',
    presets: lang === 'ja' ? 'プリセット' : 'Presets',
    noAliases: lang === 'ja' ? 'エイリアスなし' : 'No aliases',
  };

  // 詳細編集画面
  if (state.viewMode === 'detail' && state.selectedWorkType) {
    return (
      <div className="min-h-screen w-full bg-gray-50 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => state.setViewMode('list')} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h3 className="text-lg font-bold">{state.selectedWorkType.name}</h3>
              <p className="text-xs text-indigo-200">{txt.detailTitle}</p>
            </div>
            {state.hasChanges && <span className="text-amber-400 text-xs bg-amber-900/30 px-2 py-0.5 rounded">{txt.unsaved}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={state.handleResetCustomization} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white/20 hover:bg-white/30 text-white transition-colors">
              {txt.resetCustomization}
            </button>
            <button
              onClick={state.handleSave}
              disabled={!state.hasChanges}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${state.hasChanges ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-white/20 text-white/50 cursor-not-allowed'}`}
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
          {Array.from(state.selectedWorkType.categories.entries()).map(([catName, catData]) => (
            <div key={catName} className="mb-6 bg-white rounded-lg border shadow-sm">
              <div className="px-4 py-2 bg-gray-50 border-b rounded-t-lg">
                <span className="font-medium text-gray-700">{CATEGORY_SHORT_NAMES[catName] || catName}</span>
              </div>
              <div className="p-4">
                <EditableTreeView
                  data={catData}
                  path={state.selectedWorkType!.name}
                  customization={state.customization}
                  onDelete={state.handleDelete}
                  onRename={state.handleRename}
                  onAdd={state.handleAdd}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // エイリアス設定画面
  if (state.viewMode === 'alias') {
    return (
      <div className="min-h-screen w-full bg-gray-50 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-600 to-amber-700 text-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => state.setViewMode('list')} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h3 className="text-lg font-bold">{txt.aliasTitle}</h3>
              <p className="text-xs text-amber-200">{txt.aliasDescription}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Enable/Disable Toggle */}
          <div className="bg-white rounded-lg border shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-gray-900">エイリアス変換</h4>
                <p className="text-sm text-gray-500">解析済みデータに一括適用</p>
              </div>
              <button
                onClick={alias.handleToggleAliasEnabled}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${alias.aliasSettings.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
              >
                {alias.aliasSettings.enabled ? <><ToggleRight className="w-5 h-5" />{txt.aliasEnabled}</> : <><ToggleLeft className="w-5 h-5" />{txt.aliasDisabled}</>}
              </button>
            </div>
          </div>

          {/* Presets */}
          <div className="bg-white rounded-lg border shadow-sm p-4">
            <h4 className="font-medium text-gray-900 mb-3">{txt.presets}</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(PRESET_ALIASES).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => alias.handleApplyPreset(key as PresetKey)}
                  className={`px-3 py-2 rounded-lg text-sm transition-colors ${alias.aliasSettings.activePreset === key ? 'bg-amber-100 text-amber-700 border-2 border-amber-300' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'}`}
                >
                  <div className="font-medium">{preset.name}</div>
                  <div className="text-xs text-gray-500">{preset.description}</div>
                </button>
              ))}
              <button onClick={alias.handleResetAliases} className="px-3 py-2 rounded-lg text-sm bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 flex items-center gap-1">
                <RefreshCw className="w-4 h-4" />
                {txt.resetCustomization}
              </button>
            </div>
          </div>

          {/* Work Type Aliases */}
          <div className="bg-white rounded-lg border shadow-sm p-4">
            <h4 className="font-medium text-gray-900 mb-3">{txt.workTypeAliases}</h4>
            {alias.workTypeAliasEntries.length > 0 ? (
              <div className="space-y-2 mb-4">
                {alias.workTypeAliasEntries.map(([from, to]) => (
                  <div key={from} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    <span className="flex-1 text-sm font-medium text-gray-700">{from}</span>
                    <span className="text-gray-400">→</span>
                    <span className="flex-1 text-sm text-amber-600 font-medium">{to}</span>
                    <button onClick={() => alias.handleRemoveWorkTypeAlias(from)} className="p-1 text-red-500 hover:bg-red-100 rounded"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 mb-4">{txt.noAliases}</p>
            )}
            <div className="flex items-center gap-2">
              <input type="text" value={alias.newWorkTypeFrom} onChange={(e) => alias.setNewWorkTypeFrom(e.target.value)} placeholder={txt.from} className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
              <span className="text-gray-400">→</span>
              <input type="text" value={alias.newWorkTypeTo} onChange={(e) => alias.setNewWorkTypeTo(e.target.value)} placeholder={txt.to} className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
              <button onClick={alias.handleAddWorkTypeAlias} disabled={!alias.newWorkTypeFrom.trim() || !alias.newWorkTypeTo.trim()} className="px-3 py-2 rounded-lg text-sm bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"><Plus className="w-4 h-4" />{txt.add}</button>
            </div>
          </div>

          {/* Variety Aliases */}
          <div className="bg-white rounded-lg border shadow-sm p-4">
            <h4 className="font-medium text-gray-900 mb-3">{txt.varietyAliases}</h4>
            {alias.varietyAliasEntries.length > 0 ? (
              <div className="space-y-2 mb-4">
                {alias.varietyAliasEntries.map(([from, to]) => (
                  <div key={from} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    <span className="flex-1 text-sm font-medium text-gray-700">{from}</span>
                    <span className="text-gray-400">→</span>
                    <span className="flex-1 text-sm text-amber-600 font-medium">{to}</span>
                    <button onClick={() => alias.handleRemoveVarietyAlias(from)} className="p-1 text-red-500 hover:bg-red-100 rounded"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 mb-4">{txt.noAliases}</p>
            )}
            <div className="flex items-center gap-2">
              <input type="text" value={alias.newVarietyFrom} onChange={(e) => alias.setNewVarietyFrom(e.target.value)} placeholder={txt.from} className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
              <span className="text-gray-400">→</span>
              <input type="text" value={alias.newVarietyTo} onChange={(e) => alias.setNewVarietyTo(e.target.value)} placeholder={txt.to} className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
              <button onClick={alias.handleAddVarietyAlias} disabled={!alias.newVarietyFrom.trim() || !alias.newVarietyTo.trim()} className="px-3 py-2 rounded-lg text-sm bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"><Plus className="w-4 h-4" />{txt.add}</button>
            </div>
          </div>

          {/* Preview & Apply Section */}
          {alias.hasAnyAliases && alias.aliasSettings.enabled && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h4 className="font-medium text-amber-800 mb-2">変換プレビュー</h4>
              <div className="text-sm text-amber-700 mb-4">
                <p>以下の変換が適用されます：</p>
                <ul className="mt-2 space-y-1 list-disc list-inside">
                  {alias.workTypeAliasEntries.map(([from, to]) => <li key={`wt-${from}`}>工種: {from} → {to}</li>)}
                  {alias.varietyAliasEntries.map(([from, to]) => <li key={`var-${from}`}>種別: {from} → {to}</li>)}
                </ul>
              </div>
              {onApplyAliasesToSession && (
                <div className="border-t border-amber-200 pt-4 mt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-amber-800">現在のセッションに適用</p>
                      <p className="text-xs text-amber-600">解析済みの写真データを一括変換します</p>
                    </div>
                    <button onClick={alias.handleApplyToSession} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2">
                      <Replace className="w-4 h-4" />適用
                    </button>
                  </div>
                  {alias.applyResult && (
                    <div className={`mt-3 p-2 rounded text-sm ${alias.applyResult.modifiedCount > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {alias.applyResult.modifiedCount > 0 ? `${alias.applyResult.modifiedCount}件のデータを変換しました` : '変換対象のデータがありませんでした'}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
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
          <button
            onClick={() => state.setViewMode('alias')}
            className={`px-3 py-1 text-xs rounded flex items-center gap-1 ${alias.hasAnyAliases && alias.aliasSettings.enabled ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            <Replace className="w-3 h-3" />
            {txt.aliasTitle}
            {alias.hasAnyAliases && alias.aliasSettings.enabled && <span className="w-2 h-2 bg-amber-500 rounded-full" />}
          </button>
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
        {state.workTypeList.map(workType => {
          const isEnabled = state.enabledTypes.has(workType.name);
          const hasCustomization = state.hasWorkTypeCustomization(workType.name);

          return (
            <div key={workType.name} className={`border-b ${isEnabled ? 'bg-white' : 'bg-gray-50'}`}>
              <div className="flex items-center gap-3 px-4 py-3 transition-colors">
                <div
                  onClick={(e) => state.toggleWorkType(workType.name, e)}
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
                    {Array.from(workType.categories.keys()).map(cat => (
                      <span key={cat} className={`text-[10px] px-1.5 py-0.5 rounded ${isEnabled ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'}`}>
                        {CATEGORY_SHORT_NAMES[cat] || cat}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  onClick={(e) => state.openDetailEdit(workType, e)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${isEnabled ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  <span className="text-xs">{txt.edit}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MasterEditorModal;
