import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PhotoRecord } from '../types';
import { generateZip } from '../utils/zipGenerator';

const A4_WIDTH_PX = 794;

declare const saveAs: any;
declare const html2pdf: any;

interface PreviewLayoutState {
  scale: number;
  isFitMode: boolean;
  photosPerPage: 2 | 3;
}

interface ExportState {
  isGeneratingPdf: boolean;
  isGeneratingZip: boolean;
}

interface PanelState {
  showConsole: boolean;
  showHistoryPanel: boolean;
}

interface UploadState {
  isDragging: boolean;
  pendingFiles: File[] | null;
  showMenu: boolean;
}

interface PreviewViewState extends PreviewLayoutState, ExportState, PanelState, UploadState {
  previewContainerRef: React.RefObject<HTMLDivElement>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  fileInputImportRef: React.RefObject<HTMLInputElement>;
}

interface UploadActions {
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleUploadClick: () => void;
  triggerImportClick: () => void;
  toggleMenu: (e: React.MouseEvent) => void;
  closeMenu: () => void;
  clearPendingFiles: () => void;
}

interface PreviewViewActions extends UploadActions {
  setPhotosPerPage: (value: 2 | 3) => void;
  setShowConsole: (value: boolean) => void;
  setShowHistoryPanel: (value: boolean) => void;
  handleDownloadPDF: (photos: PhotoRecord[], txt: { pdfError: string }) => Promise<void>;
  handleDownloadZip: (photos: PhotoRecord[]) => Promise<void>;
  handleAutoPairClick: (onAutoPair: () => void) => void;
  handleManualPairClick: (onManualPair: () => void) => void;
}

const STORAGE_KEY = 'gaspm_photosPerPage';

export function usePreviewViewState(initialLayout: 2 | 3, isProcessing: boolean = false): PreviewViewState & PreviewViewActions {
  const [scale, setScale] = useState(1);
  const [isFitMode, setIsFitMode] = useState(true);
  const [photosPerPage, setPhotosPerPageState] = useState<2 | 3>(() => {
    // localStorageから復元、なければinitialLayoutを使用
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === '2' || saved === '3') {
      return parseInt(saved, 10) as 2 | 3;
    }
    return initialLayout;
  });
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingZip, setIsGeneratingZip] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Upload state (from useUploadViewState)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputImportRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  // Close menu on outside click
  useEffect(() => {
    if (showMenu) {
      const handleClickOutside = () => setShowMenu(false);
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showMenu]);

  // 変更時にlocalStorageに保存
  const setPhotosPerPage = useCallback((value: 2 | 3) => {
    setPhotosPerPageState(value);
    localStorage.setItem(STORAGE_KEY, String(value));
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (!previewContainerRef.current) return;
      const containerWidth = previewContainerRef.current.clientWidth;
      const availableWidth = containerWidth - 32;
      setScale(isFitMode && availableWidth < A4_WIDTH_PX ? availableWidth / A4_WIDTH_PX : 1);
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [isFitMode]);

  const handleDownloadPDF = useCallback(async (photos: PhotoRecord[], txt: { pdfError: string }) => {
    setIsGeneratingPdf(true);
    const filename = `construction_album_${new Date().toISOString().slice(0, 10)}.pdf`;
    const previewElement = document.getElementById('album-content');

    try {
      if (photosPerPage === 2) {
        if (typeof html2pdf === 'undefined') {
          throw new Error('html2pdf is not loaded.');
        }
        if (!previewElement) {
          throw new Error('Preview element not found.');
        }

        previewElement.classList.add('pdf-mode');
        const opt = {
          margin: 0,
          filename,
          image: { type: 'jpeg', quality: 1.0 },
          html2canvas: { scale: 3, useCORS: true, logging: false },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: 'css', after: '.sheet-preview' }
        };

        const blob = await html2pdf().set(opt).from(previewElement).output('blob');
        const { embedSessionInPdf } = await import('../utils/pdfGenerator');
        const pdfBlob = await embedSessionInPdf(blob, photos);
        saveAs(pdfBlob, filename);
        window.open(URL.createObjectURL(pdfBlob), '_blank');
      } else {
        const { generatePdfWithImages } = await import('../utils/pdfGenerator');
        const pdfBlob = await generatePdfWithImages(photos, photosPerPage, '工事写真帳');
        saveAs(pdfBlob, filename);
        window.open(URL.createObjectURL(pdfBlob), '_blank');
      }
    } catch (err) {
      console.error('PDF generation error:', err);
      alert(txt.pdfError);
    } finally {
      previewElement?.classList.remove('pdf-mode');
      setIsGeneratingPdf(false);
    }
  }, [photosPerPage]);

  const handleDownloadZip = useCallback(async (photos: PhotoRecord[]) => {
    if (photos.length === 0) return;
    setIsGeneratingZip(true);
    try {
      const blob = await generateZip(photos);
      saveAs(blob, `electronic_delivery_${new Date().toISOString().slice(0, 10)}.zip`);
    } catch (e) {
      console.error(e);
      alert("Failed to generate ZIP.");
    } finally {
      setIsGeneratingZip(false);
    }
  }, []);

  const handleAutoPairClick = useCallback((onAutoPair: () => void) => {
    if (photosPerPage !== 2) setPhotosPerPage(2);
    onAutoPair();
  }, [photosPerPage]);

  const handleManualPairClick = useCallback((onManualPair: () => void) => {
    setPhotosPerPage(2);
    onManualPair();
  }, []);

  // Upload handlers (from useUploadViewState)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!isProcessing) setIsDragging(true);
  }, [isProcessing]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!isProcessing && e.dataTransfer.files?.length) {
      const imageFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        setPendingFiles(imageFiles);
      }
    }
  }, [isProcessing]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      setPendingFiles(Array.from(e.target.files));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleUploadClick = useCallback(() => {
    if (!isProcessing) fileInputRef.current?.click();
  }, [isProcessing]);

  const triggerImportClick = useCallback(() => {
    fileInputImportRef.current?.click();
  }, []);

  const toggleMenu = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(prev => !prev);
  }, []);

  const closeMenu = useCallback(() => setShowMenu(false), []);

  const clearPendingFiles = useCallback(() => setPendingFiles(null), []);

  return {
    // Layout state
    scale,
    isFitMode,
    photosPerPage,
    // Export state
    isGeneratingPdf,
    isGeneratingZip,
    // Panel state
    showConsole,
    showHistoryPanel,
    // Upload state
    isDragging,
    pendingFiles,
    showMenu,
    // Refs
    previewContainerRef,
    fileInputRef,
    fileInputImportRef,
    // Layout actions
    setPhotosPerPage,
    setShowConsole,
    setShowHistoryPanel,
    // Export actions
    handleDownloadPDF,
    handleDownloadZip,
    // Pair actions
    handleAutoPairClick,
    handleManualPairClick,
    // Upload actions
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileInputChange,
    handleUploadClick,
    triggerImportClick,
    toggleMenu,
    closeMenu,
    clearPendingFiles,
  };
}
