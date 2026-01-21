import React, { useState, useEffect, lazy, Suspense, useCallback } from 'react';
import { PhotoRecord, AppMode, SortPolicy, AnalysisStep, AnalysisStepId, AnalysisMode, AnalysisPauseState } from './types';
import { generateExcel } from './utils/excelGenerator';
import { TRANS } from './utils/translations';
import { fileToBase64 } from './utils/fileHandlers';

// Hooks
import {
  useAppModals,
  useProcessingState,
  useNormalizationFlow,
  useFsCache,
  usePendingState,
  useAnalysisHandlers,
  useApiKey,
  usePdfHandlers,
  useExportHandlers,
  useCacheHandlers,
  useStartProcessingFlow,
  useNormalizationHandlers,
  useProjectHandlers,
  usePhotosState,
  useAnalysisSteps,
} from './hooks';

// Core components (PreviewViewは主要ビュー)
import PreviewView from './components/PreviewView';
import { PreAnalysisInfo } from './components/AnalysisSetupModal';

// Lazy-loaded components
const LimitModal = lazy(() => import('./components/LimitModal'));
const RefineModal = lazy(() => import('./components/RefineModal'));
const ApiKeySetup = lazy(() => import('./components/ApiKeySetup'));
const ModelValidation = lazy(() => import('./components/ModelValidation'));
const UsagePanel = lazy(() => import('./components/UsagePanel'));
const ManualPairingModal = lazy(() => import('./components/ManualPairingModal'));
const MasterEditorModal = lazy(() => import('./components/MasterEditorModal'));
const BulkEntryEditor = lazy(() => import('./components/BulkEntryEditor'));
const NormalizationPreviewModal = lazy(() => import('./components/NormalizationPreviewModal'));
const SessionHistoryPanel = lazy(() => import('./components/SessionHistoryPanel'));
const GitHubSyncPanel = lazy(() => import('./components/GitHubSyncPanel'));
const CodebaseHealthDashboard = lazy(() => import('./components/CodebaseHealthDashboard'));
const InteractiveAnalysisDialog = lazy(() => import('./components/InteractiveAnalysisDialog').then(m => ({ default: m.InteractiveAnalysisDialog })));
const PdfLoadDialog = lazy(() => import('./components/PdfLoadDialog'));
const AIFrameworkDashboard = lazy(() => import('./components/AIFrameworkDashboard'));

const MAX_PHOTOS = 30;

const LoadingFallback = () => (
  <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
);

