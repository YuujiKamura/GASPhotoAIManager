import React, { useCallback } from 'react';
import { PhotoRecord, AppMode, SortPolicy, LogEntry } from '../types';
import { NormalizationCorrection } from '../services/geminiService';
import { runAIAgent } from '../services/aiAgentService';
import { OriginalData } from '../components/NormalizationPreviewModal';
import { useManualPairingHandlers } from './useManualPairingHandlers';
import { useHistoryHandlers } from './useHistoryHandlers';
import { useAnalysisPipeline } from './useAnalysisPipeline';
import { usePairingHandlers } from './usePairingHandlers';

interface Props {
  apiKey: string | null; photos: PhotoRecord[]; setPhotos: React.Dispatch<React.SetStateAction<PhotoRecord[]>>;
  stats: any; setStats: React.Dispatch<React.SetStateAction<any>>; appMode: AppMode; lang: 'en' | 'ja';
  currentSortPolicy: SortPolicy; addLog: (message: string, type?: LogEntry['type'], details?: any) => void;
  setIsProcessing: (v: boolean) => void; setCurrentStep: (v: string) => void; setErrorMsg: (v: string | null) => void;
  setSuccessMsg: (v: string | null) => void; setShowPreview: (v: boolean) => void; setInitialLayout: (v: 2 | 3) => void;
  setShowNormalizationModal: (v: boolean) => void; setNormalizationProposals: (v: NormalizationCorrection[]) => void;
  setNormalizationOriginals: (v: OriginalData[]) => void; setPhotosForNormalization: (v: PhotoRecord[]) => void;
  setManualPairingPhotos: (v: PhotoRecord[]) => void; setShowManualPairing: (v: boolean) => void;
  setShowHistory: (v: boolean) => void; setIsAskingAI: (v: boolean) => void; initialInstruction: string;
  setInitialInstruction: (v: string) => void; activeInstruction: string; setActiveInstruction: (v: string) => void; txt: any;
}

export function useAnalysisHandlers(p: Props) {
  const { apiKey, photos, setPhotos, setStats, appMode, lang, currentSortPolicy, addLog, setIsProcessing, setCurrentStep, setErrorMsg, setSuccessMsg, setShowPreview, setInitialLayout, setShowNormalizationModal, setNormalizationProposals, setNormalizationOriginals, setPhotosForNormalization, setManualPairingPhotos, setShowManualPairing, setShowHistory, setIsAskingAI, initialInstruction, setInitialInstruction, activeInstruction, setActiveInstruction, txt } = p;

  // 分離したフックを使用
  const { handleStartManualPairing, handleManualPairingComplete } = useManualPairingHandlers({
    lang, addLog, setIsProcessing, setErrorMsg, setSuccessMsg, setPhotos, setStats, setInitialLayout, setShowPreview, setManualPairingPhotos, setShowManualPairing, setInitialInstruction, setActiveInstruction, initialInstruction, activeInstruction
  });

  const { handleLoadHistory } = useHistoryHandlers({
    setShowHistory, setIsProcessing, setCurrentStep, setPhotos, setStats, setInitialInstruction, setActiveInstruction, setShowPreview, setSuccessMsg, setErrorMsg
  });

  const { abortRef, startAnalysisPipeline, logResult } = useAnalysisPipeline({
    apiKey, appMode, lang, currentSortPolicy, addLog, setIsProcessing, setCurrentStep, setErrorMsg, setSuccessMsg, setPhotos, setStats, setShowPreview, setInitialLayout, setShowNormalizationModal, setNormalizationProposals, setNormalizationOriginals, setPhotosForNormalization, setInitialInstruction, setActiveInstruction, txt
  });

  const { handleAutoPair, handleSmartSort, handleRefineAnalysis } = usePairingHandlers({
    apiKey, photos, appMode, lang, currentSortPolicy, addLog, logResult, setIsProcessing, setCurrentStep, setErrorMsg, setSuccessMsg, setPhotos, setActiveInstruction, abortRef, txt
  });

  const handleAskAI = useCallback(async (prompt: string) => {
    setIsAskingAI(true);
    try { addLog(`[AIエージェント] ${prompt.slice(0, 50)}...`, 'info'); const r = await runAIAgent(prompt, l => addLog(l, 'info')); addLog('[AIエージェント] 完了', 'success'); return r; }
    catch (e: any) { addLog(`[AIエージェント] エラー: ${e.message}`, 'error'); throw e; }
    finally { setIsAskingAI(false); }
  }, [addLog, setIsAskingAI]);

  return { shouldAbortRef: abortRef, handleAskAI, handleAutoPair, handleSmartSort, handleStartManualPairing, handleManualPairingComplete, handleLoadHistory, startAnalysisPipeline, handleRefineAnalysis, logIndividualResult: logResult };
}
