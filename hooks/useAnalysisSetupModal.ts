import { useState, useEffect, useMemo, useCallback } from 'react';
import { SortPolicy } from '../types';
import { estimateQuickCost } from '../services/usageTracker';
import { ModelType, setSelectedModel, getSelectedModel } from '../services/geminiService';
import { fileToBase64 } from '../utils/fileHandlers';

const ENABLED_WORK_TYPES_KEY = 'construction_enabled_work_types';

interface FileEntry {
  file: File;
  selected: boolean;
  thumbnail: string | null;
}

interface UseAnalysisSetupModalResult {
  entries: FileEntry[];
  model: ModelType;
  setModel: (m: ModelType) => void;
  sortPolicy: SortPolicy;
  setSortPolicy: (p: SortPolicy) => void;
  useCache: boolean;
  setUseCache: (v: boolean) => void;
  enabledWorkTypes: string[];
  selectedFiles: File[];
  cost: { typical: number };
  toggleSelect: (index: number) => void;
  selectAll: () => void;
  selectNone: () => void;
  handleStart: (onStartAnalysis: (files: File[], sortPolicy: SortPolicy, useCache: boolean) => void) => void;
  handleInteractive: (file: File, onInteractiveTest: (file: File) => void) => void;
}

export function useAnalysisSetupModal(files: File[]): UseAnalysisSetupModalResult {
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

  const toggleSelect = useCallback((index: number) => {
    setEntries(prev => prev.map((e, i) => i === index ? { ...e, selected: !e.selected } : e));
  }, []);

  const selectAll = useCallback(() => {
    setEntries(prev => prev.map(e => ({ ...e, selected: true })));
  }, []);

  const selectNone = useCallback(() => {
    setEntries(prev => prev.map(e => ({ ...e, selected: false })));
  }, []);

  const handleStart = useCallback((onStartAnalysis: (files: File[], sortPolicy: SortPolicy, useCache: boolean) => void) => {
    if (selectedFiles.length === 0) return;
    setSelectedModel(model);
    onStartAnalysis(selectedFiles, sortPolicy, useCache);
  }, [selectedFiles, model, sortPolicy, useCache]);

  const handleInteractive = useCallback((file: File, onInteractiveTest: (file: File) => void) => {
    setSelectedModel(model);
    onInteractiveTest(file);
  }, [model]);

  return {
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
  };
}
