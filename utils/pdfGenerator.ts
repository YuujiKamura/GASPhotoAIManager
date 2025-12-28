import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
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

// A4サイズ（pt）
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

// レイアウト設定
const MARGIN = 20;
const HEADER_HEIGHT = 40;
const PHOTO_INFO_GAP = 5;

// 日本語フォントのキャッシュ
let cachedJapaneseFont: ArrayBuffer | null = null;

/**
 * 日本語フォントを読み込み（キャッシュ付き）
 */
const loadJapaneseFont = async (): Promise<ArrayBuffer> => {
  if (cachedJapaneseFont) {
    return cachedJapaneseFont;
  }
  
  try {
    // publicフォルダのIPAゴシックフォントを読み込み
    const response = await fetch('/GASPhotoAIManager/fonts/ipaexg.ttf');
    if (!response.ok) {
      throw new Error(`Font fetch failed: ${response.status}`);
    }
    cachedJapaneseFont = await response.arrayBuffer();
    console.log('[PDF] Japanese font loaded:', (cachedJapaneseFont.byteLength / 1024).toFixed(1), 'KB');
    return cachedJapaneseFont;
  } catch (e) {
    console.error('[PDF] Failed to load Japanese font:', e);
    throw e;
  }
};

/**
 * pdf-libを使って個別画像を埋め込んだPDFを生成
 * 各画像は個別のオブジェクトとしてPDFに埋め込まれる（抽出可能）
 * 日本語フォント（IPAゴシック）を埋め込み
 */
