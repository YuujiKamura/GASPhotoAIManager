import React from 'react';
import { X, Check, Play, MousePointer, Settings, MessageCircle } from 'lucide-react';
import { SortPolicy, SORT_POLICIES } from '../types';
import { formatCostJPY } from '../services/usageTracker';
import { AVAILABLE_MODELS } from '../services/geminiService';
import { useAnalysisSetupModal } from '../hooks/useAnalysisSetupModal';

interface Props {
  files: File[];
  lang: 'ja' | 'en';
  onCancel: () => void;
  onStartAnalysis: (files: File[], sortPolicy: SortPolicy, useCache: boolean) => void;
  onManualPairing?: (files: File[]) => void;
  onInteractiveTest: (file: File) => void;
  onOpenMasterEditor: () => void;
}

const AnalysisSetupModal: React.FC<Props> = ({
  files, lang, onCancel, onStartAnalysis, onManualPairing, onInteractiveTest, onOpenMasterEditor
}) => {
  const {
    entries,
    model,
    setModel,
    sortPolicy,
    setSortPolicy,
    useCache,
    setUseCache,
    enabledWorkTypes,
    selectedFiles,
    cost,
    toggleSelect,
    selectAll,
    selectNone,
    handleStart,
    handleInteractive,
  } = useAnalysisSetupModal(files);

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
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-blue-600 text-white rounded-t-xl">
          <span className="font-bold">{txt.title}</span>
          <button onClick={onCancel} className="p-1 hover:bg-white/20 rounded"><X className="w-5 h-5" /></button>
        </div>

        {/* Photo Grid */}
        <div className="flex-1 overflow-auto p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">{txt.clickToTest}</span>
            <div className="flex gap-1">
              <button onClick={selectAll} className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 rounded">{txt.all}</button>
              <button onClick={selectNone} className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 rounded">{txt.none}</button>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {entries.map((entry, i) => (
              <div
                key={i}
                className={`relative aspect-square rounded border-2 cursor-pointer overflow-hidden group ${
                  entry.selected ? 'border-blue-500' : 'border-gray-200 opacity-50'
                }`}
              >
                {entry.thumbnail && (
                  <img src={entry.thumbnail} alt="" className="w-full h-full object-cover" />
                )}
                {/* Checkbox */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleSelect(i); }}
                  className={`absolute top-1 left-1 w-5 h-5 rounded flex items-center justify-center ${
                    entry.selected ? 'bg-blue-500 text-white' : 'bg-white/80 border'
                  }`}
                >
                  {entry.selected && <Check className="w-3 h-3" />}
                </button>
                {/* Interactive button */}
                <button
                  onClick={() => handleInteractive(entry.file, onInteractiveTest)}
                  className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MessageCircle className="w-6 h-6 text-white drop-shadow" />
                </button>
                {/* Filename */}
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] px-1 truncate">
                  {entry.file.name}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Settings */}
        <div className="px-4 py-3 border-t bg-gray-50 space-y-2">
          {/* Stats Row */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">
              {txt.selected}: <b className="text-blue-600">{selectedFiles.length}/{entries.length}</b>
            </span>
            <span className="text-gray-600">
              {txt.cost}: <b className="text-blue-600">${cost.typical.toFixed(3)} ({formatCostJPY(cost.typical)})</b>
            </span>
          </div>

          {/* Model + Sort */}
          <div className="flex gap-2">
            <div className="flex-1">
              <div className="text-[10px] text-gray-500 mb-1">{txt.model}</div>
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
            </div>
            <div className="flex-1">
              <div className="text-[10px] text-gray-500 mb-1">{txt.sort}</div>
              <select
                value={sortPolicy}
                onChange={e => setSortPolicy(e.target.value as SortPolicy)}
                className="w-full py-1 px-2 text-xs border rounded bg-white"
              >
                {SORT_POLICIES.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Cache + WorkTypes */}
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
        </div>

        {/* Actions */}
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
            onClick={() => handleStart(onStartAnalysis)}
            disabled={selectedFiles.length === 0 || enabledWorkTypes.length === 0}
            className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded font-bold flex items-center gap-1"
          >
            <Play className="w-4 h-4" /> {txt.start}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnalysisSetupModal;