export default function App() {
  // Language & App Mode
  const [lang] = useState<'en' | 'ja'>(() => navigator.language.startsWith('en') ? 'en' : 'ja');
  const txt = TRANS[lang];
  const [appMode, setAppMode] = useState<AppMode>('construction');

  // Interactive Analysis Target
  const [interactiveAnalysisTarget, setInteractiveAnalysisTarget] = useState<PhotoRecord | null>(null);

  // Pending Upload Files (managed at App level to survive modal transitions)
  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[] | null>(null);

  // Core Hooks
  const apiKeyState = useApiKey();
  const modals = useAppModals();
  const processing = useProcessingState();
  const normalization = useNormalizationFlow();
  const fsCacheState = useFsCache(processing.addLog);
  const pending = usePendingState();

  // Analysis Steps Progress (with pause/resume for interactive mode)
  const {
    steps: analysisSteps,
    startStep, completeStep, updateProgress, skipStep, errorStep, resetSteps,
    analysisMode, toggleMode, pauseState, requestPause, resumeAnalysis
  } = useAnalysisSteps();

  // Handler for step updates from pipeline
  const handleStepUpdate = useCallback((id: AnalysisStepId, update: Partial<AnalysisStep>) => {
    if (update.status === 'running') startStep(id);
    else if (update.status === 'done') completeStep(id, update.result);
    else if (update.status === 'skipped') skipStep(id);
    else if (update.status === 'error') errorStep(id, update.result);
    if (update.progress !== undefined) updateProgress(id, update.progress, update.subProgress);
  }, [startStep, completeStep, skipStep, errorStep, updateProgress]);

  // Photos State (unified state management with auto-save)
  const photosState = usePhotosState(processing.addLog);
  const { photos, setPhotos, stats, setStats, showPreview, setShowPreview, currentSortPolicy, setCurrentSortPolicy, initialLayout, setInitialLayout, resetStats, updatePhoto, deletePhoto, reorderPhotos, bulkUpdateFields } = photosState;

  // Analysis Handlers
  const analysisHandlers = useAnalysisHandlers({
    apiKey: apiKeyState.apiKey, photos, setPhotos, stats, setStats,
    appMode, lang, currentSortPolicy, addLog: processing.addLog, setIsProcessing: processing.setIsProcessing,
    setCurrentStep: processing.setCurrentStep, setErrorMsg: processing.setErrorMsg, setSuccessMsg: processing.setSuccessMsg,
    setShowPreview, setInitialLayout, setShowNormalizationModal: modals.setShowNormalizationModal,
    setNormalizationProposals: normalization.setNormalizationProposals, setNormalizationOriginals: normalization.setNormalizationOriginals,
    setPhotosForNormalization: normalization.setPhotosForNormalization, setManualPairingPhotos: pending.setManualPairingPhotos,
    setShowManualPairing: modals.setShowManualPairing, setShowHistory: modals.setShowHistory, setIsAskingAI: processing.setIsAskingAI,
    initialInstruction: pending.initialInstruction, setInitialInstruction: pending.setInitialInstruction,
    activeInstruction: pending.activeInstruction, setActiveInstruction: pending.setActiveInstruction, txt,
    onStepUpdate: handleStepUpdate,
  });

  // PDF Handlers
  const pdfHandlers = usePdfHandlers({ setPhotos, setStats, addLog: processing.addLog, setErrorMsg: processing.setErrorMsg });

  // Export Handlers
  const exportHandlers = useExportHandlers({ photos, setPhotos, setStats, setShowPreview });

  // Cache Handlers
  const cacheHandlers = useCacheHandlers({
    lang, setPhotos, setStats, setErrorMsg: processing.setErrorMsg, setSuccessMsg: processing.setSuccessMsg,
    fsCacheEnabled: fsCacheState.fsCacheEnabled, setFsCacheEnabled: fsCacheState.setFsCacheEnabled, setFsCacheStats: fsCacheState.setFsCacheStats,
  });

  // Start Processing Flow
  const startProcessingFlow = useStartProcessingFlow({
    setCurrentSortPolicy, setPendingInstruction: pending.setPendingInstruction, setPendingUseCache: pending.setPendingUseCache,
    setPendingFiles: pending.setPendingFiles, setSelectionCount: pending.setSelectionCount, setPendingAnalysisFiles: pending.setPendingAnalysisFiles,
    setShowWorkTypeConfirm: modals.setShowWorkTypeConfirm, pendingFiles: pending.pendingFiles, pendingAnalysisFiles: pending.pendingAnalysisFiles,
    pendingInstruction: pending.pendingInstruction, pendingUseCache: pending.pendingUseCache, selectionStart: pending.selectionStart,
    selectionCount: pending.selectionCount, startAnalysisPipeline: analysisHandlers.startAnalysisPipeline,
  });

  // Normalization Handlers
  const normalizationHandlers = useNormalizationHandlers({
    currentSortPolicy, photosForNormalization: normalization.photosForNormalization, setPhotos,
    addLog: processing.addLog, setShowNormalizationModal: modals.setShowNormalizationModal, resetNormalization: normalization.resetNormalization,
  });

  // Project Handlers
  const projectHandlers = useProjectHandlers({
    txt, setPhotos, setShowPreview, setInitialLayout, resetStats, setErrorMsg: processing.setErrorMsg,
    setSuccessMsg: processing.setSuccessMsg, resetAllPending: pending.resetAllPending, clearLogs: processing.clearLogs,
    addLog: processing.addLog, handleRefineAnalysis: analysisHandlers.handleRefineAnalysis, photos, setInteractiveAnalysisTarget,
  });

  // API Key Handlers
  const handleApiKeyInput = (key: string) => {
    apiKeyState.handleApiKeyInput(key);
    modals.setShowApiKeySetup(false);
    modals.setShowModelValidation(true);
  };

  // ロック解除時（モデル検証をスキップ）
  const handleUnlock = (key: string) => {
    apiKeyState.handleUnlockComplete(key);
    modals.setShowApiKeySetup(false);
    // モデル検証はスキップ
  };

  const handleModelValidationComplete = (key: string) => {
    apiKeyState.handleModelValidationComplete(key);
    modals.setShowModelValidation(false);
  };

  const handleModelValidationBack = () => {
    apiKeyState.handleModelValidationBack();
    modals.setShowModelValidation(false);
    modals.setShowApiKeySetup(true);
  };

  // Test One Interactive: FileをPhotoRecordに変換して対話型解析を開く
  const handleTestOneInteractive = useCallback(async (file: File) => {
    try {
      const base64 = await fileToBase64(file);
      const photoRecord: PhotoRecord = {
        fileName: file.name,
        base64,
        mimeType: file.type,
        status: 'pending',
      };
      setInteractiveAnalysisTarget(photoRecord);
    } catch (error) {
      console.error('Failed to load file for interactive analysis:', error);
      processing.setErrorMsg('ファイルの読み込みに失敗しました');
    }
  }, [processing]);

  // 簡素化した解析開始ハンドラ
  const handleStartAnalysis = useCallback((files: File[], sortPolicy: SortPolicy, useCache: boolean, preInfo: PreAnalysisInfo) => {
    resetSteps(); // ステップ進捗をリセット
    setCurrentSortPolicy(sortPolicy);
    analysisHandlers.startAnalysisPipeline(files, '', useCache, preInfo);
  }, [setCurrentSortPolicy, analysisHandlers, resetSteps]);

  // 手動ペアリングモード（2枚ペアを選択するUI）
  const handleManualPairing = useCallback((files: File[]) => {
    analysisHandlers.handleStartManualPairing(files, '', false); // 2枚ペアリングUIを表示
  }, [analysisHandlers]);

  // Render
  return (
    <>
      {modals.showPdfLoadDialog && (
        <Suspense fallback={<LoadingFallback />}>
          <PdfLoadDialog
            isOpen={modals.showPdfLoadDialog}
            onClose={() => { modals.setShowPdfLoadDialog(false); if (photos.length > 0) setShowPreview(true); }}
            onLoad={pdfHandlers.handlePdfLoad}
            lang={lang}
          />
        </Suspense>
      )}

      {modals.showApiKeySetup && (
        <Suspense fallback={<LoadingFallback />}>
          <ApiKeySetup onComplete={handleApiKeyInput} onUnlock={handleUnlock} onCancel={() => modals.setShowApiKeySetup(false)}
            onImportPdf={() => { modals.setShowApiKeySetup(false); modals.setShowPdfLoadDialog(true); }} />
        </Suspense>
      )}

      {modals.showModelValidation && apiKeyState.pendingApiKey && (
        <Suspense fallback={<LoadingFallback />}>
          <ModelValidation apiKey={apiKeyState.pendingApiKey} onComplete={handleModelValidationComplete} onBack={handleModelValidationBack} />
        </Suspense>
      )}

      {modals.showHealthDashboard ? (
        <Suspense fallback={<LoadingFallback />}>
          <CodebaseHealthDashboard lang={lang} onClose={() => modals.setShowHealthDashboard(false)} />
        </Suspense>
      ) : modals.showMasterEditor ? (
        <Suspense fallback={<LoadingFallback />}>
          <MasterEditorModal lang={lang} onClose={() => modals.setShowMasterEditor(false)} />
        </Suspense>
      ) : (
        <PreviewView
          data={{ lang, photos, stats, appMode, logs: processing.logs, initialLayout, apiKey: apiKeyState.apiKey || '', analysisSteps, analysisMode, pauseState, pendingUploadFiles }}
          state={{ isProcessing: processing.isProcessing, currentStep: processing.currentStep, errorMsg: processing.errorMsg, successMsg: processing.successMsg }}
          pauseResumeHandlers={{ onToggleMode: toggleMode, onPause: requestPause, onResume: resumeAnalysis }}
          photoHandlers={{
            onUpdatePhoto: updatePhoto,
            onDeletePhoto: (fileName) => deletePhoto(fileName, lang),
            onReanalyzePhoto: projectHandlers.handleInteractiveAnalysis,
            onReorderPhotos: reorderPhotos
          }}
          actionHandlers={{
            onClearLogs: processing.clearLogs,
            onGoHome: () => { analysisHandlers.shouldAbortRef.current = true; setPhotos([]); resetStats(); setInitialLayout(3); resetSteps(); setPendingUploadFiles(null); },
            onRefine: () => modals.setShowRefineModal(true),
            onExportExcel: (layout) => generateExcel(photos, appMode, layout),
            onAutoPair: analysisHandlers.handleAutoPair,
            onManualPair: () => { pending.setManualPairingPhotos(photos); modals.setShowManualPairing(true); },
            onSendInstruction: projectHandlers.handleConsoleInstruction,
            onAbort: () => { analysisHandlers.shouldAbortRef.current = true; processing.addLog("解析を中断しています...", 'info'); },
            onOpenMasterEditor: () => modals.setShowMasterEditor(true),
            onOpenBulkEditor: () => modals.setShowBulkEditor(true),
            onOpenGitHubSync: () => modals.setShowGitHubSync(true),
            // System handlers (from UploadView)
            onOpenSettings: () => modals.setShowApiKeySetup(true),
            onOpenHealthDashboard: () => modals.setShowHealthDashboard(true),
            onOpenAIFramework: () => modals.setShowAIFramework(true),
            onPdfLoad: () => modals.setShowPdfLoadDialog(true),
            onClearCache: cacheHandlers.handleClearCache,
            onStartProcessing: handleStartAnalysis,
            onManualPairing: handleManualPairing,
            onTestOneInteractive: handleTestOneInteractive,
            onFilesSelected: setPendingUploadFiles,
            onClearPendingFiles: () => setPendingUploadFiles(null),
          }}
        />
      )}

      {photos.length > 0 && (
        <Suspense fallback={<LoadingFallback />}>
          <UsagePanel photoCount={photos.length} totalImageSize={photos.reduce((sum, p) => sum + (p.base64?.length || 0) * 0.75, 0)} />
        </Suspense>
      )}

      {pending.pendingFiles && (
        <Suspense fallback={<LoadingFallback />}>
          <LimitModal totalFiles={pending.pendingFiles.length} maxPhotos={MAX_PHOTOS} selectionStart={pending.selectionStart}
            selectionCount={pending.selectionCount} lang={lang} onStartChange={pending.setSelectionStart}
            onCountChange={(v) => pending.setSelectionCount(Math.min(v, MAX_PHOTOS))}
            onCancel={() => pending.setPendingFiles(null)} onConfirm={startProcessingFlow.confirmLimitSelection} />
        </Suspense>
      )}

      {modals.showRefineModal && (
        <Suspense fallback={<LoadingFallback />}>
          <RefineModal lang={lang} photos={photos} onClose={() => modals.setShowRefineModal(false)} onRunAnalysis={analysisHandlers.handleRefineAnalysis} apiKey={apiKeyState.apiKey} />
        </Suspense>
      )}

      {modals.showManualPairing && (
        <Suspense fallback={<LoadingFallback />}>
          <ManualPairingModal photos={pending.manualPairingPhotos} lang={lang} onComplete={analysisHandlers.handleManualPairingComplete} onCancel={() => modals.setShowManualPairing(false)} />
        </Suspense>
      )}

      {modals.showBulkEditor && (
        <Suspense fallback={<LoadingFallback />}>
          <BulkEntryEditor photos={photos} lang={lang} onClose={() => modals.setShowBulkEditor(false)} onApply={bulkUpdateFields} />
        </Suspense>
      )}

      {modals.showNormalizationModal && (
        <Suspense fallback={<LoadingFallback />}>
          <NormalizationPreviewModal corrections={normalization.normalizationProposals} originalData={normalization.normalizationOriginals}
            onApprove={normalizationHandlers.handleNormalizationApprove} onReject={normalizationHandlers.handleNormalizationReject}
            onRetry={(customPrompt: string) => { analysisHandlers.handleRefineAnalysis(customPrompt, 6); modals.setShowNormalizationModal(false); }} lang={lang} />
        </Suspense>
      )}

      {modals.showHistory && (
        <Suspense fallback={<LoadingFallback />}>
          <SessionHistoryPanel onLoad={analysisHandlers.handleLoadHistory} onClose={() => modals.setShowHistory(false)} currentPhotos={photos} />
        </Suspense>
      )}

      {modals.showGitHubSync && (
        <Suspense fallback={<LoadingFallback />}>
          <GitHubSyncPanel onClose={() => modals.setShowGitHubSync(false)} />
        </Suspense>
      )}

      {modals.showAIFramework && (
        <Suspense fallback={<LoadingFallback />}>
          <AIFrameworkDashboard onClose={() => modals.setShowAIFramework(false)} appMode={appMode} />
        </Suspense>
      )}

      <Suspense fallback={<LoadingFallback />}>
        <InteractiveAnalysisDialog photo={interactiveAnalysisTarget} apiKey={apiKeyState.apiKey || ''} lang={lang}
          onConfirm={projectHandlers.handleInteractiveAnalysisConfirm} onClose={() => setInteractiveAnalysisTarget(null)} />
      </Suspense>
    </>
  );
}
