import React, { useState } from 'react';
import { Check, MousePointer, Play, MessageCircle, Database, Trash2, Key, AlertCircle, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import { SortPolicy, SORT_POLICIES } from '../../types';
import { AVAILABLE_MODELS, ModelType } from '../../services/geminiService';
import { formatCostJPY } from '../../services/usageTracker';
import { loadRuleSettings, rulesToPromptText } from '../../utils/analysisRules';

export interface FileEntry {
  file: File;
  selected: boolean;
  thumbnail: string | null;
  hasCache?: boolean;
}

// --- Photo Grid ---

interface PhotoGridItemProps {
  entry: FileEntry;
  onToggle: () => void;
  onInteractive: () => void;
}

export const PhotoGridItem: React.FC<PhotoGridItemProps> = ({ entry, onToggle, onInteractive }) => (
  <div
    className={`relative aspect-square rounded border-2 cursor-pointer overflow-hidden group ${
      entry.selected ? 'border-blue-500' : 'border-gray-200 opacity-50'
    }`}
  >
    {entry.thumbnail && (
      <img src={entry.thumbnail} alt="" className="w-full h-full object-cover" />
    )}
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={`absolute top-1 left-1 w-5 h-5 rounded flex items-center justify-center z-10 ${
        entry.selected ? 'bg-blue-500 text-white' : 'bg-white/80 border'
      }`}
    >
      {entry.selected && <Check className="w-3 h-3" />}
    </button>
    {entry.hasCache && (
      <div className="absolute top-1 right-1 w-5 h-5 rounded bg-green-500 text-white flex items-center justify-center z-10" title="キャッシュあり">
        <Database className="w-3 h-3" />
      </div>
    )}
    <button
      onClick={onInteractive}
      className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
    >
      <MessageCircle className="w-6 h-6 text-white drop-shadow" />
    </button>
    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] px-1 truncate">
      {entry.file.name}
    </div>
  </div>
);

interface PhotoGridProps {
  entries: FileEntry[];
  onToggle: (index: number) => void;
  onInteractive: (file: File) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onClearSelectedCache?: () => void;
  selectedCachedCount: number;
  txt: { clickToTest: string; all: string; none: string; clearCache: string };
}

export const PhotoGrid: React.FC<PhotoGridProps> = ({ entries, onToggle, onInteractive, onSelectAll, onSelectNone, onClearSelectedCache, selectedCachedCount, txt }) => (
  <div className="flex-1 overflow-auto p-3">
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs text-gray-500">{txt.clickToTest}</span>
      <div className="flex gap-1">
        <button onClick={onSelectAll} className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 rounded">{txt.all}</button>
        <button onClick={onSelectNone} className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 rounded">{txt.none}</button>
        {selectedCachedCount > 0 && onClearSelectedCache && (
          <button
            onClick={onClearSelectedCache}
            className="px-2 py-0.5 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded flex items-center gap-1"
            title={`選択中の${selectedCachedCount}件のキャッシュを削除`}
          >
            <Trash2 className="w-3 h-3" />
            {txt.clearCache} ({selectedCachedCount})
          </button>
        )}
      </div>
    </div>
    <div className="grid grid-cols-5 gap-2">
      {entries.map((entry, i) => (
        <PhotoGridItem
          key={i}
          entry={entry}
          onToggle={() => onToggle(i)}
          onInteractive={() => onInteractive(entry.file)}
        />
      ))}
    </div>
  </div>
);

// --- Selectors ---

interface ModelSelectorProps {
  model: ModelType;
  setModel: (m: ModelType) => void;
}

export const ModelSelectorRow: React.FC<ModelSelectorProps> = ({ model, setModel }) => (
  <div className="flex gap-1">
    {AVAILABLE_MODELS.map(m => (
      <button
        key={m.id}
        onClick={() => setModel(m.id)}
        className={`flex-1 py-1 text-xs rounded ${
          model === m.id ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'
        }`}
      >
        {m.name.replace('Gemini ', '')}
      </button>
    ))}
  </div>
);

interface SortSelectorProps {
  sortPolicy: SortPolicy;
  setSortPolicy: (p: SortPolicy) => void;
}

