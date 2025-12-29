import React, { useCallback } from 'react';
import { PhotoRecord, ProcessingStats } from '../types';
import { exportDataToJson, importDataFromJson } from '../utils/storage';

declare const saveAs: any;

interface UseExportHandlersProps {
  photos: PhotoRecord[];
  setPhotos: React.Dispatch<React.SetStateAction<PhotoRecord[]>>;
  setStats: React.Dispatch<React.SetStateAction<ProcessingStats>>;
  setShowPreview: (show: boolean) => void;
}

/**
 * Export/Import関連のカスタムフック
 */
export function useExportHandlers({
  photos,
  setPhotos,
  setStats,
  setShowPreview,
}: UseExportHandlersProps) {
  const handleExportJson = useCallback(() => {
    const json = exportDataToJson(photos);
    const blob = new Blob([json], { type: 'application/json' });
    saveAs(blob, `project_data_${new Date().toISOString().slice(0, 10)}.json`);
  }, [photos]);

  const handleImportJson = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = importDataFromJson(ev.target?.result as string);
        setPhotos(imported);
        setStats({ total: imported.length, processed: imported.length, success: imported.length, failed: 0, cached: 0 });
        setShowPreview(true);
      } catch { alert("Failed to import JSON"); }
    };
    reader.readAsText(e.target.files[0]);
  }, [setPhotos, setStats, setShowPreview]);

  return { handleExportJson, handleImportJson };
}
