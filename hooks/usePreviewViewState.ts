import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PhotoRecord, TemplateLayout } from '../types';
import { generateZip } from '../utils/zipGenerator';
import { getTemplateById, getDefaultTemplateId, BUILT_IN_TEMPLATES } from '../utils/layoutConfig';
import { saveAs } from 'file-saver';

const A4_WIDTH_PX = 794;

interface PreviewLayoutState {
  scale: number;
  isFitMode: boolean;
  photosPerPage: 2 | 3;
  templateId: string;
  template: TemplateLayout;
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
  setTemplateId: (templateId: string) => void;
  setShowConsole: (value: boolean) => void;
  setShowHistoryPanel: (value: boolean) => void;
  handleDownloadPDF: (photos: PhotoRecord[], txt: { pdfError: string }) => Promise<void>;
  handleDownloadZip: (photos: PhotoRecord[]) => Promise<void>;
  handleAutoPairClick: (onAutoPair: () => void) => void;
  handleManualPairClick: (onManualPair: () => void) => void;
}

const STORAGE_KEY_TEMPLATE = 'gaspm_templateId';

export function usePreviewViewState(initialLayout: 2 | 3, isProcessing: boolean = false): PreviewViewState & PreviewViewActions {
  const [scale, setScale] = useState(1);
  const [isFitMode, setIsFitMode] = useState(true);

  // テンプレートID状態（localStorageから復元）
  const [templateId, setTemplateIdState] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_TEMPLATE);
    if (saved && BUILT_IN_TEMPLATES[saved]) {
      return saved;
    }
    // initialLayoutから初期テンプレートを決定
    return initialLayout === 2 ? 'simple-2up' : 'standard-3up';
  });

  // テンプレートオブジェクト（templateIdから導出）
  const template = getTemplateById(templateId) || BUILT_IN_TEMPLATES[getDefaultTemplateId()];

  // photosPerPage は template.blocksPerPage から導出（後方互換性）
  const photosPerPage = template.blocksPerPage as 2 | 3;
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

  // テンプレートID変更（localStorageに保存）
  const setTemplateId = useCallback((id: string) => {
    if (BUILT_IN_TEMPLATES[id]) {
      setTemplateIdState(id);
      localStorage.setItem(STORAGE_KEY_TEMPLATE, id);
    }
  }, []);

  // 後方互換: photosPerPage からテンプレートを自動選択
  const setPhotosPerPage = useCallback((value: 2 | 3) => {
    const newTemplateId = value === 2 ? 'simple-2up' : 'standard-3up';
    setTemplateId(newTemplateId);
  }, [setTemplateId]);

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

    try {
      // 全テンプレートで統一されたPDF生成を使用
      const { generatePdfWithImages } = await import('../utils/pdfGenerator');
      const pdfBlob = await generatePdfWithImages(photos, templateId, '工事写真帳');
      saveAs(pdfBlob, filename);
      window.open(URL.createObjectURL(pdfBlob), '_blank');
    } catch (err) {
      console.error('PDF generation error:', err);
      alert(txt.pdfError);
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [templateId]);

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
    templateId,
    template,
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
    setTemplateId,
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