export const generatePdfWithImages = async (
  photos: PhotoRecord[],
  photosPerPage: 2 | 3 = 3,
  title: string = '工事写真帳'
): Promise<Blob> => {
  const pdfDoc = await PDFDocument.create();
  
  // fontkitを登録して日本語フォントを埋め込み可能に
  pdfDoc.registerFontkit(fontkit);
  
  // 日本語フォントを読み込み・埋め込み
  let japaneseFont;
  let fallbackFont;
  try {
    const fontBytes = await loadJapaneseFont();
    japaneseFont = await pdfDoc.embedFont(fontBytes);
    fallbackFont = japaneseFont;
  } catch {
    // フォント読み込み失敗時は英語フォントにフォールバック
    console.warn('[PDF] Using fallback font (Helvetica)');
    fallbackFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    japaneseFont = fallbackFont;
  }
  
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // 1ページあたりの写真高さを計算
  const usableHeight = A4_HEIGHT - MARGIN * 2 - HEADER_HEIGHT;
  const photoRowHeight = usableHeight / photosPerPage;
  const photoHeight = photoRowHeight - PHOTO_INFO_GAP * 2;
  const photoWidth = (A4_WIDTH - MARGIN * 2) * 0.45; // 45%を写真に
  const infoWidth = (A4_WIDTH - MARGIN * 2) * 0.50;  // 50%を情報に

  // ページごとに処理
  const totalPages = Math.ceil(photos.length / photosPerPage);

  for (let pageNum = 0; pageNum < totalPages; pageNum++) {
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    const pagePhotos = photos.slice(pageNum * photosPerPage, (pageNum + 1) * photosPerPage);

    // ヘッダー
    page.drawText(title, {
      x: MARGIN,
      y: A4_HEIGHT - MARGIN - 20,
      size: 14,
      font: japaneseFont,
      color: rgb(0.2, 0.2, 0.2),
    });
    page.drawText(`Page ${pageNum + 1} / ${totalPages}`, {
      x: A4_WIDTH - MARGIN - 80,
      y: A4_HEIGHT - MARGIN - 20,
      size: 10,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    });

    // 各写真を配置
    for (let i = 0; i < pagePhotos.length; i++) {
      const photo = pagePhotos[i];
      const rowY = A4_HEIGHT - MARGIN - HEADER_HEIGHT - (i + 1) * photoRowHeight + PHOTO_INFO_GAP;

      // 写真を埋め込み
      if (photo.base64) {
        try {
          // base64データを取得（data:image/jpeg;base64, プレフィックスを除去）
          const base64Data = photo.base64.includes(',') 
            ? photo.base64.split(',')[1] 
            : photo.base64;
          const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

          // 画像形式を判定して埋め込み
          let embeddedImage;
          const mimeType = photo.mimeType || 'image/jpeg';
          
          if (mimeType.includes('png')) {
            embeddedImage = await pdfDoc.embedPng(imageBytes);
          } else {
            embeddedImage = await pdfDoc.embedJpg(imageBytes);
          }

          // アスペクト比を維持してサイズ計算
          const imgAspect = embeddedImage.width / embeddedImage.height;
          const boxAspect = photoWidth / photoHeight;
          
          let drawWidth, drawHeight;
          if (imgAspect > boxAspect) {
            // 横長画像
            drawWidth = photoWidth;
            drawHeight = photoWidth / imgAspect;
          } else {
            // 縦長画像
            drawHeight = photoHeight;
            drawWidth = photoHeight * imgAspect;
          }

          // センタリング
          const offsetX = (photoWidth - drawWidth) / 2;
          const offsetY = (photoHeight - drawHeight) / 2;

          page.drawImage(embeddedImage, {
            x: MARGIN + offsetX,
            y: rowY + offsetY,
            width: drawWidth,
            height: drawHeight,
          });

          // 写真枠
          page.drawRectangle({
            x: MARGIN,
            y: rowY,
            width: photoWidth,
            height: photoHeight,
            borderColor: rgb(0.7, 0.7, 0.7),
            borderWidth: 0.5,
          });
        } catch (imgErr) {
          console.warn(`Failed to embed image ${photo.fileName}:`, imgErr);
          // 画像埋め込み失敗時はプレースホルダーを描画
          page.drawRectangle({
            x: MARGIN,
            y: rowY,
            width: photoWidth,
            height: photoHeight,
            color: rgb(0.95, 0.95, 0.95),
            borderColor: rgb(0.7, 0.7, 0.7),
            borderWidth: 0.5,
          });
          page.drawText('Image Error', {
            x: MARGIN + photoWidth / 2 - 30,
            y: rowY + photoHeight / 2,
            size: 10,
            font: helvetica,
            color: rgb(0.5, 0.5, 0.5),
          });
        }
      }

      // 情報欄
      const infoX = MARGIN + photoWidth + PHOTO_INFO_GAP;
      const analysis = photo.analysis;
      const infoLines = [
        { label: '工種', value: analysis?.workType || '-' },
        { label: '種別', value: analysis?.variety || '-' },
        { label: '細別', value: analysis?.detail || '-' },
        { label: '測点', value: analysis?.station || '-' },
        { label: '備考', value: analysis?.remarks || '-' },
        { label: '撮影', value: photo.date ? new Date(photo.date).toLocaleString('ja-JP') : '-' },
      ];

      const lineHeight = 18;
      const infoStartY = rowY + photoHeight - 15;

      // 情報欄の枠
      page.drawRectangle({
        x: infoX,
        y: rowY,
        width: infoWidth,
        height: photoHeight,
        borderColor: rgb(0.7, 0.7, 0.7),
        borderWidth: 0.5,
      });

      // 各行を描画
      infoLines.forEach((line, idx) => {
        const y = infoStartY - idx * lineHeight;
        if (y > rowY + 5) {
          // ラベル（日本語フォント）
          page.drawText(line.label + ':', {
            x: infoX + 5,
            y: y,
            size: 8,
            font: japaneseFont,
            color: rgb(0.4, 0.4, 0.4),
          });
          // 値（長い場合は切り詰め、日本語フォント）
          const valueText = line.value.length > 20 ? line.value.substring(0, 20) + '...' : line.value;
          page.drawText(valueText, {
            x: infoX + 45,
            y: y,
            size: 9,
            font: japaneseFont,
            color: rgb(0.1, 0.1, 0.1),
          });
        }
      });

      // ファイル名
      page.drawText(photo.fileName || `photo_${pageNum * photosPerPage + i + 1}.jpg`, {
        x: infoX + 5,
        y: rowY + 5,
        size: 7,
        font: helvetica,
        color: rgb(0.6, 0.6, 0.6),
      });
    }
  }

  // セッションデータを埋め込み
  const sessionData = encodeSessionData(photos);
  pdfDoc.setSubject(SESSION_MARKER + sessionData);
  pdfDoc.setKeywords(['GASPhotoAIManager', 'SmartPDF', 'SessionData', 'IndividualImages']);
  pdfDoc.setCreator('GASPhotoAIManager');
  pdfDoc.setProducer('GASPhotoAIManager + pdf-lib (Individual Images)');
  pdfDoc.setTitle(title);

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
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
 * PDFが新形式（個別画像埋め込み）かどうかを確認
 * 新形式: pdf-libで生成、個別画像として抽出可能
 * 旧形式: html2pdfで生成、ページ全体が1画像
 */
export const hasIndividualImages = async (pdfFile: File | Blob): Promise<boolean> => {
  try {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const keywords = pdfDoc.getKeywords();
    return !!keywords && keywords.includes('IndividualImages');
  } catch {
    return false;
  }
};

/**
 * PDFからテキストを抽出（ページごと）
 */
export const extractTextFromPdf = async (
  pdfFile: File | Blob
): Promise<{ pageNum: number; texts: string[] }[]> => {
  const results: { pageNum: number; texts: string[] }[] = [];

  try {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      const pageTexts: string[] = [];
      for (const item of textContent.items) {
        if ('str' in item && item.str.trim()) {
          pageTexts.push(item.str.trim());
        }
      }

      results.push({ pageNum, texts: pageTexts });
    }
  } catch (e) {
    console.error('Failed to extract text from PDF:', e);
  }

  return results;
};

