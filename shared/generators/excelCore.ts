/**
 * Excel Generator Core (Environment-agnostic)
 *
 * CLI/Web両環境で使用可能なExcel生成ロジック
 * Buffer返却に変更（saveAs依存を排除）
 */

import ExcelJS from 'exceljs';

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

// ============================================
// レイアウト設定
// ============================================

const LAYOUT = {
  // 列幅
  COL_A_WIDTH: 56.1,   // 画像列
  COL_B_WIDTH: 11,     // ラベル列
  COL_C_WIDTH: 28.6,   // 値列

  // 行設定
  ROWS_PER_BLOCK: 11,
  PHOTO_ROWS: 10,
  ROW_HEIGHT_PT: 26,

  // 変換係数
  PT_TO_PX: 96 / 72,
  PX_PER_EXCEL_COL: 7.1,
};

// フィールド定義
const FIELDS = [
  { key: 'date', label: '撮影日時', rowSpan: 1 },
  { key: 'workType', label: '工種', rowSpan: 1 },
  { key: 'variety', label: '種別', rowSpan: 1 },
  { key: 'detail', label: '細別', rowSpan: 1 },
  { key: 'station', label: '測点', rowSpan: 1 },
  { key: 'remarks', label: '備考', rowSpan: 2 },
  { key: 'measurements', label: '寸法', rowSpan: 3 },
];

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
          left: 0.4,
          right: 0.4,
          top: 0.4,
          bottom: 0.4,
          header: 0.2,
          footer: 0.2
        }
      },
      views: [{ showGridLines: false }]
    });

    // 列幅設定
    sheet.columns = [
      { width: LAYOUT.COL_A_WIDTH },
      { width: LAYOUT.COL_B_WIDTH },
      { width: LAYOUT.COL_C_WIDTH }
    ];

    let currentRow = 1;

    // 写真を配置
    for (let i = 0; i < pagePhotos.length; i++) {
      const photo = pagePhotos[i];
      const startRow = currentRow;
      const endRow = startRow + LAYOUT.ROWS_PER_BLOCK - 1;

      // 行高さ設定
      for (let r = startRow; r <= endRow; r++) {
        sheet.getRow(r).height = LAYOUT.ROW_HEIGHT_PT;
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
          br: { col: 1, row: startRow - 1 + LAYOUT.PHOTO_ROWS },
          editAs: 'absolute'
        } as unknown as ExcelJS.ImageRange);
      }

      // 情報フィールド（列B & C）
      const visibleFields = photosPerPage === 2
        ? FIELDS.filter(f => f.key === 'station' || f.key === 'remarks')
        : FIELDS;

      let fieldRow = startRow;
      for (const field of visibleFields) {
        let value = '';
        if (field.key === 'date') {
          value = photo.date
            ? new Date(photo.date).toLocaleString('ja-JP', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })
            : '';
        } else if (photo.analysis) {
          value = (photo.analysis as Record<string, string>)[field.key] || '';
        }

        const rowSpan = field.rowSpan;
        createFieldCell(sheet, fieldRow, field.label, value, rowSpan);
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
