import React from 'react';
import { ArrowLeft, Trash2, Plus, Replace, ToggleLeft, ToggleRight, RefreshCw } from 'lucide-react';
import { PRESET_ALIASES, PresetKey, AliasSettings } from '../../utils/workTypeAliases';

// --- Grouped interfaces ---

interface AliasData {
  aliasSettings: AliasSettings;
  workTypeAliasEntries: [string, string][];
  varietyAliasEntries: [string, string][];
  hasAnyAliases: boolean;
  applyResult: { modifiedCount: number } | null;
  canApplyToSession: boolean;
}

interface AliasInputState {
  newWorkTypeFrom: string;
  newWorkTypeTo: string;
  newVarietyFrom: string;
  newVarietyTo: string;
}

interface AliasInputSetters {
  setNewWorkTypeFrom: (v: string) => void;
  setNewWorkTypeTo: (v: string) => void;
  setNewVarietyFrom: (v: string) => void;
  setNewVarietyTo: (v: string) => void;
}

interface AliasHandlers {
  onBack: () => void;
  onToggleEnabled: () => void;
  onApplyPreset: (key: PresetKey) => void;
  onReset: () => void;
  onRemoveWorkTypeAlias: (from: string) => void;
  onRemoveVarietyAlias: (from: string) => void;
  onAddWorkTypeAlias: () => void;
  onAddVarietyAlias: () => void;
  onApplyToSession: () => void;
}

interface AliasTexts {
  aliasTitle: string;
  aliasDescription: string;
  aliasEnabled: string;
  aliasDisabled: string;
  presets: string;
  resetCustomization: string;
  workTypeAliases: string;
  varietyAliases: string;
  from: string;
  to: string;
  add: string;
  noAliases: string;
}

export interface AliasSettingsViewProps {
  data: AliasData;
  inputState: AliasInputState;
  inputSetters: AliasInputSetters;
  handlers: AliasHandlers;
  txt: AliasTexts;
}

// --- Sub-components ---

const AliasInputRow: React.FC<{
  fromValue: string;
  toValue: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onAdd: () => void;
  disabled: boolean;
  txt: { from: string; to: string; add: string };
}> = ({ fromValue, toValue, onFromChange, onToChange, onAdd, disabled, txt }) => (
  <div className="flex items-center gap-2">
    <input type="text" value={fromValue} onChange={(e) => onFromChange(e.target.value)} placeholder={txt.from} className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
    <span className="text-gray-400">→</span>
    <input type="text" value={toValue} onChange={(e) => onToChange(e.target.value)} placeholder={txt.to} className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
    <button onClick={onAdd} disabled={disabled} className="px-3 py-2 rounded-lg text-sm bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"><Plus className="w-4 h-4" />{txt.add}</button>
  </div>
);