/**
 * 抽出したテキストからPhotoRecord形式に変換
 * PDFの写真帳レイアウトから工種、細別、測点、備考などを解析
 */
export const parseTextToPhotoRecords = (
  pageTexts: { pageNum: number; texts: string[] }[],
  imageCount: number,
  photosPerPage: 2 | 3 = 3
): Partial<PhotoRecord>[] => {
  const records: Partial<PhotoRecord>[] = [];

  // 写真帳のフィールドラベル（日本語・英語）
  const fieldPatterns = {
    workType: /^(工種|Work\s*Type)$/i,
    variety: /^(種別|Variety)$/i,
    detail: /^(細別|Detail)$/i,
    station: /^(測点|Station)$/i,
    remarks: /^(備考|Remarks)$/i,
    date: /^(撮影日時|Date)$/i,
    measurements: /^(寸法|Measurements?)$/i,
    description: /^(記事|説明|Description)$/i
  };

  // ページタイトルのパターン
  const pageTitlePattern = /^(工事写真帳|Photo\s*Album)$/i;
  const pageNumPattern = /^Page\s*\d+$/i;

  for (const page of pageTexts) {
    // テキストをフィルタリング（ページタイトル、ページ番号を除外）
    const filteredTexts = page.texts.filter(t =>
      !pageTitlePattern.test(t) && !pageNumPattern.test(t)
    );

    // 1ページあたりの写真数に基づいてグループ化を試みる
    // テキストはラベルと値のペアになっていることが多い

    // ラベルを検出して、その次のテキストを値として取得
    let currentPhotoData: Partial<PhotoRecord['analysis']> = {};
    let photoCount = 0;

    for (let i = 0; i < filteredTexts.length; i++) {
      const text = filteredTexts[i];
      const nextText = filteredTexts[i + 1] || '';

      // ラベルかどうかチェック
      let isLabel = false;
      for (const [key, pattern] of Object.entries(fieldPatterns)) {
        if (pattern.test(text)) {
          isLabel = true;
          // 次のテキストが別のラベルでなければ値として使用
          let isNextLabel = false;
          for (const p of Object.values(fieldPatterns)) {
            if (p.test(nextText)) {
              isNextLabel = true;
              break;
            }
          }

          if (!isNextLabel && nextText) {
            (currentPhotoData as any)[key] = nextText;
            i++; // 値を消費
          }
          break;
        }
      }

      // 撮影日時パターンの直接検出
      const dateMatch = text.match(/^(\d{4}[\/\-]\d{2}[\/\-]\d{2})\s*(\d{2}:\d{2})?/);
      if (dateMatch && !isLabel) {
        // 日時形式のテキストを検出
        currentPhotoData.date = text;
      }
    }

    // このページの写真データがあれば追加
    if (Object.keys(currentPhotoData).length > 0) {
      // ページあたりphotosPerPage枚の写真を想定
      for (let slot = 0; slot < photosPerPage; slot++) {
        const recordIndex = (page.pageNum - 1) * photosPerPage + slot;
        if (recordIndex < imageCount) {
          if (records[recordIndex]) {
            // 既存のデータとマージ
            records[recordIndex].analysis = {
              ...records[recordIndex].analysis,
              ...currentPhotoData
            } as any;
          } else {
            records[recordIndex] = {
              fileName: `photo_${recordIndex + 1}.jpg`,
              status: 'done',
              analysis: currentPhotoData as any
            };
          }
        }
      }
    }
  }

  // 画像数に合わせてレコードを調整
  const finalRecords: Partial<PhotoRecord>[] = [];
  for (let i = 0; i < imageCount; i++) {
    if (records[i]) {
      finalRecords.push(records[i]);
    } else {
      finalRecords.push({
        fileName: `photo_${i + 1}.jpg`,
        status: 'done',
        analysis: {
          workType: '',
          variety: '',
          detail: '',
          station: '',
          remarks: '',
          description: ''
        }
      });
    }
  }

  return finalRecords;
};

