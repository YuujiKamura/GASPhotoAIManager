/**
 * Excel出力レイアウトのデモ/テストスクリプト
 *
 * 本番の layoutConfig.ts からレイアウト定数をインポートして使用
 *
 * 使用方法: npx tsx scripts/test-excel-export.ts
 * 出力: test-output/excel-demo-*.xlsx
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas } from 'canvas';
import ExcelJS from 'exceljs';

// 本番のレイアウト設定をインポート
import { LAYOUT_FIELDS, ROWS_PER_PHOTO, DIMENSION, getLayoutConfig as getLayoutConfigFromLib, PDF_LAYOUT, CONVERSION } from '../utils/layoutConfig';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// ラベル（本番はTRANSから取得するが、テスト用に直接定義）
const LABELS: Record<string, string> = {
  labelDate: '撮影日時',
  labelWorkType: '工種',
  labelVariety: '種別',
  labelDetail: '細別',
  labelStation: '測点',
  labelRemarks: '備考',
  labelMeasurements: '寸法',
};

// ===========================================
// 本番と同じレイアウト定数を使用（layoutConfigから取得）
// ===========================================
function getLayoutConfig(photosPerPage: 2 | 3) {
  const config = getLayoutConfigFromLib(photosPerPage);

  return {
    COL_A_WIDTH: config.colAWidth,
    COL_B_WIDTH: config.colBWidth,
    COL_C_WIDTH: config.colCWidth,
    rowsPerBlock: config.rowsPerBlock,
    ROW_HEIGHT_PTS: config.rowHeightPt,
    PIXELS_PER_COL_UNIT: CONVERSION.PX_PER_EXCEL_COL,
    PT_TO_PX: CONVERSION.PT_TO_PX,
    PT_PER_COL: CONVERSION.PT_PER_EXCEL_COL,
  };
}

// CALS規格サイズ（1280x960）のサンプル画像を生成
function createCALSImage(index: number, workType: string, station: string): Buffer {
  const width = 1280;
  const height = 960;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 背景（工事現場っぽいグラデーション）
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#87CEEB');  // 空色
  gradient.addColorStop(0.3, '#B0C4DE');
  gradient.addColorStop(0.5, '#808080'); // 道路
  gradient.addColorStop(1, '#696969');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // 道路の白線
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

  // 黒板（右下）
  const boardX = width - 350;
  const boardY = height - 250;
  const boardW = 320;
  const boardH = 220;

  ctx.fillStyle = '#8B4513';
  ctx.fillRect(boardX - 10, boardY - 10, boardW + 20, boardH + 20);
  ctx.fillStyle = '#228B22';
  ctx.fillRect(boardX, boardY, boardW, boardH);

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

  // 写真番号（大）
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.font = 'bold 200px sans-serif';
  ctx.fillText(`${index + 1}`, 50, 250);

  return canvas.toBuffer('image/jpeg', { quality: 0.85 });
}

// サンプルデータ
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
  const layout = getLayoutConfig(photosPerPage);
  const isTwoUp = photosPerPage === 2;

  const workbook = new ExcelJS.Workbook();

  // シート設定
  const createSheetOptions = () => ({
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait' as const,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
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

  console.log(`  レイアウト: ${photosPerPage}枚/ページ`);
  console.log(`    A列幅: ${layout.COL_A_WIDTH} (${Math.round(layout.COL_A_WIDTH * layout.PIXELS_PER_COL_UNIT)}px)`);
  console.log(`    B列幅: ${layout.COL_B_WIDTH}`);
  console.log(`    C列幅: ${layout.COL_C_WIDTH}`);
  console.log(`    行数/ブロック: ${layout.rowsPerBlock}`);

  // ページ数を計算
  const totalPages = Math.ceil(records.length / photosPerPage);
  console.log(`    シート数: ${totalPages}`);

  // ページごとにシートを作成
  for (let pageNum = 0; pageNum < totalPages; pageNum++) {
    const pageRecords = records.slice(pageNum * photosPerPage, (pageNum + 1) * photosPerPage);
    const sheetName = `${pageNum + 1}`;

    const sheet = workbook.addWorksheet(sheetName, createSheetOptions());

    // 列幅設定
    sheet.columns = [
      { width: layout.COL_A_WIDTH },
      { width: layout.COL_B_WIDTH },
      { width: layout.COL_C_WIDTH }
    ];

    let currentRow = 1;

    // このページの写真を配置
    for (let i = 0; i < pageRecords.length; i++) {
      const record = pageRecords[i];

      const startRow = currentRow;
      const endRow = startRow + layout.rowsPerBlock - 1;

      // 行高さ設定
      for (let r = startRow; r <= endRow; r++) {
        sheet.getRow(r).height = layout.ROW_HEIGHT_PTS;
      }

      // 画像セル（A列）
      sheet.mergeCells(startRow, 1, endRow, 1);
      const imgCell = sheet.getCell(startRow, 1);
      imgCell.border = {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } }
      };

      // 画像追加
      if (record.base64) {
        const base64Data = record.base64.split(',')[1];
        const imageId = workbook.addImage({
          base64: base64Data,
          extension: 'jpeg',
        });

        // ボックスサイズ（px）- セルサイズから計算
        const boxWidthPx = layout.COL_A_WIDTH * layout.PIXELS_PER_COL_UNIT;
        const boxHeightPx = layout.rowsPerBlock * layout.ROW_HEIGHT_PTS * layout.PT_TO_PX;

        // CALS画像 (1280x960)
        const imgW = 1280, imgH = 960;

        // スケール計算（セルサイズに合わせる、100%フィル）
        const scaleW = boxWidthPx / imgW;
        const scaleH = boxHeightPx / imgH;
        const scale = Math.min(scaleW, scaleH);

        const finalW = Math.round(imgW * scale);
        const finalH = Math.round(imgH * scale);

        // tl/br形式で写真行数分に配置（余白行は含まない）
        // アスペクト比はExcelのnoChangeAspectで維持される
        const photoRows = layout.rowsPerBlock - 1; // 余白1行分を除く
        sheet.addImage(imageId, {
          tl: { col: 0, row: startRow - 1 },
          br: { col: 1, row: startRow - 1 + photoRows },
          editAs: 'absolute'
        });
      }

      // フィールド（B・C列）
      const createField = (r: number, label: string, value: string, rowSpan: number) => {
        let finalRowSpan = rowSpan;
        if (isTwoUp) {
          // 2upモード: station=2行, remarks=残り(11-2=9行)
          if (label === LABELS.labelStation) finalRowSpan = 2;
          if (label === LABELS.labelRemarks) finalRowSpan = layout.rowsPerBlock - 2;
        }

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

      // 本番と同じフィールドフィルタ
      const visibleFields = LAYOUT_FIELDS.filter((field) => {
        if (isTwoUp) return field.key === 'remarks' || field.key === 'station';
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

      currentRow = endRow + 1; // シート内なのでギャップなし
    }
  }

  // 出力
  const outputDir = path.join(__dirname, '..', 'test-output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filename = path.join(outputDir, `excel-demo-${photosPerPage}up.xlsx`);
  await workbook.xlsx.writeFile(filename);
  console.log(`  ✅ 出力: ${filename}\n`);
}

async function main() {
  console.log('📊 Excel出力デモ（本番layoutConfig使用）\n');
  console.log('=== レイアウト定数（layoutConfig.ts） ===');
  console.log(`  ROWS_PER_PHOTO: ${ROWS_PER_PHOTO}`);
  console.log(`  ROW_HEIGHT_PT: ${DIMENSION.ROW_HEIGHT_PT}`);
  console.log(`  LABEL_WIDTH_EXCEL: ${DIMENSION.LABEL_WIDTH_EXCEL}`);
  console.log(`  PIXELS_PER_COL_UNIT: ${DIMENSION.PIXELS_PER_COL_UNIT}`);
  console.log('');

  const records = createSampleRecords();
  console.log(`サンプルデータ: ${records.length}件\n`);

  await generateExcelDemo(records, 3);
  await generateExcelDemo(records, 2);

  console.log('✨ 完了');
}

main().catch(console.error);
