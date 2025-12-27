import React, { useState, useRef, useEffect } from 'react';
import { FileText, Loader2, Download, Printer, AlertCircle, ZoomIn, Maximize, Home, Wand2, X, Database, FileArchive, Layers, GitCompare, CalendarClock, Check, FileText as FileTextIcon, MousePointer, StopCircle, Settings, ArrowUpDown, Save } from 'lucide-react';
import { TRANS } from '../utils/translations';
import { PhotoRecord, ProcessingStats, AppMode, AIAnalysisResult, LogEntry } from '../types';
import PhotoAlbumView from './PhotoAlbumView';
import ConsolePanel from './ConsolePanel';
import { generateZip } from '../utils/zipGenerator';

// Declare html2pdf and saveAs
declare const html2pdf: any;
declare const saveAs: any;

const A4_WIDTH_PX = 794;

interface PreviewViewProps {
  lang: 'en' | 'ja';
  photos: PhotoRecord[];
  stats: ProcessingStats;
  appMode: AppMode;
  isProcessing: boolean;
  currentStep: string;
  errorMsg: string | null;
  successMsg: string | null;
  logs: LogEntry[];
  initialLayout?: 2 | 3;
  fsCacheEnabled?: boolean;
  fsCacheStats?: any;
  onClearLogs: () => void;
  onGoHome: () => void;
  onCloseProject: () => void;
  onRefine: () => void;
  onExportExcel: (photosPerPage: 2 | 3) => void;
  onUpdatePhoto: (fileName: string, field: keyof AIAnalysisResult, value: string) => void;
  onDeletePhoto: (fileName: string) => void;
  onAutoPair: () => void;
  onManualPair: () => void;
  onSortByDate: () => void;
  onSendInstruction?: (instruction: string) => void;
  onSelectCacheFolder?: () => void;
  onClearFileSystemCache?: () => void;
  onReanalyzePhoto?: (fileName: string) => void;
  onAbort?: () => void;
  onOpenMasterEditor?: () => void;
  onReorderPhotos?: (reorderedPhotos: PhotoRecord[]) => void;
}

