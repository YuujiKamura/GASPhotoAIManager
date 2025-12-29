import { PhotoRecord, AppMode, AIAnalysisResult } from "../types";
import { extractBase64Data } from "./imageUtils";
import { LAYOUT_FIELDS, ROWS_PER_PHOTO, DIMENSION } from "./layoutConfig";
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

  // Use current language for headers, or default to JA since this is primarily Japanese layout
  const txt = TRANS['ja']; 

  // Create a new workbook
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(appMode === 'construction' ? '工事写真帳' : 'Photo Album', {
    pageSetup: { 
      paperSize: 9, // 9 = A4
      orientation: 'portrait',
      fitToPage: false,
      margins: {
        left: 0.7, right: 0.7, top: 0.75, bottom: 0.75,
        header: 0.3, footer: 0.3
      }
    },
    views: [{ showGridLines: false }]
  });

  // --- Layout Constants (from shared DIMENSION config) ---
  const isTwoUp = photosPerPage === 2;

  // Column widths from DIMENSION (A4 portrait, 3 columns)
  // 3-up: A=65 (image 65%), B=8 (label), C=25 (value 35%)
  // 2-up: A=80 (larger image), B=6, C=14
  const COL_A_WIDTH = isTwoUp ? 80 : 65;
  const COL_B_WIDTH = isTwoUp ? 6 : DIMENSION.LABEL_WIDTH_EXCEL;
  const COL_C_WIDTH = isTwoUp ? 14 : 25;

  // Row height from shared config
  const ROW_HEIGHT_PTS = DIMENSION.ROW_HEIGHT_PT;
  const PIXELS_PER_PT = DIMENSION.PT_TO_PX;
  const PIXELS_PER_COL_UNIT = DIMENSION.PIXELS_PER_COL_UNIT;

  // Rows per photo block (3-up = 12, 2-up = 18)
  const rowsPerBlock = photosPerPage === 2 ? 18 : ROWS_PER_PHOTO;

  // Calculate actual pixel dimensions for image placement
  const BOX_WIDTH_PX = COL_A_WIDTH * PIXELS_PER_COL_UNIT;
  const BOX_HEIGHT_PX = rowsPerBlock * ROW_HEIGHT_PTS * PIXELS_PER_PT; 

  // Setup Column Widths (using computed values)
  sheet.columns = [
    { width: COL_A_WIDTH }, // Column A (Image)
    { width: COL_B_WIDTH }, // Column B (Label)
    { width: COL_C_WIDTH }  // Column C (Value)
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
      currentRow++; // Spacer row
    }

    const startRow = currentRow;
    const endRow = startRow + rowsPerBlock - 1;

    // Explicitly set row heights
    for (let r = startRow; r <= endRow; r++) {
      sheet.getRow(r).height = ROW_HEIGHT_PTS;
    }

    // --- 1. Image Section (Column A) ---
    // Merge Column A for the image
    sheet.mergeCells(startRow, 1, endRow, 1); // A{startRow}:A{endRow}
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
      // 1. Get Actual Image Dimensions to preserve Aspect Ratio
      const { w: imgW, h: imgH } = await getImageDimensions(record.base64);
      console.log(`[ExcelExport] Image dimensions: ${imgW}x${imgH}`);

      // 2. Calculate Scale to Fit Box (Contain)
      const scaleW = (BOX_WIDTH_PX * 0.95) / imgW;
      const scaleH = (BOX_HEIGHT_PX * 0.95) / imgH;
      const scale = Math.min(scaleW, scaleH);

      const finalW = imgW * scale;
      const finalH = imgH * scale;
      console.log(`[ExcelExport] Scaled size: ${Math.round(finalW)}x${Math.round(finalH)}`);

      // 3. Use tl/ext format (more compatible with CDN version of ExcelJS)
      // Calculate column offset for centering (as fraction of column width)
      const colOffset = (BOX_WIDTH_PX - finalW) / 2 / PIXELS_PER_COL_UNIT / COL_A_WIDTH;
      // Calculate row offset for centering (as fraction of rows)
      const rowOffset = (BOX_HEIGHT_PX - finalH) / 2 / (ROW_HEIGHT_PTS * PIXELS_PER_PT) / rowsPerBlock;

      sheet.addImage(imageId, {
        tl: { col: Math.max(0, colOffset), row: startRow - 1 + Math.max(0, rowOffset * rowsPerBlock) },
        ext: { width: finalW, height: finalH },
        editAs: 'oneCell'
      });

    } catch (e) {
      console.warn("[ExcelExport] Could not calculate image dimensions, using fallback.", e);
      // Fallback: place image with fixed size
      sheet.addImage(imageId, {
        tl: { col: 0.02, row: startRow - 1 + 0.1 },
        ext: { width: 400, height: 300 },
        editAs: 'oneCell'
      });
    }

    // --- 2. Info Section (Columns B & C) ---
    // Helper function for creating fields
    const createField = (r: number, label: string, value: string, rowSpan: number) => {
      // Scale rowSpan if using 2-up layout to fill vertical space
      // 2-up mode now only shows remarks + station (matching Web View)
      // Total 18 rows available: Station = 2 rows, Remarks = 16 rows
      let finalRowSpan = rowSpan;
      if (photosPerPage === 2) {
         if (label === txt.labelStation) finalRowSpan = 2;
         if (label === txt.labelRemarks) finalRowSpan = 16;
      }

      // Label Cell (Col 2 / B)
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

      // Value Cell (Col 3 / C)
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
        // Merge cells vertically
        sheet.mergeCells(r, 2, r + finalRowSpan - 1, 2); 
        sheet.mergeCells(r, 3, r + finalRowSpan - 1, 3); 
      }
      
      return finalRowSpan;
    };

    // Iterate through Shared Layout Configuration
    // Filter fields based on layout mode (matching Web View behavior)
    const visibleFields = LAYOUT_FIELDS.filter((field) => {
      // 2-up mode: only remarks and station (like PhotoAlbumView.tsx)
      if (isTwoUp) {
        return field.key === 'remarks' || field.key === 'station';
      }
      // 3-up mode: all fields including measurements (always shown)
      return true;
    });

    let currentFieldRow = startRow;

    visibleFields.forEach((field) => {
      // Resolve Value
      let val = "";
      if (field.key === 'date') {
         val = record.date
           ? new Date(record.date).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
           : "";
      } else {
         val = record.analysis ? (record.analysis[field.key as keyof AIAnalysisResult] as string || "") : "";
      }

      // Resolve Label
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