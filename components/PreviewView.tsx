import React, { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react';
import { Loader2, Download, Printer, AlertCircle, Home, X, Database, FileArchive, Save, StopCircle, CheckCircle, Upload, Plus, HardHat } from 'lucide-react';
import { exportDataToJson, importDataFromJson } from '../utils/storage/exportImport';
import { TRANS } from '../utils/translations';
import { PhotoRecord, ProcessingStats, AppMode, AIAnalysisResult, LogEntry, SortPolicy } from '../types';
import PhotoAlbumView from './PhotoAlbumView';
import ConsolePanel from './ConsolePanel';
import SessionHistoryPanel from './SessionHistoryPanel';
import { ReorderModeView, PreviewToolsMenu } from './PreviewView/index';
import { useReorderMode } from '../hooks/useReorderMode';
import { usePreviewViewState } from '../hooks/usePreviewViewState';

// Lazy load AnalysisSetupModal
const AnalysisSetupModal = lazy(() => import('./AnalysisSetupModal'));

// --- Grouped interfaces for cleaner props ---

/** Core data props */
interface PreviewData {
  lang: 'en' | 'ja';
  photos: PhotoRecord[];
  stats: ProcessingStats;
  appMode: AppMode;
  logs: LogEntry[];
  initialLayout?: 2 | 3;
  apiKey?: string;
}

/** Processing state props */
interface PreviewState {
  isProcessing: boolean;
  currentStep: string;
  errorMsg: string | null;
  successMsg: string | null;
}

/** Photo-related callbacks */
interface PhotoHandlers {
  onUpdatePhoto: (fileName: string, field: keyof AIAnalysisResult, value: string) => void;
  onDeletePhoto: (fileName: string) => void;
  onReanalyzePhoto?: (fileName: string) => void;
  onReorderPhotos?: (reorderedPhotos: PhotoRecord[]) => void;
}

/** Action callbacks */
interface ActionHandlers {
  onClearLogs: () => void;
  onGoHome: () => void;
  onRefine: () => void;
  onExportExcel: (photosPerPage: 2 | 3) => void;
  onAutoPair: () => void;
  onManualPair: () => void;
  onSendInstruction?: (instruction: string) => void;
  onAbort?: () => void;
  onOpenMasterEditor?: () => void;
  onOpenBulkEditor?: () => void;
  onApplyAliases?: () => { modifiedCount: number };
  onOpenGitHubSync?: () => void;
  // Upload/System handlers (from UploadView)
  onOpenSettings?: () => void;
  onOpenHealthDashboard?: () => void;
  onOpenAIFramework?: () => void;
  onPdfLoad?: () => void;
  onClearCache?: () => void;
  onStartProcessing?: (files: File[], sortPolicy: SortPolicy, useCache: boolean) => void;
  onManualPairing?: (files: File[]) => void;
  onTestOneInteractive?: (file: File) => void;
}

// Main props interface using grouped interfaces
export interface PreviewViewProps {
  data: PreviewData;
  state: PreviewState;
  photoHandlers: PhotoHandlers;
  actionHandlers: ActionHandlers;
}

const PreviewView: React.FC<PreviewViewProps> = ({
  data: { lang, photos, stats, appMode, logs, initialLayout = 3 as const, apiKey },
  state: { isProcessing, currentStep, errorMsg, successMsg },
  photoHandlers: { onUpdatePhoto, onDeletePhoto, onReanalyzePhoto, onReorderPhotos },
  actionHandlers: { onClearLogs, onGoHome, onRefine, onExportExcel, onAutoPair, onManualPair, onSendInstruction, onAbort, onOpenMasterEditor, onOpenBulkEditor, onApplyAliases, onOpenGitHubSync, onOpenSettings, onOpenHealthDashboard, onOpenAIFramework, onPdfLoad, onClearCache, onStartProcessing, onManualPairing, onTestOneInteractive }
}) => {
  const txt = TRANS[lang];
  const reorder = useReorderMode(photos, onReorderPhotos);

  // ローカル状態で通知の表示/自動消去を管理
  const [localErrorMsg, setLocalErrorMsg] = useState<string | null>(null);
  const [localSuccessMsg, setLocalSuccessMsg] = useState<string | null>(null);

  // 親からのメッセージが変わったらローカル状態を更新
  useEffect(() => {
    if (errorMsg) {
      setLocalErrorMsg(errorMsg);
      const timer = setTimeout(() => setLocalErrorMsg(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  useEffect(() => {
    if (successMsg) {
      setLocalSuccessMsg(successMsg);
      const timer = setTimeout(() => setLocalSuccessMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  const {
    scale,
    photosPerPage,
    isGeneratingPdf,
    isGeneratingZip,
    showConsole,
    showHistoryPanel,
    // Upload state
    isDragging,
    pendingFiles,
    // Refs
    previewContainerRef,
    fileInputRef,
    fileInputImportRef,
    // Actions
    setPhotosPerPage,
    setShowConsole,
    setShowHistoryPanel,
    handleDownloadPDF,
    handleDownloadZip,
    handleAutoPairClick,
    handleManualPairClick,
    // Upload actions
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileInputChange,
    handleUploadClick,
    clearPendingFiles,
  } = usePreviewViewState(initialLayout, isProcessing);

  // 写真が0件かどうか
  const isEmpty = photos.length === 0;

  const handleExportJson = useCallback(() => {
    if (photos.length === 0) {
      alert(lang === 'ja' ? '保存する写真データがありません' : 'No photo data to save');
      return;
    }
    const jsonStr = exportDataToJson(photos);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `photo_data_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [photos, lang]);

  const handleImportJson = useCallback(() => {
    fileInputImportRef.current?.click();
  }, [fileInputImportRef]);

  const handleJsonFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const jsonStr = ev.target?.result as string;
        const importedPhotos = importDataFromJson(jsonStr);
        if (onReorderPhotos) {
          onReorderPhotos(importedPhotos);
          setLocalSuccessMsg(lang === 'ja' ? `${importedPhotos.length}件の写真データを読み込みました` : `Loaded ${importedPhotos.length} photo records`);
        }
      } catch (err) {
        console.error('JSON import error:', err);
        setLocalErrorMsg(lang === 'ja' ? 'JSONファイルの読み込みに失敗しました' : 'Failed to import JSON file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [onReorderPhotos, lang]);

  // Handle start analysis from modal
  const handleStartAnalysis = useCallback((files: File[], sortPolicy: SortPolicy, useCache: boolean) => {
    if (onStartProcessing) {
      onStartProcessing(files, sortPolicy, useCache);
    }
    clearPendingFiles();
  }, [onStartProcessing, clearPendingFiles]);

  // Handle manual pairing from modal
  const handleManualPairingClick = useCallback((files: File[]) => {
    if (onManualPairing) {
      onManualPairing(files);
    }
    clearPendingFiles();
  }, [onManualPairing, clearPendingFiles]);

  return (
    <div
      className={`fixed inset-0 z-[100] overflow-hidden flex flex-col transition-colors duration-300 ${isDragging ? 'bg-blue-50' : 'bg-gray-200'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="sticky top-0 z-[101] bg-slate-800 text-white p-3 shadow-md flex justify-between items-center">
        <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
          <h1 className="text-white font-bold tracking-tight text-lg flex items-center gap-2">
            {appMode === 'construction' && <HardHat className="w-5 h-5 text-amber-500" />}
            {txt.appTitle}
          </h1>
          {!isEmpty && (
            <div className="flex gap-2 text-xs md:text-sm bg-slate-700 px-2 py-1 rounded-lg flex-shrink-0 whitespace-nowrap items-center">
              <span className="text-slate-300">{txt.total}: {stats.total}</span>
              <span className="text-green-400">{txt.done}: {stats.success}</span>
              {isProcessing && (
                <>
                  <span className="text-amber-300 animate-pulse flex items-center gap-1 border-l border-slate-600 pl-2">
                    <Loader2 className="w-3 h-3 animate-spin"/> {currentStep.split('(')[0]}
                  </span>
                  <button onClick={onAbort} className="ml-2 px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded flex items-center gap-1 transition-colors" title="解析を中断 (ESC)">
                    <StopCircle className="w-3 h-3" /> 中断
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 items-center">
          {reorder.isReorderMode && (
            <div className="flex gap-1 mr-2 animate-in slide-in-from-left">
              <button onClick={reorder.handleSaveReorder} className="px-3 py-2 bg-green-600 hover:bg-green-500 rounded text-white text-xs font-bold flex items-center gap-1" title={lang === 'ja' ? '順序を保存' : 'Save Order'}>
                <Save className="w-4 h-4" /> {lang === 'ja' ? '保存' : 'Save'}
              </button>
              <button onClick={reorder.handleCancelReorder} className="px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded text-white text-xs font-bold flex items-center gap-1" title={lang === 'ja' ? 'キャンセル' : 'Cancel'}>
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Add photos button (always visible) */}
          <button onClick={handleUploadClick} disabled={isProcessing} className="p-2 bg-blue-600 hover:bg-blue-500 rounded text-white transition-colors" title={lang === 'ja' ? '写真を追加' : 'Add Photos'}>
            <Plus className="w-4 h-4" />
          </button>

          {!isEmpty && (
            <>
              <div className="flex items-center gap-1 bg-slate-700 rounded-lg px-1">
                {([2, 3] as const).map(n => (
                  <button key={n} onClick={() => setPhotosPerPage(n)} className={`px-2 py-1.5 text-xs font-medium rounded transition-colors ${photosPerPage === n ? "bg-amber-500 text-white" : "text-slate-300 hover:bg-slate-600"}`} title={`${n}枚/ページ`}>
                    {n}枚
                  </button>
                ))}
              </div>

              <div className="flex gap-1">
                <button onClick={() => onExportExcel(photosPerPage)} disabled={isProcessing || isEmpty} className="p-2 md:px-3 md:py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-bold shadow-sm flex items-center gap-1" title={txt.exportExcel}>
                  <Download className="w-4 h-4" /> <span className="hidden lg:inline">{txt.exportExcel}</span>
                </button>
                {appMode === 'construction' && (
                  <button onClick={() => handleDownloadZip(photos)} disabled={isGeneratingZip || isProcessing || isEmpty} className="p-2 md:px-3 md:py-2 bg-blue-500 hover:bg-blue-600 rounded text-sm font-bold text-white shadow-sm flex items-center gap-1" title="XML/ZIP">
                    {isGeneratingZip ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />} <span className="hidden lg:inline">ZIP</span>
                  </button>
                )}
                <button onClick={() => handleDownloadPDF(photos, txt)} disabled={isGeneratingPdf || isProcessing || isEmpty} className="p-2 md:px-3 md:py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-bold text-white shadow-sm flex items-center gap-1" title={txt.exportPDF}>
                  {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} <span className="hidden lg:inline">PDF</span>
                </button>
              </div>
            </>
          )}

          {!reorder.isReorderMode && (
            <PreviewToolsMenu
              lang={lang}
              isProcessing={isProcessing}
              onAutoPair={() => handleAutoPairClick(onAutoPair)}
              onManualPair={() => handleManualPairClick(onManualPair)}
              onEnterReorderMode={reorder.enterReorderMode}
              onRefine={onRefine}
              onShowHistory={() => setShowHistoryPanel(true)}
              onOpenBulkEditor={onOpenBulkEditor}
              onOpenMasterEditor={onOpenMasterEditor}
              onApplyAliases={onApplyAliases}
              onOpenGitHubSync={onOpenGitHubSync}
              onExportJson={!isEmpty ? handleExportJson : undefined}
              onImportJson={onReorderPhotos ? handleImportJson : undefined}
              // System actions
              onOpenSettings={onOpenSettings}
              onOpenHealthDashboard={onOpenHealthDashboard}
              onOpenAIFramework={onOpenAIFramework}
              onPdfLoad={onPdfLoad}
              onClearCache={onClearCache}
            />
          )}
        </div>
      </div>

      {localErrorMsg && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-[102] bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded shadow-lg flex items-center gap-2 max-w-[90vw] animate-in fade-in slide-in-from-top-4">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium break-words">{localErrorMsg}</span>
          <button onClick={() => setLocalErrorMsg(null)} className="ml-2 p-1 hover:bg-red-200 rounded transition-colors" title="閉じる">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {localSuccessMsg && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-[102] bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded shadow-lg flex items-center gap-2 max-w-[90vw] animate-in fade-in slide-in-from-top-4">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium break-words">{localSuccessMsg}</span>
          <button onClick={() => setLocalSuccessMsg(null)} className="ml-2 p-1 hover:bg-green-200 rounded transition-colors" title="閉じる">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div id="print-area" ref={previewContainerRef} className={`flex-1 p-4 md:p-8 flex flex-col items-center overflow-auto w-full relative ${isDragging ? 'bg-blue-50' : 'bg-gray-200'}`}>
        {isEmpty ? (
          /* Empty State - Large DropZone */
          <div className="flex-1 flex flex-col items-center justify-center w-full max-w-2xl mx-auto">
            <div
              onClick={handleUploadClick}
              className="group cursor-pointer flex flex-col items-center justify-center p-10 md:p-16 z-20 rounded-3xl transition-all duration-300 hover:bg-gray-100 w-full"
            >
              <div className={`mb-6 transition-transform duration-300 ease-out p-6 rounded-full bg-gray-100 group-hover:bg-blue-100 group-hover:scale-110 ${isDragging ? 'scale-125 bg-blue-200' : ''}`}>
                <Upload className={`w-16 h-16 text-gray-400 group-hover:text-blue-600 transition-colors ${isDragging ? 'text-blue-600' : ''}`} strokeWidth={1.5} />
              </div>
              <span className="text-2xl md:text-3xl font-bold text-gray-700 group-hover:text-gray-900 transition-colors tracking-tight text-center">
                {isDragging ? txt.dropHere : txt.putPhotos}
              </span>
              <span className="mt-3 text-sm text-gray-400 group-hover:text-gray-500 text-center">
                {appMode === 'construction' ? '工事黒板を自動認識します' : 'Click or Drop photos here'}
              </span>
            </div>

            {/* Processing Indicator */}
            {isProcessing && (
              <div className="absolute inset-0 bg-white/90 z-50 flex flex-col items-center justify-center backdrop-blur-sm rounded-xl">
                <div className="w-16 h-16 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mb-6" />
                <h2 className="text-xl font-bold text-gray-800 animate-pulse">{txt.analyzing}</h2>
                <p className="text-gray-500 mt-2 text-sm">AI is processing your photos...</p>
              </div>
            )}
          </div>
        ) : reorder.isReorderMode ? (
          <ReorderModeView
            lang={lang}
            reorderType={reorder.reorderType}
            reorderedGroups={reorder.reorderedGroups}
            reorderedSinglePhotos={reorder.reorderedSinglePhotos}
            draggedGroupIndex={reorder.draggedGroupIndex}
            draggedPhotoIndex={reorder.draggedPhotoIndex}
            setReorderType={reorder.setReorderType}
            onGroupDragStart={reorder.handleGroupDragStart}
            onGroupDragOver={reorder.handleGroupDragOver}
            onGroupDragEnd={reorder.handleGroupDragEnd}
            onPhotoDragStart={reorder.handlePhotoDragStart}
            onPhotoDragOver={reorder.handlePhotoDragOver}
            onPhotoDragEnd={reorder.handlePhotoDragEnd}
          />
        ) : (
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top center', marginBottom: scale < 1 ? `-${(1 - scale) * 50}%` : '0', minWidth: '210mm' }}>
            <PhotoAlbumView
              records={photos}
              appMode={appMode}
              lang={lang}
              photosPerPage={photosPerPage}
              onUpdatePhoto={onUpdatePhoto}
              onDeletePhoto={onDeletePhoto}
              onReanalyzePhoto={onReanalyzePhoto}
            />
          </div>
        )}

        <ConsolePanel logs={logs} isOpen={showConsole} onToggle={() => setShowConsole(!showConsole)} onClear={onClearLogs} isProcessing={isProcessing} onSendInstruction={onSendInstruction} />
      </div>

      {showHistoryPanel && <SessionHistoryPanel onLoad={() => {}} onClose={() => setShowHistoryPanel(false)} currentPhotos={photos} />}

      {/* Photo file input */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        multiple
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
      />

      {/* JSON import file input */}
      <input
        type="file"
        ref={fileInputImportRef}
        accept=".json"
        onChange={handleJsonFileChange}
        style={{ display: 'none' }}
      />

      {/* Analysis Setup Modal */}
      {pendingFiles && pendingFiles.length > 0 && onStartProcessing && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"><Loader2 className="w-8 h-8 text-white animate-spin" /></div>}>
          <AnalysisSetupModal
            files={pendingFiles}
            lang={lang}
            apiKey={apiKey}
            onCancel={clearPendingFiles}
            onStartAnalysis={handleStartAnalysis}
            onManualPairing={onManualPairing ? handleManualPairingClick : undefined}
            onInteractiveTest={(file) => onTestOneInteractive?.(file)}
            onOpenMasterEditor={() => onOpenMasterEditor?.()}
            onOpenSettings={onOpenSettings}
          />
        </Suspense>
      )}
    </div>
  );
};

export default PreviewView;
