import { useCallback } from 'react';
import { SortPolicy } from '../types';
import { getPhotoDate } from '../utils/imageUtils';

type PendingFile = { file: File; date: number };

const MAX_PHOTOS = 30;

interface UseStartProcessingFlowProps {
  setCurrentSortPolicy: (policy: SortPolicy) => void;
  setPendingInstruction: (instruction: string) => void;
  setPendingUseCache: (useCache: boolean) => void;
  setPendingFiles: (files: PendingFile[] | null) => void;
  setSelectionCount: (count: number) => void;
  setPendingAnalysisFiles: (files: File[] | null) => void;
  setShowWorkTypeConfirm: (show: boolean) => void;
  pendingFiles: PendingFile[] | null;
  pendingAnalysisFiles: File[] | null;
  pendingInstruction: string;
  pendingUseCache: boolean;
  selectionStart: number;
  selectionCount: number;
  startAnalysisPipeline: (files: File[], instruction: string, useCache: boolean) => void;
}

/**
 * 処理開始フロー管理のカスタムフック
 */
export function useStartProcessingFlow({
  setCurrentSortPolicy,
  setPendingInstruction,
  setPendingUseCache,
  setPendingFiles,
  setSelectionCount,
  setPendingAnalysisFiles,
  setShowWorkTypeConfirm,
  pendingFiles,
  pendingAnalysisFiles,
  pendingInstruction,
  pendingUseCache,
  selectionStart,
  selectionCount,
  startAnalysisPipeline,
}: UseStartProcessingFlowProps) {
  // 処理開始
  const handleStartProcessing = useCallback(async (
    files: File[],
    instruction: string,
    useCache: boolean,
    sortPolicy: SortPolicy = 'by_detail_safety_first'
  ) => {
    if (!files?.length) return;
    setCurrentSortPolicy(sortPolicy);
    setPendingInstruction(instruction);
    setPendingUseCache(useCache);

    if (files.length > MAX_PHOTOS) {
      const pendingList: PendingFile[] = [];
      for (const f of files) pendingList.push({ file: f, date: await getPhotoDate(f) });
      pendingList.sort((a, b) => a.date - b.date);
      setPendingFiles(pendingList);
      setSelectionCount(Math.min(pendingList.length, MAX_PHOTOS));
      return;
    }

    setPendingAnalysisFiles(files);
    setShowWorkTypeConfirm(true);
  }, [setCurrentSortPolicy, setPendingInstruction, setPendingUseCache, setPendingFiles, setSelectionCount, setPendingAnalysisFiles, setShowWorkTypeConfirm]);

  // 作業種別確認後
  const handleWorkTypeConfirmed = useCallback(() => {
    setShowWorkTypeConfirm(false);
    if (pendingAnalysisFiles) {
      startAnalysisPipeline(pendingAnalysisFiles, pendingInstruction, pendingUseCache);
      setPendingAnalysisFiles(null);
    }
  }, [pendingAnalysisFiles, pendingInstruction, pendingUseCache, startAnalysisPipeline, setShowWorkTypeConfirm, setPendingAnalysisFiles]);

  // 枚数制限モーダルで確定
  const confirmLimitSelection = useCallback(() => {
    if (!pendingFiles) return;
    const selected = pendingFiles.slice(selectionStart - 1, selectionStart - 1 + selectionCount).map(p => p.file);
    setPendingFiles(null);
    setPendingAnalysisFiles(selected);
    setShowWorkTypeConfirm(true);
  }, [pendingFiles, selectionStart, selectionCount, setPendingFiles, setPendingAnalysisFiles, setShowWorkTypeConfirm]);

  return {
    handleStartProcessing,
    handleWorkTypeConfirmed,
    confirmLimitSelection,
  };
}