/**
 * より高精度なテキスト解析（位置情報付き）
 * テキストのY座標を使って、どの写真に対応するかを判定
 */
export const extractTextWithPositions = async (
  pdfFile: File | Blob
): Promise<{ pageNum: number; items: Array<{ text: string; y: number; x: number }> }[]> => {
  const results: { pageNum: number; items: Array<{ text: string; y: number; x: number }> }[] = [];

  try {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });

      const items: Array<{ text: string; y: number; x: number }> = [];
      for (const item of textContent.items) {
        if ('str' in item && 'transform' in item && item.str.trim()) {
          // transform[4] = x, transform[5] = y (PDF座標系)
          const y = viewport.height - item.transform[5]; // 上からの距離に変換
          const x = item.transform[4];
          items.push({ text: item.str.trim(), y, x });
        }
      }

      // Y座標でソート
      items.sort((a, b) => a.y - b.y);
      results.push({ pageNum, items });
    }
  } catch (e) {
    console.error('Failed to extract text with positions:', e);
  }

  return results;
};

/**
 * 位置情報付きテキストから写真ごとのデータを抽出
 */
export const parsePositionedTextToRecords = (
  pageData: { pageNum: number; items: Array<{ text: string; y: number; x: number }> }[],
  imageCount: number,
  photosPerPage: 2 | 3 = 3
): Partial<PhotoRecord>[] => {
  const records: Partial<PhotoRecord>[] = [];

  // フィールドラベルパターン
  const fieldPatterns: { [key: string]: RegExp } = {
    workType: /^工種$/,
    variety: /^種別$/,
    detail: /^細別$/,
    station: /^測点$/,
    remarks: /^備考$/,
    date: /^撮影日時$/,
    measurements: /^寸法$/,
    description: /^(記事|説明)$/
  };

  for (const page of pageData) {
    // ページ高さを推定（A4: 297mm ≈ 842pt）
    const pageHeight = 842;
    const slotHeight = pageHeight / photosPerPage;

    // 各スロットのテキストを収集
    for (let slot = 0; slot < photosPerPage; slot++) {
      const slotTop = slot * slotHeight + 50; // ヘッダー分のオフセット
      const slotBottom = (slot + 1) * slotHeight + 50;

      const slotItems = page.items.filter(item =>
        item.y >= slotTop && item.y < slotBottom
      );

      if (slotItems.length === 0) continue;

      const recordIndex = (page.pageNum - 1) * photosPerPage + slot;
      if (recordIndex >= imageCount) continue;

      const analysis: Partial<PhotoRecord['analysis']> = {
        workType: '',
        variety: '',
        detail: '',
        station: '',
        remarks: '',
        description: ''
      };

      // ラベルと値のペアを解析
      for (let i = 0; i < slotItems.length; i++) {
        const item = slotItems[i];

        for (const [field, pattern] of Object.entries(fieldPatterns)) {
          if (pattern.test(item.text)) {
            // 同じ行（y座標が近い）で、x座標が大きいものを値として探す
            const valueItem = slotItems.find((other, j) =>
              j > i &&
              Math.abs(other.y - item.y) < 10 &&
              other.x > item.x
            );

            if (valueItem) {
              (analysis as any)[field] = valueItem.text;
            }
            break;
          }
        }
      }

      records[recordIndex] = {
        fileName: `photo_${recordIndex + 1}.jpg`,
        status: 'done',
        analysis: analysis as any
      };
    }
  }

  // 欠落しているレコードを埋める
  const finalRecords: Partial<PhotoRecord>[] = [];
  for (let i = 0; i < imageCount; i++) {
    if (records[i]) {
      finalRecords.push(records[i]);
    } else {
      finalRecords.push({
        fileName: `photo_${i + 1}.jpg`,
        status: 'done',
        analysis: {
          workType: '',
          variety: '',
          detail: '',
          station: '',
          remarks: '',
          description: ''
        }
      });
    }
  }

  return finalRecords;
};