export const SortSelectorRow: React.FC<SortSelectorProps> = ({ sortPolicy, setSortPolicy }) => (
  <select
    value={sortPolicy}
    onChange={e => setSortPolicy(e.target.value as SortPolicy)}
    className="w-full py-1 px-2 text-xs border rounded bg-white"
  >
    {SORT_POLICIES.map(p => (
      <option key={p.id} value={p.id}>{p.name}</option>
    ))}
  </select>
);

// --- Pre-Analysis Info Section ---

interface PreAnalysisInfoSectionProps {
  workType: string;
  setWorkType: (v: string) => void;
  station: string;
  setStation: (v: string) => void;
  enabledWorkTypes: string[];
  txt: {
    workTypeLabel: string;
    workTypePlaceholder: string;
    stationLabel: string;
    stationPlaceholder: string;
  };
}

export const PreAnalysisInfoSection: React.FC<PreAnalysisInfoSectionProps> = ({
  workType, setWorkType, station, setStation, enabledWorkTypes, txt
}) => (
  <div className="px-4 py-3 border-t bg-amber-50 space-y-2">
    <div className="flex gap-3">
      <div className="flex-1">
        <div className="text-[10px] text-gray-500 mb-1">{txt.workTypeLabel} <span className="text-red-500">*</span></div>
        <select
          value={workType}
          onChange={e => setWorkType(e.target.value)}
          className={`w-full py-1.5 px-2 text-xs border rounded bg-white ${
            !workType ? 'border-red-300' : 'border-gray-300'
          }`}
        >
          <option value="">{txt.workTypePlaceholder}</option>
          {enabledWorkTypes.map(wt => (
            <option key={wt} value={wt}>{wt}</option>
          ))}
        </select>
      </div>
      <div className="flex-1">
        <div className="text-[10px] text-gray-500 mb-1">{txt.stationLabel}</div>
        <input
          type="text"
          value={station}
          onChange={e => setStation(e.target.value)}
          placeholder={txt.stationPlaceholder}
          className="w-full py-1.5 px-2 text-xs border border-gray-300 rounded bg-white"
        />
      </div>
    </div>
  </div>
);

// --- Settings Section ---


const CacheRow: React.FC<{ useCache: boolean; setUseCache: (v: boolean) => void; txt: { cacheEnabled: string } }> = ({
  useCache, setUseCache, txt
}) => (
  <label className="flex items-center gap-2 text-sm text-gray-700 bg-blue-50 px-3 py-2 rounded border border-blue-200 cursor-pointer hover:bg-blue-100">
    <input type="checkbox" checked={useCache} onChange={e => setUseCache(e.target.checked)} className="w-4 h-4" />
    <span className="font-medium">{txt.cacheEnabled}</span>
  </label>
);

interface SettingsSectionProps {
  selectedCount: number;
  totalCount: number;
  cost: { typical: number };
  model: ModelType;
  setModel: (m: ModelType) => void;
  sortPolicy: SortPolicy;
  setSortPolicy: (p: SortPolicy) => void;
  useCache: boolean;
  setUseCache: (v: boolean) => void;
  runNormalization: boolean;
  setRunNormalization: (v: boolean) => void;
  txt: {
    selected: string;
    cost: string;
    model: string;
    sort: string;
    cacheEnabled: string;
    runNormalization: string;
  };
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  selectedCount, totalCount, cost, model, setModel,
  sortPolicy, setSortPolicy, useCache, setUseCache,
  runNormalization, setRunNormalization, txt
}) => (
  <div className="px-4 py-3 border-t bg-gray-50 space-y-3">
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600">
        {txt.selected}: <b className="text-blue-600">{selectedCount}/{totalCount}</b>
      </span>
      <span className="text-gray-600">
        {txt.cost}: <b className="text-blue-600">${cost.typical.toFixed(3)} ({formatCostJPY(cost.typical)})</b>
      </span>
    </div>
    <div className="flex flex-col sm:flex-row gap-2">
      <div className="flex-1">
        <div className="text-[10px] text-gray-500 mb-1">{txt.model}</div>
        <ModelSelectorRow model={model} setModel={setModel} />
      </div>
      <div className="flex-1">
        <div className="text-[10px] text-gray-500 mb-1">{txt.sort}</div>
        <SortSelectorRow sortPolicy={sortPolicy} setSortPolicy={setSortPolicy} />
      </div>
    </div>
    <CacheRow useCache={useCache} setUseCache={setUseCache} txt={{ cacheEnabled: txt.cacheEnabled }} />
    {/* 後処理オプション */}
    <div className="flex flex-wrap gap-3 text-xs text-gray-600">
      <label className="flex items-center gap-1.5 cursor-pointer">
        <input type="checkbox" checked={runNormalization} onChange={e => setRunNormalization(e.target.checked)} />
        {txt.runNormalization}
      </label>
    </div>
  </div>
);

