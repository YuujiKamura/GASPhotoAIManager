import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PhotoRecord } from '../types';
import { generateZip } from '../utils/zipGenerator';

const A4_WIDTH_PX = 794;

declare const saveAs: any;

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

interface PreviewViewState extends PreviewLayoutState, ExportState, PanelState {
  previewContainerRef: React.RefObject<HTMLDivElement>;
}

interface PreviewViewActions {
  setPhotosPerPage: (value: 2 | 3) => void;
  setShowConsole: (value: boolean) => void;
  setShowHistoryPanel: (value: boolean) => void;
  handleDownloadPDF: (photos: PhotoRecord[], txt: { pdfError: string }) => Promise<void>;
  handleDownloadZip: (photos: PhotoRecord[]) => Promise<void>;
  handleAutoPairClick: (onAutoPair: () => void) => void;
  handleManualPairClick: (onManualPair: () => void) => void;
}

const STORAGE_KEY = 'gaspm_photosPerPage';

export function usePreviewViewState(initialLayout: 2 | 3): PreviewViewState & PreviewViewActions {
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
    try {
      const { generatePdfWithImages } = await import('../utils/pdfGenerator');
      const pdfBlob = await generatePdfWithImages(photos, photosPerPage, '工事写真帳');
      const filename = `construction_album_${new Date().toISOString().slice(0, 10)}.pdf`;
      saveAs(pdfBlob, filename);
      window.open(URL.createObjectURL(pdfBlob), '_blank');
    } catch (err) {
      console.error('PDF generation error:', err);
      alert(txt.pdfError);
    } finally {
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

  return {
    scale,
    isFitMode,
    photosPerPage,
    isGeneratingPdf,
    isGeneratingZip,
    showConsole,
    showHistoryPanel,
    previewContainerRef,
    setPhotosPerPage,
    setShowConsole,
    setShowHistoryPanel,
    handleDownloadPDF,
    handleDownloadZip,
    handleAutoPairClick,
    handleManualPairClick,
  };
}
