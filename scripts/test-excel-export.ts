/**
 * Excel出力レイアウトのデモ/テストスクリプト
 *
 * 使用方法: npx tsx scripts/test-excel-export.ts
 * 出力: test-output/excel-demo.xlsx
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas } from 'canvas';

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

// CALS規格サイズ（1280x960）のサンプル画像を生成
function createCALSImage(index: number, workType: string, station: string): Buffer {
  const width = 1280;
  const height = 960;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 背景（工事現場っぽいグレー/茶色系グラデーション）
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#87CEEB');  // 空色
  gradient.addColorStop(0.3, '#B0C4DE'); // 明るいグレー
  gradient.addColorStop(0.5, '#808080'); // グレー（道路）
  gradient.addColorStop(1, '#696969');   // ダークグレー
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // 道路っぽい線を描画
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 8;
  ctx.setLineDash([40, 20]);
  ctx.beginPath();
  ctx.moveTo(width * 0.4, height * 0.5);
  ctx.lineTo(width * 0.6, height);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(width * 0.6, height * 0.5);
  ctx.lineTo(width * 0.4, height);
  ctx.stroke();
  ctx.setLineDash([]);

  // 黒板風のエリア（右下）
  const boardX = width - 350;
  const boardY = height - 250;
  const boardW = 320;
  const boardH = 220;

  // 黒板の枠
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(boardX - 10, boardY - 10, boardW + 20, boardH + 20);

  // 黒板本体
  ctx.fillStyle = '#228B22';
  ctx.fillRect(boardX, boardY, boardW, boardH);

  // 黒板テキスト
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('工事名: サンプル舗装工事', boardX + 15, boardY + 40);
  ctx.font = '20px sans-serif';
  ctx.fillText(`工種: ${workType}`, boardX + 15, boardY + 75);
  ctx.fillText(`測点: ${station}`, boardX + 15, boardY + 105);
  ctx.fillText(`撮影: 2024/12/15`, boardX + 15, boardY + 135);
  ctx.font = '16px sans-serif';
  ctx.fillText(`写真 No.${index + 1}`, boardX + 15, boardY + 170);
  ctx.fillText('施工: サンプル建設(株)', boardX + 15, boardY + 195);

  // 画像番号を大きく表示（デバッグ用）
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.font = 'bold 200px sans-serif';
  ctx.fillText(`${index + 1}`, 50, 250);

  return canvas.toBuffer('image/jpeg', { quality: 0.85 });
}

// サンプルデータを生成
function createSampleRecords(): PhotoRecord[] {
  const records: PhotoRecord[] = [
    {
      fileName: 'IMG_001.jpg',
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
    {
      fileName: 'IMG_004.jpg',
      date: new Date('2024-12-15 14:00:00').getTime(),
      analysis: {
        workType: '舗装工',
        variety: 'アスファルト舗装工',
        detail: '表層工',
        station: 'NO.7+00.0',
        remarks: '敷均し状況\nフィニッシャ施工中',
        measurements: '幅員: 3.5m\n厚さ: 5cm',
        hasBoard: true,
      }
    },
    {
      fileName: 'IMG_005.jpg',
      date: new Date('2024-12-15 15:30:00').getTime(),
      analysis: {
        workType: '舗装工',
        variety: 'アスファルト舗装工',
        detail: '表層工',
        station: 'NO.8+00.0',
        remarks: '転圧完了\nマカダムローラ使用',
        measurements: '締固め度: 97%',
        hasBoard: true,
      }
    },
    {
      fileName: 'IMG_006.jpg',
      date: new Date('2024-12-15 16:00:00').getTime(),
      analysis: {
        workType: '附帯工',
        variety: '排水構造物工',
        detail: 'L型側溝',
        station: 'NO.5+00.0〜NO.8+00.0',
        remarks: '側溝設置完了',
        measurements: '延長: 300m',
        hasBoard: true,
      }
    },
  ];

  // 各レコードにCALS画像を生成して追加
  return records.map((record, index) => ({
    ...record,
    base64: 'data:image/jpeg;base64,' + createCALSImage(
      index,
      record.analysis?.workType || '',
      record.analysis?.station || ''
    ).toString('base64')
  }));
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
    imgCell.border = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } }
    };

    // 画像を追加
    if (record.base64) {
      const base64Data = record.base64.split(',')[1];
      const imageId = workbook.addImage({
        base64: base64Data,
        extension: 'jpeg',
      });

      // 画像サイズ計算（セル内に収まるように）
      const BOX_WIDTH_PX = COL_A_WIDTH * DIMENSION.PIXELS_PER_COL_UNIT;
      const BOX_HEIGHT_PX = rowsPerBlock * ROW_HEIGHT_PTS * DIMENSION.PT_TO_PX;

      // CALS画像は4:3なのでアスペクト比を維持
      const imgW = 1280;
      const imgH = 960;
      const scaleW = (BOX_WIDTH_PX * 0.95) / imgW;
      const scaleH = (BOX_HEIGHT_PX * 0.95) / imgH;
      const scale = Math.min(scaleW, scaleH);

      const finalW = imgW * scale;
      const finalH = imgH * scale;
      const xOffset = (BOX_WIDTH_PX - finalW) / 2;
      const yOffset = (BOX_HEIGHT_PX - finalH) / 2;

      sheet.addImage(imageId, {
        tl: { col: 0.02, row: startRow - 1 + 0.1 },
        ext: { width: finalW, height: finalH },
        editAs: 'oneCell'
      });
    }

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