// --- Prompt Preview Section ---

interface PromptPreviewSectionProps {
  txt: { showPrompt: string; hidePrompt: string };
}

export const PromptPreviewSection: React.FC<PromptPreviewSectionProps> = ({ txt }) => {
  const [expanded, setExpanded] = useState(false);
  const rules = loadRuleSettings();
  const rulesText = rulesToPromptText(rules);

  return (
    <div className="px-4 py-2 border-t bg-slate-50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800"
      >
        {expanded ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        {expanded ? txt.hidePrompt : txt.showPrompt}
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {expanded && (
        <div className="mt-2 p-2 bg-white border rounded text-[10px] font-mono text-slate-700 max-h-40 overflow-auto whitespace-pre-wrap">
          <div className="font-bold text-slate-500 mb-1">--- 解析ルール ---</div>
          {rulesText || '(カスタムルールなし)'}
          <div className="font-bold text-slate-500 mt-2 mb-1">--- システム指示概要 ---</div>
          <div className="text-slate-600">
            • 写真区分を9カテゴリから自動判定{'\n'}
            • マスタデータから工種・種別・細別を選択{'\n'}
            • 黒板OCRで測点・備考を抽出{'\n'}
            • 温度・出来形の測定値を記録
          </div>
        </div>
      )}
    </div>
  );
};

// --- Action Buttons ---

interface ActionButtonsProps {
  onCancel: () => void;
  onManualPairing?: (files: File[]) => void;
  onStart: () => void;
  onOpenSettings?: () => void;
  selectedFiles: File[];
  enabledWorkTypes: string[];
  workType: string;
  apiKey?: string;
  txt: { cancel: string; manual: string; start: string };
}

// ボタンが無効な理由を取得
const getDisabledReasons = (
  selectedFiles: File[],
  enabledWorkTypes: string[],
  workType: string,
  apiKey?: string
): string[] => {
  const reasons: string[] = [];
  if (!apiKey) reasons.push('APIキー未設定');
  if (selectedFiles.length === 0) reasons.push('写真未選択');
  if (enabledWorkTypes.length === 0) reasons.push('工種マスタ未設定');
  if (!workType) reasons.push('工種未選択');
  return reasons;
};

export const ActionButtons: React.FC<ActionButtonsProps> = ({
  onCancel, onManualPairing, onStart, onOpenSettings, selectedFiles, enabledWorkTypes, workType, apiKey, txt
}) => {
  const disabledReasons = getDisabledReasons(selectedFiles, enabledWorkTypes, workType, apiKey);
  const isDisabled = disabledReasons.length > 0;

  return (
    <div className="px-4 py-3 border-t space-y-2">
      {/* API Key Status & Disabled Reasons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {apiKey ? (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <Key className="w-3 h-3" /> APIキー設定済み
            </span>
          ) : (
            <button
              onClick={onOpenSettings}
              className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1 underline"
            >
              <Key className="w-3 h-3" /> APIキー未設定 - クリックして設定
            </button>
          )}
        </div>
        {isDisabled && disabledReasons.length > 0 && (
          <span className="text-xs text-amber-600 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {disabledReasons.join('、')}
          </span>
        )}
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded">
          {txt.cancel}
        </button>
        <div className="flex-1" />
        {onManualPairing && (
          <button
            onClick={() => onManualPairing(selectedFiles)}
            className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded flex items-center gap-1"
          >
            <MousePointer className="w-4 h-4" /> {txt.manual}
          </button>
        )}
        <button
          onClick={onStart}
          disabled={isDisabled}
          className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded font-bold flex items-center gap-1"
          title={isDisabled ? disabledReasons.join('、') : undefined}
        >
          <Play className="w-4 h-4" /> {txt.start}
        </button>
      </div>
    </div>
  );
};
