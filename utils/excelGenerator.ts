

import { PhotoRecord, AppMode, AIAnalysisResult } from "../types";
import { extractBase64Data } from "./imageUtils";
import { LAYOUT_FIELDS, ROWS_PER_PHOTO } from "./layoutConfig";
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

export const generateExcel = async (records: PhotoRecord[], appMode: AppMode = 'construction') => {
  if (typeof ExcelJS === 'undefined') {
    alert("Excel generation library is not loaded.");
    return;
  }

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

  // --- Layout Constants ---
  const COL_A_WIDTH_CHARS = 65; 
  const PIXELS_PER_COL_UNIT = 7.1; // Tuned for ExcelJS default font
  
  const ROW_HEIGHT_PTS = 21; 
  const PIXELS_PER_PT = 96.0 / 72.0; // Standard DPI conversion
  
  const BOX_WIDTH_PX = COL_A_WIDTH_CHARS * PIXELS_PER_COL_UNIT; 
  const BOX_HEIGHT_PX = ROWS_PER_PHOTO * ROW_HEIGHT_PTS * PIXELS_PER_PT; 

  // Setup Column Widths
  // initializing columns array directly is safer than getColumn(n).width
  sheet.columns = [
    { width: COL_A_WIDTH_CHARS }, // Column A
    { width: 8 },  // Column B
    { width: 25 }  // Column C
  ];

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
    const imageId = workbook.addImage({
      base64: base64Data,
      extension: 'jpeg',
    });

    try {
      // 1. Get Actual Image Dimensions to preserve Aspect Ratio
      const { w: imgW, h: imgH } = await getImageDimensions(record.base64);
      
      // 2. Calculate Scale to Fit Box (Contain)
      const scaleW = (BOX_WIDTH_PX * 0.96) / imgW; // 96% to leave small padding
      const scaleH = (BOX_HEIGHT_PX * 0.96) / imgH;
      const scale = Math.min(scaleW, scaleH); // Contain logic

      const finalW = imgW * scale;
      const finalH = imgH * scale;

      // 3. Calculate Centering Offsets (in Pixels)
      const xOffsetPx = (BOX_WIDTH_PX - finalW) / 2;
      const yOffsetPx = (BOX_HEIGHT_PX - finalH) / 2;

      // 4. Place Image using Absolute Positioning (Pixels)
      const absX = xOffsetPx; // Column A starts at 0px
      const absY = ((startRow - 1) * ROW_HEIGHT_PTS * PIXELS_PER_PT) + yOffsetPx;

      sheet.addImage(imageId, {
        x: absX,
        y: absY,
        width: finalW,
        height: finalH,
        editAs: 'absolute'
      });

    } catch (e) {
      console.warn("Could not calculate image dimensions, falling back.", e);
      sheet.addImage(imageId, {
        tl: { col: 0.05, row: startRow - 1 + 0.5 },
        ext: { width: 400, height: 300 }, 
        editAs: 'oneCell' 
      });
    }

    // --- 2. Info Section (Columns B & C) ---
    // Helper function for creating fields
    const createField = (r: number, label: string, value: string, rowSpan: number) => {
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
      valueCell.font = { size: 11 }; // Slightly larger font for readability
      valueCell.border = {
        top: { style: 'hair', color: { argb: 'FFCCCCCC' } },
        right: { style: 'hair', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'hair', color: { argb: 'FFCCCCCC' } }
      };

      if (rowSpan > 1) {
        // Merge cells vertically
        sheet.mergeCells(r, 2, r + rowSpan - 1, 2); // B{r}:B{r+span-1}
        sheet.mergeCells(r, 3, r + rowSpan - 1, 3); // C{r}:C{r+span-1}
      }
    };

    // Iterate through Shared Layout Configuration
    let currentFieldRow = startRow;
    
    LAYOUT_FIELDS.forEach((field) => {
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

      createField(currentFieldRow, label, val, field.rowSpan);
      currentFieldRow += field.rowSpan;
    });

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
