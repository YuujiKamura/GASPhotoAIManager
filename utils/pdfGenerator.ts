import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as pdfjsLib from 'pdfjs-dist';
import { PhotoRecord } from '../types';
import { getPdfLayout } from './layoutConfig';

// PDF.js worker setup
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

// ========== 定数 ==========
const SESSION_MARKER = 'GASPM_SESSION_V1:';

// layoutConfigから取得
const pdfLayout = getPdfLayout();
const A4_WIDTH = pdfLayout.pageWidth;
const A4_HEIGHT = pdfLayout.pageHeight;
const MARGIN = pdfLayout.margin;
const HEADER_HEIGHT = pdfLayout.headerHeight;
const PHOTO_INFO_GAP = pdfLayout.gap;

// フィールドパターン（共通定義）
const FIELD_PATTERNS: Record<string, RegExp> = {
  workType: /^(工種|Work\s*Type)$/i,
  variety: /^(種別|Variety)$/i,
  detail: /^(細別|Detail)$/i,
  station: /^(測点|Station)$/i,
  remarks: /^(備考|Remarks)$/i,
  date: /^(撮影日時|Date)$/i,
  measurements: /^(寸法|Measurements?)$/i,
  description: /^(記事|説明|Description)$/
};

// 日本語フォントキャッシュ
let cachedJapaneseFont: ArrayBuffer | null = null;

// ========== ユーティリティ関数 ==========

/** セッションデータをエンコード */
const encodeSessionData = (photos: PhotoRecord[]): string => {
  const lightPhotos = photos.map(p => ({
    fileName: p.fileName,
    mimeType: p.mimeType,
    date: p.date,
    analysis: p.analysis,
    status: p.status,
    sceneId: p.sceneId,
    phase: p.phase,
    base64Length: p.base64?.length || 0
  }));
  return btoa(unescape(encodeURIComponent(JSON.stringify(lightPhotos))));
};

/** セッションデータをデコード */
const decodeSessionData = (encoded: string): Partial<PhotoRecord>[] =>
  JSON.parse(decodeURIComponent(escape(atob(encoded))));

/** 日本語フォントを読み込み（キャッシュ付き） */
const loadJapaneseFont = async (): Promise<ArrayBuffer> => {
  if (cachedJapaneseFont) return cachedJapaneseFont;
  const response = await fetch('/GASPhotoAIManager/fonts/ipaexg.ttf');
  if (!response.ok) throw new Error(`Font fetch failed: ${response.status}`);
  cachedJapaneseFont = await response.arrayBuffer();
  return cachedJapaneseFont;
};

/** 空のPhotoRecord解析結果を生成 */
const createEmptyAnalysis = () => ({
  workType: '', variety: '', detail: '', station: '', remarks: '', description: ''
});

/** 欠落レコードを埋めて配列を返す */
const fillMissingRecords = (records: (Partial<PhotoRecord> | undefined)[], count: number): Partial<PhotoRecord>[] =>
  Array.from({ length: count }, (_, i) => records[i] || {
    fileName: `photo_${i + 1}.jpg`,
    status: 'done',
    analysis: createEmptyAnalysis() as any
  });

/** CanvasをJPEG Blobに変換 */
const canvasToJpegBlob = (canvas: HTMLCanvasElement, quality = 0.95): Promise<Blob | null> =>
  new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));

/** PDF.jsオブジェクトを非同期で取得 */
const getObjectAsync = (objs: any, objName: string): Promise<any> =>
  new Promise(resolve => {
    const existing = objs.get(objName);
    if (existing) return resolve(existing);
    objs.get(objName, resolve);
  });

/** 画像がhtml2pdf形式のページ全体画像かどうかを判定 */
const isFullPageImage = (width: number, height: number): boolean =>
  Math.abs(width / height - 210 / 297) < 0.15 && height > 1000;

// ========== PDF生成 ==========

