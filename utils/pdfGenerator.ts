import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { PhotoRecord } from '../types';

// PDF.js worker setup
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

// セッションデータのマーカー
const SESSION_MARKER = 'GASPM_SESSION_V1:';

/**
 * セッションデータをエンコード（base64画像は除外して軽量化）
 */
const encodeSessionData = (photos: PhotoRecord[]): string => {
  // base64を除いた軽量版（メタデータ＋解析結果のみ）
  const lightPhotos = photos.map(p => ({
    fileName: p.fileName,
    mimeType: p.mimeType,
    date: p.date,
    analysis: p.analysis,
    status: p.status,
    sceneId: p.sceneId,
    phase: p.phase,
    // base64は復元時に画像から再取得するためハッシュ代わりにサイズだけ
    base64Length: p.base64?.length || 0
  }));
  return btoa(unescape(encodeURIComponent(JSON.stringify(lightPhotos))));
};

/**
 * セッションデータをデコード
 */
const decodeSessionData = (encoded: string): Partial<PhotoRecord>[] => {
  const json = decodeURIComponent(escape(atob(encoded)));
  return JSON.parse(json);
};

/**
 * html2pdfで生成されたPDFにセッションデータを埋め込む
 */
export const embedSessionInPdf = async (
  pdfBlob: Blob,
  photos: PhotoRecord[]
): Promise<Blob> => {
  try {
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);

    // メタデータにセッションデータを埋め込み
    const sessionData = encodeSessionData(photos);
    pdfDoc.setSubject(SESSION_MARKER + sessionData);
    pdfDoc.setKeywords(['GASPhotoAIManager', 'SmartPDF', 'SessionData']);
    pdfDoc.setCreator('GASPhotoAIManager');
    pdfDoc.setProducer('GASPhotoAIManager + pdf-lib');

    const modifiedBytes = await pdfDoc.save();
    return new Blob([modifiedBytes], { type: 'application/pdf' });
  } catch (e) {
    console.error('Failed to embed session in PDF:', e);
    // 埋め込み失敗時は元のPDFをそのまま返す
    return pdfBlob;
  }
};

/**
 * PDFからセッションデータを抽出
 */
export const extractSessionFromPdf = async (
  pdfFile: File | Blob
): Promise<Partial<PhotoRecord>[] | null> => {
  try {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const subject = pdfDoc.getSubject();

    if (!subject || !subject.startsWith(SESSION_MARKER)) {
      console.log('No session data found in PDF');
      return null;
    }

    const encoded = subject.substring(SESSION_MARKER.length);
    return decodeSessionData(encoded);
  } catch (e) {
    console.error('Failed to extract session from PDF:', e);
    return null;
  }
};

/**
 * PDFがスマートPDF（セッションデータ埋め込み済み）かどうかを確認
 */
export const isSmartPdf = async (pdfFile: File | Blob): Promise<boolean> => {
  try {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const subject = pdfDoc.getSubject();
    return !!subject && subject.startsWith(SESSION_MARKER);
  } catch {
    return false;
  }
};

/**
 * PDFから埋め込み画像を抽出
 * html2pdfで生成されたPDFには、各ページに画像が埋め込まれている
 */
export const extractImagesFromPdf = async (
  pdfFile: File | Blob
): Promise<{ data: Uint8Array; mimeType: string }[]> => {
  const images: { data: Uint8Array; mimeType: string }[] = [];

  try {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const operatorList = await page.getOperatorList();
      const objs = page.objs;

      // OperatorListから画像オブジェクトを探す
      for (let i = 0; i < operatorList.fnArray.length; i++) {
        // OPS.paintImageXObject = 85, OPS.paintJpegXObject = 82
        if (operatorList.fnArray[i] === 85 || operatorList.fnArray[i] === 82) {
          const imgName = operatorList.argsArray[i][0];

          try {
            const imgData = objs.get(imgName);
            if (imgData && imgData.data) {
              // ImageDataをcanvasに描画してbase64に変換
              const canvas = document.createElement('canvas');
              canvas.width = imgData.width;
              canvas.height = imgData.height;
              const ctx = canvas.getContext('2d');

              if (ctx) {
                const imageData = new ImageData(
                  new Uint8ClampedArray(imgData.data),
                  imgData.width,
                  imgData.height
                );
                ctx.putImageData(imageData, 0, 0);

                // Blob に変換
                const blob = await new Promise<Blob | null>((resolve) => {
                  canvas.toBlob(resolve, 'image/jpeg', 0.95);
                });

                if (blob) {
                  const buffer = await blob.arrayBuffer();
                  images.push({
                    data: new Uint8Array(buffer),
                    mimeType: 'image/jpeg'
                  });
                }
              }
            }
          } catch (imgErr) {
            // 個別画像の取得失敗は無視
            console.warn(`Failed to extract image ${imgName}:`, imgErr);
          }
        }
      }
    }
  } catch (e) {
    console.error('Failed to extract images from PDF:', e);
  }

  return images;
};
