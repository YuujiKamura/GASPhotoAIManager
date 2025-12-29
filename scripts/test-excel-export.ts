/**
 * Excel出力レイアウトのデモ/テストスクリプト
 *
 * 使用方法: npx tsx scripts/test-excel-export.ts
 * 出力: test-output/excel-demo.xlsx
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ExcelJSをNode.jsで使用
import ExcelJS from 'exceljs';

// 型定義
interface AIAnalysisResult {
  workType: string;
  variety: string;
  detail: string;
  station: string;
  remarks: string;
  measurements: string;
  hasBoard?: boolean;
}

interface PhotoRecord {
  fileName: string;
  base64: string;
  date?: number;
  analysis?: AIAnalysisResult;
}

// レイアウト定数
const DIMENSION = {
  ROW_HEIGHT_PT: 21,
  PT_TO_PX: 96 / 72,
  PIXELS_PER_COL_UNIT: 7.1,
  LABEL_WIDTH_EXCEL: 8,
};

const LAYOUT_FIELDS = [
  { key: 'date', labelKey: 'labelDate', rowSpan: 1 },
  { key: 'workType', labelKey: 'labelWorkType', rowSpan: 1 },
  { key: 'variety', labelKey: 'labelVariety', rowSpan: 1 },
  { key: 'detail', labelKey: 'labelDetail', rowSpan: 1 },
  { key: 'station', labelKey: 'labelStation', rowSpan: 1 },
  { key: 'remarks', labelKey: 'labelRemarks', rowSpan: 2 },
  { key: 'measurements', labelKey: 'labelMeasurements', rowSpan: 3 },
];

const ROWS_PER_PHOTO = 12;

const LABELS: Record<string, string> = {
  labelDate: '撮影日時',
  labelWorkType: '工種',
  labelVariety: '種別',
  labelDetail: '細別',
  labelStation: '測点',
  labelRemarks: '備考',
  labelMeasurements: '寸法',
};

// サンプル画像を生成（1x1ピクセルの赤い画像）
function createSampleImageBase64(): string {
  // 1x1 red pixel JPEG (minimal valid JPEG)
  const redPixelJpeg = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
    0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
    0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
    0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
    0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
    0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
    0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
    0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
    0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
    0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
    0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
    0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
    0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
    0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
    0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
    0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
    0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
    0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
    0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
    0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
    0x00, 0x00, 0x3F, 0x00, 0xFB, 0xD5, 0xDB, 0x20, 0xA8, 0xC8, 0x01, 0xC5,
    0x1D, 0xFF, 0xD9
  ]);
  return 'data:image/jpeg;base64,' + redPixelJpeg.toString('base64');
}

// サンプルデータを生成
function createSampleRecords(): PhotoRecord[] {
  const baseImage = createSampleImageBase64();

  return [
    {
      fileName: 'IMG_001.jpg',
      base64: baseImage,
      date: new Date('2024-12-15 09:30:00').getTime(),
      analysis: {
        workType: '舗装工',
        variety: 'アスファルト舗装工',
        detail: '表層工',
        station: 'NO.5+10.0',
        remarks: '乳剤散布状況\n気温15℃、天候晴れ',
        measurements: '幅員: 3.5m\n延長: 50m\n厚さ: 5cm',
        hasBoard: true,
      }
    },
    {
      fileName: 'IMG_002.jpg',
      base64: baseImage,
      date: new Date('2024-12-15 10:15:00').getTime(),
      analysis: {
        workType: '舗装工',
        variety: 'アスファルト舗装工',
        detail: '基層工',
        station: 'NO.5+10.0〜NO.6+00.0',
        remarks: '転圧状況確認',
        measurements: '締固め度: 96%',
        hasBoard: true,
      }
    },
    {
      fileName: 'IMG_003.jpg',
      base64: baseImage,
      date: new Date('2024-12-15 11:00:00').getTime(),
      analysis: {
        workType: '区画線工',
        variety: '区画線設置工',
        detail: '実線',
        station: 'NO.0+00.0〜NO.10+00.0',
        remarks: '白線施工完了',
        measurements: '幅: 15cm\n延長: 1000m',
        hasBoard: false,
      }
    },
  ];
}

async function generateExcelDemo(records: PhotoRecord[], photosPerPage: 2 | 3 = 3): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('工事写真帳', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: false,
      margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 }
    },
    views: [{ showGridLines: false }]
  });

  const isTwoUp = photosPerPage === 2;
  const COL_A_WIDTH = isTwoUp ? 80 : 65;
  const COL_B_WIDTH = isTwoUp ? 6 : DIMENSION.LABEL_WIDTH_EXCEL;
  const COL_C_WIDTH = isTwoUp ? 14 : 25;
  const rowsPerBlock = photosPerPage === 2 ? 18 : ROWS_PER_PHOTO;
  const ROW_HEIGHT_PTS = DIMENSION.ROW_HEIGHT_PT;

  sheet.columns = [
    { width: COL_A_WIDTH },
    { width: COL_B_WIDTH },
    { width: COL_C_WIDTH }
  ];

  let currentRow = 1;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    // Page Break
    if (i > 0 && i % photosPerPage === 0) {
      sheet.getRow(currentRow).addPageBreak();
      currentRow++;
    }

    const startRow = currentRow;
    const endRow = startRow + rowsPerBlock - 1;

    // Set row heights
    for (let r = startRow; r <= endRow; r++) {
      sheet.getRow(r).height = ROW_HEIGHT_PTS;
    }

    // Image cell (Column A)
    sheet.mergeCells(startRow, 1, endRow, 1);
    const imgCell = sheet.getCell(startRow, 1);
    imgCell.value = `[画像: ${record.fileName}]`;
    imgCell.alignment = { vertical: 'middle', horizontal: 'center' };
    imgCell.font = { size: 14, color: { argb: 'FF888888' } };
    imgCell.border = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } }
    };

    // Info fields (Columns B & C)
    const createField = (r: number, label: string, value: string, rowSpan: number) => {
      let finalRowSpan = rowSpan;
      if (photosPerPage === 2) {
        if (label === LABELS.labelStation) finalRowSpan = 2;
        if (label === LABELS.labelRemarks) finalRowSpan = 16;
      }

      // Label cell
      const labelCell = sheet.getCell(r, 2);
      labelCell.value = label;
      labelCell.font = { bold: true, size: 9, color: { argb: 'FF555555' } };
      labelCell.alignment = { vertical: 'middle', horizontal: 'center' };
      labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      labelCell.border = {
        top: { style: 'hair', color: { argb: 'FFAAAAAA' } },
        left: { style: 'hair', color: { argb: 'FFAAAAAA' } },
        right: { style: 'hair', color: { argb: 'FFAAAAAA' } },
        bottom: { style: 'hair', color: { argb: 'FFAAAAAA' } }
      };

      // Value cell
      const valueCell = sheet.getCell(r, 3);
      valueCell.value = value;
      valueCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      valueCell.font = { size: 11 };
      valueCell.border = {
        top: { style: 'hair', color: { argb: 'FFCCCCCC' } },
        right: { style: 'hair', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'hair', color: { argb: 'FFCCCCCC' } }
      };

      if (finalRowSpan > 1) {
        sheet.mergeCells(r, 2, r + finalRowSpan - 1, 2);
        sheet.mergeCells(r, 3, r + finalRowSpan - 1, 3);
      }

      return finalRowSpan;
    };

    // Filter fields for 2-up mode
    const visibleFields = LAYOUT_FIELDS.filter((field) => {
      if (isTwoUp) {
        return field.key === 'remarks' || field.key === 'station';
      }
      return true;
    });

    let currentFieldRow = startRow;
    for (const field of visibleFields) {
      let val = "";
      if (field.key === 'date') {
        val = record.date
          ? new Date(record.date).toLocaleString('ja-JP', {
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit'
            })
          : "";
      } else if (record.analysis) {
        val = (record.analysis as any)[field.key] || "";
      }

      const label = LABELS[field.labelKey] || field.key;
      const usedSpan = createField(currentFieldRow, label, val, field.rowSpan);
      currentFieldRow += usedSpan;
    }

    currentRow = endRow + 2;
  }

  // Output directory
  const outputDir = path.join(__dirname, '..', 'test-output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Save files
  const filename3up = path.join(outputDir, 'excel-demo-3up.xlsx');
  const filename2up = path.join(outputDir, 'excel-demo-2up.xlsx');

  if (photosPerPage === 3) {
    await workbook.xlsx.writeFile(filename3up);
    console.log(`✅ 3枚/ページ: ${filename3up}`);
  } else {
    await workbook.xlsx.writeFile(filename2up);
    console.log(`✅ 2枚/ページ: ${filename2up}`);
  }
}

async function main() {
  console.log('📊 Excel出力デモを生成中...\n');

  const records = createSampleRecords();
  console.log(`サンプルデータ: ${records.length}件`);
  records.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.fileName}: ${r.analysis?.workType} - ${r.analysis?.variety}`);
  });
  console.log('');

  // 3枚/ページ版
  await generateExcelDemo(records, 3);

  // 2枚/ページ版
  await generateExcelDemo(records, 2);

  console.log('\n✨ 完了！test-output/ フォルダにExcelファイルが生成されました');
}

main().catch(console.error);