/** pdf-libを使ってPDFを生成 */
export const generatePdfWithImages = async (
  photos: PhotoRecord[],
  photosPerPage: 2 | 3 = 3,
  title = '工事写真帳'
): Promise<Blob> => {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  let japaneseFont;
  try {
    japaneseFont = await pdfDoc.embedFont(await loadJapaneseFont());
  } catch {
    japaneseFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  }
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const usableWidth = A4_WIDTH - MARGIN * 2;
  const usableHeight = A4_HEIGHT - MARGIN * 2 - HEADER_HEIGHT;
  const totalPages = Math.ceil(photos.length / photosPerPage);

  // 2枚モード: 写真フル幅 + キャプション下
  // 3枚モード: 写真左 + 情報欄右
  const isTwoUp = photosPerPage === 2;

  for (let pageNum = 0; pageNum < totalPages; pageNum++) {
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    const pagePhotos = photos.slice(pageNum * photosPerPage, (pageNum + 1) * photosPerPage);

    // ヘッダー（3枚モードのみ）
    if (!isTwoUp) {
      page.drawText(title, { x: MARGIN, y: A4_HEIGHT - MARGIN - 20, size: 14, font: japaneseFont, color: rgb(0.2, 0.2, 0.2) });
      page.drawText(`Page ${pageNum + 1}`, { x: A4_WIDTH - MARGIN - 50, y: A4_HEIGHT - MARGIN - 20, size: 10, font: helvetica, color: rgb(0.5, 0.5, 0.5) });
    }

    for (let i = 0; i < pagePhotos.length; i++) {
      const photo = pagePhotos[i];
      const analysis = photo.analysis;

      if (isTwoUp) {
        // ========== 2枚モード: 写真フル幅 + キャプション下（ヘッダーなし） ==========
        const captionHeight = 50; // キャプション領域の高さ
        const twoUpUsableHeight = A4_HEIGHT - MARGIN * 2; // ヘッダーなしで全高使用
        const photoRowHeight = twoUpUsableHeight / 2;
        const photoHeight = photoRowHeight - captionHeight - PHOTO_INFO_GAP;
        const photoWidth = usableWidth;
        const rowY = A4_HEIGHT - MARGIN - i * photoRowHeight;
        const photoY = rowY - photoHeight;
        const captionY = photoY - captionHeight;

        // 写真を埋め込み
        if (photo.base64) {
          try {
            const base64Data = photo.base64.includes(',') ? photo.base64.split(',')[1] : photo.base64;
            const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
            const embeddedImage = (photo.mimeType || 'image/jpeg').includes('png')
              ? await pdfDoc.embedPng(imageBytes)
              : await pdfDoc.embedJpg(imageBytes);

            const imgAspect = embeddedImage.width / embeddedImage.height;
            const boxAspect = photoWidth / photoHeight;
            const [drawWidth, drawHeight] = imgAspect > boxAspect
              ? [photoWidth, photoWidth / imgAspect]
              : [photoHeight * imgAspect, photoHeight];

            page.drawImage(embeddedImage, {
              x: MARGIN + (photoWidth - drawWidth) / 2,
              y: photoY + (photoHeight - drawHeight) / 2,
              width: drawWidth,
              height: drawHeight
            });
            page.drawRectangle({ x: MARGIN, y: photoY, width: photoWidth, height: photoHeight, borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.5 });
          } catch {
            page.drawRectangle({ x: MARGIN, y: photoY, width: photoWidth, height: photoHeight, color: rgb(0.95, 0.95, 0.95), borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.5 });
            page.drawText('Image Error', { x: MARGIN + photoWidth / 2 - 30, y: photoY + photoHeight / 2, size: 10, font: helvetica, color: rgb(0.5, 0.5, 0.5) });
          }
        }

        // キャプション欄（写真の下、中央寄せ）
        page.drawRectangle({ x: MARGIN, y: captionY, width: photoWidth, height: captionHeight, borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.5 });

        // 日本語テキスト幅を推定（日本語文字は約0.9em、ASCII文字は約0.5em）
        const estimateTextWidth = (text: string, fontSize: number): number => {
          let width = 0;
          for (const char of text) {
            width += char.charCodeAt(0) > 255 ? fontSize * 0.9 : fontSize * 0.5;
          }
          return width;
        };

        // ページ中央のX座標
        const pageCenterX = A4_WIDTH / 2;

        // 1行目: 備考（着手前/竣工など）- 中央配置
        const remarks = analysis?.remarks || '';
        if (remarks) {
          const remarksWidth = estimateTextWidth(remarks, 12);
          page.drawText(remarks, {
            x: pageCenterX - remarksWidth / 2,
            y: captionY + captionHeight / 2 + 5,
            size: 12,
            font: japaneseFont,
            color: rgb(0.1, 0.1, 0.1)
          });
        }

        // 2行目: 測点/場所情報 - 中央配置
        const location = analysis?.station || analysis?.description || '';
        if (location) {
          const locationWidth = estimateTextWidth(location, 11);
          page.drawText(location, {
            x: pageCenterX - locationWidth / 2,
            y: captionY + captionHeight / 2 - 15,
            size: 11,
            font: japaneseFont,
            color: rgb(0.2, 0.2, 0.2)
          });
        }

      } else {
        // ========== 3枚モード: 写真左 + 情報欄右 ==========
        const photoRowHeight = usableHeight / photosPerPage;
        const photoHeight = photoRowHeight - PHOTO_INFO_GAP * 2;
        const photoWidth = usableWidth * pdfLayout.imageRatio;
        const infoWidth = usableWidth * pdfLayout.infoRatio;
        const rowY = A4_HEIGHT - MARGIN - HEADER_HEIGHT - (i + 1) * photoRowHeight + PHOTO_INFO_GAP;

        // 写真を埋め込み
        if (photo.base64) {
          try {
            const base64Data = photo.base64.includes(',') ? photo.base64.split(',')[1] : photo.base64;
            const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
            const embeddedImage = (photo.mimeType || 'image/jpeg').includes('png')
              ? await pdfDoc.embedPng(imageBytes)
              : await pdfDoc.embedJpg(imageBytes);

            const imgAspect = embeddedImage.width / embeddedImage.height;
            const boxAspect = photoWidth / photoHeight;
            const [drawWidth, drawHeight] = imgAspect > boxAspect
              ? [photoWidth, photoWidth / imgAspect]
              : [photoHeight * imgAspect, photoHeight];

            page.drawImage(embeddedImage, {
              x: MARGIN + (photoWidth - drawWidth) / 2,
              y: rowY + (photoHeight - drawHeight) / 2,
              width: drawWidth,
              height: drawHeight
            });
            page.drawRectangle({ x: MARGIN, y: rowY, width: photoWidth, height: photoHeight, borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.5 });
          } catch {
            page.drawRectangle({ x: MARGIN, y: rowY, width: photoWidth, height: photoHeight, color: rgb(0.95, 0.95, 0.95), borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.5 });
            page.drawText('Image Error', { x: MARGIN + photoWidth / 2 - 30, y: rowY + photoHeight / 2, size: 10, font: helvetica, color: rgb(0.5, 0.5, 0.5) });
          }
        }

        // 情報欄
        const infoX = MARGIN + photoWidth + PHOTO_INFO_GAP;
        const infoLines = [
          { label: '工種', value: analysis?.workType || '-' },
          { label: '種別', value: analysis?.variety || '-' },
          { label: '細別', value: analysis?.detail || '-' },
          { label: '測点', value: analysis?.station || '-' },
          { label: '備考', value: analysis?.remarks || '-' },
          { label: '撮影', value: photo.date ? new Date(photo.date).toLocaleString('ja-JP') : '-' }
        ];

        page.drawRectangle({ x: infoX, y: rowY, width: infoWidth, height: photoHeight, borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.5 });

        infoLines.forEach((line, idx) => {
          const y = rowY + photoHeight - 15 - idx * 18;
          if (y > rowY + 5) {
            page.drawText(line.label + ':', { x: infoX + 5, y, size: 8, font: japaneseFont, color: rgb(0.4, 0.4, 0.4) });
            page.drawText(line.value.length > 20 ? line.value.substring(0, 20) + '...' : line.value, { x: infoX + 45, y, size: 9, font: japaneseFont, color: rgb(0.1, 0.1, 0.1) });
          }
        });

        page.drawText(photo.fileName || `photo_${pageNum * photosPerPage + i + 1}.jpg`, { x: infoX + 5, y: rowY + 5, size: 7, font: helvetica, color: rgb(0.6, 0.6, 0.6) });
      }
    }
  }

  // メタデータ埋め込み
  pdfDoc.setSubject(SESSION_MARKER + encodeSessionData(photos));
  pdfDoc.setKeywords(['GASPhotoAIManager', 'SmartPDF', 'SessionData', 'IndividualImages']);
  pdfDoc.setCreator('GASPhotoAIManager');
  pdfDoc.setProducer('GASPhotoAIManager + pdf-lib');
  pdfDoc.setTitle(title);

  return new Blob([await pdfDoc.save()], { type: 'application/pdf' });
};

