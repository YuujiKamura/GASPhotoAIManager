/**
 * Excel Generator Core (Environment-agnostic)
 *
 * CLI/Web両環境で使用可能なExcel生成ロジック
 * Buffer返却に変更（saveAs依存を排除）
 *
 * ## 変更履歴
 * - 2026-01-17: layoutConfigから定数を取得するように修正（Web版と共通化）
 */

import ExcelJS from 'exceljs';
import { getLayoutConfig, LAYOUT_FIELDS, PDF_LAYOUT, FIELD_LABELS, formatDateTime } from '../../utils/layoutConfig';

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

export interface ExcelOptions {
  photosPerPage?: 2 | 3;
  title?: string;
}

// フィールドラベルはlayoutConfig.tsのFIELD_LABELSを使用

// ============================================
// Excel生成
// ============================================

/**
 * Excel Workbookを生成してBufferを返す
 */
export async function generateExcelBuffer(
  photos: PhotoData[],
  options: ExcelOptions = {}
): Promise<Buffer> {
  const { photosPerPage = 3 } = options;

  // layoutConfigからレイアウト設定を取得
  const layout = getLayoutConfig(photosPerPage);
  const {
    rowsPerBlock,
    photoRows,
    rowHeightPt,
    colAWidth,
    colBWidth,
    colCWidth,
  } = layout;

  const workbook = new ExcelJS.Workbook();
  const totalPages = Math.ceil(photos.length / photosPerPage);

  // ページごとにシートを作成
  for (let pageNum = 0; pageNum < totalPages; pageNum++) {
    const pagePhotos = photos.slice(
      pageNum * photosPerPage,
      (pageNum + 1) * photosPerPage
    );
    const sheetName = `${pageNum + 1}`;

    const sheet = workbook.addWorksheet(sheetName, {
      pageSetup: {
        paperSize: 9, // A4
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1,
        horizontalCentered: true,
        verticalCentered: true,
        margins: {
          left: PDF_LAYOUT.MARGIN / 72,
          right: PDF_LAYOUT.MARGIN / 72,
          top: PDF_LAYOUT.MARGIN / 72,
          bottom: PDF_LAYOUT.MARGIN / 72,
          header: 0.2,
          footer: 0.2
        }
      },
      views: [{ showGridLines: false }]
    });

    // 列幅設定（layoutConfigから取得）
    sheet.columns = [
      { width: colAWidth },
      { width: colBWidth },
      { width: colCWidth }
    ];

    let currentRow = 1;

    // 写真を配置
    for (let i = 0; i < pagePhotos.length; i++) {
      const photo = pagePhotos[i];
      const startRow = currentRow;
      const endRow = startRow + rowsPerBlock - 1;

      // 行高さ設定（layoutConfigから取得）
      for (let r = startRow; r <= endRow; r++) {
        sheet.getRow(r).height = rowHeightPt;
      }

      // 画像セル（列A）
      const photoEndRow = endRow - 1;
      sheet.mergeCells(startRow, 1, photoEndRow, 1);
      const imgCell = sheet.getCell(startRow, 1);
      imgCell.border = {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } }
      };

      // 画像を追加
      const base64Data = extractBase64Data(photo.base64);
      if (base64Data) {
        const imageId = workbook.addImage({
          base64: base64Data,
          extension: 'jpeg',
        });

        // ExcelJSの型定義の問題を回避（tl/br形式は実際にはサポートされている）
        sheet.addImage(imageId, {
          tl: { col: 0, row: startRow - 1 },
          br: { col: 1, row: startRow - 1 + photoRows },
          editAs: 'absolute'
        } as unknown as ExcelJS.ImageRange);
      }

      // 情報フィールド（列B & C）- LAYOUT_FIELDSを使用
      const visibleFields = photosPerPage === 2
        ? LAYOUT_FIELDS.filter(f => f.key === 'station' || f.key === 'remarks')
        : LAYOUT_FIELDS;

      let fieldRow = startRow;
      for (const field of visibleFields) {
        let value = '';
        if (field.key === 'date') {
          value = photo.date ? formatDateTime(photo.date) : '';
        } else if (photo.analysis) {
          value = (photo.analysis as Record<string, string>)[field.key] || '';
        }

        const label = FIELD_LABELS[field.labelKey] || field.labelKey;
        const rowSpan = field.rowSpan;
        createFieldCell(sheet, fieldRow, label, value, rowSpan);
        fieldRow += rowSpan;
      }

      currentRow = endRow + 1;
    }
  }

  // Bufferとして返す
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * フィールドセルを作成
 */
function createFieldCell(
  sheet: ExcelJS.Worksheet,
  row: number,
  label: string,
  value: string,
  rowSpan: number
): void {
  // ラベルセル
  const labelCell = sheet.getCell(row, 2);
  labelCell.value = label;
  labelCell.font = { bold: true, size: 9, color: { argb: 'FF555555' } };
  labelCell.alignment = { vertical: 'middle', horizontal: 'center' };
  labelCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF5F5F5' }
  };
  labelCell.border = {
    top: { style: 'hair', color: { argb: 'FFAAAAAA' } },
    left: { style: 'hair', color: { argb: 'FFAAAAAA' } },
    right: { style: 'hair', color: { argb: 'FFAAAAAA' } },
    bottom: { style: 'hair', color: { argb: 'FFAAAAAA' } }
  };

  // 値セル
  const valueCell = sheet.getCell(row, 3);
  valueCell.value = value;
  valueCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  valueCell.font = { size: 11 };
  valueCell.border = {
    top: { style: 'hair', color: { argb: 'FFCCCCCC' } },
    right: { style: 'hair', color: { argb: 'FFCCCCCC' } },
    bottom: { style: 'hair', color: { argb: 'FFCCCCCC' } }
  };

  // 複数行の場合はマージ
  if (rowSpan > 1) {
    sheet.mergeCells(row, 2, row + rowSpan - 1, 2);
    sheet.mergeCells(row, 3, row + rowSpan - 1, 3);
  }
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
