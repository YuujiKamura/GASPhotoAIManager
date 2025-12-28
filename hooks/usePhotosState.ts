import { useState, useEffect, useCallback } from 'react';
import { PhotoRecord, ProcessingStats, AIAnalysisResult, SortPolicy } from '../types';
import { saveProjectData, loadProjectData, clearProjectData, cacheAnalysis } from '../utils/storage';
import { initLearningService, recordManualEdit } from '../services/learningService';
import { sortPhotosLogical } from '../utils/sortingUtils';
import { learnFromOrder } from '../utils/learnedSortOrder';

/**
 * 写真状態管理のカスタムフック
 */
export function usePhotosState(addLog?: (message: string, type?: 'info' | 'success' | 'error') => void) {
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [stats, setStats] = useState<ProcessingStats>({ total: 0, processed: 0, success: 0, failed: 0, cached: 0 });
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [currentSortPolicy, setCurrentSortPolicy] = useState<SortPolicy>('by_detail_safety_first');
  const [initialLayout, setInitialLayout] = useState<2 | 3>(3);

  // 初期ロード
  useEffect(() => {
    const initLoad = async () => {
      try {
        await initLearningService();
        const savedPhotos = await loadProjectData();
        if (savedPhotos && savedPhotos.length > 0) {
          setPhotos(savedPhotos);
          const success = savedPhotos.filter(p => p.status === 'done').length;
          const failed = savedPhotos.filter(p => p.status === 'error').length;
          const cached = savedPhotos.filter(p => p.fromCache).length;
          setStats({ total: savedPhotos.length, processed: success + failed, success, failed, cached });
          setShowPreview(true);
          addLog?.("Restored previous session data.", 'success');
        }
      } catch (err) {
        console.error("Failed to load session", err);
      } finally {
        setIsStorageLoaded(true);
      }
    };
    initLoad();
  }, [addLog]);

  // Auto-Save
  useEffect(() => {
    if (!isStorageLoaded) return;
    const timer = setTimeout(() => {
      if (photos.length > 0) {
        saveProjectData(photos).catch(console.error);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [photos, isStorageLoaded]);

  // 写真を更新
  const updatePhoto = useCallback((fileName: string, field: keyof AIAnalysisResult, value: string) => {
    setPhotos(prev => prev.map(p => {
      if (p.fileName === fileName && p.analysis) {
        const oldValue = String(p.analysis[field] || '');
        const editedFields = p.analysis.editedFields ? [...p.analysis.editedFields] : [];
        if (!editedFields.includes(field as string)) {
          editedFields.push(field as string);
        }

        const updatedAnalysis: AIAnalysisResult = {
          ...p.analysis,
          [field]: value,
          editedFields: editedFields
        };

        cacheAnalysis(p, updatedAnalysis).catch(e => console.error("Cache update failed", e));

        if (oldValue !== value) {
          recordManualEdit(p.analysis, field, oldValue, value).catch(e =>
            console.warn("Failed to record edit for learning:", e)
          );
        }

        return { ...p, analysis: updatedAnalysis };
      }
      return p;
    }));
  }, []);

  // 写真を削除
  const deletePhoto = useCallback((fileName: string, lang: 'ja' | 'en' = 'ja') => {
    const confirmMsg = lang === 'ja' ? "この写真を削除してもよろしいですか？" : "Are you sure you want to delete this photo?";
    if (window.confirm(confirmMsg)) {
      const updatedPhotos = photos.filter(p => p.fileName !== fileName);
      setPhotos(updatedPhotos);

      const success = updatedPhotos.filter(p => p.status === 'done').length;
      const failed = updatedPhotos.filter(p => p.status === 'error').length;
      const cached = updatedPhotos.filter(p => p.fromCache).length;
      setStats({ total: updatedPhotos.length, processed: success + failed, success, failed, cached });
      addLog?.(`Deleted photo: ${fileName}`, 'info');
    }
  }, [photos, addLog]);

  // 写真を並べ替え
  const reorderPhotos = useCallback((reorderedPhotos: PhotoRecord[]) => {
    const orderedDetails = reorderedPhotos.map(p => p.analysis?.detail || p.analysis?.variety || '');
    learnFromOrder(orderedDetails);
    setPhotos(reorderedPhotos);
    addLog?.(`順序を学習しました: ${orderedDetails.filter(d => d).join(' → ')}`, 'info');
  }, [addLog]);

  // 測点を一括置換
  const replaceStations = useCallback((replacements: Array<{ fileName: string; newStation: string }>) => {
    if (replacements.length === 0) return;

    setPhotos(prev => prev.map(p => {
      const replacement = replacements.find(r => r.fileName === p.fileName);
      if (replacement && p.analysis) {
        const updatedAnalysis = { ...p.analysis, station: replacement.newStation };
        cacheAnalysis(p, updatedAnalysis).catch(console.error);
        return { ...p, analysis: updatedAnalysis };
      }
      return p;
    }));
    addLog?.(`測点を一括置換: ${replacements.length}枚`, 'success');
  }, [addLog]);

  // プロジェクトをクローズ
  const closeProject = useCallback(async (confirmMsg: string) => {
    if (window.confirm(confirmMsg)) {
      setPhotos([]);
      setStats({ total: 0, processed: 0, success: 0, failed: 0, cached: 0 });
      setShowPreview(false);
      setInitialLayout(3);
      await clearProjectData();
      return true;
    }
    return false;
  }, []);

  // ソート
  const sortPhotos = useCallback((policy?: SortPolicy) => {
    const policyToUse = policy || currentSortPolicy;
    setPhotos(prev => sortPhotosLogical(prev, policyToUse));
  }, [currentSortPolicy]);

  // 統計を更新
  const updateStats = useCallback((newPhotos: PhotoRecord[]) => {
    const success = newPhotos.filter(p => p.status === 'done').length;
    const failed = newPhotos.filter(p => p.status === 'error').length;
    const cached = newPhotos.filter(p => p.fromCache).length;
    setStats({ total: newPhotos.length, processed: success + failed, success, failed, cached });
  }, []);

  return {
    photos,
    setPhotos,
    stats,
    setStats,
    isStorageLoaded,
    showPreview,
    setShowPreview,
    currentSortPolicy,
    setCurrentSortPolicy,
    initialLayout,
    setInitialLayout,
    updatePhoto,
    deletePhoto,
    reorderPhotos,
    replaceStations,
    closeProject,
    sortPhotos,
    updateStats,
  };
}