/**
 * PDFオブジェクトを非同期で取得するヘルパー関数
 * pdfjs-distのobjs.get()はオブジェクトが解決されるまでnullを返す可能性があるため、
 * コールバック形式で確実に取得する
 */
const getObjectAsync = (objs: any, objName: string): Promise<any> => {
  return new Promise((resolve) => {
    // 既に解決済みの場合は即座に返す
    const existing = objs.get(objName);
    if (existing) {
      resolve(existing);
      return;
    }
    // コールバック形式で待機
    objs.get(objName, resolve);
  });
};

/**
 * html2pdf形式のページ画像から個別の写真を切り出す
 * @param srcCanvas ページ全体が描画されたCanvas
 * @param photosPerPage 1ページあたりの写真数（2または3）
 */
const splitPageCanvasIntoPhotos = async (
  srcCanvas: HTMLCanvasElement,
  photosPerPage: 2 | 3
): Promise<{ data: Uint8Array; mimeType: string }[]> => {
  const photos: { data: Uint8Array; mimeType: string }[] = [];
  const pageWidth = srcCanvas.width;
  const pageHeight = srcCanvas.height;
  
  // レイアウト計算
  const headerRatio = 0.05; // 上部5%はヘッダー
  const photoWidthRatio = 0.43; // 写真は左側43%
  const rowCount = photosPerPage;
  
  const headerHeight = Math.floor(pageHeight * headerRatio);
  const usableHeight = pageHeight - headerHeight;
  const rowHeight = Math.floor(usableHeight / rowCount);
  const photoWidth = Math.floor(pageWidth * photoWidthRatio);
  
  // マージン
  const marginTop = Math.floor(rowHeight * 0.02);
  const marginLeft = Math.floor(pageWidth * 0.02);
  
  console.log(`[PDF Split] Splitting ${pageWidth}x${pageHeight} into ${photosPerPage} photos`);
  
  // 各行から写真を切り出し
  for (let i = 0; i < rowCount; i++) {
    const y = headerHeight + i * rowHeight + marginTop;
    const x = marginLeft;
    const w = photoWidth - marginLeft;
    const h = rowHeight - marginTop * 2;
    
    const destCanvas = document.createElement('canvas');
    destCanvas.width = w;
    destCanvas.height = h;
    const destCtx = destCanvas.getContext('2d');
    if (!destCtx) continue;
    
    destCtx.drawImage(srcCanvas, x, y, w, h, 0, 0, w, h);
    
    const blob = await new Promise<Blob | null>((resolve) => {
      destCanvas.toBlob(resolve, 'image/jpeg', 0.92);
    });
    
    if (blob && blob.size > 1000) {
      console.log(`[PDF Split] Photo ${i + 1}: ${w}x${h}, ${(blob.size / 1024).toFixed(1)} KB`);
      const buffer = await blob.arrayBuffer();
      photos.push({
        data: new Uint8Array(buffer),
        mimeType: 'image/jpeg'
      });
    }
  }
  
  return photos;
};

