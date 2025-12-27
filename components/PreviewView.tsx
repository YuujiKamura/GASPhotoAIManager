import React, { useState, useRef, useEffect } from 'react';
import { FileText, Loader2, Download, Printer, AlertCircle, ZoomIn, Maximize, Home, Wand2, X, Database, FileArchive, Layers, GitCompare, CalendarClock, Check, FileText as FileTextIcon, MousePointer, StopCircle, Settings, ArrowUpDown, Save, ChevronDown, Replace, MoreVertical } from 'lucide-react';
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
  onOpenStationReplace?: () => void;
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
  onOpenStationReplace
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
  const [reorderType, setReorderType] = useState<'group' | 'single'>('group');
  const [draggedGroupIndex, setDraggedGroupIndex] = useState<number | null>(null);
  const [draggedPhotoIndex, setDraggedPhotoIndex] = useState<number | null>(null);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  // 細別ごとにグループ化
  type PhotoGroup = { detail: string; photos: PhotoRecord[] };
  const [reorderedGroups, setReorderedGroups] = useState<PhotoGroup[]>([]);
  // 1枚ずつモード用
  const [reorderedSinglePhotos, setReorderedSinglePhotos] = useState<PhotoRecord[]>([]);

  // Initialize groups/photos when entering reorder mode
  useEffect(() => {
    if (isReorderMode) {
      // 1枚ずつモード用
      setReorderedSinglePhotos([...photos]);

      // グループモード用：写真を細別でグループ化（出現順を維持）
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

  // Drag and drop handlers for single photo reorder mode
  const handlePhotoDragStart = (index: number) => {
    setDraggedPhotoIndex(index);
  };

  const handlePhotoDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedPhotoIndex === null || draggedPhotoIndex === index) return;

    const newPhotos = [...reorderedSinglePhotos];
    const draggedPhoto = newPhotos[draggedPhotoIndex];
    newPhotos.splice(draggedPhotoIndex, 1);
    newPhotos.splice(index, 0, draggedPhoto);
    setReorderedSinglePhotos(newPhotos);
    setDraggedPhotoIndex(index);
  };

  const handlePhotoDragEnd = () => {
    setDraggedPhotoIndex(null);
  };

  const handleSaveReorder = () => {
    if (onReorderPhotos) {
      if (reorderType === 'group') {
        // グループ順に写真を展開
        const reorderedPhotos = reorderedGroups.flatMap(g => g.photos);
        onReorderPhotos(reorderedPhotos);
      } else {
        // 1枚ずつモード
        onReorderPhotos(reorderedSinglePhotos);
      }
    }
    setIsReorderMode(false);
  };

  const handleCancelReorder = () => {
    setReorderedGroups([]);
    setReorderedSinglePhotos([]);
    setIsReorderMode(false);
  };

  // Sync photosPerPage if initialLayout changes (e.g. after auto-pair finishes)
  useEffect(() => {
    setPhotosPerPage(initialLayout);
  }, [initialLayout]);

  // Close tools menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setShowToolsMenu(false);
      }
    };
    if (showToolsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showToolsMenu]);

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
            {/* Reorder Mode Controls - Overlay when active */}
            {isReorderMode && (
              <div className="flex gap-1 mr-2 animate-in slide-in-from-left">
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

            {/* Tools Dropdown Menu */}
            {!isReorderMode && (
              <div className="relative" ref={toolsMenuRef}>
                <button
                  onClick={() => setShowToolsMenu(!showToolsMenu)}
                  className={`p-2 rounded text-sm font-medium flex items-center gap-1 transition-colors ${
                    showToolsMenu ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                  disabled={isProcessing}
                  title={lang === 'ja' ? 'ツール' : 'Tools'}
                >
                  <MoreVertical className="w-4 h-4" />
                  <span className="hidden md:inline">{lang === 'ja' ? 'ツール' : 'Tools'}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${showToolsMenu ? 'rotate-180' : ''}`} />
                </button>

                {showToolsMenu && (
                  <div className="absolute right-0 top-full mt-1 w-56 bg-slate-800 rounded-lg shadow-xl border border-slate-600 py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    {/* Pairing Section */}
                    <div className="px-3 py-1.5 text-xs text-slate-400 uppercase tracking-wide border-b border-slate-700">
                      {lang === 'ja' ? 'ペアリング' : 'Pairing'}
                    </div>
                    <button
                      onClick={() => { handleAutoPairClick(); setShowToolsMenu(false); }}
                      className="w-full px-3 py-2 text-sm text-left text-slate-200 hover:bg-blue-600 flex items-center gap-2 transition-colors"
                    >
                      <GitCompare className="w-4 h-4 text-blue-400" />
                      {lang === 'ja' ? 'AIペアリング' : 'AI Pairing'}
                    </button>
                    <button
                      onClick={() => { setPhotosPerPage(2); onManualPair(); setShowToolsMenu(false); }}
                      className="w-full px-3 py-2 text-sm text-left text-slate-200 hover:bg-amber-600 flex items-center gap-2 transition-colors"
                    >
                      <MousePointer className="w-4 h-4 text-amber-400" />
                      {lang === 'ja' ? '手動ペアリング' : 'Manual Pairing'}
                    </button>

                    {/* Edit Section */}
                    <div className="px-3 py-1.5 text-xs text-slate-400 uppercase tracking-wide border-b border-slate-700 border-t mt-1">
                      {lang === 'ja' ? '編集' : 'Edit'}
                    </div>
                    <button
                      onClick={() => { setIsReorderMode(true); setShowToolsMenu(false); }}
                      className="w-full px-3 py-2 text-sm text-left text-slate-200 hover:bg-orange-600 flex items-center gap-2 transition-colors"
                    >
                      <ArrowUpDown className="w-4 h-4 text-orange-400" />
                      {lang === 'ja' ? '並べ替え' : 'Reorder'}
                    </button>
                    {onOpenStationReplace && (
                      <button
                        onClick={() => { onOpenStationReplace(); setShowToolsMenu(false); }}
                        className="w-full px-3 py-2 text-sm text-left text-slate-200 hover:bg-cyan-600 flex items-center gap-2 transition-colors"
                      >
                        <Replace className="w-4 h-4 text-cyan-400" />
                        {lang === 'ja' ? '測点の一括置換' : 'Replace Stations'}
                      </button>
                    )}
                    <button
                      onClick={() => { onRefine(); setShowToolsMenu(false); }}
                      className="w-full px-3 py-2 text-sm text-left text-slate-200 hover:bg-purple-600 flex items-center gap-2 transition-colors"
                    >
                      <Wand2 className="w-4 h-4 text-purple-400" />
                      {lang === 'ja' ? '再解析' : 'Refine'}
                    </button>

                    {/* Settings Section */}
                    {onOpenMasterEditor && (
                      <>
                        <div className="px-3 py-1.5 text-xs text-slate-400 uppercase tracking-wide border-b border-slate-700 border-t mt-1">
                          {lang === 'ja' ? '設定' : 'Settings'}
                        </div>
                        <button
                          onClick={() => { onOpenMasterEditor(); setShowToolsMenu(false); }}
                          className="w-full px-3 py-2 text-sm text-left text-slate-200 hover:bg-slate-600 flex items-center gap-2 transition-colors"
                        >
                          <Settings className="w-4 h-4 text-slate-400" />
                          {lang === 'ja' ? 'マスタ管理' : 'Master Data'}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Home Button */}
            <button onClick={onGoHome} className="p-2 bg-slate-700 hover:bg-blue-600 rounded text-slate-300 hover:text-white transition-colors" title={txt.backHome}>
              <Home className="w-4 h-4" />
            </button>

            {/* Layout & View Controls */}
            <div className="flex items-center gap-1 bg-slate-700 rounded-lg px-1">
              {/* Layout Switcher - show when photos have boards */}
              {hasPhotosWithBoard && (
                <>
                  <button
                    onClick={() => setPhotosPerPage(2)}
                    className={`px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                      photosPerPage === 2 ? "bg-amber-500 text-white" : "text-slate-300 hover:bg-slate-600"
                    }`}
                    title="2枚/ページ"
                  >
                    2枚
                  </button>
                  <button
                    onClick={() => setPhotosPerPage(3)}
                    className={`px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                      photosPerPage === 3 ? "bg-amber-500 text-white" : "text-slate-300 hover:bg-slate-600"
                    }`}
                    title="3枚/ページ"
                  >
                    3枚
                  </button>
                </>
              )}

              {/* Description Toggle - only show in 3-up mode */}
              {photosPerPage === 3 && (
                <button
                  onClick={() => setShowDescription(!showDescription)}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                    showDescription ? "bg-blue-500 text-white" : "text-slate-300 hover:bg-slate-600"
                  }`}
                  title="記事欄の表示/非表示"
                >
                  <FileTextIcon className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">記事</span>
                </button>
              )}
            </div>

            {/* Export Buttons */}
            <div className="flex gap-1">
              <button onClick={() => onExportExcel(photosPerPage)} disabled={isProcessing} className="p-2 md:px-3 md:py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-bold shadow-sm flex items-center gap-1" title={txt.exportExcel}>
                  <Download className="w-4 h-4" /> <span className="hidden lg:inline">{txt.exportExcel}</span>
              </button>

              {appMode === 'construction' && (
                <button onClick={handleDownloadZip} disabled={isGeneratingZip || isProcessing} className="p-2 md:px-3 md:py-2 bg-blue-500 hover:bg-blue-600 rounded text-sm font-bold text-white shadow-sm flex items-center gap-1" title="XML/ZIP">
                  {isGeneratingZip ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />} <span className="hidden lg:inline">ZIP</span>
                </button>
              )}

              <button onClick={handleDownloadPDF} disabled={isGeneratingPdf || isProcessing} className="p-2 md:px-3 md:py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-bold text-white shadow-sm flex items-center gap-1" title={txt.exportPDF}>
                {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} <span className="hidden lg:inline">PDF</span>
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
           /* Reorder Mode */
           <div className="w-full max-w-4xl">
             {/* Mode Toggle */}
             <div className="flex gap-2 mb-4">
               <button
                 onClick={() => setReorderType('group')}
                 className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                   reorderType === 'group'
                     ? 'bg-orange-500 text-white'
                     : 'bg-white text-gray-600 hover:bg-orange-100'
                 }`}
               >
                 {lang === 'ja' ? '細別グループ' : 'By Group'}
               </button>
               <button
                 onClick={() => setReorderType('single')}
                 className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                   reorderType === 'single'
                     ? 'bg-blue-500 text-white'
                     : 'bg-white text-gray-600 hover:bg-blue-100'
                 }`}
               >
                 {lang === 'ja' ? '1枚ずつ' : 'Individual'}
               </button>
             </div>

             {/* Instructions */}
             <div className={`rounded-lg p-3 mb-4 text-sm ${
               reorderType === 'group' ? 'bg-orange-100 border border-orange-300 text-orange-800' : 'bg-blue-100 border border-blue-300 text-blue-800'
             }`}>
               <ArrowUpDown className="w-4 h-4 inline mr-2" />
               {reorderType === 'group'
                 ? (lang === 'ja' ? '細別グループをドラッグして並べ替え' : 'Drag groups to reorder')
                 : (lang === 'ja' ? '写真を1枚ずつドラッグして並べ替え' : 'Drag individual photos to reorder')}
             </div>

             {reorderType === 'group' ? (
               /* Group Mode */
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
                     <div className="w-12 h-full bg-orange-500 text-white flex items-center justify-center font-bold text-lg flex-shrink-0">
                       {index + 1}
                     </div>
                     <div className="w-24 h-16 flex-shrink-0 grid grid-cols-2 grid-rows-2 gap-0.5 p-1 bg-gray-100">
                       {group.photos.slice(0, 4).map((photo) => (
                         <img key={photo.fileName} src={photo.base64} alt="" className="w-full h-full object-cover pointer-events-none" />
                       ))}
                     </div>
                     <div className="flex-1 px-4 py-2">
                       <div className="font-bold text-gray-800 text-base">{group.detail}</div>
                       <div className="text-gray-500 text-sm">{group.photos.length}枚</div>
                     </div>
                     <div className="px-4 text-gray-400">
                       <ArrowUpDown className="w-5 h-5" />
                     </div>
                   </div>
                 ))}
               </div>
             ) : (
               /* Single Photo Mode */
               <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                 {reorderedSinglePhotos.map((photo, index) => (
                   <div
                     key={photo.fileName}
                     draggable
                     onDragStart={() => handlePhotoDragStart(index)}
                     onDragOver={(e) => handlePhotoDragOver(e, index)}
                     onDragEnd={handlePhotoDragEnd}
                     className={`relative bg-white rounded-lg shadow-md overflow-hidden cursor-grab active:cursor-grabbing transition-all ${
                       draggedPhotoIndex === index ? 'ring-2 ring-blue-500 scale-105 opacity-75' : 'hover:shadow-lg hover:scale-[1.02]'
                     }`}
                   >
                     <div className="absolute top-1 left-1 bg-blue-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow">
                       {index + 1}
                     </div>
                     <img src={photo.base64} alt={photo.fileName} className="w-full aspect-square object-cover pointer-events-none" />
                     <div className="p-1 text-xs truncate text-gray-600 bg-gray-50">
                       {photo.analysis?.detail || photo.analysis?.remarks || photo.fileName}
                     </div>
                   </div>
                 ))}
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