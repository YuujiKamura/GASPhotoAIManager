import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { PhotoRecord, AppMode, AIAnalysisResult, SortPolicy } from './types';
import { getPhotoDate } from './utils/imageUtils';
import { applyNormalizationCorrections, NormalizationCorrection, getApiKey, setApiKey as saveApiKey } from './services/geminiService';
import { generateExcel } from './utils/excelGenerator';
import { clearAnalysisCache, exportDataToJson, importDataFromJson } from './utils/storage';
import { extractSessionFromPdf, isSmartPdf, hasIndividualImages, extractImagesFromPdf } from './utils/pdfGenerator';
import { fsCache } from './utils/fileSystemCache';
import { TRANS } from './utils/translations';
import { loadAliasSettings, hasAliases, applyAliasesToRecords } from './utils/workTypeAliases';

// Hooks
import {
  useAppModals,
  useProcessingState,
  useNormalizationFlow,
  useFsCache,
  usePendingState,
  useAnalysisHandlers,
} from './hooks';

// Utils
import { sortPhotosLogical } from './utils/sortingUtils';
import { extractLocationName } from './utils/locationUtils';
import { loadImagesFromFolder } from './utils/fileHandlers';

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

import type { OriginalData } from './components/NormalizationPreviewModal';

declare const saveAs: any;
const MAX_PHOTOS = 30;
type PendingFile = { file: File, date: number };

const LoadingFallback = () => (
  <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
);

