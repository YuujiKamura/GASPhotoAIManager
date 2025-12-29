import { PhotoRecord, AppMode, AIAnalysisResult } from "../types";
import { extractBase64Data } from "./imageUtils";
import { LAYOUT_FIELDS, getLayoutConfig, DIMENSION, PDF_LAYOUT, CONVERSION } from "./layoutConfig";
import { TRANS } from "./translations";

// Declare global variables for loaded scripts
declare const ExcelJS: any;
declare const saveAs: any;

// Helper to get actual dimensions of the base64 image string
const getImageDimensions = (base64: string): Promise<{ w: number; h: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.width, h: img.height });
    img.onerror = (e) => reject(e);
    img.src = base64;
  });
};

export const generateExcel = async (
  records: PhotoRecord[],
  appMode: AppMode = 'construction',
  photosPerPage: 2 | 3 = 3
) => {
  console.log('[ExcelExport] Starting export...', { recordCount: records.length, appMode, photosPerPage });

  // Check if ExcelJS library is loaded from CDN
  if (typeof ExcelJS === 'undefined') {
    console.error('[ExcelExport] ExcelJS library not loaded');
    alert("ExcelJS ライブラリが読み込まれていません。ページを再読み込みしてください。");
    return;
  }

  // Check if FileSaver (saveAs) is loaded from CDN
  if (typeof saveAs === 'undefined') {
    console.error('[ExcelExport] FileSaver (saveAs) not loaded');
    alert("FileSaver ライブラリが読み込まれていません。ページを再読み込みしてください。");
    return;
  }

  // Check if there are records to export
  if (!records || records.length === 0) {
    console.warn('[ExcelExport] No records to export');
    alert("エクスポートするデータがありません。");
    return;
  }

  console.log('[ExcelExport] Libraries loaded, creating workbook...');

  // ============================================
  // レイアウト設定（PDF基準から導出）
  // ============================================
  const layout = getLayoutConfig(photosPerPage);
  const isTwoUp = photosPerPage === 2;

  // Excel列幅（layoutConfigから取得）
  const COL_A_WIDTH = layout.colAWidth;
  const COL_B_WIDTH = layout.colBWidth;
  const COL_C_WIDTH = layout.colCWidth;
  const rowsPerBlock = layout.rowsPerBlock;
  const ROW_HEIGHT_PT = layout.rowHeightPt;

  // 画像配置用の寸法（PDF ptベース）
  const photoWidthPt = layout.photoWidthPt;
  const photoHeightPt = layout.photoHeightPt;

  console.log('[ExcelExport] Layout config:', {
    photosPerPage,
    colWidths: [COL_A_WIDTH, COL_B_WIDTH, COL_C_WIDTH],
    rowsPerBlock,
    rowHeightPt: ROW_HEIGHT_PT,
    photoSizePt: `${photoWidthPt.toFixed(1)} x ${photoHeightPt.toFixed(1)}`
  });

  // Use current language for headers
  const txt = TRANS['ja'];

  // Create a new workbook
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(appMode === 'construction' ? '工事写真帳' : 'Photo Album', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: false,
      margins: {
        // PDF_LAYOUTのマージン(pt)をインチに変換 (1inch = 72pt)
        left: PDF_LAYOUT.MARGIN / 72,
        right: PDF_LAYOUT.MARGIN / 72,
        top: (PDF_LAYOUT.MARGIN + PDF_LAYOUT.HEADER_HEIGHT) / 72,
        bottom: PDF_LAYOUT.MARGIN / 72,
        header: 0.3,
        footer: 0.3
      }
    },
    views: [{ showGridLines: false }]
  });

  // Setup Column Widths
  sheet.columns = [
    { width: COL_A_WIDTH },
    { width: COL_B_WIDTH },
    { width: COL_C_WIDTH }
  ];

  // Set default font
  sheet.eachRow((row: any) => {
    row.font = { name: 'Meiryo', size: 10 };
  });

  let currentRow = 1;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    console.log(`[ExcelExport] Processing record ${i + 1}/${records.length}: ${record.fileName}`);

    // Page Break Logic
    if (i > 0 && i % photosPerPage === 0) {
      sheet.getRow(currentRow).addPageBreak();
      currentRow++;
    }

    const startRow = currentRow;
    const endRow = startRow + rowsPerBlock - 1;

    // Explicitly set row heights
    for (let r = startRow; r <= endRow; r++) {
      sheet.getRow(r).height = ROW_HEIGHT_PT;
    }

    // --- 1. Image Section (Column A) ---
    sheet.mergeCells(startRow, 1, endRow, 1);
    const imgCell = sheet.getCell(startRow, 1);
    imgCell.border = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } }
    };

    const base64Data = extractBase64Data(record.base64);
    if (!base64Data) {
      console.warn(`[ExcelExport] Skipping image for ${record.fileName}: no base64 data`);
      currentRow = endRow + 2;
      continue;
    }

    console.log(`[ExcelExport] Adding image for ${record.fileName}, base64 length: ${base64Data.length}`);
    const imageId = workbook.addImage({
      base64: base64Data,
      extension: 'jpeg',
    });

    try {
      // 1. Get Actual Image Dimensions
      const { w: imgW, h: imgH } = await getImageDimensions(record.base64);
      console.log(`[ExcelExport] Image dimensions: ${imgW}x${imgH}`);

      // 2. Calculate Scale using PDF-based dimensions (pt)
      // ボックスサイズ（pt）
      const boxWidthPt = COL_A_WIDTH * CONVERSION.PT_PER_EXCEL_COL;
      const boxHeightPt = rowsPerBlock * ROW_HEIGHT_PT;

      // 画像の実サイズをptに変換（96dpi想定）
      const imgWPt = imgW * CONVERSION.PX_TO_PT;
      const imgHPt = imgH * CONVERSION.PX_TO_PT;

      // スケール計算（95%マージン）
      const scaleW = (boxWidthPt * 0.95) / imgWPt;
      const scaleH = (boxHeightPt * 0.95) / imgHPt;
      const scale = Math.min(scaleW, scaleH);

      const finalWPt = imgWPt * scale;
      const finalHPt = imgHPt * scale;

      // pxに戻す（ExcelJSのextはpx単位）
      const finalWPx = finalWPt * CONVERSION.PT_TO_PX;
      const finalHPx = finalHPt * CONVERSION.PT_TO_PX;

      console.log(`[ExcelExport] Scaled size: ${Math.round(finalWPx)}x${Math.round(finalHPx)}px (${finalWPt.toFixed(1)}x${finalHPt.toFixed(1)}pt)`);

      // 3. Calculate cell positions for centering
      const paddingWPt = (boxWidthPt - finalWPt) / 2;
      const paddingHPt = (boxHeightPt - finalHPt) / 2;

      // セル内オフセット（列の小数部分）
      const colOffset = paddingWPt / boxWidthPt;
      const rowOffset = paddingHPt / boxHeightPt * rowsPerBlock;

      const tlCol = Math.max(0.02, colOffset);
      const tlRow = startRow - 1 + Math.max(0.1, rowOffset);

      // 画像サイズをセル単位に変換
      const imgCols = finalWPt / boxWidthPt;
      const imgRows = finalHPt / boxHeightPt * rowsPerBlock;

      const brCol = tlCol + imgCols;
      const brRow = tlRow + imgRows;

      // tl/br format with 'absolute' - 印刷時にセルと一緒に動かない
      sheet.addImage(imageId, {
        tl: { col: tlCol, row: tlRow },
        br: { col: brCol, row: brRow },
        editAs: 'absolute'
      });

    } catch (e) {
      console.warn("[ExcelExport] Could not calculate image dimensions, using fallback.", e);
      sheet.addImage(imageId, {
        tl: { col: 0.02, row: startRow - 1 + 0.1 },
        ext: { width: 400, height: 300 },
        editAs: 'oneCell'
      });
    }

    // --- 2. Info Section (Columns B & C) ---
    const createField = (r: number, label: string, value: string, rowSpan: number) => {
      let finalRowSpan = rowSpan;
      if (isTwoUp) {
        if (label === txt.labelStation) finalRowSpan = 2;
        if (label === txt.labelRemarks) finalRowSpan = 16;
      }

      // Label Cell (Col B)
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

      // Value Cell (Col C)
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

    // Filter fields based on layout mode
    const visibleFields = LAYOUT_FIELDS.filter((field) => {
      if (isTwoUp) {
        return field.key === 'remarks' || field.key === 'station';
      }
      return true;
    });

    let currentFieldRow = startRow;

    visibleFields.forEach((field) => {
      let val = "";
      if (field.key === 'date') {
        val = record.date
          ? new Date(record.date).toLocaleString('ja-JP', {
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit'
            })
          : "";
      } else {
        val = record.analysis ? (record.analysis[field.key as keyof AIAnalysisResult] as string || "") : "";
      }

      const label = txt[field.labelKey as keyof typeof txt] as string;
      const usedSpan = createField(currentFieldRow, label, val, field.rowSpan);
      currentFieldRow += usedSpan;
    });

    currentRow = endRow + 2;
  }

  try {
    console.log('[ExcelExport] Writing buffer...');
    const buffer = await workbook.xlsx.writeBuffer();
    console.log('[ExcelExport] Buffer created, size:', buffer.byteLength);
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `PhotoAlbum_${dateStr}.xlsx`;
    console.log('[ExcelExport] Saving file:', filename);
    saveAs(blob, filename);
    console.log('[ExcelExport] Export complete');
  } catch (error) {
    console.error("[ExcelExport] Excel generation failed:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    alert(`Excel生成に失敗しました: ${errorMessage}`);
  }
};
