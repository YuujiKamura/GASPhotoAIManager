import React from 'react';
import { ArrowLeft, Trash2, Plus, Replace, ToggleLeft, ToggleRight, RefreshCw } from 'lucide-react';
import { PRESET_ALIASES, PresetKey, AliasSettings } from '../../utils/workTypeAliases';

interface Props {
  aliasSettings: AliasSettings;
  workTypeAliasEntries: [string, string][];
  varietyAliasEntries: [string, string][];
  newWorkTypeFrom: string;
  newWorkTypeTo: string;
  newVarietyFrom: string;
  newVarietyTo: string;
  hasAnyAliases: boolean;
  applyResult: { modifiedCount: number } | null;
  onBack: () => void;
  onToggleEnabled: () => void;
  onApplyPreset: (key: PresetKey) => void;
  onReset: () => void;
  onRemoveWorkTypeAlias: (from: string) => void;
  onRemoveVarietyAlias: (from: string) => void;
  onAddWorkTypeAlias: () => void;
  onAddVarietyAlias: () => void;
  setNewWorkTypeFrom: (v: string) => void;
  setNewWorkTypeTo: (v: string) => void;
  setNewVarietyFrom: (v: string) => void;
  setNewVarietyTo: (v: string) => void;
  onApplyToSession: () => void;
  canApplyToSession: boolean;
  txt: {
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
  };
}

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

// --- Sub-components ---

const AliasHeader: React.FC<{
  txt: { aliasTitle: string; aliasDescription: string };
  onBack: () => void;
}> = ({ txt, onBack }) => (
  <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-600 to-amber-700 text-white sticky top-0 z-10">
    <div className="flex items-center gap-3">
      <button onClick={onBack} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
        <ArrowLeft className="w-5 h-5" />
      </button>
      <div>
        <h3 className="text-lg font-bold">{txt.aliasTitle}</h3>
        <p className="text-xs text-amber-200">{txt.aliasDescription}</p>
      </div>
    </div>
  </div>
);