export default function App() {
  // API Key State
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [pendingApiKey, setPendingApiKey] = useState<string | null>(null);

  useEffect(() => {
    const storedKey = getApiKey();
    if (storedKey) setApiKeyState(storedKey);
  }, []);

  // Photos State
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);
  const [currentSortPolicy, setCurrentSortPolicy] = useState<SortPolicy>('by_detail_safety_first');
  const [initialLayout, setInitialLayout] = useState<2 | 3>(3);
  const [appMode, setAppMode] = useState<AppMode>('construction');

  // Language
  const [lang, setLang] = useState<'en' | 'ja'>(() => navigator.language.startsWith('en') ? 'en' : 'ja');
  const txt = TRANS[lang];

  // Hooks
  const modals = useAppModals();
  const processing = useProcessingState();
  const normalization = useNormalizationFlow();
  const fsCacheState = useFsCache(processing.addLog);
  const pending = usePendingState();

  // Interactive Analysis
  const [interactiveAnalysisTarget, setInteractiveAnalysisTarget] = useState<PhotoRecord | null>(null);

  // Analysis Handlers
  const analysisHandlers = useAnalysisHandlers({
    apiKey,
    photos,
    setPhotos,
    stats: processing.stats,
    setStats: processing.setStats,
    appMode,
    lang,
    currentSortPolicy,
    addLog: processing.addLog,
    setIsProcessing: processing.setIsProcessing,
    setCurrentStep: processing.setCurrentStep,
    setErrorMsg: processing.setErrorMsg,
    setSuccessMsg: processing.setSuccessMsg,
    setShowPreview,
    setInitialLayout,
    setShowNormalizationModal: modals.setShowNormalizationModal,
    setNormalizationProposals: normalization.setNormalizationProposals,
    setNormalizationOriginals: normalization.setNormalizationOriginals,
    setPhotosForNormalization: normalization.setPhotosForNormalization,
    setManualPairingPhotos: pending.setManualPairingPhotos,
    setShowManualPairing: modals.setShowManualPairing,
    setShowHistory: modals.setShowHistory,
    setIsAskingAI: processing.setIsAskingAI,
    initialInstruction: pending.initialInstruction,
    setInitialInstruction: pending.setInitialInstruction,
    activeInstruction: pending.activeInstruction,
    setActiveInstruction: pending.setActiveInstruction,
    txt,
  });

  // API Key Handlers
  const handleApiKeyInput = (key: string) => {
    setPendingApiKey(key);
    modals.setShowApiKeySetup(false);
    modals.setShowModelValidation(true);
  };

  const handleModelValidationComplete = (key: string) => {
    saveApiKey(key);
    setApiKeyState(key);
    setPendingApiKey(null);
    modals.setShowModelValidation(false);
  };

  const handleModelValidationBack = () => {
    modals.setShowModelValidation(false);
    modals.setShowApiKeySetup(true);
  };

  // Photo Update Handler
  const handleUpdatePhoto = useCallback((fileName: string, field: keyof AIAnalysisResult, value: string) => {
    setPhotos(prev => prev.map(p => {
      if (p.fileName === fileName && p.analysis) {
        const editedFields = p.analysis.editedFields ? [...p.analysis.editedFields] : [];
        if (!editedFields.includes(field as string)) editedFields.push(field as string);
        return { ...p, analysis: { ...p.analysis, [field]: value, editedFields } };
      }
      return p;
    }));
  }, []);

  // Photo Delete Handler
  const handleDeletePhoto = useCallback((fileName: string) => {
    if (window.confirm(lang === 'ja' ? "この写真を削除してもよろしいですか？" : "Delete this photo?")) {
      const updated = photos.filter(p => p.fileName !== fileName);
      setPhotos(updated);
      const success = updated.filter(p => p.status === 'done').length;
      const failed = updated.filter(p => p.status === 'error').length;
      const cached = updated.filter(p => p.fromCache).length;
      processing.setStats({ total: updated.length, processed: success + failed, success, failed, cached });
    }
  }, [photos, lang, processing]);

  // Station Replace Handler
  const handleStationReplace = useCallback((replacements: Array<{ fileName: string; newStation: string }>) => {
    if (replacements.length === 0) return;
    setPhotos(prev => prev.map(p => {
      const r = replacements.find(rep => rep.fileName === p.fileName);
      return r && p.analysis ? { ...p, analysis: { ...p.analysis, station: r.newStation } } : p;
    }));
    processing.setSuccessMsg(`${replacements.length}枚の測点を更新しました`);
  }, [processing]);

  // Reorder Photos Handler
  const handleReorderPhotos = useCallback((reordered: PhotoRecord[]) => {
    setPhotos(reordered);
  }, []);

  // Normalization Handlers
  const handleNormalizationApprove = (approved: NormalizationCorrection[]) => {
    if (approved.length > 0) {
      const corrected = applyNormalizationCorrections(normalization.photosForNormalization, approved);
      setPhotos(prev => prev.map(p => corrected.find(c => c.fileName === p.fileName) || p));
      processing.addLog(`${approved.length}件の修正を適用しました`, 'success');
    }
    setPhotos(prev => sortPhotosLogical(prev, currentSortPolicy));
    const aliasSettings = loadAliasSettings();
    if (aliasSettings.enabled && hasAliases(aliasSettings)) {
      setPhotos(prev => applyAliasesToRecords(prev, aliasSettings).records);
    }
    modals.setShowNormalizationModal(false);
    normalization.resetNormalization();
  };

  const handleNormalizationReject = () => {
    setPhotos(prev => sortPhotosLogical(prev, currentSortPolicy));
    modals.setShowNormalizationModal(false);
    normalization.resetNormalization();
  };

  // Project Handlers
  const handleCloseProject = async () => {
    if (window.confirm(txt.resetConfirm)) {
      setPhotos([]);
      processing.resetStats();
      processing.setErrorMsg(null);
      processing.setSuccessMsg(null);
      setShowPreview(false);
      pending.resetAllPending();
      setInitialLayout(3);
      processing.clearLogs();
    }
  };

  const handleClearCache = async () => {
    const msg = lang === 'ja' ? "解析済みのキャッシュデータを削除しますか？" : "Clear analysis cache?";
    if (window.confirm(msg)) {
      await clearAnalysisCache();
      processing.setStats(prev => ({ ...prev, cached: 0 }));
      setPhotos(prev => prev.map(p => ({ ...p, fromCache: false })));
      alert(lang === 'ja' ? "キャッシュを削除しました。" : "Cache cleared.");
    }
  };

  // File System Cache Handlers
  const handleSelectCacheFolder = async () => {
    if (!fsCache.isAvailable()) {
      processing.setErrorMsg("File System Access API is not supported.");
      return;
    }
    try {
      const selected = await fsCache.selectDirectory();
      if (selected) {
        fsCacheState.setFsCacheEnabled(true);
        await fsCache.saveHandle();
        fsCacheState.setFsCacheStats(fsCache.getStats());
        processing.setSuccessMsg("Cache folder selected!");
      }
    } catch (error) {
      processing.setErrorMsg("Failed to select cache folder.");
    }
  };

  const handleClearFileSystemCache = async () => {
    if (!fsCacheState.fsCacheEnabled) return;
    if (window.confirm("Clear file system cache?")) {
      await fsCache.clearCache();
      fsCacheState.setFsCacheStats(fsCache.getStats());
      processing.setSuccessMsg("File system cache cleared!");
    }
  };

  // Export/Import Handlers
  const handleExportJson = () => {
    const json = exportDataToJson(photos);
    const blob = new Blob([json], { type: 'application/json' });
    saveAs(blob, `project_data_${new Date().toISOString().slice(0, 10)}.json`);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = importDataFromJson(ev.target?.result as string);
        setPhotos(imported);
        processing.setStats({ total: imported.length, processed: imported.length, success: imported.length, failed: 0, cached: 0 });
        setShowPreview(true);
      } catch { alert("Failed to import JSON"); }
    };
    reader.readAsText(e.target.files[0]);
  };

  // PDF Handlers
  const handlePdfLoad = async (pdfFile: File, imageFolder: FileSystemDirectoryHandle | null, pushLog?: (msg: string) => void) => {
    const log = (msg: string, level: 'info' | 'success' | 'error' = 'info') => {
      processing.addLog(msg, level);
      pushLog?.(msg);
    };
    log(`PDF読み込み: ${pdfFile.name}`);

    try {
      let images: Array<{ fileName: string; base64: string; mimeType: string }> = [];
      let captionData: Record<string, any> | null = null;
      const isSmart = await isSmartPdf(pdfFile);
      const hasImages = await hasIndividualImages(pdfFile);

      if (hasImages && !imageFolder) {
        log('新形式PDF: 画像を抽出中...');
        const extracted = await extractImagesFromPdf(pdfFile);
        images = extracted.map((img, i) => {
          const mimeType = img.mimeType || 'image/jpeg';
          let binary = '';
          for (let j = 0; j < img.data.length; j += 8192) {
            binary += String.fromCharCode.apply(null, Array.from(img.data.subarray(j, j + 8192)));
          }
          return { fileName: `photo_${i + 1}.jpg`, base64: `data:${mimeType};base64,${btoa(binary)}`, mimeType };
        });
        if (isSmart) {
          const sessionData = await extractSessionFromPdf(pdfFile);
          if (sessionData) {
            captionData = {};
            sessionData.forEach((item: any, i: number) => {
              const fileName = item.fileName || `photo_${i + 1}.jpg`;
              captionData![fileName] = item;
              if (images[i]) images[i].fileName = fileName;
            });
          }
        }
      } else if (imageFolder) {
        const result = await loadImagesFromFolder(imageFolder);
        images = result.images;
        if (isSmart) {
          const sessionData = await extractSessionFromPdf(pdfFile);
          if (sessionData) {
            captionData = {};
            sessionData.forEach((item: any) => { if (item.fileName) captionData![item.fileName] = item; });
          }
        } else if (result.analysisData) {
          captionData = result.analysisData;
        }
      } else {
        throw new Error('画像フォルダを選択してください');
      }

      const restoredPhotos: PhotoRecord[] = images.map(img => {
        const caption = captionData?.[img.fileName];
        return {
          fileName: img.fileName, base64: img.base64, mimeType: img.mimeType, fileSize: 0, lastModified: 0,
          status: 'done' as const, date: caption?.date || '', fromCache: true,
          analysis: caption?.analysis || { workType: '', variety: '', detail: '', station: '', remarks: '', description: '' },
        };
      });

      setPhotos(restoredPhotos);
      processing.setStats({ total: restoredPhotos.length, processed: restoredPhotos.length, success: restoredPhotos.length, failed: 0, cached: restoredPhotos.length });
      log(`PDFから${restoredPhotos.length}枚を復元しました`, 'success');
    } catch (err: any) {
      processing.setErrorMsg(err.message);
      throw err;
    }
  };

  // Start Processing Handler
  const handleStartProcessing = async (files: File[], instruction: string, useCache: boolean, sortPolicy: SortPolicy = 'by_detail_safety_first') => {
    if (!files?.length) return;
    setCurrentSortPolicy(sortPolicy);
    pending.setPendingInstruction(instruction);
    pending.setPendingUseCache(useCache);

    if (files.length > MAX_PHOTOS) {
      const pendingList: PendingFile[] = [];
      for (const f of files) pendingList.push({ file: f, date: await getPhotoDate(f) });
      pendingList.sort((a, b) => a.date - b.date);
      pending.setPendingFiles(pendingList);
      pending.setSelectionCount(Math.min(pendingList.length, MAX_PHOTOS));
      return;
    }

    pending.setPendingAnalysisFiles(files);
    modals.setShowWorkTypeConfirm(true);
  };

  const handleWorkTypeConfirmed = () => {
    modals.setShowWorkTypeConfirm(false);
    if (pending.pendingAnalysisFiles) {
      analysisHandlers.startAnalysisPipeline(pending.pendingAnalysisFiles, pending.pendingInstruction, pending.pendingUseCache);
      pending.setPendingAnalysisFiles(null);
    }
  };

  const confirmLimitSelection = () => {
    if (!pending.pendingFiles) return;
    const selected = pending.pendingFiles.slice(pending.selectionStart - 1, pending.selectionStart - 1 + pending.selectionCount).map(p => p.file);
    pending.setPendingFiles(null);
    pending.setPendingAnalysisFiles(selected);
    modals.setShowWorkTypeConfirm(true);
  };

  // Console Handler
  const handleConsoleInstruction = (instruction: string) => {
    processing.addLog("User instruction: " + instruction, "info");
    analysisHandlers.handleRefineAnalysis(instruction, 6);
  };

  // Interactive Analysis Handlers
  const handleInteractiveAnalysis = (fileName: string) => {
    const target = photos.find(p => p.fileName === fileName);
    if (target) setInteractiveAnalysisTarget(target);
  };

  const handleInteractiveAnalysisConfirm = (fileName: string, analysis: AIAnalysisResult) => {
    setPhotos(prev => prev.map(p => p.fileName === fileName ? { ...p, analysis, status: 'done' } : p));
    processing.setSuccessMsg("Photo analyzed successfully.");
  };

  // Apply Aliases Handler
  const handleApplyAliases = () => {
    const settings = loadAliasSettings();
    if (!settings.enabled || !hasAliases(settings)) return { modifiedCount: 0 };
    const { modifiedCount, records } = applyAliasesToRecords(photos, settings);
    if (modifiedCount > 0) {
      setPhotos(records);
      processing.addLog(`エイリアス適用: ${modifiedCount}件`, 'success');
    }
    return { modifiedCount };
  };

  // Render
  return (
    <>
      <PdfLoadDialog
        isOpen={modals.showPdfLoadDialog}
        onClose={() => { modals.setShowPdfLoadDialog(false); if (photos.length > 0) setShowPreview(true); }}
        onLoad={handlePdfLoad}
        lang={lang}
      />

      {modals.showApiKeySetup && (
        <ApiKeySetup
          onComplete={handleApiKeyInput}
          onCancel={() => modals.setShowApiKeySetup(false)}
          onImportPdf={() => { modals.setShowApiKeySetup(false); modals.setShowPdfLoadDialog(true); }}
        />
      )}

      {modals.showModelValidation && pendingApiKey && (
        <ModelValidation apiKey={pendingApiKey} onComplete={handleModelValidationComplete} onBack={handleModelValidationBack} />
      )}

      {modals.showHealthDashboard ? (
        <Suspense fallback={<LoadingFallback />}>
          <CodebaseHealthDashboard lang={lang} onClose={() => modals.setShowHealthDashboard(false)} />
        </Suspense>
      ) : modals.showMasterEditor ? (
        <Suspense fallback={<LoadingFallback />}>
          <MasterEditorModal lang={lang} onClose={() => modals.setShowMasterEditor(false)} onApplyAliasesToSession={handleApplyAliases} />
        </Suspense>
      ) : !showPreview ? (
        <UploadView
          lang={lang} isProcessing={processing.isProcessing} photos={photos} appMode={appMode} apiKey={apiKey || ''}
          logs={processing.logs} isAskingAI={processing.isAskingAI} setAppMode={setAppMode}
          onStartProcessing={handleStartProcessing} onResume={() => setShowPreview(true)} onCloseProject={handleCloseProject}
          onExportJson={handleExportJson} onImportJson={handleImportJson} onPdfButtonClick={() => modals.setShowPdfLoadDialog(true)}
          onClearCache={handleClearCache} onShowPreview={() => setShowPreview(true)} onOpenSettings={() => modals.setShowApiKeySetup(true)}
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
          onCloseProject={handleCloseProject} onRefine={() => modals.setShowRefineModal(true)}
          onExportExcel={(layout) => generateExcel(photos, appMode, layout)} onUpdatePhoto={handleUpdatePhoto}
          onDeletePhoto={handleDeletePhoto} onAutoPair={analysisHandlers.handleAutoPair}
          onManualPair={() => { pending.setManualPairingPhotos(photos); modals.setShowManualPairing(true); }}
          onSortByDate={analysisHandlers.handleSmartSort} onSendInstruction={handleConsoleInstruction}
          onSelectCacheFolder={handleSelectCacheFolder} onClearFileSystemCache={handleClearFileSystemCache}
          onReanalyzePhoto={handleInteractiveAnalysis}
          onAbort={() => { analysisHandlers.shouldAbortRef.current = true; processing.addLog("解析を中断しています...", 'info'); }}
          onOpenMasterEditor={() => modals.setShowMasterEditor(true)} onReorderPhotos={handleReorderPhotos}
          onOpenStationReplace={() => modals.setShowStationReplace(true)} onApplyAliases={handleApplyAliases}
          onOpenGitHubSync={() => modals.setShowGitHubSync(true)}
        />
      )}

      {showPreview && <UsagePanel photoCount={photos.length} totalImageSize={photos.reduce((sum, p) => sum + (p.base64?.length || 0) * 0.75, 0)} />}

      {pending.pendingFiles && (
        <LimitModal
          totalFiles={pending.pendingFiles.length} maxPhotos={MAX_PHOTOS} selectionStart={pending.selectionStart}
          selectionCount={pending.selectionCount} lang={lang} onStartChange={pending.setSelectionStart}
          onCountChange={(v) => pending.setSelectionCount(Math.min(v, MAX_PHOTOS))}
          onCancel={() => pending.setPendingFiles(null)} onConfirm={confirmLimitSelection}
        />
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
          <StationReplaceModal photos={photos} lang={lang} onClose={() => modals.setShowStationReplace(false)} onReplace={handleStationReplace} />
        </Suspense>
      )}

      {modals.showNormalizationModal && (
        <Suspense fallback={<LoadingFallback />}>
          <NormalizationPreviewModal
            corrections={normalization.normalizationProposals} originalData={normalization.normalizationOriginals}
            onApprove={handleNormalizationApprove} onReject={handleNormalizationReject}
            onRetry={async () => {}} lang={lang}
          />
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
        <WorkTypeConfirmModal
          lang={lang} onConfirm={handleWorkTypeConfirmed} onCancel={() => { modals.setShowWorkTypeConfirm(false); pending.setPendingAnalysisFiles(null); }}
          onOpenSettings={() => { modals.setShowWorkTypeConfirm(false); modals.setShowMasterEditor(true); }}
        />
      )}

      <Suspense fallback={<LoadingFallback />}>
        <InteractiveAnalysisDialog
          photo={interactiveAnalysisTarget} apiKey={apiKey || ''} lang={lang}
          onConfirm={handleInteractiveAnalysisConfirm} onClose={() => setInteractiveAnalysisTarget(null)}
        />
      </Suspense>
    </>
  );
}
