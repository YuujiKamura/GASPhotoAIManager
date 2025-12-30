import React, { useCallback } from 'react';
import { PhotoRecord, AIAnalysisResult, LogEntry } from '../types';
import { processImageForAI, getPhotoDate } from '../utils/imageUtils';
import { saveAnalysisHistory } from '../utils/storage';
import { extractLocationName } from '../utils/locationUtils';

const emptyAnalysis = (fn: string): AIAnalysisResult => ({ fileName: fn, workType: '', variety: '', detail: '', station: '', remarks: '', description: '', hasBoard: false, detectedText: '' });

async function loadFiles(files: File[], log: (m: string, t?: LogEntry['type']) => void): Promise<PhotoRecord[]> {
  return Promise.all(files.map(async (f, i) => {
    log(`  [${i + 1}/${files.length}] ${f.name}`, 'info');
    const [date, { base64, mimeType }] = await Promise.all([getPhotoDate(f), processImageForAI(f)]);
    return { fileName: f.name, base64, mimeType, fileSize: f.size, lastModified: f.lastModified, originalFile: f, status: 'pending' as const, date, fromCache: false };
  }));
}

interface Props {
  lang: 'en' | 'ja';
  addLog: (message: string, type?: LogEntry['type']) => void;
  setIsProcessing: (v: boolean) => void;
  setErrorMsg: (v: string | null) => void;
  setSuccessMsg: (v: string | null) => void;
  setPhotos: React.Dispatch<React.SetStateAction<PhotoRecord[]>>;
  setStats: React.Dispatch<React.SetStateAction<any>>;
  setInitialLayout: (v: 2 | 3) => void;
  setShowPreview: (v: boolean) => void;
  setManualPairingPhotos: (v: PhotoRecord[]) => void;
  setShowManualPairing: (v: boolean) => void;
  setInitialInstruction: (v: string) => void;
  setActiveInstruction: (v: string) => void;
  initialInstruction: string;
  activeInstruction: string;
}

export function useManualPairingHandlers(p: Props) {
  const { lang, addLog, setIsProcessing, setErrorMsg, setSuccessMsg, setPhotos, setStats, setInitialLayout, setShowPreview, setManualPairingPhotos, setShowManualPairing, setInitialInstruction, setActiveInstruction, initialInstruction, activeInstruction } = p;

  const handleStartManualPairing = useCallback(async (files: File[], inst: string, skipPairingUI = false) => {
    setIsProcessing(true); setErrorMsg(null); addLog('手動入力モード開始...', 'info'); setInitialInstruction(inst); setActiveInstruction(inst);
    try {
      const r = await loadFiles(files, addLog);
      if (skipPairingUI) {
        const loc = extractLocationName(inst);
        const records = r.map((rec, i) => ({
          ...rec,
          analysis: { ...emptyAnalysis(rec.fileName), station: loc, sceneId: `MANUAL_S${i + 1}`, phase: 'status' as const },
          status: 'done' as const
        }));
        setPhotos(records);
        setStats({ total: records.length, processed: records.length, success: records.length, failed: 0, cached: 0 });
        setInitialLayout(3);
        setShowPreview(true);
        setSuccessMsg(lang === 'ja' ? `${records.length}枚の手動入力準備完了` : `${records.length} photos ready for manual input`);
        addLog(`手動入力: ${records.length}枚`, 'success');
        saveAnalysisHistory(records, '手動入力', 'manual').catch(() => {});
      } else {
        setManualPairingPhotos(r);
        setShowManualPairing(true);
      }
    }
    catch (e: any) { setErrorMsg(e.message); } finally { setIsProcessing(false); }
  }, [addLog, setIsProcessing, setErrorMsg, setInitialInstruction, setActiveInstruction, setManualPairingPhotos, setShowManualPairing, setPhotos, setStats, setInitialLayout, setShowPreview, setSuccessMsg, lang]);

  const handleManualPairingComplete = useCallback((pairs: Array<{ before: PhotoRecord; after: PhotoRecord; id: string }>) => {
    const loc = extractLocationName(activeInstruction || initialInstruction);
    const ps = pairs.flatMap((pr, i) => {
      const sid = `MANUAL_S${i + 1}`;
      return [{ ...pr.before, analysis: { ...(pr.before.analysis || emptyAnalysis(pr.before.fileName)), sceneId: sid, phase: 'before' as const, station: loc, remarks: '着手前' }, status: 'done' as const },
        { ...pr.after, analysis: { ...(pr.after.analysis || emptyAnalysis(pr.after.fileName)), sceneId: sid, phase: 'after' as const, station: loc, remarks: '竣工' }, status: 'done' as const }];
    });
    setPhotos(ps); setStats({ total: ps.length, processed: ps.length, success: ps.length, failed: 0, cached: 0 });
    setInitialLayout(2); setShowPreview(true); setShowManualPairing(false);
    setSuccessMsg(lang === 'ja' ? `${pairs.length}組作成` : `${pairs.length} pairs`); addLog(`手動ペアリング: ${pairs.length}組`, 'success');
    saveAnalysisHistory(ps, '手動ペアリング', 'manual').catch(() => {});
  }, [activeInstruction, initialInstruction, setPhotos, setStats, setInitialLayout, setShowPreview, setShowManualPairing, setSuccessMsg, addLog, lang]);

  return { handleStartManualPairing, handleManualPairingComplete };
}
