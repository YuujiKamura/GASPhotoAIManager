import { useState, useEffect, useMemo } from 'react';
import { SortPolicy } from '../../types';
import { ModelType, getSelectedModel } from '../../services/geminiService';
import { fileToBase64 } from '../../utils/fileHandlers';
import { estimateQuickCost } from '../../services/usageTracker';
import { FileEntry } from './SubComponents';

const ENABLED_WORK_TYPES_KEY = 'construction_enabled_work_types';

export function useAnalysisSetupState(files: File[]) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [model, setModel] = useState<ModelType>(getSelectedModel());
  const [sortPolicy, setSortPolicy] = useState<SortPolicy>('by_detail_safety_first');
  const [useCache, setUseCache] = useState(true);
  const [enabledWorkTypes, setEnabledWorkTypes] = useState<string[]>([]);

  // Load thumbnails
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

  // Load enabled work types
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
  };
}
