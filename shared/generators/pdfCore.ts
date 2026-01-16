/**
 * PDF Generator Core (Environment-agnostic)
 *
 * CLI/Web両環境で使用可能なPDF生成ロジック
 * Buffer返却（Canvas/fetch依存を排除）
 */

import { PDFDocument, rgb, StandardFonts, PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as fs from 'fs/promises';

// ============================================
// 型定義
// ============================================

export interface PhotoData {
  fileName: string;
  base64: string;
  mimeType: string;
  date?: number;
  analysis?: {
    workType?: string;
    variety?: string;
    detail?: string;
    station?: string;
    remarks?: string;
    measurements?: string;
    description?: string;
  };
}

export interface PdfOptions {
  photosPerPage?: 2 | 3;
  title?: string;
  fontPath?: string;
}

// ============================================
// レイアウト定数
// ============================================

const A4_WIDTH = 595.28;  // pt
const A4_HEIGHT = 841.89; // pt
const MARGIN = 28.35;     // 10mm
const HEADER_HEIGHT = 40;
const GAP = 5;

const IMAGE_RATIO = 0.65;
const INFO_RATIO = 0.35;

// ============================================
// PDF生成
// ============================================

/**
 * PDFを生成してBufferを返す
 */
export async function generatePdfBuffer(
  photos: PhotoData[],
  options: PdfOptions = {}
): Promise<Buffer> {
  const { photosPerPage = 3, title = 'Construction Photo Album', fontPath } = options;

  const pdfDoc = await PDFDocument.create();

  // 日本語フォントの読み込み
  let japaneseFont: PDFFont;

  try {
    // fontkitを登録（ESM対応）
    const fk = (fontkit as unknown as { default?: typeof fontkit }).default || fontkit;
    pdfDoc.registerFontkit(fk as Parameters<typeof pdfDoc.registerFontkit>[0]);

    // フォントパスのリスト
    const fontPaths = fontPath ? [fontPath] : [
      // Windows (TTF)
      'C:/Windows/Fonts/yumin.ttf',      // 游明朝
      'C:/Windows/Fonts/YuGothR.ttf',    // 游ゴシック
      // macOS
      '/Library/Fonts/Arial Unicode.ttf',
      // Linux
      '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf',
    ];

    for (const fp of fontPaths) {
      try {
        const fontBuffer = await fs.readFile(fp);
        japaneseFont = await pdfDoc.embedFont(fontBuffer);
        break;
      } catch {
        // 次のフォントを試す
      }
    }
  } catch {
    // fontkit登録失敗
  }

  // 日本語フォントが読み込めなければエラー
  if (!japaneseFont!) {
    throw new Error('日本語フォントが見つかりません。--font オプションでTTFファイルを指定してください。');
  }
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // ラベル定義
  const labels = { type: '工種', variety: '種別', detail: '細別', station: '測点', remarks: '備考', date: '撮影' };

  // レイアウト計算
  const usableHeight = A4_HEIGHT - MARGIN * 2 - HEADER_HEIGHT;
  const photoRowHeight = usableHeight / photosPerPage;
  const photoHeight = photoRowHeight - GAP * 2;
  const usableWidth = A4_WIDTH - MARGIN * 2;
  const photoWidth = usableWidth * IMAGE_RATIO;
  const infoWidth = usableWidth * INFO_RATIO;

  const totalPages = Math.ceil(photos.length / photosPerPage);

  for (let pageNum = 0; pageNum < totalPages; pageNum++) {
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    const pagePhotos = photos.slice(
      pageNum * photosPerPage,
      (pageNum + 1) * photosPerPage
    );

    // ヘッダー
    page.drawText(title, {
      x: MARGIN,
      y: A4_HEIGHT - MARGIN - 20,
      size: 14,
      font: japaneseFont,
      color: rgb(0.2, 0.2, 0.2)
    });

    page.drawText(`Page ${pageNum + 1} / ${totalPages}`, {
      x: A4_WIDTH - MARGIN - 80,
      y: A4_HEIGHT - MARGIN - 20,
      size: 10,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5)
    });

    // 各写真を配置
    for (let i = 0; i < pagePhotos.length; i++) {
      const photo = pagePhotos[i];
      const rowY = A4_HEIGHT - MARGIN - HEADER_HEIGHT - (i + 1) * photoRowHeight + GAP;

      // 写真を埋め込み
      if (photo.base64) {
        try {
          const base64Data = extractBase64Data(photo.base64);
          const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

          const isPng = (photo.mimeType || 'image/jpeg').includes('png');
          const embeddedImage = isPng
            ? await pdfDoc.embedPng(imageBytes)
            : await pdfDoc.embedJpg(imageBytes);

          // アスペクト比を維持して描画
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

          // 枠線
          page.drawRectangle({
            x: MARGIN,
            y: rowY,
            width: photoWidth,
            height: photoHeight,
            borderColor: rgb(0.7, 0.7, 0.7),
            borderWidth: 0.5
          });
        } catch {
          // 画像エラー時はプレースホルダー
          page.drawRectangle({
            x: MARGIN,
            y: rowY,
            width: photoWidth,
            height: photoHeight,
            color: rgb(0.95, 0.95, 0.95),
            borderColor: rgb(0.7, 0.7, 0.7),
            borderWidth: 0.5
          });
          page.drawText('Image Error', {
            x: MARGIN + photoWidth / 2 - 30,
            y: rowY + photoHeight / 2,
            size: 10,
            font: helvetica,
            color: rgb(0.5, 0.5, 0.5)
          });
        }
      }

      // 情報欄
      const infoX = MARGIN + photoWidth + GAP;
      const analysis = photo.analysis || {};

      const infoLines = [
        { label: labels.type, value: analysis.workType || '-' },
        { label: labels.variety, value: analysis.variety || '-' },
        { label: labels.detail, value: analysis.detail || '-' },
        { label: labels.station, value: analysis.station || '-' },
        { label: labels.remarks, value: analysis.remarks || '-' },
        { label: labels.date, value: photo.date ? new Date(photo.date).toISOString().slice(0, 10) : '-' }
      ];

      // 情報欄の枠
      page.drawRectangle({
        x: infoX,
        y: rowY,
        width: infoWidth,
        height: photoHeight,
        borderColor: rgb(0.7, 0.7, 0.7),
        borderWidth: 0.5
      });

      // 情報テキスト
      infoLines.forEach((line, idx) => {
        const y = rowY + photoHeight - 15 - idx * 18;
        if (y > rowY + 5) {
          page.drawText(`${line.label}:`, {
            x: infoX + 5,
            y,
            size: 8,
            font: japaneseFont,
            color: rgb(0.4, 0.4, 0.4)
          });
          const displayValue = truncate(line.value, 20);
          page.drawText(displayValue, {
            x: infoX + 45,
            y,
            size: 9,
            font: japaneseFont,
            color: rgb(0.1, 0.1, 0.1)
          });
        }
      });

      // ファイル名
      page.drawText(photo.fileName, {
        x: infoX + 5,
        y: rowY + 5,
        size: 7,
        font: helvetica,
        color: rgb(0.6, 0.6, 0.6)
      });
    }
  }

  // メタデータ
  pdfDoc.setTitle(title);
  pdfDoc.setCreator('GASPhotoAIManager CLI');
  pdfDoc.setProducer('GASPhotoAIManager + pdf-lib');

  // Bufferとして返す
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Base64データ部分を抽出
 */
function extractBase64Data(base64: string): string {
  if (base64.includes(',')) {
    return base64.split(',')[1];
  }
  return base64;
}

/**
 * Node.js用のatob実装（グローバルにない場合）
 */
function atob(data: string): string {
  if (typeof globalThis.atob === 'function') {
    return globalThis.atob(data);
  }
  return Buffer.from(data, 'base64').toString('binary');
}

/**
 * 文字列を切り詰め
 */
function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}
