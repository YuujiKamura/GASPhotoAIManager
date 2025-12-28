import { useState, useCallback } from 'react';
import { PhotoRecord } from '../types';

type PendingFile = { file: File; date: number };

/**
 * ペンディング状態（ファイル選択・指示など）を管理するカスタムフック
 */
export function usePendingState() {
  const [pendingFiles, setPendingFiles] = useState<PendingFile[] | null>(null);
  const [pendingAnalysisFiles, setPendingAnalysisFiles] = useState<File[] | null>(null);
  const [pendingInstruction, setPendingInstruction] = useState<string>("");
  const [pendingUseCache, setPendingUseCache] = useState<boolean>(true);
  const [manualPairingPhotos, setManualPairingPhotos] = useState<PhotoRecord[]>([]);
  const [selectionStart, setSelectionStart] = useState(1);
  const [selectionCount, setSelectionCount] = useState(30); // MAX_PHOTOS

  // 指示関連
  const [initialInstruction, setInitialInstruction] = useState<string>("");
  const [activeInstruction, setActiveInstruction] = useState<string>("");

  // ペンディングファイルをクリア
  const clearPendingFiles = useCallback(() => {
    setPendingFiles(null);
    setPendingAnalysisFiles(null);
  }, []);

  // ペンディング指示をクリア
  const clearPendingInstruction = useCallback(() => {
    setPendingInstruction("");
    setPendingUseCache(true);
  }, []);

  // 全てのペンディング状態をリセット
  const resetAllPending = useCallback(() => {
    setPendingFiles(null);
    setPendingAnalysisFiles(null);
    setPendingInstruction("");
    setPendingUseCache(true);
    setManualPairingPhotos([]);
    setInitialInstruction("");
    setActiveInstruction("");
  }, []);

  return {
    // ファイル関連
    pendingFiles,
    setPendingFiles,
    pendingAnalysisFiles,
    setPendingAnalysisFiles,
    selectionStart,
    setSelectionStart,
    selectionCount,
    setSelectionCount,

    // 指示関連
    pendingInstruction,
    setPendingInstruction,
    pendingUseCache,
    setPendingUseCache,
    initialInstruction,
    setInitialInstruction,
    activeInstruction,
    setActiveInstruction,

    // ペアリング関連
    manualPairingPhotos,
    setManualPairingPhotos,

    // ユーティリティ
    clearPendingFiles,
    clearPendingInstruction,
    resetAllPending,
  };
}
