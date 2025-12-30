import React, { useState, useEffect, useMemo } from 'react';
import { X, Check, Play, MousePointer, Settings, MessageCircle } from 'lucide-react';
import { SortPolicy, SORT_POLICIES } from '../types';
import { estimateQuickCost, formatCostJPY } from '../services/usageTracker';
import { AVAILABLE_MODELS, ModelType, setSelectedModel, getSelectedModel } from '../services/geminiService';
import { fileToBase64 } from '../utils/fileHandlers';

const ENABLED_WORK_TYPES_KEY = 'construction_enabled_work_types';

interface Props {
  files: File[];
  lang: 'ja' | 'en';
  apiKey?: string;
  onCancel: () => void;
  onStartAnalysis: (files: File[], sortPolicy: SortPolicy, useCache: boolean) => void;
  onManualPairing?: (files: File[]) => void;
  onInteractiveTest: (file: File) => void;
  onOpenMasterEditor: () => void;
  onOpenSettings?: () => void;
}

interface FileEntry {
  file: File;
  selected: boolean;
  thumbnail: string | null;
}

// --- Sub-components to reduce JSX depth ---

interface PhotoGridItemProps {
  entry: FileEntry;
  index: number;
  onToggle: () => void;
  onInteractive: () => void;
}

const PhotoGridItem: React.FC<PhotoGridItemProps> = ({ entry, index, onToggle, onInteractive }) => (
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
      className={`absolute top-1 left-1 w-5 h-5 rounded flex items-center justify-center ${
        entry.selected ? 'bg-blue-500 text-white' : 'bg-white/80 border'
      }`}
    >
      {entry.selected && <Check className="w-3 h-3" />}
    </button>
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
  txt: { clickToTest: string; all: string; none: string };
}

const PhotoGrid: React.FC<PhotoGridProps> = ({ entries, onToggle, onInteractive, onSelectAll, onSelectNone, txt }) => (
  <div className="flex-1 overflow-auto p-3">
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs text-gray-500">{txt.clickToTest}</span>
      <div className="flex gap-1">
        <button onClick={onSelectAll} className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 rounded">{txt.all}</button>
        <button onClick={onSelectNone} className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 rounded">{txt.none}</button>
      </div>
    </div>
    <div className="grid grid-cols-5 gap-2">
      {entries.map((entry, i) => (
        <PhotoGridItem
          key={i}
          entry={entry}
          index={i}
          onToggle={() => onToggle(i)}
          onInteractive={() => onInteractive(entry.file)}
        />
      ))}
    </div>
  </div>
);

interface ModelSelectorProps {
  model: ModelType;
  setModel: (m: ModelType) => void;
}

