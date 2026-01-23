import React, { useCallback } from 'react';
import { PhotoRecord, AIAnalysisResult } from '../types';
import { saveAnalysisHistory, cacheAnalysis } from '../utils/storage';

interface UseProjectHandlersProps {
  txt: { resetConfirm: string };
  setPhotos: React.Dispatch<React.SetStateAction<PhotoRecord[]>>;
  setShowPreview: (show: boolean) => void;
  setInitialLayout: (layout: 2 | 3) => void;
  resetStats: () => void;
  setErrorMsg: (msg: string | null) => void;
  setSuccessMsg: (msg: string | null) => void;
  resetAllPending: () => void;
  clearLogs: () => void;
  addLog: (message: string, type?: 'info' | 'success' | 'error') => void;
  handleRefineAnalysis: (instruction: string, count: number) => void;
  photos: PhotoRecord[];
  setInteractiveAnalysisTarget: (target: PhotoRecord | null) => void;
}

/**
 * プロジェクト管理ハンドラーのカスタムフック
 */
export function useProjectHandlers({
  txt,
  setPhotos,
  setShowPreview,
  setInitialLayout,
  resetStats,
  setErrorMsg,
  setSuccessMsg,
  resetAllPending,
  clearLogs,
  addLog,
  handleRefineAnalysis,
  photos,
  setInteractiveAnalysisTarget,
}: UseProjectHandlersProps) {
  // プロジェクトを閉じる
  const handleCloseProject = useCallback(async () => {
    if (window.confirm(txt.resetConfirm)) {
      setPhotos([]);
      resetStats();
      setErrorMsg(null);
      setSuccessMsg(null);
      setShowPreview(false);
      resetAllPending();
      setInitialLayout(3);
      clearLogs();
    }
  }, [txt.resetConfirm, setPhotos, resetStats, setErrorMsg, setSuccessMsg, setShowPreview, resetAllPending, setInitialLayout, clearLogs]);

  // コンソール指示
  const handleConsoleInstruction = useCallback((instruction: string) => {
    addLog("User instruction: " + instruction, "info");
    handleRefineAnalysis(instruction, 6);
  }, [addLog, handleRefineAnalysis]);

  // インタラクティブ解析を開始
  const handleInteractiveAnalysis = useCallback((fileName: string) => {
    const target = photos.find(p => p.fileName === fileName);
    if (target) setInteractiveAnalysisTarget(target);
  }, [photos, setInteractiveAnalysisTarget]);

  // インタラクティブ解析を確定
  const handleInteractiveAnalysisConfirm = useCallback((fileName: string, analysis: AIAnalysisResult) => {
    setPhotos(prev => {
      const updated = prev.map(p => {
        if (p.fileName === fileName) {
          const updatedPhoto = { ...p, analysis, status: 'done' as const };
          // 個別キャッシュにも保存（getCachedAnalysisで使用される）
          cacheAnalysis(updatedPhoto, analysis).catch(err => {
            console.error('Failed to cache analysis:', err);
          });
          return updatedPhoto;
        }
        return p;
      });
      // 履歴に保存
      saveAnalysisHistory(updated, '対話型解析', 'gemini').catch(err => {
        console.error('Failed to save analysis history:', err);
      });
      return updated;
    });
    setSuccessMsg("Photo analyzed successfully.");
  }, [setPhotos, setSuccessMsg]);

  return {
    handleCloseProject,
    handleConsoleInstruction,
    handleInteractiveAnalysis,
    handleInteractiveAnalysisConfirm,
  };
}