/** html2pdfで生成されたPDFにセッションデータを埋め込む */
const embedSessionInPdf = async (pdfBlob: Blob, photos: PhotoRecord[]): Promise<Blob> => {
  try {
    const pdfDoc = await PDFDocument.load(await pdfBlob.arrayBuffer());
    pdfDoc.setSubject(SESSION_MARKER + encodeSessionData(photos));
    pdfDoc.setKeywords(['GASPhotoAIManager', 'SmartPDF', 'SessionData']);
    pdfDoc.setCreator('GASPhotoAIManager');
    pdfDoc.setProducer('GASPhotoAIManager + pdf-lib');
    return new Blob([await pdfDoc.save()], { type: 'application/pdf' });
  } catch {
    return pdfBlob;
  }
};

// ========== PDF解析・抽出 ==========

/** PDFからセッションデータを抽出 */
export const extractSessionFromPdf = async (pdfFile: File | Blob): Promise<Partial<PhotoRecord>[] | null> => {
  try {
    const pdfDoc = await PDFDocument.load(await pdfFile.arrayBuffer());
    const subject = pdfDoc.getSubject();
    if (!subject?.startsWith(SESSION_MARKER)) return null;
    return decodeSessionData(subject.substring(SESSION_MARKER.length));
  } catch {
    return null;
  }
};

