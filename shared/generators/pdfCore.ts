/**
 * PDF Generator Core (Environment-agnostic)
 *
 * CLI/Web両環境で使用可能なPDF生成ロジック
 * Buffer返却（Canvas/fetch依存を排除）
 *
 * ## 変更履歴
 * - 2026-01-17: テキスト自動縮小機能追加（枠に収まるようフォントサイズ調整）
 * - 2026-01-17: layoutConfigから定数を取得するように修正（Web版と共通化）
 */

import { PDFDocument, rgb, StandardFonts, PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as fs from 'fs/promises';
import { getPdfLayout, type PdfLayout } from '../../utils/layoutConfig';

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

/** PDF画質プリセット */
export type PdfQuality = 'high' | 'medium' | 'low';

/** 画像最適化オプション */
export interface ImageOptimizeOptions {
  maxWidth: number;
  quality: number;
}

/** 画質プリセット定義 */
export const QUALITY_PRESETS: Record<PdfQuality, ImageOptimizeOptions> = {
  high: { maxWidth: 1400, quality: 85 },   // 印刷用（デフォルト）
  medium: { maxWidth: 800, quality: 75 },  // デジタル提出用
  low: { maxWidth: 500, quality: 60 },     // 画面確認・ドラフト用
};

export interface PdfOptions {
  photosPerPage?: 2 | 3;
  title?: string;
  fontPath?: string;
  /** PDF画質設定 (high=印刷用, medium=デジタル提出用, low=ドラフト用) */
  pdfQuality?: PdfQuality;
  /** 画像最適化関数（環境別にsharp/Canvasを注入） */
  imageOptimizer?: (bytes: Uint8Array, opts: ImageOptimizeOptions) => Promise<Uint8Array>;
}

// ============================================
// レイアウト定数（layoutConfigから取得）
// ============================================

const getLayoutConstants = () => {
  const layout: PdfLayout = getPdfLayout();
  return {
    A4_WIDTH: layout.pageWidth,
    A4_HEIGHT: layout.pageHeight,
    MARGIN: layout.margin,
    HEADER_HEIGHT: layout.headerHeight,
    GAP: layout.gap,
    IMAGE_RATIO: layout.imageRatio,
    INFO_RATIO: layout.infoRatio,
  };
};

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
  const {
    photosPerPage = 3,
    title = 'Construction Photo Album',
    fontPath,
    pdfQuality = 'high',
    imageOptimizer,
  } = options;

  // 画質設定からオプションを取得
  const optimizeOpts = QUALITY_PRESETS[pdfQuality];

  // layoutConfigからレイアウト定数を取得
  const { A4_WIDTH, A4_HEIGHT, MARGIN, HEADER_HEIGHT, GAP, IMAGE_RATIO, INFO_RATIO } = getLayoutConstants();

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

  // ラベル定義（正しい階層: 写真区分 → 工種 → 種別 → 細別）
  // 現在のデータ構造: workType=写真区分, variety=工種, detail=種別, subDetail=細別
  const labels = { date: '日時', photoCategory: '写真区分', workType: '工種', variety: '種別', detail: '細別', station: '測点', remarks: '備考', measurements: '測定値' };

  // レイアウト計算（layoutConfigの値を使用、ヘッダーなし）
  const usableHeight = A4_HEIGHT - MARGIN * 2;
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

    // 各写真を配置
    for (let i = 0; i < pagePhotos.length; i++) {
      const photo = pagePhotos[i];
      const rowY = A4_HEIGHT - MARGIN - (i + 1) * photoRowHeight + GAP;

      // 写真を埋め込み
      if (photo.base64) {
        try {
          const base64Data = extractBase64Data(photo.base64);
          let imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

          // 画像最適化（オプティマイザーが提供されている場合）
          if (imageOptimizer) {
            imageBytes = await imageOptimizer(imageBytes, optimizeOpts);
          }

          // 最適化後は常にJPEG（オプティマイザーがある場合）
          const isPng = !imageOptimizer && (photo.mimeType || 'image/jpeg').includes('png');
          const embeddedImage = isPng
            ? await pdfDoc.embedPng(imageBytes)
            : await pdfDoc.embedJpg(imageBytes);

          // アスペクト比を維持して描画サイズを計算
          const imgAspect = embeddedImage.width / embeddedImage.height;
          const boxAspect = photoWidth / photoHeight;
          const [drawWidth, drawHeight] = imgAspect > boxAspect
            ? [photoWidth, photoWidth / imgAspect]
            : [photoHeight * imgAspect, photoHeight];

          // 画像を固定枠内で中央配置
          const imgX = MARGIN + (photoWidth - drawWidth) / 2;
          const imgY = rowY + (photoHeight - drawHeight) / 2;

          page.drawImage(embeddedImage, {
            x: imgX,
            y: imgY,
            width: drawWidth,
            height: drawHeight
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

      // 画像エリア枠線（固定サイズ）
      page.drawRectangle({
        x: MARGIN,
        y: rowY,
        width: photoWidth,
        height: photoHeight,
        borderColor: rgb(0.7, 0.7, 0.7),
        borderWidth: 0.5
      });

      // 情報欄（固定位置）
      const infoX = MARGIN + photoWidth;
      const analysis = photo.analysis || {};

      // 正しい階層順序: 日時 → 写真区分 → 工種 → 種別 → 細別 → 測点 → 備考 → 測定値
      // データマッピング: workType=写真区分, variety=工種, detail=種別, subDetail=細別
      const infoLines = [
        { label: labels.date, value: photo.date ? new Date(photo.date).toISOString().slice(0, 10) : '-' },
        { label: labels.photoCategory, value: analysis.workType || '-' },
        { label: labels.workType, value: analysis.variety || '-' },
        { label: labels.variety, value: analysis.detail || '-' },
        { label: labels.detail, value: analysis.subDetail || '-' },
        { label: labels.station, value: analysis.station || '-' },
        { label: labels.remarks, value: analysis.remarks || '-' },
        { label: labels.measurements, value: analysis.measurements || '-' }
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

      // 情報テキスト（枠に収まるよう自動縮小・改行）
      const baseFontSize = 12;
      const lineHeight = 14;  // 行の高さ
      const labelWidth = 50;  // ラベル用の幅
      const valueMaxWidth = infoWidth - labelWidth - 10;  // 値用の最大幅（余白含む）

      let currentY = rowY + photoHeight - 20;

      infoLines.forEach((line) => {
        if (currentY < rowY + 15) return;  // 枠外に出る場合はスキップ

        // ラベル描画
        page.drawText(`${line.label}:`, {
          x: infoX + 5,
          y: currentY,
          size: baseFontSize,
          font: japaneseFont,
          color: rgb(0.4, 0.4, 0.4)
        });

        // 値を枠に収まるよう調整（最大2行）
        const { fontSize, lines } = fitTextToWidth(
          line.value,
          japaneseFont,
          valueMaxWidth,
          baseFontSize,
          8,  // 最小8pt
          2   // 最大2行
        );

        // 複数行の描画
        lines.forEach((textLine, lineIdx) => {
          const lineY = currentY - lineIdx * (fontSize + 2);
          if (lineY > rowY + 5) {
            page.drawText(textLine, {
              x: infoX + 55,
              y: lineY,
              size: fontSize,
              font: japaneseFont,
              color: rgb(0.1, 0.1, 0.1)
            });
          }
        });

        // 次のフィールドへ（複数行の場合は追加スペース）
        currentY -= lineHeight + (lines.length > 1 ? (fontSize + 2) * (lines.length - 1) : 0);
      });

      // ファイル名
      page.drawText(photo.fileName, {
        x: infoX + 5,
        y: rowY + 5,
        size: baseFontSize,
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

/**
 * テキストを指定幅に収まるよう複数行に分割
 * @param text テキスト
 * @param font フォント
 * @param maxWidth 最大幅（pt）
 * @param fontSize フォントサイズ
 * @param maxLines 最大行数
 * @returns 分割された行の配列
 */
function wrapText(
  text: string,
  font: PDFFont,
  maxWidth: number,
  fontSize: number,
  maxLines: number = 2
): string[] {
  const lines: string[] = [];
  let remaining = text;

  while (remaining.length > 0 && lines.length < maxLines) {
    // 1行に収まるか確認
    const textWidth = font.widthOfTextAtSize(remaining, fontSize);
    if (textWidth <= maxWidth) {
      lines.push(remaining);
      break;
    }

    // 収まらない場合、文字を減らして改行位置を探す
    let breakPoint = remaining.length;
    while (breakPoint > 1) {
      const testText = remaining.substring(0, breakPoint);
      const testWidth = font.widthOfTextAtSize(testText, fontSize);
      if (testWidth <= maxWidth) {
        break;
      }
      breakPoint--;
    }

    // 最後の行で収まらない場合は省略記号
    if (lines.length === maxLines - 1 && breakPoint < remaining.length) {
      // 省略記号分のスペースを確保
      while (breakPoint > 1) {
        const testText = remaining.substring(0, breakPoint) + '…';
        const testWidth = font.widthOfTextAtSize(testText, fontSize);
        if (testWidth <= maxWidth) {
          lines.push(remaining.substring(0, breakPoint) + '…');
          remaining = '';
          break;
        }
        breakPoint--;
      }
      if (remaining.length > 0) {
        lines.push('…');
        remaining = '';
      }
    } else {
      lines.push(remaining.substring(0, breakPoint));
      remaining = remaining.substring(breakPoint);
    }
  }

  return lines.length > 0 ? lines : [''];
}

/**
 * テキストが枠に収まるフォントサイズと行を計算
 * @param text テキスト
 * @param font フォント
 * @param maxWidth 最大幅（pt）
 * @param baseFontSize 基本フォントサイズ
 * @param minFontSize 最小フォントサイズ
 * @param maxLines 最大行数
 * @returns { fontSize, lines } 調整後のフォントサイズと表示行
 */
function fitTextToWidth(
  text: string,
  font: PDFFont,
  maxWidth: number,
  baseFontSize: number,
  minFontSize: number = 8,
  maxLines: number = 2
): { fontSize: number; lines: string[] } {
  let fontSize = baseFontSize;

  // まず1行で収まるかフォントサイズを縮小して試す
  while (fontSize >= minFontSize) {
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    if (textWidth <= maxWidth) {
      return { fontSize, lines: [text] };
    }
    fontSize -= 0.5;
  }

  // 最小サイズでも1行に収まらない場合は複数行に分割
  fontSize = minFontSize;
  const lines = wrapText(text, font, maxWidth, fontSize, maxLines);

  return { fontSize, lines };
}
