import { PhotoRecord } from "../types";
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

export const generateExcel = async (records: PhotoRecord[]) => {
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
  const PIXELS_PER_PT = 1.333; 
  
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

      // 4. Convert Offsets to Excel Coordinates (Col/Row units)
      const colOffset = xOffsetPx / BOX_WIDTH_PX; // Fraction of Col A width
      const rowOffset = (yOffsetPx / BOX_HEIGHT_PX) * ROWS_PER_PHOTO; // Fraction of total rows

      // 5. Place Image using 'tl' + 'ext'
      sheet.addImage(imageId, {
        tl: { col: 0 + colOffset, row: (startRow - 1) + rowOffset },
        ext: { width: finalW, height: finalH },
        editAs: 'oneCell' // Moves with cells but doesn't resize with them
      });

    } catch (e) {
      console.warn("Could not calculate image dimensions, falling back.", e);
      // Fallback
      sheet.addImage(imageId, {
        tl: { col: 0.05, row: startRow - 1 + 0.5 },
        ext: { width: 400, height: 300 }, 
        editAs: 'oneCell'
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

    // Layout Logic (Total 12 Rows)
    // 1. 工種 (2 rows)
    createField(startRow, "工種", record.analysis?.workType || "", 2);
    
    // 2. 測点 (2 rows)
    createField(startRow + 2, "測点", record.analysis?.station || "", 2);
    
    // 3. 備考/黒板 (3 rows) - New Field
    createField(startRow + 4, "備考", record.analysis?.remarks || "", 3);
    
    // 4. 記事 (5 rows) - Description takes remaining space
    createField(startRow + 7, "記事", record.analysis?.description || "", 5);

    currentRow = endRow + 2; 
  }

  try {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const dateStr = new Date().toISOString().slice(0, 10);
    saveAs(blob, `工事写真帳_${dateStr}.xlsx`);
  } catch (error) {
    console.error("Excel generation failed:", error);
    alert("Excel file generation failed.");
  }
};