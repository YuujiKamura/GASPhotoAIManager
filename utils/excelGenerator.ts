
import { PhotoRecord, AppMode } from "../types";
import { extractBase64Data } from "./imageUtils";

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

export const generateExcel = async (records: PhotoRecord[], appMode: AppMode = 'construction') => {
  if (typeof ExcelJS === 'undefined') {
    alert("Excel generation library is not loaded.");
    return;
  }

  // Create a new workbook
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('工事写真帳', {
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

  // --- Layout Constants ---
  const COL_A_WIDTH_CHARS = 65; 
  const PIXELS_PER_COL_UNIT = 7.1; // Tuned for ExcelJS default font
  
  const ROW_HEIGHT_PTS = 21; 
  const PIXELS_PER_PT = 96.0 / 72.0; // Standard DPI conversion
  
  // 12 Rows per photo block
  const ROWS_PER_PHOTO = 12;

  const BOX_WIDTH_PX = COL_A_WIDTH_CHARS * PIXELS_PER_COL_UNIT; 
  const BOX_HEIGHT_PX = ROWS_PER_PHOTO * ROW_HEIGHT_PTS * PIXELS_PER_PT; 

  // Setup Column Widths
  sheet.getColumn('A').width = COL_A_WIDTH_CHARS; 
  sheet.getColumn('B').width = 8; // Label column
  sheet.getColumn('C').width = 25; // Value column

  // Set default font
  sheet.eachRow((row: any) => {
    row.font = { name: 'Meiryo', size: 10 };
  });

  let currentRow = 1;

  // Header Labels based on Mode
  const labelWorkType = appMode === 'construction' ? "工種" : "カテゴリ";
  const labelStation = appMode === 'construction' ? "測点" : "場所";
  const labelRemarks = appMode === 'construction' ? "備考" : "タイトル";
  const labelDescription = "記事";
  const labelDate = appMode === 'construction' ? "撮影日時" : "日時";

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    // Page Break Logic: Every 3 photos
    if (i > 0 && i % 3 === 0) {
      sheet.getRow(currentRow).addPageBreak();
      currentRow++; // Spacer row
    }

    const startRow = currentRow;
    const endRow = startRow + ROWS_PER_PHOTO - 1; 

    // Explicitly set row heights
    for (let r = startRow; r <= endRow; r++) {
      sheet.getRow(r).height = ROW_HEIGHT_PTS;
    }

    // --- 1. Image Section (Column A) ---
    sheet.mergeCells(`A${startRow}:A${endRow}`);
    const imgCell = sheet.getCell(`A${startRow}`);
    imgCell.border = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } }
    };

    const base64Data = extractBase64Data(record.base64);
    const imageId = workbook.addImage({
      base64: base64Data,
      extension: 'jpeg',
    });

    try {
      // 1. Get Actual Image Dimensions to preserve Aspect Ratio
      const { w: imgW, h: imgH } = await getImageDimensions(record.base64);
      
      // 2. Calculate Scale to Fit Box (Contain)
      // Use 'ext' (explicit width/height) instead of 'br' to prevent stretching.
      
      const scaleW = (BOX_WIDTH_PX * 0.96) / imgW; // 96% to leave small padding
      const scaleH = (BOX_HEIGHT_PX * 0.96) / imgH;
      const scale = Math.min(scaleW, scaleH); // Contain logic

      const finalW = imgW * scale;
      const finalH = imgH * scale;

      // 3. Calculate Centering Offsets (in Pixels)
      const xOffsetPx = (BOX_WIDTH_PX - finalW) / 2;
      const yOffsetPx = (BOX_HEIGHT_PX - finalH) / 2;

      // 4. Place Image using Absolute Positioning (Pixels)
      // User request: "Don't move or size with cells" (editAs: 'absolute')
      // Requires x, y in pixels.
      const absX = xOffsetPx; // Column A starts at 0px
      const absY = ((startRow - 1) * ROW_HEIGHT_PTS * PIXELS_PER_PT) + yOffsetPx;

      sheet.addImage(imageId, {
        x: absX,
        y: absY,
        width: finalW,
        height: finalH,
        editAs: 'absolute' // "セルに合わせて移動もサイズ変更もしない"
      });

    } catch (e) {
      console.warn("Could not calculate image dimensions, falling back.", e);
      // Fallback
      sheet.addImage(imageId, {
        tl: { col: 0.05, row: startRow - 1 + 0.5 },
        ext: { width: 400, height: 300 }, 
        editAs: 'oneCell' // Fallback to standard anchoring if pixel calc fails
      });
    }

    // --- 2. Info Section (Columns B & C) ---
    // Helper function for creating fields
    const createField = (r: number, label: string, value: string, rowSpan: number) => {
      // Label Cell (Col B)
      const labelCell = sheet.getCell(`B${r}`);
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
      const valueCell = sheet.getCell(`C${r}`);
      valueCell.value = value;
      valueCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      valueCell.border = {
        top: { style: 'hair', color: { argb: 'FFCCCCCC' } },
        right: { style: 'hair', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'hair', color: { argb: 'FFCCCCCC' } }
      };

      if (rowSpan > 1) {
        sheet.mergeCells(`B${r}:B${r + rowSpan - 1}`);
        sheet.mergeCells(`C${r}:C${r + rowSpan - 1}`);
      }
    };

    // Format Date String
    const dateStr = record.date 
      ? new Date(record.date).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) 
      : "";
    
    // Layout Logic (Total 12 Rows)
    // 1. Work Type (1 row) [Row 1]
    createField(startRow, labelWorkType, record.analysis?.workType || "", 1);

    // 2. Station (1 row) [Row 2] -- SEPARATED
    createField(startRow + 1, labelStation, record.analysis?.station || "", 1);
    
    // 3. Remarks (3 rows) [Rows 3-5]
    createField(startRow + 2, labelRemarks, record.analysis?.remarks || "", 3);
    
    // 4. Description (5 rows) [Rows 6-10]
    createField(startRow + 5, labelDescription, record.analysis?.description || "", 5);

    // 5. Date (2 rows) [Rows 11-12]
    createField(startRow + 10, labelDate, dateStr, 2);

    currentRow = endRow + 2; 
  }

  try {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const dateStr = new Date().toISOString().slice(0, 10);
    saveAs(blob, `PhotoAlbum_${dateStr}.xlsx`);
  } catch (error) {
    console.error("Excel generation failed:", error);
    alert("Excel file generation failed.");
  }
};
