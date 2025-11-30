
import React, { useState, useRef, useEffect } from 'react';
import { FileText, Loader2, Download, Printer, AlertCircle, ZoomIn, Maximize, Home, Wand2, X, Database, FileArchive, Layers, GitCompare, CalendarClock } from 'lucide-react';
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
  onClearLogs: () => void;
  onGoHome: () => void;
  onCloseProject: () => void;
  onRefine: () => void;
  onExportExcel: (photosPerPage: 2 | 3) => void;
  onUpdatePhoto: (fileName: string, field: keyof AIAnalysisResult, value: string) => void;
  onDeletePhoto: (fileName: string) => void;
  onAutoPair: () => void;
  onSortByDate: () => void;
  onSendInstruction?: (instruction: string) => void;
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
  onClearLogs,
  onGoHome,
  onCloseProject,
  onRefine,
  onExportExcel,
  onUpdatePhoto,
  onDeletePhoto,
  onAutoPair,
  onSortByDate,
  onSendInstruction
}) => {
  const txt = TRANS[lang];
  const [scale, setScale] = useState(1);
  const [isFitMode, setIsFitMode] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingZip, setIsGeneratingZip] = useState(false);
  const [showConsole, setShowConsole] = useState(true); // Default to True
  const [photosPerPage, setPhotosPerPage] = useState<2 | 3>(initialLayout);
  const previewContainerRef = useRef<HTMLDivElement>(null);

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
              {isProcessing && <span className="text-amber-300 animate-pulse flex items-center gap-1 border-l border-slate-600 pl-2"><Loader2 className="w-3 h-3 animate-spin"/> {currentStep.split('(')[0]}</span>}
           </div>
         </div>

         <div className="flex gap-2 items-center">


            {/* Refine Button */}
            <button 
              onClick={onRefine}
              className="p-2 bg-purple-600 hover:bg-purple-500 rounded text-white shadow-lg shadow-purple-900/20 mr-2"
              disabled={isProcessing}
              title={txt.refineTitle}
            >
              <Wand2 className="w-4 h-4" />
            </button>



            <button onClick={onGoHome} className="p-2 bg-slate-700 hover:bg-blue-600 rounded text-slate-300 hover:text-white transition-colors" title={txt.backHome}>
              <Home className="w-4 h-4" />
            </button>

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
         <div style={{ transform: `scale(${scale})`, transformOrigin: 'top center', marginBottom: scale < 1 ? `-${(1 - scale) * 50}%` : '0', minWidth: '210mm' }}>
            <PhotoAlbumView 
              records={photos} 
              appMode={appMode} 
              lang={lang} 
              photosPerPage={photosPerPage}
              onUpdatePhoto={onUpdatePhoto}
              onDeletePhoto={onDeletePhoto}
            />
         </div>
         
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
