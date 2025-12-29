import { useCallback } from 'react';
import { PhotoRecord, SortPolicy } from '../types';
import { applyNormalizationCorrections, NormalizationCorrection } from '../services/geminiService';
import { sortPhotosLogical } from '../utils/sortingUtils';
import { loadAliasSettings, hasAliases, applyAliasesToRecords } from '../utils/workTypeAliases';

interface UseNormalizationHandlersProps {
  currentSortPolicy: SortPolicy;
  photosForNormalization: PhotoRecord[];
  setPhotos: React.Dispatch<React.SetStateAction<PhotoRecord[]>>;
  addLog: (message: string, type?: 'info' | 'success' | 'error') => void;
  setShowNormalizationModal: (show: boolean) => void;
  resetNormalization: () => void;
}

/**
 * 正規化ハンドラー管理のカスタムフック
 */
export function useNormalizationHandlers({
  currentSortPolicy,
  photosForNormalization,
  setPhotos,
  addLog,
  setShowNormalizationModal,
  resetNormalization,
}: UseNormalizationHandlersProps) {
  const handleNormalizationApprove = useCallback((approved: NormalizationCorrection[]) => {
    if (approved.length > 0) {
      const corrected = applyNormalizationCorrections(photosForNormalization, approved);
      setPhotos(prev => prev.map(p => corrected.find(c => c.fileName === p.fileName) || p));
      addLog(`${approved.length}件の修正を適用しました`, 'success');
    }
    setPhotos(prev => sortPhotosLogical(prev, currentSortPolicy));
    const aliasSettings = loadAliasSettings();
    if (aliasSettings.enabled && hasAliases(aliasSettings)) {
      setPhotos(prev => applyAliasesToRecords(prev, aliasSettings).records);
    }
    setShowNormalizationModal(false);
    resetNormalization();
  }, [currentSortPolicy, photosForNormalization, setPhotos, addLog, setShowNormalizationModal, resetNormalization]);

  const handleNormalizationReject = useCallback(() => {
    setPhotos(prev => sortPhotosLogical(prev, currentSortPolicy));
    setShowNormalizationModal(false);
    resetNormalization();
  }, [currentSortPolicy, setPhotos, setShowNormalizationModal, resetNormalization]);

  return {
    handleNormalizationApprove,
    handleNormalizationReject,
  };
}
