import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FileText, Loader2, Download, Printer, AlertCircle, ZoomIn, Maximize, Home, Wand2, X, Database, FileArchive, Layers, GitCompare, CalendarClock, Check, FileText as FileTextIcon, MousePointer, StopCircle, Settings, ArrowUpDown, Save, Replace } from 'lucide-react';
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
  onBulkReplaceStation?: (oldValue: string, newValue: string) => void;
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
  onReorderPhotos,
  onBulkReplaceStation
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
  const [isReplaceMode, setIsReplaceMode] = useState(false);
  const [draggedGroupIndex, setDraggedGroupIndex] = useState<number | null>(null);
  const [selectedReplaceFrom, setSelectedReplaceFrom] = useState<string>('');
  const [replaceTo, setReplaceTo] = useState<string>('');
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // 細別ごとにグループ化
  type PhotoGroup = { detail: string; photos: PhotoRecord[] };
  const [reorderedGroups, setReorderedGroups] = useState<PhotoGroup[]>([]);

  // 測点一覧を計算（枚数付き）
  const stationStats = useMemo(() => {
    const map = new Map<string, number>();
    photos.forEach(photo => {
      const station = photo.analysis?.station || '';
      if (station) {
        map.set(station, (map.get(station) || 0) + 1);
      }
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'ja', { numeric: true }))
      .map(([station, count]) => ({ station, count }));
  }, [photos]);

  // Initialize groups when entering reorder mode
  useEffect(() => {
    if (isReorderMode) {
      // 写真を細別でグループ化（出現順を維持）
      const groupMap = new Map<string, PhotoRecord[]>();
      const groupOrder: string[] = [];

      photos.forEach(photo => {
        const detail = photo.analysis?.detail || photo.analysis?.variety || '未分類';
        if (!groupMap.has(detail)) {
          groupMap.set(detail, []);
          groupOrder.push(detail);
        }
        groupMap.get(detail)!.push(photo);
      });

      const groups: PhotoGroup[] = groupOrder.map(detail => ({
        detail,
        photos: groupMap.get(detail)!
      }));

      setReorderedGroups(groups);
    }
  }, [isReorderMode, photos]);

  // Drag and drop handlers for group reorder mode
  const handleGroupDragStart = (index: number) => {
    setDraggedGroupIndex(index);
  };

  const handleGroupDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedGroupIndex === null || draggedGroupIndex === index) return;

    const newGroups = [...reorderedGroups];
    const draggedGroup = newGroups[draggedGroupIndex];
    newGroups.splice(draggedGroupIndex, 1);
    newGroups.splice(index, 0, draggedGroup);
    setReorderedGroups(newGroups);
    setDraggedGroupIndex(index);
  };

  const handleGroupDragEnd = () => {
    setDraggedGroupIndex(null);
  };

  const handleSaveReorder = () => {
    if (onReorderPhotos) {
      // グループ順に写真を展開
      const reorderedPhotos = reorderedGroups.flatMap(g => g.photos);
      onReorderPhotos(reorderedPhotos);
    }
    setIsReorderMode(false);
  };

  const handleCancelReorder = () => {
    setReorderedGroups([]);
    setIsReorderMode(false);
  };

  // 置換モードのハンドラ
  const handleEnterReplaceMode = () => {
    setSelectedReplaceFrom('');
    setReplaceTo('');
    setIsReplaceMode(true);
  };

  const handleExecuteReplace = () => {
    if (selectedReplaceFrom && replaceTo && onBulkReplaceStation) {
      onBulkReplaceStation(selectedReplaceFrom, replaceTo);
      setIsReplaceMode(false);
      setSelectedReplaceFrom('');
      setReplaceTo('');
    }
  };

  const handleCancelReplace = () => {
    setIsReplaceMode(false);
    setSelectedReplaceFrom('');
    setReplaceTo('');
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
            {!isReorderMode && !isReplaceMode && (
              <button
                onClick={() => setIsReorderMode(true)}
                className="p-2 bg-orange-600 hover:bg-orange-500 rounded text-white shadow-lg shadow-orange-900/20"
                disabled={isProcessing}
                title={lang === 'ja' ? '並べ替えモード' : 'Reorder Mode'}
              >
                <ArrowUpDown className="w-4 h-4" />
              </button>
            )}
            {isReorderMode && (
              <div className="flex gap-1">
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

            {/* Replace Mode Toggle */}
            {!isReorderMode && !isReplaceMode && (
              <button
                onClick={handleEnterReplaceMode}
                className="p-2 bg-cyan-600 hover:bg-cyan-500 rounded text-white shadow-lg shadow-cyan-900/20 mr-2"
                disabled={isProcessing}
                title={lang === 'ja' ? '測点一括置換' : 'Bulk Replace Station'}
              >
                <Replace className="w-4 h-4" />
              </button>
            )}
            {isReplaceMode && (
              <div className="flex gap-1 mr-2">
                <button
                  onClick={handleCancelReplace}
                  className="px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded text-white text-xs font-bold flex items-center gap-1"
                  title={lang === 'ja' ? 'キャンセル' : 'Cancel'}
                >
                  <X className="w-4 h-4" />
                  {lang === 'ja' ? '閉じる' : 'Close'}
                </button>
              </div>
            )}

            {/* Refine Button */}
            <button
              onClick={onRefine}
              className="p-2 bg-purple-600 hover:bg-purple-500 rounded text-white shadow-lg shadow-purple-900/20 mr-2"
              disabled={isProcessing || isReorderMode || isReplaceMode}
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
           /* Reorder Mode - Group-based Draggable Cards */
           <div className="w-full max-w-4xl">
             <div className="bg-orange-100 border border-orange-300 rounded-lg p-3 mb-4 text-orange-800 text-sm">
               <ArrowUpDown className="w-4 h-4 inline mr-2" />
               {lang === 'ja'
                 ? '細別グループをドラッグして並べ替えてください。完了したら「保存」を押すと順序が学習されます。'
                 : 'Drag detail groups to reorder. Click "Save" to learn this order for future use.'}
             </div>
             <div className="flex flex-col gap-2">
               {reorderedGroups.map((group, index) => (
                 <div
                   key={group.detail}
                   draggable
                   onDragStart={() => handleGroupDragStart(index)}
                   onDragOver={(e) => handleGroupDragOver(e, index)}
                   onDragEnd={handleGroupDragEnd}
                   className={`bg-white rounded-lg shadow-md overflow-hidden cursor-grab active:cursor-grabbing transition-all flex items-center ${
                     draggedGroupIndex === index ? 'ring-2 ring-orange-500 scale-[1.02] opacity-75' : 'hover:shadow-lg'
                   }`}
                 >
                   {/* Order Number */}
                   <div className="w-12 h-full bg-orange-500 text-white flex items-center justify-center font-bold text-lg flex-shrink-0">
                     {index + 1}
                   </div>

                   {/* Thumbnail Grid (up to 4 photos) */}
                   <div className="w-24 h-16 flex-shrink-0 grid grid-cols-2 grid-rows-2 gap-0.5 p-1 bg-gray-100">
                     {group.photos.slice(0, 4).map((photo, i) => (
                       <img
                         key={photo.fileName}
                         src={photo.base64}
                         alt=""
                         className="w-full h-full object-cover pointer-events-none"
                       />
                     ))}
                   </div>

                   {/* Group Info */}
                   <div className="flex-1 px-4 py-2">
                     <div className="font-bold text-gray-800 text-base">{group.detail}</div>
                     <div className="text-gray-500 text-sm">{group.photos.length}枚</div>
                   </div>

                   {/* Drag Handle Indicator */}
                   <div className="px-4 text-gray-400">
                     <ArrowUpDown className="w-5 h-5" />
                   </div>
                 </div>
               ))}
             </div>
           </div>
         ) : isReplaceMode ? (
           /* Replace Mode - Bulk Station Replace UI */
           <div className="w-full max-w-2xl">
             <div className="bg-cyan-100 border border-cyan-300 rounded-lg p-3 mb-4 text-cyan-800 text-sm">
               <Replace className="w-4 h-4 inline mr-2" />
               {lang === 'ja'
                 ? '置換したい測点をクリックして選択し、新しい値を入力してください。'
                 : 'Click a station to select it, then enter the new value.'}
             </div>

             {/* Station List */}
             <div className="bg-white rounded-lg shadow-md p-4 mb-4">
               <h3 className="font-bold text-gray-700 mb-3">
                 {lang === 'ja' ? '測点一覧' : 'Station List'}
               </h3>
               <div className="flex flex-wrap gap-2">
                 {stationStats.length === 0 ? (
                   <div className="text-gray-500 text-sm">
                     {lang === 'ja' ? '測点が設定されている写真がありません' : 'No photos with station data'}
                   </div>
                 ) : (
                   stationStats.map(({ station, count }) => (
                     <button
                       key={station}
                       onClick={() => {
                         setSelectedReplaceFrom(station);
                         setReplaceTo(station);
                       }}
                       className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                         selectedReplaceFrom === station
                           ? 'bg-cyan-500 text-white border-cyan-600 ring-2 ring-cyan-300'
                           : 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-700'
                       }`}
                     >
                       <span className="font-medium">{station}</span>
                       <span className="ml-2 text-xs opacity-75">({count}枚)</span>
                     </button>
                   ))
                 )}
               </div>
             </div>

             {/* Replace Form */}
             {selectedReplaceFrom && (
               <div className="bg-white rounded-lg shadow-md p-4">
                 <h3 className="font-bold text-gray-700 mb-3">
                   {lang === 'ja' ? '置換設定' : 'Replace Settings'}
                 </h3>
                 <div className="flex items-center gap-3">
                   <div className="flex-1">
                     <label className="block text-xs text-gray-500 mb-1">
                       {lang === 'ja' ? '置換元' : 'From'}
                     </label>
                     <div className="px-3 py-2 bg-gray-100 rounded border border-gray-200 font-medium text-gray-700">
                       {selectedReplaceFrom}
                     </div>
                   </div>
                   <div className="text-gray-400 pt-5">→</div>
                   <div className="flex-1">
                     <label className="block text-xs text-gray-500 mb-1">
                       {lang === 'ja' ? '置換先' : 'To'}
                     </label>
                     <input
                       type="text"
                       value={replaceTo}
                       onChange={(e) => setReplaceTo(e.target.value)}
                       className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-cyan-300 focus:border-cyan-500 outline-none"
                       placeholder={lang === 'ja' ? '新しい測点値' : 'New station value'}
                     />
                   </div>
                   <button
                     onClick={handleExecuteReplace}
                     disabled={!replaceTo || replaceTo === selectedReplaceFrom}
                     className="mt-5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold rounded transition-colors flex items-center gap-2"
                   >
                     <Replace className="w-4 h-4" />
                     {lang === 'ja' ? '置換' : 'Replace'}
                   </button>
                 </div>
                 <div className="mt-2 text-xs text-gray-500">
                   {lang === 'ja'
                     ? `「${selectedReplaceFrom}」の写真 ${stationStats.find(s => s.station === selectedReplaceFrom)?.count || 0} 枚が対象になります`
                     : `${stationStats.find(s => s.station === selectedReplaceFrom)?.count || 0} photos with "${selectedReplaceFrom}" will be updated`}
                 </div>
               </div>
             )}
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