const AliasList: React.FC<{
  entries: [string, string][];
  onRemove: (from: string) => void;
  noAliasesText: string;
}> = ({ entries, onRemove, noAliasesText }) => (
  entries.length > 0 ? (
    <div className="space-y-2 mb-4">
      {entries.map(([from, to]) => (
        <div key={from} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
          <span className="flex-1 text-sm font-medium text-gray-700">{from}</span>
          <span className="text-gray-400">→</span>
          <span className="flex-1 text-sm text-amber-600 font-medium">{to}</span>
          <button onClick={() => onRemove(from)} className="p-1 text-red-500 hover:bg-red-100 rounded"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
    </div>
  ) : (
    <p className="text-sm text-gray-400 mb-4">{noAliasesText}</p>
  )
);

const EnableToggle: React.FC<{
  enabled: boolean;
  onToggle: () => void;
  enabledText: string;
  disabledText: string;
}> = ({ enabled, onToggle, enabledText, disabledText }) => (
  <div className="bg-white rounded-lg border shadow-sm p-4">
    <div className="flex items-center justify-between">
      <div>
        <h4 className="font-medium text-gray-900">エイリアス変換</h4>
        <p className="text-sm text-gray-500">解析済みデータに一括適用</p>
      </div>
      <button onClick={onToggle} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
        {enabled ? <><ToggleRight className="w-5 h-5" />{enabledText}</> : <><ToggleLeft className="w-5 h-5" />{disabledText}</>}
      </button>
    </div>
  </div>
);

const PresetSelector: React.FC<{
  activePreset: string | null;
  onApplyPreset: (key: PresetKey) => void;
  onReset: () => void;
  presetsText: string;
  resetText: string;
}> = ({ activePreset, onApplyPreset, onReset, presetsText, resetText }) => (
  <div className="bg-white rounded-lg border shadow-sm p-4">
    <h4 className="font-medium text-gray-900 mb-3">{presetsText}</h4>
    <div className="flex flex-wrap gap-2">
      {Object.entries(PRESET_ALIASES).map(([key, preset]) => (
        <button key={key} onClick={() => onApplyPreset(key as PresetKey)} className={`px-3 py-2 rounded-lg text-sm transition-colors ${activePreset === key ? 'bg-amber-100 text-amber-700 border-2 border-amber-300' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'}`}>
          <div className="font-medium">{preset.name}</div>
          <div className="text-xs text-gray-500">{preset.description}</div>
        </button>
      ))}
      <button onClick={onReset} className="px-3 py-2 rounded-lg text-sm bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 flex items-center gap-1">
        <RefreshCw className="w-4 h-4" />{resetText}
      </button>
    </div>
  </div>
);

const AliasPreview: React.FC<{
  workTypeEntries: [string, string][];
  varietyEntries: [string, string][];
  canApply: boolean;
  applyResult: { modifiedCount: number } | null;
  onApply: () => void;
}> = ({ workTypeEntries, varietyEntries, canApply, applyResult, onApply }) => (
  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
    <h4 className="font-medium text-amber-800 mb-2">変換プレビュー</h4>
    <div className="text-sm text-amber-700 mb-4">
      <p>以下の変換が適用されます：</p>
      <ul className="mt-2 space-y-1 list-disc list-inside">
        {workTypeEntries.map(([from, to]) => <li key={`wt-${from}`}>工種: {from} → {to}</li>)}
        {varietyEntries.map(([from, to]) => <li key={`var-${from}`}>種別: {from} → {to}</li>)}
      </ul>
    </div>
    {canApply && (
      <div className="border-t border-amber-200 pt-4 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-amber-800">現在のセッションに適用</p>
            <p className="text-xs text-amber-600">解析済みの写真データを一括変換します</p>
          </div>
          <button onClick={onApply} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2">
            <Replace className="w-4 h-4" />適用
          </button>
        </div>
        {applyResult && (
          <div className={`mt-3 p-2 rounded text-sm ${applyResult.modifiedCount > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
            {applyResult.modifiedCount > 0 ? `${applyResult.modifiedCount}件のデータを変換しました` : '変換対象のデータがありませんでした'}
          </div>
        )}
      </div>
    )}
  </div>
);

const AliasSection: React.FC<{
  title: string;
  entries: [string, string][];
  fromValue: string;
  toValue: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (from: string) => void;
  txt: { from: string; to: string; add: string; noAliases: string };
}> = ({ title, entries, fromValue, toValue, onFromChange, onToChange, onAdd, onRemove, txt }) => (
  <div className="bg-white rounded-lg border shadow-sm p-4">
    <h4 className="font-medium text-gray-900 mb-3">{title}</h4>
    <AliasList entries={entries} onRemove={onRemove} noAliasesText={txt.noAliases} />
    <AliasInputRow fromValue={fromValue} toValue={toValue} onFromChange={onFromChange} onToChange={onToChange} onAdd={onAdd} disabled={!fromValue.trim() || !toValue.trim()} txt={txt} />
  </div>
);

// --- Main Component ---

export const AliasSettingsView: React.FC<AliasSettingsViewProps> = ({ data, inputState, inputSetters, handlers, txt }) => (
  <div className="min-h-screen w-full bg-gray-50 flex flex-col">
    {/* Header */}
    <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-600 to-amber-700 text-white sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <button onClick={handlers.onBack} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"><ArrowLeft className="w-5 h-5" /></button>
        <div>
          <h3 className="text-lg font-bold">{txt.aliasTitle}</h3>
          <p className="text-xs text-amber-200">{txt.aliasDescription}</p>
        </div>
      </div>
    </div>

    {/* Content */}
    <div className="flex-1 overflow-auto p-4 space-y-4">
      <EnableToggle enabled={data.aliasSettings.enabled} onToggle={handlers.onToggleEnabled} enabledText={txt.aliasEnabled} disabledText={txt.aliasDisabled} />

      <PresetSelector activePreset={data.aliasSettings.activePreset} onApplyPreset={handlers.onApplyPreset} onReset={handlers.onReset} presetsText={txt.presets} resetText={txt.resetCustomization} />

      <AliasSection
        title={txt.workTypeAliases}
        entries={data.workTypeAliasEntries}
        fromValue={inputState.newWorkTypeFrom}
        toValue={inputState.newWorkTypeTo}
        onFromChange={inputSetters.setNewWorkTypeFrom}
        onToChange={inputSetters.setNewWorkTypeTo}
        onAdd={handlers.onAddWorkTypeAlias}
        onRemove={handlers.onRemoveWorkTypeAlias}
        txt={{ from: txt.from, to: txt.to, add: txt.add, noAliases: txt.noAliases }}
      />

      <AliasSection
        title={txt.varietyAliases}
        entries={data.varietyAliasEntries}
        fromValue={inputState.newVarietyFrom}
        toValue={inputState.newVarietyTo}
        onFromChange={inputSetters.setNewVarietyFrom}
        onToChange={inputSetters.setNewVarietyTo}
        onAdd={handlers.onAddVarietyAlias}
        onRemove={handlers.onRemoveVarietyAlias}
        txt={{ from: txt.from, to: txt.to, add: txt.add, noAliases: txt.noAliases }}
      />

      {data.hasAnyAliases && data.aliasSettings.enabled && (
        <AliasPreview
          workTypeEntries={data.workTypeAliasEntries}
          varietyEntries={data.varietyAliasEntries}
          canApply={data.canApplyToSession}
          applyResult={data.applyResult}
          onApply={handlers.onApplyToSession}
        />
      )}
    </div>
  </div>
);
