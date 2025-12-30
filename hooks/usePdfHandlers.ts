import React, { useCallback } from 'react';
import { PhotoRecord, ProcessingStats } from '../types';
// pdfGenerator is dynamically imported when needed to avoid loading heavy PDF libraries upfront
import { loadImagesFromFolder } from '../utils/fileHandlers';
import { saveAnalysisHistory } from '../utils/storage';

interface UsePdfHandlersProps {
  setPhotos: React.Dispatch<React.SetStateAction<PhotoRecord[]>>;
  setStats: React.Dispatch<React.SetStateAction<ProcessingStats>>;
  addLog: (message: string, type?: 'info' | 'success' | 'error') => void;
  setErrorMsg: (msg: string | null) => void;
}

/**
 * PDF読み込み関連のカスタムフック
 */
export function usePdfHandlers({
  setPhotos,
  setStats,
  addLog,
  setErrorMsg,
}: UsePdfHandlersProps) {
  const handlePdfLoad = useCallback(async (
    pdfFile: File,
    imageFolder: FileSystemDirectoryHandle | null,
    pushLog?: (msg: string) => void
  ) => {
    const log = (msg: string, level: 'info' | 'success' | 'error' = 'info') => {
      addLog(msg, level);
      pushLog?.(msg);
    };
    log(`PDF読み込み: ${pdfFile.name}`);

    try {
      // Dynamic import of pdfGenerator to avoid loading heavy PDF libraries upfront
      const { isSmartPdf, hasIndividualImages, extractImagesFromPdf, extractSessionFromPdf } = await import('../utils/pdfGenerator');

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
      setStats({ total: restoredPhotos.length, processed: restoredPhotos.length, success: restoredPhotos.length, failed: 0, cached: restoredPhotos.length });
      log(`PDFから${restoredPhotos.length}枚を復元しました`, 'success');

      // 履歴に保存
      saveAnalysisHistory(restoredPhotos, `PDF復元: ${pdfFile.name}`, 'pdf-restore').catch(err => {
        console.error('履歴保存エラー:', err);
      });
    } catch (err: any) {
      setErrorMsg(err.message);
      throw err;
    }
  }, [setPhotos, setStats, addLog, setErrorMsg]);

  return { handlePdfLoad };
}
