import { PhotoRecord, AppMode, AIAnalysisResult } from "../types";
import { extractBase64Data } from "./imageUtils";
import { LAYOUT_FIELDS, getLayoutConfig, PDF_LAYOUT, CONVERSION } from "./layoutConfig";
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

// シート設定を作成するヘルパー
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

export const generateExcel = async (
  records: PhotoRecord[],
  appMode: AppMode = 'construction',
  photosPerPage: 2 | 3 = 3
) => {
  console.log('[ExcelExport] Starting export...', { recordCount: records.length, appMode, photosPerPage });

  // Check libraries
  if (typeof ExcelJS === 'undefined') {
    console.error('[ExcelExport] ExcelJS library not loaded');
    alert("ExcelJS ライブラリが読み込まれていません。ページを再読み込みしてください。");
    return;
  }
  if (typeof saveAs === 'undefined') {
    console.error('[ExcelExport] FileSaver (saveAs) not loaded');
    alert("FileSaver ライブラリが読み込まれていません。ページを再読み込みしてください。");
    return;
  }
  if (!records || records.length === 0) {
    console.warn('[ExcelExport] No records to export');
    alert("エクスポートするデータがありません。");
    return;
  }

  console.log('[ExcelExport] Libraries loaded, creating workbook...');

  // レイアウト設定（PDF基準から導出）
  const layout = getLayoutConfig(photosPerPage);
  const isTwoUp = photosPerPage === 2;

  const COL_A_WIDTH = layout.colAWidth;
  const COL_B_WIDTH = layout.colBWidth;
  const COL_C_WIDTH = layout.colCWidth;
  const rowsPerBlock = layout.rowsPerBlock;
  const ROW_HEIGHT_PT = layout.rowHeightPt;

  console.log('[ExcelExport] Layout config:', {
    photosPerPage,
    colWidths: [COL_A_WIDTH, COL_B_WIDTH, COL_C_WIDTH],
    rowsPerBlock,
    rowHeightPt: ROW_HEIGHT_PT
  });

  const txt = TRANS['ja'];
  const workbook = new ExcelJS.Workbook();

  // ページ数を計算
  const totalPages = Math.ceil(records.length / photosPerPage);
  console.log(`[ExcelExport] Creating ${totalPages} sheets (${photosPerPage} photos per page)`);

  // ページごとにシートを作成
  for (let pageNum = 0; pageNum < totalPages; pageNum++) {
    const pageRecords = records.slice(pageNum * photosPerPage, (pageNum + 1) * photosPerPage);
    const sheetName = `${pageNum + 1}`;

    console.log(`[ExcelExport] Creating sheet "${sheetName}" with ${pageRecords.length} photos`);

    const sheet = workbook.addWorksheet(sheetName, createSheetOptions());

    // 列幅設定
    sheet.columns = [
      { width: COL_A_WIDTH },
      { width: COL_B_WIDTH },
      { width: COL_C_WIDTH }
    ];

    let currentRow = 1;

    // このページの写真を配置
    for (let i = 0; i < pageRecords.length; i++) {
      const record = pageRecords[i];
      const globalIndex = pageNum * photosPerPage + i;
      console.log(`[ExcelExport] Processing record ${globalIndex + 1}/${records.length}: ${record.fileName}`);

      const startRow = currentRow;
      const endRow = startRow + rowsPerBlock - 1;

      // 行高さ設定
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
        currentRow = endRow + 1;
        continue;
      }

      console.log(`[ExcelExport] Adding image for ${record.fileName}, base64 length: ${base64Data.length}`);
      const imageId = workbook.addImage({
        base64: base64Data,
        extension: 'jpeg',
      });

      try {
        const { w: imgW, h: imgH } = await getImageDimensions(record.base64);
        console.log(`[ExcelExport] Image dimensions: ${imgW}x${imgH}`);

        // ボックスサイズ（pt）
        const boxWidthPt = COL_A_WIDTH * CONVERSION.PT_PER_EXCEL_COL;
        const boxHeightPt = rowsPerBlock * ROW_HEIGHT_PT;

        // 画像サイズをptに変換
        const imgWPt = imgW * CONVERSION.PX_TO_PT;
        const imgHPt = imgH * CONVERSION.PX_TO_PT;

        // スケール計算（95%マージン）
        const scaleW = (boxWidthPt * 0.95) / imgWPt;
        const scaleH = (boxHeightPt * 0.95) / imgHPt;
        const scale = Math.min(scaleW, scaleH);

        const finalWPt = imgWPt * scale;
        const finalHPt = imgHPt * scale;

        console.log(`[ExcelExport] Scaled: ${finalWPt.toFixed(1)}x${finalHPt.toFixed(1)}pt`);

        // セル位置計算（中央配置）
        const paddingWPt = (boxWidthPt - finalWPt) / 2;
        const paddingHPt = (boxHeightPt - finalHPt) / 2;

        const colOffset = paddingWPt / boxWidthPt;
        const rowOffset = paddingHPt / boxHeightPt * rowsPerBlock;

        const tlCol = Math.max(0.02, colOffset);
        const tlRow = startRow - 1 + Math.max(0.1, rowOffset);

        const imgCols = finalWPt / boxWidthPt;
        const imgRows = finalHPt / boxHeightPt * rowsPerBlock;

        const brCol = tlCol + imgCols;
        const brRow = tlRow + imgRows;

        // absolute配置（印刷時にセルと一緒に動かない）
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

      currentRow = endRow + 1; // 次のブロックへ（シート内なのでギャップなし）
    }
  }

  // ファイル保存
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
