import { useCallback } from 'react';
import { PhotoRecord, ProcessingStats, AIAnalysisResult } from '../types';
import { loadAliasSettings, hasAliases, applyAliasesToRecords } from '../utils/workTypeAliases';

interface UsePhotoManagementProps {
  lang: 'ja' | 'en';
  photos: PhotoRecord[];
  setPhotos: React.Dispatch<React.SetStateAction<PhotoRecord[]>>;
  setStats: React.Dispatch<React.SetStateAction<ProcessingStats>>;
  addLog: (message: string, type?: 'info' | 'success' | 'error') => void;
  setSuccessMsg: (msg: string | null) => void;
}

/**
 * 写真管理（更新・削除・並び替え・測点置換・エイリアス適用）のカスタムフック
 */
export function usePhotoManagement({
  lang,
  photos,
  setPhotos,
  setStats,
  addLog,
  setSuccessMsg,
}: UsePhotoManagementProps) {
  // 写真を更新
  const handleUpdatePhoto = useCallback((fileName: string, field: keyof AIAnalysisResult, value: string) => {
    setPhotos(prev => prev.map(p => {
      if (p.fileName === fileName && p.analysis) {
        const editedFields = p.analysis.editedFields ? [...p.analysis.editedFields] : [];
        if (!editedFields.includes(field as string)) editedFields.push(field as string);
        return { ...p, analysis: { ...p.analysis, [field]: value, editedFields } };
      }
      return p;
    }));
  }, [setPhotos]);

  // 写真を削除
  const handleDeletePhoto = useCallback((fileName: string) => {
    if (window.confirm(lang === 'ja' ? "この写真を削除してもよろしいですか？" : "Delete this photo?")) {
      const updated = photos.filter(p => p.fileName !== fileName);
      setPhotos(updated);
      const success = updated.filter(p => p.status === 'done').length;
      const failed = updated.filter(p => p.status === 'error').length;
      const cached = updated.filter(p => p.fromCache).length;
      setStats({ total: updated.length, processed: success + failed, success, failed, cached });
    }
  }, [lang, photos, setPhotos, setStats]);

  // 測点を一括置換
  const handleStationReplace = useCallback((replacements: Array<{ fileName: string; newStation: string }>) => {
    if (replacements.length === 0) return;
    setPhotos(prev => prev.map(p => {
      const r = replacements.find(rep => rep.fileName === p.fileName);
      return r && p.analysis ? { ...p, analysis: { ...p.analysis, station: r.newStation } } : p;
    }));
    setSuccessMsg(`${replacements.length}枚の測点を更新しました`);
  }, [setPhotos, setSuccessMsg]);

  // 写真を並び替え
  const handleReorderPhotos = useCallback((reordered: PhotoRecord[]) => {
    setPhotos(reordered);
  }, [setPhotos]);

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
    handleUpdatePhoto,
    handleDeletePhoto,
    handleStationReplace,
    handleReorderPhotos,
    handleApplyAliases,
  };
}