const ModelSelectorRow: React.FC<ModelSelectorProps> = ({ model, setModel }) => (
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

const SortSelectorRow: React.FC<SortSelectorProps> = ({ sortPolicy, setSortPolicy }) => (
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
  enabledWorkTypes: string[];
  onOpenMasterEditor: () => void;
  txt: {
    selected: string;
    cost: string;
    model: string;
    sort: string;
    cache: string;
    workTypes: string;
    noWorkTypes: string;
  };
}

const SettingsSection: React.FC<SettingsSectionProps> = ({
  selectedCount, totalCount, cost, model, setModel,
  sortPolicy, setSortPolicy, useCache, setUseCache,
  enabledWorkTypes, onOpenMasterEditor, txt
}) => (
  <div className="px-4 py-3 border-t bg-gray-50 space-y-2">
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600">
        {txt.selected}: <b className="text-blue-600">{selectedCount}/{totalCount}</b>
      </span>
      <span className="text-gray-600">
        {txt.cost}: <b className="text-blue-600">${cost.typical.toFixed(3)} ({formatCostJPY(cost.typical)})</b>
      </span>
    </div>
    <div className="flex gap-2">
      <div className="flex-1">
        <div className="text-[10px] text-gray-500 mb-1">{txt.model}</div>
        <ModelSelectorRow model={model} setModel={setModel} />
      </div>
      <div className="flex-1">
        <div className="text-[10px] text-gray-500 mb-1">{txt.sort}</div>
        <SortSelectorRow sortPolicy={sortPolicy} setSortPolicy={setSortPolicy} />
      </div>
    </div>
    <CacheAndWorkTypesRow
      useCache={useCache}
      setUseCache={setUseCache}
      enabledWorkTypes={enabledWorkTypes}
      onOpenMasterEditor={onOpenMasterEditor}
      txt={{ cache: txt.cache, workTypes: txt.workTypes, noWorkTypes: txt.noWorkTypes }}
    />
  </div>
);

interface CacheAndWorkTypesRowProps {
  useCache: boolean;
  setUseCache: (v: boolean) => void;
  enabledWorkTypes: string[];
  onOpenMasterEditor: () => void;
  txt: { cache: string; workTypes: string; noWorkTypes: string };
}

const CacheAndWorkTypesRow: React.FC<CacheAndWorkTypesRowProps> = ({
  useCache, setUseCache, enabledWorkTypes, onOpenMasterEditor, txt
}) => (
  <div className="flex items-center gap-4">
    <label className="flex items-center gap-2 text-xs text-gray-600">
      <input type="checkbox" checked={useCache} onChange={e => setUseCache(e.target.checked)} />
      {txt.cache}
    </label>
    <div className="flex items-center gap-2 text-xs text-gray-600">
      <span>{txt.workTypes}:</span>
      {enabledWorkTypes.length > 0 ? (
        <span className="text-blue-600 font-medium">{enabledWorkTypes.length}件</span>
      ) : (
        <span className="text-red-500">{txt.noWorkTypes}</span>
      )}
      <button onClick={onOpenMasterEditor} className="p-1 hover:bg-gray-200 rounded">
        <Settings className="w-3 h-3" />
      </button>
    </div>
  </div>
);

interface ActionButtonsProps {
  onCancel: () => void;
  onManualPairing?: (files: File[]) => void;
  onStart: () => void;
  selectedFiles: File[];
  enabledWorkTypes: string[];
  txt: { cancel: string; manual: string; start: string };
}

const ActionButtons: React.FC<ActionButtonsProps> = ({
  onCancel, onManualPairing, onStart, selectedFiles, enabledWorkTypes, txt
}) => (
  <div className="flex gap-2 px-4 py-3 border-t">
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
      disabled={selectedFiles.length === 0 || enabledWorkTypes.length === 0}
      className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded font-bold flex items-center gap-1"
    >
      <Play className="w-4 h-4" /> {txt.start}
    </button>
  </div>
);

// --- Main Component ---

const AnalysisSetupModal: React.FC<Props> = ({
  files, lang, apiKey, onCancel, onStartAnalysis, onManualPairing, onInteractiveTest, onOpenMasterEditor, onOpenSettings
}) => {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [model, setModel] = useState<ModelType>(getSelectedModel());
  const [sortPolicy, setSortPolicy] = useState<SortPolicy>('by_detail_safety_first');
  const [useCache, setUseCache] = useState(true);
  const [enabledWorkTypes, setEnabledWorkTypes] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      const loaded = await Promise.all(
        files.map(async (file) => {
          try {
            const thumbnail = await fileToBase64(file);
            return { file, selected: true, thumbnail };
          } catch {
            return { file, selected: true, thumbnail: null };
          }
        })
      );
      setEntries(loaded);
    };
    load();
  }, [files]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ENABLED_WORK_TYPES_KEY);
      if (saved) setEnabledWorkTypes(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const selectedFiles = useMemo(() => entries.filter(e => e.selected).map(e => e.file), [entries]);
  const cost = useMemo(() => estimateQuickCost(selectedFiles.length), [selectedFiles.length]);

  const toggleSelect = (index: number) => {
    setEntries(prev => prev.map((e, i) => i === index ? { ...e, selected: !e.selected } : e));
  };

  const selectAll = () => setEntries(prev => prev.map(e => ({ ...e, selected: true })));
  const selectNone = () => setEntries(prev => prev.map(e => ({ ...e, selected: false })));

  const handleStart = () => {
    if (selectedFiles.length === 0) return;
    if (!apiKey) {
      onOpenSettings?.();
      return;
    }
    setSelectedModel(model);
    onStartAnalysis(selectedFiles, sortPolicy, useCache);
  };

  const handleInteractive = (file: File) => {
    setSelectedModel(model);
    onInteractiveTest(file);
  };

  const txt = {
    title: lang === 'ja' ? '解析設定' : 'Analysis Setup',
    selected: lang === 'ja' ? '選択' : 'Selected',
    cost: lang === 'ja' ? '推定コスト' : 'Est. Cost',
    model: lang === 'ja' ? 'モデル' : 'Model',
    sort: lang === 'ja' ? '並び替え' : 'Sort',
    cache: lang === 'ja' ? 'キャッシュ' : 'Cache',
    workTypes: lang === 'ja' ? '工種' : 'Work Types',
    all: lang === 'ja' ? '全選択' : 'All',
    none: lang === 'ja' ? '解除' : 'None',
    cancel: lang === 'ja' ? 'キャンセル' : 'Cancel',
    manual: lang === 'ja' ? '手動' : 'Manual',
    start: lang === 'ja' ? '解析開始' : 'Start',
    clickToTest: lang === 'ja' ? 'クリックで対話型テスト' : 'Click for interactive test',
    noWorkTypes: lang === 'ja' ? '工種未設定' : 'No work types',
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-blue-600 text-white rounded-t-xl">
          <span className="font-bold">{txt.title}</span>
          <button onClick={onCancel} className="p-1 hover:bg-white/20 rounded"><X className="w-5 h-5" /></button>
        </div>
        <PhotoGrid
          entries={entries}
          onToggle={toggleSelect}
          onInteractive={handleInteractive}
          onSelectAll={selectAll}
          onSelectNone={selectNone}
          txt={{ clickToTest: txt.clickToTest, all: txt.all, none: txt.none }}
        />
        <SettingsSection
          selectedCount={selectedFiles.length}
          totalCount={entries.length}
          cost={cost}
          model={model}
          setModel={setModel}
          sortPolicy={sortPolicy}
          setSortPolicy={setSortPolicy}
          useCache={useCache}
          setUseCache={setUseCache}
          enabledWorkTypes={enabledWorkTypes}
          onOpenMasterEditor={onOpenMasterEditor}
          txt={{
            selected: txt.selected,
            cost: txt.cost,
            model: txt.model,
            sort: txt.sort,
            cache: txt.cache,
            workTypes: txt.workTypes,
            noWorkTypes: txt.noWorkTypes,
          }}
        />
        <ActionButtons
          onCancel={onCancel}
          onManualPairing={onManualPairing}
          onStart={handleStart}
          selectedFiles={selectedFiles}
          enabledWorkTypes={enabledWorkTypes}
          txt={{ cancel: txt.cancel, manual: txt.manual, start: txt.start }}
        />
      </div>
    </div>
  );
};

export default AnalysisSetupModal;