const EnableToggle: React.FC<{
  enabled: boolean;
  txt: { aliasEnabled: string; aliasDisabled: string };
  onToggle: () => void;
}> = ({ enabled, txt, onToggle }) => (
  <div className="bg-white rounded-lg border shadow-sm p-4">
    <div className="flex items-center justify-between">
      <div>
        <h4 className="font-medium text-gray-900">エイリアス変換</h4>
        <p className="text-sm text-gray-500">解析済みデータに一括適用</p>
      </div>
      <button
        onClick={onToggle}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
          enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
        }`}
      >
        {enabled ? (
          <><ToggleRight className="w-5 h-5" />{txt.aliasEnabled}</>
        ) : (
          <><ToggleLeft className="w-5 h-5" />{txt.aliasDisabled}</>
        )}
      </button>
    </div>
  </div>
);

const PresetSelector: React.FC<{
  activePreset: PresetKey | null;
  txt: { presets: string; resetCustomization: string };
  onApplyPreset: (key: PresetKey) => void;
  onReset: () => void;
}> = ({ activePreset, txt, onApplyPreset, onReset }) => (
  <div className="bg-white rounded-lg border shadow-sm p-4">
    <h4 className="font-medium text-gray-900 mb-3">{txt.presets}</h4>
    <div className="flex flex-wrap gap-2">
      {Object.entries(PRESET_ALIASES).map(([key, preset]) => (
        <button
          key={key}
          onClick={() => onApplyPreset(key as PresetKey)}
          className={`px-3 py-2 rounded-lg text-sm transition-colors ${
            activePreset === key
              ? 'bg-amber-100 text-amber-700 border-2 border-amber-300'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
          }`}
        >
          <div className="font-medium">{preset.name}</div>
          <div className="text-xs text-gray-500">{preset.description}</div>
        </button>
      ))}
      <button
        onClick={onReset}
        className="px-3 py-2 rounded-lg text-sm bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 flex items-center gap-1"
      >
        <RefreshCw className="w-4 h-4" />
        {txt.resetCustomization}
      </button>
    </div>
  </div>
);

const AliasSection: React.FC<{
  title: string;
  entries: [string, string][];
  fromValue: string;
  toValue: string;
  noAliasesText: string;
  txt: { from: string; to: string; add: string };
  onRemove: (from: string) => void;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onAdd: () => void;
}> = ({ title, entries, fromValue, toValue, noAliasesText, txt, onRemove, onFromChange, onToChange, onAdd }) => (
  <div className="bg-white rounded-lg border shadow-sm p-4">
    <h4 className="font-medium text-gray-900 mb-3">{title}</h4>
    <AliasList entries={entries} onRemove={onRemove} noAliasesText={noAliasesText} />
    <AliasInputRow
      fromValue={fromValue}
      toValue={toValue}
      onFromChange={onFromChange}
      onToChange={onToChange}
      onAdd={onAdd}
      disabled={!fromValue.trim() || !toValue.trim()}
      txt={txt}
    />
  </div>
);

const PreviewSection: React.FC<{
  workTypeAliasEntries: [string, string][];
  varietyAliasEntries: [string, string][];
  canApplyToSession: boolean;
  applyResult: { modifiedCount: number } | null;
  onApplyToSession: () => void;
}> = ({ workTypeAliasEntries, varietyAliasEntries, canApplyToSession, applyResult, onApplyToSession }) => (
  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
    <h4 className="font-medium text-amber-800 mb-2">変換プレビュー</h4>
    <div className="text-sm text-amber-700 mb-4">
      <p>以下の変換が適用されます：</p>
      <ul className="mt-2 space-y-1 list-disc list-inside">
        {workTypeAliasEntries.map(([from, to]) => (
          <li key={`wt-${from}`}>工種: {from} → {to}</li>
        ))}
        {varietyAliasEntries.map(([from, to]) => (
          <li key={`var-${from}`}>種別: {from} → {to}</li>
        ))}
      </ul>
    </div>
    {canApplyToSession && (
      <ApplyToSessionSection applyResult={applyResult} onApply={onApplyToSession} />
    )}
  </div>
);

const ApplyToSessionSection: React.FC<{
  applyResult: { modifiedCount: number } | null;
  onApply: () => void;
}> = ({ applyResult, onApply }) => (
  <div className="border-t border-amber-200 pt-4 mt-4">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-amber-800">現在のセッションに適用</p>
        <p className="text-xs text-amber-600">解析済みの写真データを一括変換します</p>
      </div>
      <button
        onClick={onApply}
        className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2"
      >
        <Replace className="w-4 h-4" />適用
      </button>
    </div>
    {applyResult && (
      <div className={`mt-3 p-2 rounded text-sm ${
        applyResult.modifiedCount > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
      }`}>
        {applyResult.modifiedCount > 0
          ? `${applyResult.modifiedCount}件のデータを変換しました`
          : '変換対象のデータがありませんでした'}
      </div>
    )}
  </div>
);

// --- Main Component ---

export const AliasSettingsView: React.FC<Props> = (props) => {
  const { aliasSettings, workTypeAliasEntries, varietyAliasEntries, hasAnyAliases, applyResult, txt } = props;

  return (
    <div className="min-h-screen w-full bg-gray-50 flex flex-col">
      <AliasHeader txt={txt} onBack={props.onBack} />

      <div className="flex-1 overflow-auto p-4 space-y-4">
        <EnableToggle
          enabled={aliasSettings.enabled}
          txt={txt}
          onToggle={props.onToggleEnabled}
        />

        <PresetSelector
          activePreset={aliasSettings.activePreset}
          txt={txt}
          onApplyPreset={props.onApplyPreset}
          onReset={props.onReset}
        />

        <AliasSection
          title={txt.workTypeAliases}
          entries={workTypeAliasEntries}
          fromValue={props.newWorkTypeFrom}
          toValue={props.newWorkTypeTo}
          noAliasesText={txt.noAliases}
          txt={{ from: txt.from, to: txt.to, add: txt.add }}
          onRemove={props.onRemoveWorkTypeAlias}
          onFromChange={props.setNewWorkTypeFrom}
          onToChange={props.setNewWorkTypeTo}
          onAdd={props.onAddWorkTypeAlias}
        />

        <AliasSection
          title={txt.varietyAliases}
          entries={varietyAliasEntries}
          fromValue={props.newVarietyFrom}
          toValue={props.newVarietyTo}
          noAliasesText={txt.noAliases}
          txt={{ from: txt.from, to: txt.to, add: txt.add }}
          onRemove={props.onRemoveVarietyAlias}
          onFromChange={props.setNewVarietyFrom}
          onToChange={props.setNewVarietyTo}
          onAdd={props.onAddVarietyAlias}
        />

        {hasAnyAliases && aliasSettings.enabled && (
          <PreviewSection
            workTypeAliasEntries={workTypeAliasEntries}
            varietyAliasEntries={varietyAliasEntries}
            canApplyToSession={props.canApplyToSession}
            applyResult={applyResult}
            onApplyToSession={props.onApplyToSession}
          />
        )}
      </div>
    </div>
  );
};
