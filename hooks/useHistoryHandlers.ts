import React, { useCallback } from 'react';
import { PhotoRecord, AnalysisHistoryEntry } from '../types';
import { getCachedAnalysis } from '../utils/storage';

interface Props {
  setShowHistory: (v: boolean) => void;
  setIsProcessing: (v: boolean) => void;
  setCurrentStep: (v: string) => void;
  setPhotos: React.Dispatch<React.SetStateAction<PhotoRecord[]>>;
  setStats: React.Dispatch<React.SetStateAction<any>>;
  setInitialInstruction: (v: string) => void;
  setActiveInstruction: (v: string) => void;
  setShowPreview: (v: boolean) => void;
  setSuccessMsg: (v: string | null) => void;
  setErrorMsg: (v: string | null) => void;
}

export function useHistoryHandlers(p: Props) {
  const { setShowHistory, setIsProcessing, setCurrentStep, setPhotos, setStats, setInitialInstruction, setActiveInstruction, setShowPreview, setSuccessMsg, setErrorMsg } = p;

  const handleLoadHistory = useCallback(async (e: AnalysisHistoryEntry) => {
    setShowHistory(false); setIsProcessing(true); setCurrentStep('履歴復元中...');
    try {
      const recs = await Promise.all(e.photoKeys.map(async (k, i) => {
        const pts = k.split('_'), fn = pts.slice(0, -2).join('_');
        const r: PhotoRecord = { fileName: fn, base64: e.thumbnails?.[i] || '', mimeType: 'image/jpeg', fileSize: parseInt(pts[pts.length - 2]) || 0, lastModified: parseInt(pts[pts.length - 1]) || 0, status: 'done', date: parseInt(pts[pts.length - 1]) || 0, fromCache: true };
        const c = await getCachedAnalysis(r); if (c) r.analysis = c; return r;
      }));
      setPhotos(recs); setStats({ total: recs.length, processed: recs.length, success: recs.length, failed: 0, cached: recs.length });
      setInitialInstruction(e.instruction); setActiveInstruction(e.instruction); setShowPreview(true);
      setSuccessMsg(`${e.photoCount}枚を履歴から読み込み`);
    } catch { setErrorMsg('履歴読み込み失敗'); } finally { setIsProcessing(false); setCurrentStep(''); }
  }, [setShowHistory, setIsProcessing, setCurrentStep, setPhotos, setStats, setInitialInstruction, setActiveInstruction, setShowPreview, setSuccessMsg, setErrorMsg]);

  return { handleLoadHistory };
}
