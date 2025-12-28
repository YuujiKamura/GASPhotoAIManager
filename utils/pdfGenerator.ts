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
      const OPS = pdfjsLib.OPS;
      for (let i = 0; i < operatorList.fnArray.length; i++) {
        const op = operatorList.fnArray[i];
        if (op === OPS.paintImageXObject || op === OPS.paintJpegXObject) {
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