/** PDFがスマートPDFかどうかを確認 */
export const isSmartPdf = async (pdfFile: File | Blob): Promise<boolean> => {
  try {
    const pdfDoc = await PDFDocument.load(await pdfFile.arrayBuffer());
    return pdfDoc.getSubject()?.startsWith(SESSION_MARKER) || false;
  } catch {
    return false;
  }
};

/** PDFが新形式（個別画像埋め込み）かどうかを確認 */
export const hasIndividualImages = async (pdfFile: File | Blob): Promise<boolean> => {
  try {
    const pdfDoc = await PDFDocument.load(await pdfFile.arrayBuffer());
    return pdfDoc.getKeywords()?.includes('IndividualImages') || false;
  } catch {
    return false;
  }
};

/** PDFからテキストを抽出（位置情報付きオプション） */
export const extractTextFromPdf = async (
  pdfFile: File | Blob,
  withPositions = false
): Promise<{ pageNum: number; texts: string[]; items?: { text: string; y: number; x: number }[] }[]> => {
  try {
    const pdf = await pdfjsLib.getDocument({ data: await pdfFile.arrayBuffer() }).promise;
    const results = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const texts: string[] = [];
      const items: { text: string; y: number; x: number }[] = [];

      if (withPositions) {
        const viewport = page.getViewport({ scale: 1 });
        for (const item of textContent.items) {
          if ('str' in item && 'transform' in item && item.str.trim()) {
            const y = viewport.height - item.transform[5];
            items.push({ text: item.str.trim(), y, x: item.transform[4] });
          }
        }
        items.sort((a, b) => a.y - b.y);
      }

      for (const item of textContent.items) {
        if ('str' in item && item.str.trim()) texts.push(item.str.trim());
      }

      results.push({ pageNum, texts, ...(withPositions ? { items } : {}) });
    }
    return results;
  } catch {
    return [];
  }
};

