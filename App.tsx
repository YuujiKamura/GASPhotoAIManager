import React, { useState, useEffect, lazy, Suspense, useCallback } from 'react';
import { PhotoRecord, ProcessedFile, AppMode, SortPolicy, AnalysisStep, AnalysisStepId, AnalysisMode, AnalysisPauseState } from './types';
import { generateExcel } from './utils/excelGenerator';
import { TRANS } from './utils/translations';
import { fileToBase64 } from './utils/fileHandlers';
import { processImageForAI, getPhotoDate } from './utils/imageUtils';
import { checkServerHealth, SERVER_NOT_RUNNING_MESSAGE, getLocalApiBase, setLocalApiBase } from './services/localApiService';
import { useAnalysisBackend } from './hooks/useAnalysisBackend';

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

// GitHub Pages判定（ローカルAPI選択肢の表示制御用）
const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.includes('github.io');

const LoadingFallback = () => (
  <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
);

export default function App() {
  // Server Connection State (null = checking, true = connected, false = not connected)
  const [serverConnected, setServerConnected] = useState<boolean | null>(null);
  const { backend, setBackend, resetBackend } = useAnalysisBackend();
  const [localApiUrl, setLocalApiUrl] = useState<string>(() => getLocalApiBase());
  const [localApiStatus, setLocalApiStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
  const [localApiError, setLocalApiError] = useState<string>('');

  // Language & App Mode
  const [lang] = useState<'en' | 'ja'>(() => navigator.language.startsWith('en') ? 'en' : 'ja');
  const txt = TRANS[lang];
  const [appMode, setAppMode] = useState<AppMode>('construction');

  // Check server connection on mount
  useEffect(() => {
    if (backend === 'local') {
      const checkConnection = async () => {
        const isHealthy = await checkServerHealth();
        setServerConnected(isHealthy);
      };
      checkConnection();
      return;
    }
    if (backend === 'gemini') {
      setServerConnected(true);
    } else {
      setServerConnected(null);
    }
  }, [backend]);

  useEffect(() => {
    if (backend === null) {
      setLocalApiUrl(getLocalApiBase());
      setLocalApiStatus('idle');
      setLocalApiError('');
    }
  }, [backend]);

  // Interactive Analysis Target
  const [interactiveAnalysisTarget, setInteractiveAnalysisTarget] = useState<PhotoRecord | null>(null);
  const handleRequireBackend = useCallback(() => {
    resetBackend();
    setInteractiveAnalysisTarget(null);
  }, [resetBackend]);

  // Pending Upload Files (managed at App level to survive modal transitions)
  // ProcessedFile[] に変換済みで保持することで、モバイルのGCによるFile無効化を回避
  const [pendingUploadFiles, setPendingUploadFiles] = useState<ProcessedFile[] | null>(null);

  // Core Hooks
  const apiKeyState = useApiKey();
  const modals = useAppModals(backend);
  const processing = useProcessingState();
  const normalization = useNormalizationFlow();
  const fsCacheState = useFsCache(processing.addLog);
  const pending = usePendingState();

  // 画像選択時に即座にBase64変換を行うハンドラ（processing定義後に配置）
  const handleFilesSelected = useCallback(async (files: File[]) => {
    try {
      const processed = await Promise.all(
        files.map(async (file): Promise<ProcessedFile> => {
          const [{ base64, mimeType }, date] = await Promise.all([
            processImageForAI(file),
            getPhotoDate(file),
          ]);
          return {
            fileName: file.name,
            base64,
            mimeType,
            fileSize: file.size,
            lastModified: file.lastModified,
            date,
          };
        })
      );
      setPendingUploadFiles(processed);
    } catch (error) {
      console.error('Failed to process selected files:', error);
      processing.addLog('画像の処理に失敗しました', 'error');
    }
  }, [processing]);

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
    backend,
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

  // Test One Interactive: ProcessedFileをPhotoRecordに変換して対話型解析を開く
  const handleTestOneInteractive = useCallback((file: ProcessedFile) => {
    const photoRecord: PhotoRecord = {
      fileName: file.fileName,
      base64: file.base64,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      lastModified: file.lastModified,
      date: file.date,
      status: 'pending',
    };
    setInteractiveAnalysisTarget(photoRecord);
  }, []);

  // 簡素化した解析開始ハンドラ（ProcessedFile[]を受け取る）
  const handleStartAnalysis = useCallback((files: ProcessedFile[], sortPolicy: SortPolicy, useCache: boolean, preInfo: PreAnalysisInfo) => {
    resetSteps(); // ステップ進捗をリセット
    setCurrentSortPolicy(sortPolicy);
    analysisHandlers.startAnalysisPipeline(files, '', useCache, preInfo);
  }, [setCurrentSortPolicy, analysisHandlers, resetSteps]);

  // 手動ペアリングモード（2枚ペアを選択するUI）
  const handleManualPairing = useCallback((files: ProcessedFile[]) => {
    analysisHandlers.handleStartManualPairing(files, '', false); // 2枚ペアリングUIを表示
  }, [analysisHandlers]);

  // Render
  return (
    <>
      {backend === null && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full">
            <h1 className="text-lg font-bold text-gray-800 mb-2">解析エンジンを選択</h1>
            <p className="text-sm text-gray-600 mb-4">
              起動時に解析の実行先を選んでください。後からいつでも変更できます。
            </p>
            <div className="space-y-3">
              <button
                onClick={() => setBackend('gemini')}
                className="w-full py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Gemini API（クラウド）
              </button>
              {!isGitHubPages && (
              <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                <div className="text-sm font-medium text-gray-800">ローカルAPI（Claude Code）</div>
                <input
                  type="text"
                  value={localApiUrl}
                  onChange={(e) => setLocalApiUrl(e.target.value)}
                  placeholder="http://localhost:3001"
                  className="w-full px-3 py-2 rounded border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
                {localApiStatus === 'ok' && (
                  <div className="text-xs text-green-600">接続OK</div>
                )}
                {localApiStatus === 'error' && (
                  <div className="text-xs text-red-600">{localApiError || '接続できませんでした'}</div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      setLocalApiStatus('checking');
                      setLocalApiError('');
                      try {
                        const normalized = setLocalApiBase(localApiUrl);
                        setLocalApiUrl(normalized);
                        const isHealthy = await checkServerHealth();
                        setLocalApiStatus(isHealthy ? 'ok' : 'error');
                        if (!isHealthy) {
                          setLocalApiError('接続できませんでした');
                        }
                      } catch {
                        setLocalApiStatus('error');
                        setLocalApiError('URLが無効です');
                      }
                    }}
                    className="flex-1 py-2 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 text-sm transition-colors"
                    disabled={localApiStatus === 'checking'}
                  >
                    {localApiStatus === 'checking' ? '接続中...' : '接続テスト'}
                  </button>
                  <button
                    onClick={async () => {
                      setLocalApiStatus('checking');
                      setLocalApiError('');
                      try {
                        const normalized = setLocalApiBase(localApiUrl);
                        setLocalApiUrl(normalized);
                        const isHealthy = await checkServerHealth();
                        if (isHealthy) {
                          setLocalApiStatus('ok');
                          setBackend('local');
                        } else {
                          setLocalApiStatus('error');
                          setLocalApiError('接続できませんでした');
                        }
                      } catch {
                        setLocalApiStatus('error');
                        setLocalApiError('URLが無効です');
                      }
                    }}
                    className="flex-1 py-2 rounded bg-slate-700 text-white hover:bg-slate-800 text-sm transition-colors"
                    disabled={localApiStatus === 'checking'}
                  >
                    このアドレスで開始
                  </button>
                </div>
                <div className="text-xs text-gray-500 whitespace-pre-line">
                  ローカルAPIの起動例:
                  {"\n"}  npm run build:server && npm run server
                  {"\n"}別ターミナルで:
                  {"\n"}  cd GASPhotoAIManager
                  {"\n"}  npm run server
                </div>
              </div>
              )}
              <button
                onClick={() => setBackend('none')}
                className="w-full py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                今は選ばない
              </button>
            </div>
          </div>
        </div>
      )}
      {backend === 'local' && serverConnected !== true && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-3 text-sm">
            {serverConnected === null ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-600"></div>
                <span>ローカルAPIサーバーの接続を確認中...</span>
              </>
            ) : (
              <>
                <span className="font-medium">ローカルAPIサーバー未接続</span>
                <span className="text-amber-800">{SERVER_NOT_RUNNING_MESSAGE}</span>
                <button
                  onClick={async () => {
                    setServerConnected(null);
                    const isHealthy = await checkServerHealth();
                    setServerConnected(isHealthy);
                  }}
                  className="px-3 py-1 rounded bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                >
                  再接続
                </button>
              </>
            )}
          </div>
        </div>
      )}
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
            onSelectBackend: () => resetBackend(),
            onOpenHealthDashboard: () => modals.setShowHealthDashboard(true),
            onOpenAIFramework: () => modals.setShowAIFramework(true),
            onPdfLoad: () => modals.setShowPdfLoadDialog(true),
            onClearCache: cacheHandlers.handleClearCache,
            onStartProcessing: handleStartAnalysis,
            onManualPairing: handleManualPairing,
            onTestOneInteractive: handleTestOneInteractive,
            onFilesSelected: handleFilesSelected,
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
        <InteractiveAnalysisDialog photo={interactiveAnalysisTarget} apiKey={apiKeyState.apiKey || ''} backend={backend} lang={lang}
          onConfirm={projectHandlers.handleInteractiveAnalysisConfirm} onRequireBackend={handleRequireBackend}
          onRequireApiKey={() => modals.setShowApiKeySetup(true)} onClose={() => setInteractiveAnalysisTarget(null)} />
      </Suspense>
    </>
  );
}
