import { useState, useEffect, useMemo, useCallback } from 'react';
import { SortPolicy } from '../../types';
import { ModelType, getSelectedModel } from '../../services/geminiService';
import { fileToBase64 } from '../../utils/fileHandlers';
import { estimateQuickCost } from '../../services/usageTracker';
import { hasCachedAnalysis, deleteCacheByFiles } from '../../utils/storage';
import { FileEntry } from './SubComponents';

const ENABLED_WORK_TYPES_KEY = 'construction_enabled_work_types';

export function useAnalysisSetupState(files: File[]) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [model, setModel] = useState<ModelType>(getSelectedModel());
  const [sortPolicy, setSortPolicy] = useState<SortPolicy>('by_detail_safety_first');
  const [useCache, setUseCache] = useState(true);
  const [enabledWorkTypes, setEnabledWorkTypes] = useState<string[]>([]);

  // Load thumbnails and check cache status
  useEffect(() => {
    const load = async () => {
      const loaded = await Promise.all(
        files.map(async (file) => {
          try {
            const [thumbnail, hasCache] = await Promise.all([
              fileToBase64(file),
              hasCachedAnalysis(file)
            ]);
            return { file, selected: true, thumbnail, hasCache };
          } catch {
            return { file, selected: true, thumbnail: null, hasCache: false };
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
  const selectedCachedCount = useMemo(() => entries.filter(e => e.selected && e.hasCache).length, [entries]);

  const toggleSelect = (index: number) => {
    setEntries(prev => prev.map((e, i) => i === index ? { ...e, selected: !e.selected } : e));
  };

  const selectAll = () => setEntries(prev => prev.map(e => ({ ...e, selected: true })));
  const selectNone = () => setEntries(prev => prev.map(e => ({ ...e, selected: false })));

  const clearSelectedCache = useCallback(async () => {
    const selectedWithCache = entries.filter(e => e.selected && e.hasCache);
    if (selectedWithCache.length === 0) return;

    const msg = `選択中の${selectedWithCache.length}件のキャッシュを削除しますか？\n次回解析時に新規解析されます。`;
    if (!window.confirm(msg)) return;

    await deleteCacheByFiles(selectedWithCache.map(e => e.file));
    setEntries(prev => prev.map(e => {
      if (e.selected && e.hasCache) {
        return { ...e, hasCache: false };
      }
      return e;
    }));
  }, [entries]);

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
    selectedCachedCount,
    toggleSelect,
    selectAll,
    selectNone,
    clearSelectedCache,
  };
}
