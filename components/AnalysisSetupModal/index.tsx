import React, { useState, useEffect, useMemo } from 'react';
import { X, Play, MousePointer } from 'lucide-react';
import { SortPolicy } from '../../types';
import { estimateQuickCost } from '../../services/usageTracker';
import { ModelType, setSelectedModel, getSelectedModel } from '../../services/geminiService';
import { fileToBase64 } from '../../utils/fileHandlers';
import { PhotoGridItem } from './PhotoGridItem';
import { SettingsPanel } from './SettingsPanel';

const ENABLED_WORK_TYPES_KEY = 'construction_enabled_work_types';

interface Props {
  files: File[];
  lang: 'ja' | 'en';
  onCancel: () => void;
  onStartAnalysis: (files: File[], sortPolicy: SortPolicy, useCache: boolean) => void;
  onManualPairing?: (files: File[]) => void;
  onInteractiveTest: (file: File) => void;
  onOpenMasterEditor: () => void;
}

interface FileEntry {
  file: File;
  selected: boolean;
  thumbnail: string | null;
}

const AnalysisSetupModal: React.FC<Props> = ({
  files, lang, onCancel, onStartAnalysis, onManualPairing, onInteractiveTest, onOpenMasterEditor
}) => {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [model, setModel] = useState<ModelType>(getSelectedModel());
  const [sortPolicy, setSortPolicy] = useState<SortPolicy>('by_detail_safety_first');
  const [useCache, setUseCache] = useState(true);
  const [enabledWorkTypes, setEnabledWorkTypes] = useState<string[]>([]);

  // サムネイル生成
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

  // 有効工種を読み込み
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
    setSelectedModel(model);
    onStartAnalysis(selectedFiles, sortPolicy, useCache);
  };

  const handleInteractive = (file: File) => {
    setSelectedModel(model);
    onInteractiveTest(file);
  };

  const txt = {
    title: lang === 'ja' ? '解析設定' : 'Analysis Setup',
    all: lang === 'ja' ? '全選択' : 'All',
    none: lang === 'ja' ? '解除' : 'None',
    cancel: lang === 'ja' ? 'キャンセル' : 'Cancel',
    manual: lang === 'ja' ? '手動' : 'Manual',
    start: lang === 'ja' ? '解析開始' : 'Start',
    clickToTest: lang === 'ja' ? 'クリックで対話型テスト' : 'Click for interactive test',
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-blue-600 text-white rounded-t-xl">
          <span className="font-bold">{txt.title}</span>
          <button onClick={onCancel} className="p-1 hover:bg-white/20 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Photo Grid */}
        <div className="flex-1 overflow-auto p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">{txt.clickToTest}</span>
            <div className="flex gap-1">
              <button onClick={selectAll} className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 rounded">
                {txt.all}
              </button>
              <button onClick={selectNone} className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 rounded">
                {txt.none}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {entries.map((entry, i) => (
              <PhotoGridItem
                key={i}
                thumbnail={entry.thumbnail}
                filename={entry.file.name}
                selected={entry.selected}
                onToggleSelect={() => toggleSelect(i)}
                onInteractiveTest={() => handleInteractive(entry.file)}
              />
            ))}
          </div>
        </div>

        {/* Settings */}
        <SettingsPanel
          lang={lang}
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
        />

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
            onClick={handleStart}
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