/**
 * 画像がhtml2pdf形式のページ全体画像かどうかを判定
 * A4比率（約0.707）に近い縦長画像で、サイズが大きい場合はページ画像と判定
 */
const isFullPageImage = (width: number, height: number): boolean => {
  const aspectRatio = width / height;
  const a4Ratio = 210 / 297; // 約0.707
  
  // A4比率に近い（±20%）かつ、高さが1000px以上
  const isA4Like = Math.abs(aspectRatio - a4Ratio) < 0.15;
  const isLarge = height > 1000;
  
  return isA4Like && isLarge;
};

/**
 * PDFから埋め込み画像を抽出
 * - pdf-lib形式: 個別画像をそのまま抽出
 * - html2pdf形式: ページ全体画像から個別写真を切り出し
 */
export const extractImagesFromPdf = async (
  pdfFile: File | Blob,
  photosPerPage: 2 | 3 = 3
): Promise<{ data: Uint8Array; mimeType: string }[]> => {
  const images: { data: Uint8Array; mimeType: string }[] = [];
  // 既に処理済みの画像名を追跡（重複抽出を防止）
  const processedImageNames = new Set<string>();

  try {
    const arrayBuffer = await pdfFile.arrayBuffer();
    console.log('[PDF Extract] Loading PDF, size:', arrayBuffer.byteLength);
    
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    console.log('[PDF Extract] PDF loaded, pages:', pdf.numPages);

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const operatorList = await page.getOperatorList();
      const objs = page.objs;

      // OperatorListから画像オブジェクト名を収集
      const OPS = pdfjsLib.OPS;
      const imageNames: string[] = [];

      for (let i = 0; i < operatorList.fnArray.length; i++) {
        const op = operatorList.fnArray[i];
        if (op === OPS.paintImageXObject || op === OPS.paintJpegXObject) {
          const imgName = operatorList.argsArray[i][0];
          // 重複チェック：同じ画像名は一度だけ処理
          if (!processedImageNames.has(imgName)) {
            imageNames.push(imgName);
            processedImageNames.add(imgName);
          }
        }
      }

      console.log(`[PDF Extract] Page ${pageNum}: found ${imageNames.length} images:`, imageNames);

      // 各画像を非同期で取得
      for (const imgName of imageNames) {
        try {
          const imgData = await getObjectAsync(objs, imgName);

          // デバッグ: 画像オブジェクトの構造を出力
          console.log(`[PDF Extract] Image ${imgName}:`, {
            hasData: !!(imgData?.data),
            hasBitmap: !!(imgData?.bitmap),
            hasSrc: !!(imgData?.src),
            width: imgData?.width,
            height: imgData?.height,
            kind: imgData?.kind,
            dataLength: imgData?.data?.length,
            keys: imgData ? Object.keys(imgData) : []
          });

          if (imgData && imgData.data) {
            const width = imgData.width;
            const height = imgData.height;
            const rawData = new Uint8ClampedArray(imgData.data);
            
            // Canvasに描画
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            
            if (ctx) {
              const imageData = new ImageData(rawData, width, height);
              ctx.putImageData(imageData, 0, 0);
              
              // html2pdf形式（ページ全体画像）かどうかを判定
              if (isFullPageImage(width, height)) {
                console.log(`[PDF Extract] Detected full-page image (html2pdf format): ${width}x${height}`);
                const splitPhotos = await splitPageCanvasIntoPhotos(canvas, photosPerPage);
                images.push(...splitPhotos);
                console.log(`[PDF Extract] Split into ${splitPhotos.length} individual photos`);
              } else {
                // 通常の個別画像（pdf-lib形式）
                const blob = await new Promise<Blob | null>((resolve) => {
                  canvas.toBlob(resolve, 'image/jpeg', 0.95);
                });

                if (blob) {
                  console.log(`[PDF Extract] Image ${imgName} extracted via data, blob size:`, blob.size);
                  const buffer = await blob.arrayBuffer();
                  images.push({
                    data: new Uint8Array(buffer),
                    mimeType: 'image/jpeg'
                  });
                }
              }
            }
          } else if (imgData && imgData.bitmap) {
            // ImageBitmap形式の場合（html2pdfで生成されたPDFで使用される）
            try {
              const bitmapWidth = imgData.bitmap.width || imgData.width;
              const bitmapHeight = imgData.bitmap.height || imgData.height;
              
              const canvas = document.createElement('canvas');
              canvas.width = bitmapWidth;
              canvas.height = bitmapHeight;
              const ctx = canvas.getContext('2d');

              if (ctx) {
                ctx.drawImage(imgData.bitmap, 0, 0);
                
                // html2pdf形式かどうかを判定
                if (isFullPageImage(bitmapWidth, bitmapHeight)) {
                  console.log(`[PDF Extract] Detected full-page bitmap (html2pdf format): ${bitmapWidth}x${bitmapHeight}`);
                  const splitPhotos = await splitPageCanvasIntoPhotos(canvas, photosPerPage);
                  images.push(...splitPhotos);
                  console.log(`[PDF Extract] Split into ${splitPhotos.length} individual photos`);
                } else {
                  const blob = await new Promise<Blob | null>((resolve) => {
                    canvas.toBlob(resolve, 'image/jpeg', 0.95);
                  });

                  if (blob) {
                    console.log(`[PDF Extract] Image ${imgName} extracted via bitmap, blob size:`, blob.size);
                    const buffer = await blob.arrayBuffer();
                    images.push({
                      data: new Uint8Array(buffer),
                      mimeType: 'image/jpeg'
                    });
                  }
                }
              }
            } catch (bitmapErr) {
              console.warn(`Failed to extract bitmap image for ${imgName}:`, bitmapErr);
            }
          } else if (imgData && imgData.src) {
            // JPEG画像の場合、srcプロパティにデータURLが含まれる場合がある
            try {
              const response = await fetch(imgData.src);
              const blob = await response.blob();
              console.log(`[PDF Extract] Image ${imgName} extracted via src, blob size:`, blob.size);
              const buffer = await blob.arrayBuffer();
              images.push({
                data: new Uint8Array(buffer),
                mimeType: blob.type || 'image/jpeg'
              });
            } catch (srcErr) {
              console.warn(`Failed to fetch image src for ${imgName}:`, srcErr);
            }
          } else {
            console.warn(`[PDF Extract] Image ${imgName}: No extractable data found`);
          }
        } catch (imgErr) {
          // 個別画像の取得失敗は無視
          console.warn(`Failed to extract image ${imgName}:`, imgErr);
        }
      }
    }
  } catch (e) {
    console.error('Failed to extract images from PDF:', e);
  }

  console.log(`[PDF Extract] Total images extracted: ${images.length}`);
  return images;
};