/** 位置情報付きテキスト抽出（後方互換性） */
const extractTextWithPositions = (pdfFile: File | Blob) =>
  extractTextFromPdf(pdfFile, true) as Promise<{ pageNum: number; items: { text: string; y: number; x: number }[] }[]>;

/** テキストからPhotoRecord形式に変換 */
const parseTextToPhotoRecords = (
  pageTexts: { pageNum: number; texts: string[] }[],
  imageCount: number,
  photosPerPage: 2 | 3 = 3
): Partial<PhotoRecord>[] => {
  const records: (Partial<PhotoRecord> | undefined)[] = [];
  const pageTitlePattern = /^(工事写真帳|Photo\s*Album)$/i;
  const pageNumPattern = /^Page\s*\d+$/i;

  for (const page of pageTexts) {
    const filteredTexts = page.texts.filter(t => !pageTitlePattern.test(t) && !pageNumPattern.test(t));
    const analysis: Record<string, string> = {};

    for (let i = 0; i < filteredTexts.length; i++) {
      const text = filteredTexts[i];
      const nextText = filteredTexts[i + 1] || '';

      for (const [key, pattern] of Object.entries(FIELD_PATTERNS)) {
        if (pattern.test(text)) {
          const isNextLabel = Object.values(FIELD_PATTERNS).some(p => p.test(nextText));
          if (!isNextLabel && nextText) {
            analysis[key] = nextText;
            i++;
          }
          break;
        }
      }
    }

    if (Object.keys(analysis).length > 0) {
      for (let slot = 0; slot < photosPerPage; slot++) {
        const idx = (page.pageNum - 1) * photosPerPage + slot;
        if (idx < imageCount) {
          records[idx] = { fileName: `photo_${idx + 1}.jpg`, status: 'done', analysis: { ...records[idx]?.analysis, ...analysis } as any };
        }
      }
    }
  }

  return fillMissingRecords(records, imageCount);
};

/** 位置情報付きテキストから写真ごとのデータを抽出 */
const parsePositionedTextToRecords = (
  pageData: { pageNum: number; items: { text: string; y: number; x: number }[] }[],
  imageCount: number,
  photosPerPage: 2 | 3 = 3
): Partial<PhotoRecord>[] => {
  const records: (Partial<PhotoRecord> | undefined)[] = [];
  const slotHeight = 842 / photosPerPage;

  for (const page of pageData) {
    for (let slot = 0; slot < photosPerPage; slot++) {
      const slotTop = slot * slotHeight + 50;
      const slotBottom = (slot + 1) * slotHeight + 50;
      const slotItems = page.items.filter(item => item.y >= slotTop && item.y < slotBottom);
      if (!slotItems.length) continue;

      const idx = (page.pageNum - 1) * photosPerPage + slot;
      if (idx >= imageCount) continue;

      const analysis = createEmptyAnalysis();
      for (let i = 0; i < slotItems.length; i++) {
        for (const [field, pattern] of Object.entries(FIELD_PATTERNS)) {
          if (pattern.test(slotItems[i].text)) {
            const valueItem = slotItems.find((other, j) => j > i && Math.abs(other.y - slotItems[i].y) < 10 && other.x > slotItems[i].x);
            if (valueItem) (analysis as any)[field] = valueItem.text;
            break;
          }
        }
      }
      records[idx] = { fileName: `photo_${idx + 1}.jpg`, status: 'done', analysis: analysis as any };
    }
  }

  return fillMissingRecords(records, imageCount);
};

// ========== 画像抽出 ==========

