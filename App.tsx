import React, { useState, lazy, Suspense } from 'react';
import { PhotoRecord, AppMode, SortPolicy } from './types';
import { generateExcel } from './utils/excelGenerator';
import { TRANS } from './utils/translations';

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
  usePhotoManagement,
  useProjectHandlers,
} from './hooks';

// Core components
import UploadView from './components/UploadView';
import PreviewView from './components/PreviewView';
import LimitModal from './components/LimitModal';
import RefineModal from './components/RefineModal';
import ApiKeySetup from './components/ApiKeySetup';
import ModelValidation from './components/ModelValidation';
import UsagePanel from './components/UsagePanel';
import WorkTypeConfirmModal from './components/WorkTypeConfirmModal';
import PdfLoadDialog from './components/PdfLoadDialog';

// Lazy-loaded components
const ManualPairingModal = lazy(() => import('./components/ManualPairingModal'));
const MasterEditorModal = lazy(() => import('./components/MasterEditorModal'));
const StationReplaceModal = lazy(() => import('./components/StationReplaceModal'));
const NormalizationPreviewModal = lazy(() => import('./components/NormalizationPreviewModal'));
const SessionHistoryPanel = lazy(() => import('./components/SessionHistoryPanel'));
const GitHubSyncPanel = lazy(() => import('./components/GitHubSyncPanel'));
const CodebaseHealthDashboard = lazy(() => import('./components/CodebaseHealthDashboard'));
const InteractiveAnalysisDialog = lazy(() => import('./components/InteractiveAnalysisDialog').then(m => ({ default: m.InteractiveAnalysisDialog })));

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

  // Photos State
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [currentSortPolicy, setCurrentSortPolicy] = useState<SortPolicy>('by_detail_safety_first');
  const [initialLayout, setInitialLayout] = useState<2 | 3>(3);

  // Interactive Analysis Target
  const [interactiveAnalysisTarget, setInteractiveAnalysisTarget] = useState<PhotoRecord | null>(null);

  // Core Hooks
  const apiKeyState = useApiKey();
  const modals = useAppModals();
  const processing = useProcessingState();
  const normalization = useNormalizationFlow();
  const fsCacheState = useFsCache(processing.addLog);
  const pending = usePendingState();

  // Analysis Handlers
  const analysisHandlers = useAnalysisHandlers({
    apiKey: apiKeyState.apiKey, photos, setPhotos, stats: processing.stats, setStats: processing.setStats,
    appMode, lang, currentSortPolicy, addLog: processing.addLog, setIsProcessing: processing.setIsProcessing,
    setCurrentStep: processing.setCurrentStep, setErrorMsg: processing.setErrorMsg, setSuccessMsg: processing.setSuccessMsg,
    setShowPreview, setInitialLayout, setShowNormalizationModal: modals.setShowNormalizationModal,
    setNormalizationProposals: normalization.setNormalizationProposals, setNormalizationOriginals: normalization.setNormalizationOriginals,
    setPhotosForNormalization: normalization.setPhotosForNormalization, setManualPairingPhotos: pending.setManualPairingPhotos,
    setShowManualPairing: modals.setShowManualPairing, setShowHistory: modals.setShowHistory, setIsAskingAI: processing.setIsAskingAI,
    initialInstruction: pending.initialInstruction, setInitialInstruction: pending.setInitialInstruction,
    activeInstruction: pending.activeInstruction, setActiveInstruction: pending.setActiveInstruction, txt,
  });

  // PDF Handlers
  const pdfHandlers = usePdfHandlers({ setPhotos, setStats: processing.setStats, addLog: processing.addLog, setErrorMsg: processing.setErrorMsg });

  // Export Handlers
  const exportHandlers = useExportHandlers({ photos, setPhotos, setStats: processing.setStats, setShowPreview });

  // Cache Handlers
  const cacheHandlers = useCacheHandlers({
    lang, setPhotos, setStats: processing.setStats, setErrorMsg: processing.setErrorMsg, setSuccessMsg: processing.setSuccessMsg,
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

  // Photo Management
  const photoManagement = usePhotoManagement({
    lang, photos, setPhotos, setStats: processing.setStats, addLog: processing.addLog, setSuccessMsg: processing.setSuccessMsg,
  });

  // Project Handlers
  const projectHandlers = useProjectHandlers({
    txt, setPhotos, setShowPreview, setInitialLayout, resetStats: processing.resetStats, setErrorMsg: processing.setErrorMsg,
    setSuccessMsg: processing.setSuccessMsg, resetAllPending: pending.resetAllPending, clearLogs: processing.clearLogs,
    addLog: processing.addLog, handleRefineAnalysis: analysisHandlers.handleRefineAnalysis, photos, setInteractiveAnalysisTarget,
  });

  // API Key Handlers
  const handleApiKeyInput = (key: string) => {
    apiKeyState.handleApiKeyInput(key);
    modals.setShowApiKeySetup(false);
    modals.setShowModelValidation(true);
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

  // Render
  return (
    <>
      <PdfLoadDialog
        isOpen={modals.showPdfLoadDialog}
        onClose={() => { modals.setShowPdfLoadDialog(false); if (photos.length > 0) setShowPreview(true); }}
        onLoad={pdfHandlers.handlePdfLoad}
        lang={lang}
      />

      {modals.showApiKeySetup && (
        <ApiKeySetup onComplete={handleApiKeyInput} onCancel={() => modals.setShowApiKeySetup(false)}
          onImportPdf={() => { modals.setShowApiKeySetup(false); modals.setShowPdfLoadDialog(true); }} />
      )}

      {modals.showModelValidation && apiKeyState.pendingApiKey && (
        <ModelValidation apiKey={apiKeyState.pendingApiKey} onComplete={handleModelValidationComplete} onBack={handleModelValidationBack} />
      )}

      {modals.showHealthDashboard ? (
        <Suspense fallback={<LoadingFallback />}>
          <CodebaseHealthDashboard lang={lang} onClose={() => modals.setShowHealthDashboard(false)} />
        </Suspense>
      ) : modals.showMasterEditor ? (
        <Suspense fallback={<LoadingFallback />}>
          <MasterEditorModal lang={lang} onClose={() => modals.setShowMasterEditor(false)} onApplyAliasesToSession={photoManagement.handleApplyAliases} />
        </Suspense>
      ) : !showPreview ? (
        <UploadView
          lang={lang} isProcessing={processing.isProcessing} photos={photos} appMode={appMode} apiKey={apiKeyState.apiKey || ''}
          logs={processing.logs} isAskingAI={processing.isAskingAI} setAppMode={setAppMode}
          onStartProcessing={startProcessingFlow.handleStartProcessing} onResume={() => setShowPreview(true)} onCloseProject={projectHandlers.handleCloseProject}
          onExportJson={exportHandlers.handleExportJson} onImportJson={exportHandlers.handleImportJson} onPdfButtonClick={() => modals.setShowPdfLoadDialog(true)}
          onClearCache={cacheHandlers.handleClearCache} onShowPreview={() => setShowPreview(true)} onOpenSettings={() => modals.setShowApiKeySetup(true)}
          onManualPairing={analysisHandlers.handleStartManualPairing} onShowHistory={() => modals.setShowHistory(true)}
          onOpenMasterEditor={() => modals.setShowMasterEditor(true)} onOpenHealthDashboard={() => modals.setShowHealthDashboard(true)}
          onAskAI={analysisHandlers.handleAskAI} onClearLogs={processing.clearLogs}
        />
      ) : (
        <PreviewView
          lang={lang} photos={photos} stats={processing.stats} appMode={appMode} isProcessing={processing.isProcessing}
          currentStep={processing.currentStep} errorMsg={processing.errorMsg} successMsg={processing.successMsg}
          logs={processing.logs} initialLayout={initialLayout} fsCacheEnabled={fsCacheState.fsCacheEnabled}
          fsCacheStats={fsCacheState.fsCacheStats} onClearLogs={processing.clearLogs}
          onGoHome={() => { analysisHandlers.shouldAbortRef.current = true; setShowPreview(false); setInitialLayout(3); }}
          onCloseProject={projectHandlers.handleCloseProject} onRefine={() => modals.setShowRefineModal(true)}
          onExportExcel={(layout) => generateExcel(photos, appMode, layout)} onUpdatePhoto={photoManagement.handleUpdatePhoto}
          onDeletePhoto={photoManagement.handleDeletePhoto} onAutoPair={analysisHandlers.handleAutoPair}
          onManualPair={() => { pending.setManualPairingPhotos(photos); modals.setShowManualPairing(true); }}
          onSortByDate={analysisHandlers.handleSmartSort} onSendInstruction={projectHandlers.handleConsoleInstruction}
          onSelectCacheFolder={cacheHandlers.handleSelectCacheFolder} onClearFileSystemCache={cacheHandlers.handleClearFileSystemCache}
          onReanalyzePhoto={projectHandlers.handleInteractiveAnalysis}
          onAbort={() => { analysisHandlers.shouldAbortRef.current = true; processing.addLog("解析を中断しています...", 'info'); }}
          onOpenMasterEditor={() => modals.setShowMasterEditor(true)} onReorderPhotos={photoManagement.handleReorderPhotos}
          onOpenStationReplace={() => modals.setShowStationReplace(true)} onApplyAliases={photoManagement.handleApplyAliases}
          onOpenGitHubSync={() => modals.setShowGitHubSync(true)}
        />
      )}

      {showPreview && <UsagePanel photoCount={photos.length} totalImageSize={photos.reduce((sum, p) => sum + (p.base64?.length || 0) * 0.75, 0)} />}

      {pending.pendingFiles && (
        <LimitModal totalFiles={pending.pendingFiles.length} maxPhotos={MAX_PHOTOS} selectionStart={pending.selectionStart}
          selectionCount={pending.selectionCount} lang={lang} onStartChange={pending.setSelectionStart}
          onCountChange={(v) => pending.setSelectionCount(Math.min(v, MAX_PHOTOS))}
          onCancel={() => pending.setPendingFiles(null)} onConfirm={startProcessingFlow.confirmLimitSelection} />
      )}

      {modals.showRefineModal && (
        <RefineModal lang={lang} photos={photos} onClose={() => modals.setShowRefineModal(false)} onRunAnalysis={analysisHandlers.handleRefineAnalysis} />
      )}

      {modals.showManualPairing && (
        <Suspense fallback={<LoadingFallback />}>
          <ManualPairingModal photos={pending.manualPairingPhotos} lang={lang} onComplete={analysisHandlers.handleManualPairingComplete} onCancel={() => modals.setShowManualPairing(false)} />
        </Suspense>
      )}

      {modals.showStationReplace && (
        <Suspense fallback={<LoadingFallback />}>
          <StationReplaceModal photos={photos} lang={lang} onClose={() => modals.setShowStationReplace(false)} onReplace={photoManagement.handleStationReplace} />
        </Suspense>
      )}

      {modals.showNormalizationModal && (
        <Suspense fallback={<LoadingFallback />}>
          <NormalizationPreviewModal corrections={normalization.normalizationProposals} originalData={normalization.normalizationOriginals}
            onApprove={normalizationHandlers.handleNormalizationApprove} onReject={normalizationHandlers.handleNormalizationReject}
            onRetry={async () => {}} lang={lang} />
        </Suspense>
      )}

      {modals.showHistory && (
        <Suspense fallback={<LoadingFallback />}>
          <SessionHistoryPanel onLoad={analysisHandlers.handleLoadHistory} onClose={() => modals.setShowHistory(false)} />
        </Suspense>
      )}

      {modals.showGitHubSync && (
        <Suspense fallback={<LoadingFallback />}>
          <GitHubSyncPanel onClose={() => modals.setShowGitHubSync(false)} />
        </Suspense>
      )}

      {modals.showWorkTypeConfirm && (
        <WorkTypeConfirmModal lang={lang} onConfirm={startProcessingFlow.handleWorkTypeConfirmed}
          onCancel={() => { modals.setShowWorkTypeConfirm(false); pending.setPendingAnalysisFiles(null); }}
          onOpenSettings={() => { modals.setShowWorkTypeConfirm(false); modals.setShowMasterEditor(true); }} />
      )}

      <Suspense fallback={<LoadingFallback />}>
        <InteractiveAnalysisDialog photo={interactiveAnalysisTarget} apiKey={apiKeyState.apiKey || ''} lang={lang}
          onConfirm={projectHandlers.handleInteractiveAnalysisConfirm} onClose={() => setInteractiveAnalysisTarget(null)} />
      </Suspense>
    </>
  );
}
