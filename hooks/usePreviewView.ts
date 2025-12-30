import { useState, useRef, useEffect, useCallback } from 'react';
import { PhotoRecord } from '../types';
import { TRANS } from '../utils/translations';
import { generateZip } from '../utils/zipGenerator';

declare const saveAs: any;
const A4_WIDTH_PX = 794;

export function usePreviewView(
  photos: PhotoRecord[],
  initialLayout: 2 | 3,
  lang: 'en' | 'ja'
) {
  const txt = TRANS[lang];
  const [scale, setScale] = useState(1);
  const [isFitMode, setIsFitMode] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingZip, setIsGeneratingZip] = useState(false);
  const [showConsole, setShowConsole] = useState(true);
  const [photosPerPage, setPhotosPerPage] = useState<2 | 3>(initialLayout);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setPhotosPerPage(initialLayout); }, [initialLayout]);

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

  const handleDownloadPDF = useCallback(async () => {
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
  }, [photos, photosPerPage, txt]);

  const handleDownloadZip = useCallback(async () => {
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
  }, [photos]);

  const toggleConsole = useCallback(() => setShowConsole(v => !v), []);
  const openHistoryPanel = useCallback(() => setShowHistoryPanel(true), []);
  const closeHistoryPanel = useCallback(() => setShowHistoryPanel(false), []);

  const hasPhotosWithBoard = photos.some(p => p.analysis?.hasBoard);

  return {
    state: {
      scale,
      isGeneratingPdf,
      isGeneratingZip,
      showConsole,
      photosPerPage,
      showHistoryPanel,
      hasPhotosWithBoard,
    },
    refs: {
      previewContainerRef,
    },
    actions: {
      setPhotosPerPage,
      handleDownloadPDF,
      handleDownloadZip,
      toggleConsole,
      openHistoryPanel,
      closeHistoryPanel,
    },
  };
}