/** html2pdf形式のページ画像から個別の写真を切り出す */
const splitPageCanvasIntoPhotos = async (
  srcCanvas: HTMLCanvasElement,
  photosPerPage: 2 | 3
): Promise<{ data: Uint8Array; mimeType: string }[]> => {
  const photos: { data: Uint8Array; mimeType: string }[] = [];
  const { width: pageWidth, height: pageHeight } = srcCanvas;
  const headerHeight = Math.floor(pageHeight * 0.05);
  const rowHeight = Math.floor((pageHeight - headerHeight) / photosPerPage);
  const photoWidth = Math.floor(pageWidth * 0.43);
  const margin = Math.floor(pageWidth * 0.02);

  for (let i = 0; i < photosPerPage; i++) {
    const y = headerHeight + i * rowHeight + Math.floor(rowHeight * 0.02);
    const w = photoWidth - margin;
    const h = rowHeight - Math.floor(rowHeight * 0.04);

    const destCanvas = document.createElement('canvas');
    destCanvas.width = w;
    destCanvas.height = h;
    destCanvas.getContext('2d')?.drawImage(srcCanvas, margin, y, w, h, 0, 0, w, h);

    const blob = await canvasToJpegBlob(destCanvas, 0.92);
    if (blob && blob.size > 1000) {
      photos.push({ data: new Uint8Array(await blob.arrayBuffer()), mimeType: 'image/jpeg' });
    }
  }
  return photos;
};

/** ImageDataまたはBitmapからJPEGを抽出 */
const extractImageFromCanvas = async (
  imgData: any,
  photosPerPage: 2 | 3
): Promise<{ data: Uint8Array; mimeType: string }[] | null> => {
  const width = imgData.bitmap?.width || imgData.width;
  const height = imgData.bitmap?.height || imgData.height;
  if (!width || !height) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  if (imgData.data) {
    ctx.putImageData(new ImageData(new Uint8ClampedArray(imgData.data), width, height), 0, 0);
  } else if (imgData.bitmap) {
    ctx.drawImage(imgData.bitmap, 0, 0);
  } else {
    return null;
  }

  if (isFullPageImage(width, height)) {
    return splitPageCanvasIntoPhotos(canvas, photosPerPage);
  }

  const blob = await canvasToJpegBlob(canvas);
  if (!blob) return null;
  return [{ data: new Uint8Array(await blob.arrayBuffer()), mimeType: 'image/jpeg' }];
};

/** PDFから埋め込み画像を抽出 */
export const extractImagesFromPdf = async (
  pdfFile: File | Blob,
  photosPerPage: 2 | 3 = 3
): Promise<{ data: Uint8Array; mimeType: string }[]> => {
  const images: { data: Uint8Array; mimeType: string }[] = [];
  const processedNames = new Set<string>();

  try {
    const pdf = await pdfjsLib.getDocument({ data: await pdfFile.arrayBuffer() }).promise;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const operatorList = await page.getOperatorList();
      const OPS = pdfjsLib.OPS;

      for (let i = 0; i < operatorList.fnArray.length; i++) {
        const op = operatorList.fnArray[i];
        if (op !== OPS.paintImageXObject && op !== (OPS as any).paintJpegXObject) continue;

        const imgName = operatorList.argsArray[i][0];
        if (processedNames.has(imgName)) continue;
        processedNames.add(imgName);

        try {
          const imgData = await getObjectAsync(page.objs, imgName);
          if (!imgData) continue;

          // srcプロパティ（DataURL）の場合
          if (imgData.src) {
            const response = await fetch(imgData.src);
            const blob = await response.blob();
            images.push({ data: new Uint8Array(await blob.arrayBuffer()), mimeType: blob.type || 'image/jpeg' });
            continue;
          }

          // ImageData/Bitmap形式
          const extracted = await extractImageFromCanvas(imgData, photosPerPage);
          if (extracted) images.push(...extracted);
        } catch {
          // 個別画像の取得失敗は無視
        }
      }
    }
  } catch {
    // PDF解析失敗
  }

  return images;
};
