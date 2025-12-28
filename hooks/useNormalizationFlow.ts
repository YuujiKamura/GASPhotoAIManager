import { useState, useCallback } from 'react';
import { PhotoRecord } from '../types';
import { NormalizationCorrection } from '../services/geminiService';
import { OriginalData } from '../components/NormalizationPreviewModal';

/**
 * 正規化フロー管理のカスタムフック
 */
export function useNormalizationFlow() {
  const [normalizationProposals, setNormalizationProposals] = useState<NormalizationCorrection[]>([]);
  const [normalizationOriginals, setNormalizationOriginals] = useState<OriginalData[]>([]);
  const [photosForNormalization, setPhotosForNormalization] = useState<PhotoRecord[]>([]);

  // 正規化フローを開始
  const startNormalization = useCallback((
    photos: PhotoRecord[],
    proposals: NormalizationCorrection[],
    originals: OriginalData[]
  ) => {
    setPhotosForNormalization(photos);
    setNormalizationProposals(proposals);
    setNormalizationOriginals(originals);
  }, []);

  // 正規化フローをリセット
  const resetNormalization = useCallback(() => {
    setPhotosForNormalization([]);
    setNormalizationProposals([]);
    setNormalizationOriginals([]);
  }, []);

  return {
    // 状態
    normalizationProposals,
    setNormalizationProposals,
    normalizationOriginals,
    setNormalizationOriginals,
    photosForNormalization,
    setPhotosForNormalization,

    // ユーティリティ
    startNormalization,
    resetNormalization,
  };
}