const PreviewView: React.FC<PreviewViewProps> = ({
  lang,
  photos,
  stats,
  appMode,
  isProcessing,
  currentStep,
  errorMsg,
  successMsg,
  logs,
  initialLayout = 3,
  fsCacheEnabled,
  fsCacheStats,
  onClearLogs,
  onGoHome,
  onCloseProject,
  onRefine,
  onExportExcel,
  onUpdatePhoto,
  onDeletePhoto,
  onAutoPair,
  onManualPair,
  onSortByDate,
  onSendInstruction,
  onSelectCacheFolder,
  onClearFileSystemCache,
  onReanalyzePhoto,
  onAbort,
  onOpenMasterEditor,
  onReorderPhotos
}) => {
  const txt = TRANS[lang];
  const [scale, setScale] = useState(1);
  const [isFitMode, setIsFitMode] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingZip, setIsGeneratingZip] = useState(false);
  const [showConsole, setShowConsole] = useState(true); // Default to True
  const [photosPerPage, setPhotosPerPage] = useState<2 | 3>(initialLayout);
  const [showDescription, setShowDescription] = useState(false); // Default to OFF
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [reorderedPhotos, setReorderedPhotos] = useState<PhotoRecord[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Initialize reordered photos when entering reorder mode
  useEffect(() => {
    if (isReorderMode) {
      setReorderedPhotos([...photos]);
    }
  }, [isReorderMode, photos]);

  // Drag and drop handlers for reorder mode
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newPhotos = [...reorderedPhotos];
    const draggedPhoto = newPhotos[draggedIndex];
    newPhotos.splice(draggedIndex, 1);
    newPhotos.splice(index, 0, draggedPhoto);
    setReorderedPhotos(newPhotos);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleSaveReorder = () => {
    if (onReorderPhotos) {
      onReorderPhotos(reorderedPhotos);
    }
    setIsReorderMode(false);
  };

  const handleCancelReorder = () => {
    setReorderedPhotos([]);
    setIsReorderMode(false);
  };

  // Sync photosPerPage if initialLayout changes (e.g. after auto-pair finishes)
  useEffect(() => {
    setPhotosPerPage(initialLayout);
  }, [initialLayout]);

  // Auto-Calculate Scale for Mobile
  useEffect(() => {
    const handleResize = () => {
      if (!previewContainerRef.current) return;
      const containerWidth = previewContainerRef.current.clientWidth;
      const availableWidth = containerWidth - 32;
      if (isFitMode) {
        const newScale = availableWidth < A4_WIDTH_PX ? availableWidth / A4_WIDTH_PX : 1;
        setScale(newScale);
      } else {
        setScale(1);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); 
    return () => window.removeEventListener('resize', handleResize);
  }, [isFitMode]);

  const handleDownloadPDF = () => {
    if (typeof html2pdf === 'undefined') {
      alert("PDF library not loaded.");
      return;
    }

    setIsGeneratingPdf(true);
    const element = document.getElementById('album-content');
    if (element) element.classList.add('pdf-mode');

    const filename = `construction_album_${new Date().toISOString().slice(0, 10)}.pdf`;

    const opt = {
      margin: 0,
      filename: filename,
      image: { type: 'jpeg', quality: 1.0 },
      html2canvas: { scale: 3, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: 'css', after: '.sheet-preview' }
    };

    html2pdf().set(opt).from(element).output('blob').then((blob: Blob) => {
      saveAs(blob, filename);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setIsGeneratingPdf(false);
      if (element) element.classList.remove('pdf-mode');
    }).catch((err: any) => {
      console.error(err);
      setIsGeneratingPdf(false);
      if (element) element.classList.remove('pdf-mode');
      alert(txt.pdfError);
    });
  };

  const handleDownloadZip = async () => {
    if (photos.length === 0) return;
    setIsGeneratingZip(true);
    try {
      const blob = await generateZip(photos);
      const filename = `electronic_delivery_${new Date().toISOString().slice(0, 10)}.zip`;
      saveAs(blob, filename);
    } catch (e) {
      console.error(e);
      alert("Failed to generate ZIP.");
    } finally {
      setIsGeneratingZip(false);
    }
  };

  const handleAutoPairClick = () => {
    // Automatically switch to 2-up view for pairs as it's the intended layout for before/after
    if (photosPerPage !== 2) {
      setPhotosPerPage(2);
    }
    onAutoPair();
  };

  const hasPhotosWithBoard = photos.some(p => p.analysis?.hasBoard);
  return (
    <div className="fixed inset-0 z-[100] bg-gray-200 overflow-hidden flex flex-col">
      <div className="sticky top-0 z-[101] bg-slate-800 text-white p-3 shadow-md flex justify-between items-center">
         <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
           
           <div className="flex gap-2 text-xs md:text-sm bg-slate-700 px-2 py-1 rounded-lg flex-shrink 0 whitespace-nowrap items-center">
              <span className="text-slate-300">{txt.total}: {stats.total}</span>
              <span className="text-green-400">{txt.done}: {stats.success}</span>
              {stats.cached > 0 && (
                 <span className="text-green-300 flex items-center gap-1 border-l border-slate-600 pl-2 font-bold animate-in fade-in">
                    <Database className="w-3 h-3" /> Cached: {stats.cached}
                 </span>
              )}
              {isProcessing && (
                <>
                  <span className="text-amber-300 animate-pulse flex items-center gap-1 border-l border-slate-600 pl-2">
                    <Loader2 className="w-3 h-3 animate-spin"/> {currentStep.split('(')[0]}
                  </span>
                  <button
                    onClick={onAbort}
                    className="ml-2 px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded flex items-center gap-1 transition-colors"
                    title="解析を中断 (ESC)"
                  >
                    <StopCircle className="w-3 h-3" />
                    中断
                  </button>
                </>
              )}
           </div>
         </div>

         <div className="flex gap-2 items-center">


            {/* Pairing Buttons */}
            <div className="flex bg-slate-700 rounded overflow-hidden mr-2">
              <button
                onClick={handleAutoPairClick}
                className="px-3 py-2 text-xs font-medium text-slate-300 hover:bg-blue-600 hover:text-white transition-colors flex items-center gap-1"
                disabled={isProcessing}
                title={txt.btnPairing}
              >
                <GitCompare className="w-3.5 h-3.5" />
                <span className="hidden md:inline">AI</span>
              </button>
              <button
                onClick={() => { setPhotosPerPage(2); onManualPair(); }}
                className="px-3 py-2 text-xs font-medium text-slate-300 hover:bg-amber-500 hover:text-white transition-colors flex items-center gap-1 border-l border-slate-600"
                disabled={isProcessing}
                title={lang === 'ja' ? '手動ペアリング' : 'Manual Pairing'}
              >
                <MousePointer className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{lang === 'ja' ? '手動' : 'Manual'}</span>
              </button>
            </div>

            {/* Reorder Mode Toggle */}
            {!isReorderMode ? (
              <button
                onClick={() => setIsReorderMode(true)}
                className="p-2 bg-orange-600 hover:bg-orange-500 rounded text-white shadow-lg shadow-orange-900/20 mr-2"
                disabled={isProcessing}
                title={lang === 'ja' ? '並べ替えモード' : 'Reorder Mode'}
              >
                <ArrowUpDown className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex gap-1 mr-2">
                <button
                  onClick={handleSaveReorder}
                  className="px-3 py-2 bg-green-600 hover:bg-green-500 rounded text-white text-xs font-bold flex items-center gap-1"
                  title={lang === 'ja' ? '順序を保存' : 'Save Order'}
                >
                  <Save className="w-4 h-4" />
                  {lang === 'ja' ? '保存' : 'Save'}
                </button>
                <button
                  onClick={handleCancelReorder}
                  className="px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded text-white text-xs font-bold flex items-center gap-1"
                  title={lang === 'ja' ? 'キャンセル' : 'Cancel'}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Refine Button */}
            <button
              onClick={onRefine}
              className="p-2 bg-purple-600 hover:bg-purple-500 rounded text-white shadow-lg shadow-purple-900/20 mr-2"
              disabled={isProcessing || isReorderMode}
              title={txt.refineTitle}
            >
              <Wand2 className="w-4 h-4" />
            </button>



            <button onClick={onGoHome} className="p-2 bg-slate-700 hover:bg-blue-600 rounded text-slate-300 hover:text-white transition-colors" title={txt.backHome}>
              <Home className="w-4 h-4" />
            </button>

            {/* Master Editor Button */}
            {onOpenMasterEditor && (
              <button
                onClick={onOpenMasterEditor}
                className="p-2 bg-slate-700 hover:bg-amber-500 rounded text-slate-300 hover:text-white transition-colors ml-1"
                title={lang === 'ja' ? 'マスタ管理' : 'Master Data'}
              >
                <Settings className="w-4 h-4" />
              </button>
            )}

            {/* Layout Switcher - show when photos have boards */}
            {hasPhotosWithBoard && (
              <div className="flex bg-slate-700 rounded overflow-hidden ml-2">
                <button
                  onClick={() => setPhotosPerPage(2)}
                  className={`px-3 py-2 text-xs font-medium transition-colors ${
                    photosPerPage === 2 ? "bg-amber-500 text-white" : "text-slate-300 hover:bg-slate-600"
                  }`}
                  title="2枚/ページ"
                >
                  2枚
                </button>
                <button
                  onClick={() => setPhotosPerPage(3)}
                  className={`px-3 py-2 text-xs font-medium transition-colors ${
                    photosPerPage === 3 ? "bg-amber-500 text-white" : "text-slate-300 hover:bg-slate-600"
                  }`}
                  title="3枚/ページ"
                >
                  3枚
                </button>
              </div>
            )}

            {/* Description Toggle - only show in 3-up mode */}
            {photosPerPage === 3 && (
              <button
                onClick={() => setShowDescription(!showDescription)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded text-xs font-medium transition-colors ml-2 ${
                  showDescription
                    ? "bg-blue-500 text-white"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
                title="記事欄の表示/非表示"
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                  showDescription ? 'bg-white border-white' : 'border-slate-400'
                }`}>
                  {showDescription && <Check className="w-3 h-3 text-blue-500" />}
                </div>
                <FileTextIcon className="w-3.5 h-3.5" />
                記事欄
              </button>
            )}

            <div className="flex gap-1 ml-1">
              <button onClick={() => onExportExcel(photosPerPage)} disabled={isProcessing} className="p-2 md:px-4 md:py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-bold shadow-sm flex items-center gap-2" title={txt.exportExcel}>
                  <Download className="w-4 h-4" /> <span className="hidden md:inline">{txt.exportExcel}</span>
              </button>
              
              {appMode === 'construction' && (
                <button onClick={handleDownloadZip} disabled={isGeneratingZip || isProcessing} className="p-2 md:px-4 md:py-2 bg-blue-500 hover:bg-blue-600 rounded text-sm font-bold text-white shadow-sm flex items-center gap-2" title="Electronic Delivery (XML/ZIP)">
                  {isGeneratingZip ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />} <span className="hidden md:inline">XML/ZIP</span>
                </button>
              )}

              <button onClick={handleDownloadPDF} disabled={isGeneratingPdf || isProcessing} className="p-2 md:px-4 md:py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-bold text-white shadow-sm flex items-center gap-2" title={txt.exportPDF}>
                {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} <span className="hidden md:inline">{isGeneratingPdf ? "..." : txt.exportPDF}</span>
              </button>
            </div>
         </div>
      </div>
      
      {errorMsg && (
         <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-[102] bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded shadow-lg flex items-center gap-2 max-w-[90vw]">
           <AlertCircle className="w-5 h-5 flex-shrink-0" /> <span className="text-sm font-medium break-words">{errorMsg}</span>
         </div>
      )}
      
      {successMsg && (
         <div className="absolute top-32 left-1/2 transform -translate-x-1/2 z-[102] bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded shadow-lg flex items-center gap-2 max-w-[90vw] animate-in fade-in slide-in-from-top-4">
           <Database className="w-5 h-5 flex-shrink-0" /> <span className="text-sm font-medium break-words">{successMsg}</span>
         </div>
      )}

      <div id="print-area" ref={previewContainerRef} className="flex-1 p-4 md:p-8 flex flex-col items-center overflow-auto bg-gray-200 w-full relative">
         {isReorderMode ? (
           /* Reorder Mode - Draggable Grid */
           <div className="w-full max-w-6xl">
             <div className="bg-orange-100 border border-orange-300 rounded-lg p-3 mb-4 text-orange-800 text-sm">
               <ArrowUpDown className="w-4 h-4 inline mr-2" />
               {lang === 'ja'
                 ? 'ドラッグして写真を並べ替えてください。完了したら「保存」を押すと順序が学習されます。'
                 : 'Drag photos to reorder. Click "Save" to learn this order for future use.'}
             </div>
             <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
               {reorderedPhotos.map((photo, index) => (
                 <div
                   key={photo.fileName}
                   draggable
                   onDragStart={() => handleDragStart(index)}
                   onDragOver={(e) => handleDragOver(e, index)}
                   onDragEnd={handleDragEnd}
                   className={`bg-white rounded-lg shadow-md overflow-hidden cursor-grab active:cursor-grabbing transition-all ${
                     draggedIndex === index ? 'ring-2 ring-orange-500 scale-105 opacity-75' : 'hover:shadow-lg'
                   }`}
                 >
                   <div className="aspect-[4/3] bg-gray-100 overflow-hidden">
                     <img
                       src={photo.base64}
                       alt={photo.fileName}
                       className="w-full h-full object-cover pointer-events-none"
                     />
                   </div>
                   <div className="p-2 text-xs">
                     <div className="font-bold text-gray-700 truncate">{index + 1}. {photo.analysis?.detail || photo.analysis?.variety || '未分類'}</div>
                     <div className="text-gray-500 truncate">{photo.analysis?.remarks || ''}</div>
                   </div>
                 </div>
               ))}
             </div>
           </div>
         ) : (
           /* Normal Preview Mode */
           <div style={{ transform: `scale(${scale})`, transformOrigin: 'top center', marginBottom: scale < 1 ? `-${(1 - scale) * 50}%` : '0', minWidth: '210mm' }}>
              <PhotoAlbumView
                records={photos}
                appMode={appMode}
                lang={lang}
                photosPerPage={photosPerPage}
                showDescription={showDescription}
                onUpdatePhoto={onUpdatePhoto}
                onDeletePhoto={onDeletePhoto}
                onReanalyzePhoto={onReanalyzePhoto}
              />
           </div>
         )}
         
         {/* Console Panel Component */}
         <ConsolePanel 
           logs={logs}
           isOpen={showConsole}
           onToggle={() => setShowConsole(!showConsole)}
           onClear={onClearLogs}
           isProcessing={isProcessing}
           onSendInstruction={onSendInstruction}
         />
      </div>
    </div>
  );
};

export default PreviewView;