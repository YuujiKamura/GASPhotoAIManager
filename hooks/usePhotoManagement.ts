import { useCallback } from 'react';
import { PhotoRecord } from '../types';
import { loadAliasSettings, hasAliases, applyAliasesToRecords } from '../utils/workTypeAliases';

interface UsePhotoManagementProps {
  photos: PhotoRecord[];
  setPhotos: React.Dispatch<React.SetStateAction<PhotoRecord[]>>;
  addLog: (message: string, type?: 'info' | 'success' | 'error') => void;
}

/**
 * エイリアス適用のカスタムフック
 * 注: updatePhoto, deletePhoto, reorderPhotos, replaceStations は usePhotosState に統合済み
 */
export function usePhotoManagement({
  photos,
  setPhotos,
  addLog,
}: UsePhotoManagementProps) {
  // エイリアスを適用
  const handleApplyAliases = useCallback(() => {
    const settings = loadAliasSettings();
    if (!settings.enabled || !hasAliases(settings)) return { modifiedCount: 0 };
    const { modifiedCount, records } = applyAliasesToRecords(photos, settings);
    if (modifiedCount > 0) {
      setPhotos(records);
      addLog(`エイリアス適用: ${modifiedCount}件`, 'success');
    }
    return { modifiedCount };
  }, [photos, setPhotos, addLog]);

  return {
    handleApplyAliases,
  };
}
