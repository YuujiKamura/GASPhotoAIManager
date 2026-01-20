import { PhotoRecord, AppMode, AIAnalysisResult } from "../types";
import { getBlockLayoutMode } from "../types";
import { extractBase64Data } from "./imageUtils";
import {
  LAYOUT_FIELDS,
  getLayoutConfig,
  getTemplateLayout,
  getTemplateById,
  getDefaultTemplateId,
  BUILT_IN_TEMPLATES,
  getVisibleFields,
  PDF_LAYOUT,
  CONVERSION
} from "./layoutConfig";
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
    horizontalCentered: true,
    verticalCentered: true,
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
  templateIdOrPhotosPerPage: string | 2 | 3 = 'standard-3up'
) => {
  // 後方互換: 数値の場合はテンプレートIDに変換
  const templateId = typeof templateIdOrPhotosPerPage === 'number'
    ? (templateIdOrPhotosPerPage === 2 ? 'simple-2up' : 'standard-3up')
    : templateIdOrPhotosPerPage;

  console.log('[ExcelExport] Starting export...', { recordCount: records.length, appMode, templateId });

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

  // テンプレートを取得
  const template = getTemplateById(templateId) || BUILT_IN_TEMPLATES[getDefaultTemplateId()];
  const blocksPerPage = template.blocksPerPage;
  const layoutMode = getBlockLayoutMode(template.captionPosition);
  const isVerticalLayout = layoutMode === 'vertical';

  // レイアウト設定（PDF基準から導出）
  const photosPerPage = blocksPerPage as 2 | 3;  // 後方互換用
  const layout = getLayoutConfig(photosPerPage);
  const isTwoUp = blocksPerPage === 2;

  const COL_A_WIDTH = layout.colAWidth;
  const COL_B_WIDTH = layout.colBWidth;
  const COL_C_WIDTH = layout.colCWidth;
  const rowsPerBlock = layout.rowsPerBlock;
  const ROW_HEIGHT_PT = layout.rowHeightPt;

  console.log('[ExcelExport] Layout config:', {
    blocksPerPage,
    captionPosition: template.captionPosition,
    layoutMode,
    isVerticalLayout,
    colWidths: [COL_A_WIDTH, COL_B_WIDTH, COL_C_WIDTH],
    rowsPerBlock,
    rowHeightPt: ROW_HEIGHT_PT
  });

  const txt = TRANS['ja'];
  const workbook = new ExcelJS.Workbook();

  // ページ数を計算
  const totalPages = Math.ceil(records.length / blocksPerPage);
  console.log(`[ExcelExport] Creating ${totalPages} sheets (${blocksPerPage} blocks per page, ${template.captionPosition} layout)`);

  // ページごとにシートを作成
  for (let pageNum = 0; pageNum < totalPages; pageNum++) {
    const pageRecords = records.slice(pageNum * blocksPerPage, (pageNum + 1) * blocksPerPage);
    const sheetName = `${pageNum + 1}`;

    console.log(`[ExcelExport] Creating sheet "${sheetName}" with ${pageRecords.length} photos`);

    const sheet = workbook.addWorksheet(sheetName, createSheetOptions());

    // 列幅設定
    if (isVerticalLayout) {
      // 縦レイアウト: 全幅を使用
      const totalWidth = COL_A_WIDTH + COL_B_WIDTH + COL_C_WIDTH;
      sheet.columns = [
        { width: totalWidth },  // 写真用（全幅）
      ];
    } else {
      // 横レイアウト: 3列
      sheet.columns = [
        { width: COL_A_WIDTH },
        { width: COL_B_WIDTH },
        { width: COL_C_WIDTH }
      ];
    }

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

      if (isVerticalLayout) {
        // ========================================
        // 縦レイアウト（写真上、キャプション下）
        // ========================================
        const photoRatio = template.photoRatio / 100;  // 0.85
        const captionRatio = template.captionRatio / 100;  // 0.15
        const photoRowCount = Math.floor(rowsPerBlock * photoRatio);
        const captionRowCount = rowsPerBlock - photoRowCount;

        const photoEndRow = startRow + photoRowCount - 1;
        const captionStartRow = photoEndRow + 1;

        // 写真配置
        try {
          const { w: imgW, h: imgH } = await getImageDimensions(record.base64);
          console.log(`[ExcelExport] Image dimensions: ${imgW}x${imgH}`);

          sheet.addImage(imageId, {
            tl: { col: 0, row: startRow - 1 },
            br: { col: 1, row: photoEndRow },
            editAs: 'absolute'
          });
        } catch (e) {
          console.warn("[ExcelExport] Could not calculate image dimensions, using fallback.", e);
          sheet.addImage(imageId, {
            tl: { col: 0, row: startRow - 1 },
            ext: { width: 500, height: 400 },
            editAs: 'absolute'
          });
        }

        // キャプション配置（測点と備考を中央に）
        const visibleFields = getVisibleFields(template);
        const station = record.analysis?.station || '';
        const remarks = record.analysis?.remarks || '';

        // 測点行
        const stationCell = sheet.getCell(captionStartRow, 1);
        stationCell.value = station;
        stationCell.font = { bold: true, size: 14, color: { argb: 'FF333333' } };
        stationCell.alignment = { vertical: 'middle', horizontal: 'center' };

        // 備考行
        if (captionRowCount > 1) {
          const remarksCell = sheet.getCell(captionStartRow + 1, 1);
          remarksCell.value = remarks;
          remarksCell.font = { size: 11, color: { argb: 'FF555555' } };
          remarksCell.alignment = { vertical: 'top', horizontal: 'center', wrapText: true };

          // 残りの行をマージ
          if (captionRowCount > 2) {
            sheet.mergeCells(captionStartRow + 1, 1, endRow, 1);
          }
        }

      } else {
        // ========================================
        // 横レイアウト（写真左、キャプション右）
        // ========================================

        // --- 1. Image Section (Column A) - 余白行を除く ---
        const photoEndRow = endRow - 1;  // 余白行を除く
        sheet.mergeCells(startRow, 1, photoEndRow, 1);
        const imgCell = sheet.getCell(startRow, 1);
        imgCell.border = {
          top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } }
        };

        try {
          const { w: imgW, h: imgH } = await getImageDimensions(record.base64);
          console.log(`[ExcelExport] Image dimensions: ${imgW}x${imgH}, aspect: ${(imgW/imgH).toFixed(2)}`);

          // ボックスサイズ（px）- セルサイズから計算
          const boxWidthPx = COL_A_WIDTH * CONVERSION.PX_PER_EXCEL_COL;
          const boxHeightPx = rowsPerBlock * ROW_HEIGHT_PT * CONVERSION.PT_TO_PX;

          // スケール計算（セルサイズに合わせる、100%フィル）
          const scaleW = boxWidthPx / imgW;
          const scaleH = boxHeightPx / imgH;
          const scale = Math.min(scaleW, scaleH);

          const finalW = Math.round(imgW * scale);
          const finalH = Math.round(imgH * scale);

          console.log(`[ExcelExport] Box: ${boxWidthPx.toFixed(0)}x${boxHeightPx.toFixed(0)}px, Image: ${finalW}x${finalH}px`);

          // tl/br形式で写真行数分に配置（余白行は含まない）
          const photoRows = layout.photoRows;
          sheet.addImage(imageId, {
            tl: { col: 0, row: startRow - 1 },
            br: { col: 1, row: startRow - 1 + photoRows },
            editAs: 'absolute'
          });

        } catch (e) {
          console.warn("[ExcelExport] Could not calculate image dimensions, using fallback.", e);
          sheet.addImage(imageId, {
            tl: { col: 0.02, row: startRow - 1 + 0.1 },
            ext: { width: 400, height: 300 },
            editAs: 'absolute'
          });
        }

        // --- 2. Info Section (Columns B & C) ---
        const createField = (r: number, label: string, value: string, rowSpan: number) => {
          let finalRowSpan = rowSpan;
          if (isTwoUp) {
            // 2upモード（横レイアウトの場合）: station=2行, remarks=残り
            if (label === txt.labelStation) finalRowSpan = 2;
            if (label === txt.labelRemarks) finalRowSpan = rowsPerBlock - 2;
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

        // テンプレートから表示フィールドを取得
        const visibleFields = getVisibleFields(template);

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
      }

      currentRow = endRow + 1; // 次のブロックへ
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
