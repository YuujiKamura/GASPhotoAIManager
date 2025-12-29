import { AIAnalysisResult } from "../types";

// ============================================
// PDF基準レイアウト（Source of Truth）
// ============================================
// PDFのpt単位で定義し、ExcelやCSSの値は計算で導出する

export const PDF_LAYOUT = {
  // A4サイズ (pt) - 1pt = 1/72 inch
  PAGE_WIDTH: 595.28,
  PAGE_HEIGHT: 841.89,

  // マージン (pt)
  MARGIN: 20,
  HEADER_HEIGHT: 40,
  GAP: 5,

  // 列幅比率（合計95%、5%は隙間）
  PHOTO_WIDTH_RATIO: 0.45,   // 画像エリア 45%
  INFO_WIDTH_RATIO: 0.50,    // 情報エリア 50%
} as const;

// ============================================
// 計算された寸法値
// ============================================

// 利用可能領域 (pt)
const USABLE_WIDTH = PDF_LAYOUT.PAGE_WIDTH - PDF_LAYOUT.MARGIN * 2;   // 555.28pt
const USABLE_HEIGHT = PDF_LAYOUT.PAGE_HEIGHT - PDF_LAYOUT.MARGIN * 2 - PDF_LAYOUT.HEADER_HEIGHT; // 761.89pt

// 1写真ブロックあたりの高さ (pt)
const BLOCK_HEIGHT_3UP = USABLE_HEIGHT / 3;  // 253.96pt
const BLOCK_HEIGHT_2UP = USABLE_HEIGHT / 2;  // 380.95pt

// 列幅 (pt)
const PHOTO_WIDTH_PT = USABLE_WIDTH * PDF_LAYOUT.PHOTO_WIDTH_RATIO;  // 249.88pt
const INFO_WIDTH_PT = USABLE_WIDTH * PDF_LAYOUT.INFO_WIDTH_RATIO;    // 277.64pt

// ============================================
// 変換係数
// ============================================

export const CONVERSION = {
  // pt ⟷ px (96dpi基準)
  PT_TO_PX: 96 / 72,        // 1pt = 1.333px
  PX_TO_PT: 72 / 96,        // 1px = 0.75pt

  // Excel列幅: 1単位 ≈ 7.1px ≈ 5.3pt
  PT_PER_EXCEL_COL: 5.3,
  PX_PER_EXCEL_COL: 7.1,
  EXCEL_COL_OFFSET_PX: 5,

  // Excel行高さ: 直接pt指定可能
  // (ただしExcelの行高さはptで指定できる)
} as const;

// ============================================
// Excel用に導出された値
// ============================================

// 行の設計
const ROWS_3UP = 12;  // 3枚貼り時の1ブロック行数
const ROWS_2UP = 18;  // 2枚貼り時の1ブロック行数

// 行高さ (pt) = ブロック高さ ÷ 行数
const ROW_HEIGHT_PT_3UP = Math.round(BLOCK_HEIGHT_3UP / ROWS_3UP);  // 21pt
const ROW_HEIGHT_PT_2UP = Math.round(BLOCK_HEIGHT_2UP / ROWS_2UP);  // 21pt

// 列幅 (Excel単位) = pt ÷ 変換係数
const PHOTO_COL_WIDTH = Math.round(PHOTO_WIDTH_PT / CONVERSION.PT_PER_EXCEL_COL);  // 47
const INFO_COL_WIDTH = Math.round(INFO_WIDTH_PT / CONVERSION.PT_PER_EXCEL_COL);    // 52

// ラベル列とバリュー列の分割（情報エリア内）
const LABEL_COL_WIDTH = 8;   // 固定幅
const VALUE_COL_WIDTH = INFO_COL_WIDTH - LABEL_COL_WIDTH;  // 44

// ============================================
// エクスポート用定数（PDF/Excel/CSS共通で使用）
// ============================================

export const DIMENSION = {
  // --- PDFソース値 ---
  PDF_PAGE_WIDTH: PDF_LAYOUT.PAGE_WIDTH,
  PDF_PAGE_HEIGHT: PDF_LAYOUT.PAGE_HEIGHT,
  PDF_MARGIN: PDF_LAYOUT.MARGIN,
  PDF_HEADER_HEIGHT: PDF_LAYOUT.HEADER_HEIGHT,
  PDF_GAP: PDF_LAYOUT.GAP,
  PDF_PHOTO_WIDTH_RATIO: PDF_LAYOUT.PHOTO_WIDTH_RATIO,
  PDF_INFO_WIDTH_RATIO: PDF_LAYOUT.INFO_WIDTH_RATIO,

  // --- 計算済みPDF値 (pt) ---
  USABLE_WIDTH_PT: USABLE_WIDTH,
  USABLE_HEIGHT_PT: USABLE_HEIGHT,
  BLOCK_HEIGHT_3UP_PT: BLOCK_HEIGHT_3UP,
  BLOCK_HEIGHT_2UP_PT: BLOCK_HEIGHT_2UP,
  PHOTO_WIDTH_PT: PHOTO_WIDTH_PT,
  INFO_WIDTH_PT: INFO_WIDTH_PT,

  // --- Excel用導出値 ---
  ROW_HEIGHT_PT: ROW_HEIGHT_PT_3UP,           // 21pt (3up/2up共通)
  ROWS_PER_BLOCK_3UP: ROWS_3UP,               // 12行
  ROWS_PER_BLOCK_2UP: ROWS_2UP,               // 18行
  COL_A_WIDTH: PHOTO_COL_WIDTH,               // 47 (画像列)
  COL_B_WIDTH: LABEL_COL_WIDTH,               // 8 (ラベル列)
  COL_C_WIDTH: VALUE_COL_WIDTH,               // 44 (値列)

  // --- CSS/Web用導出値 (px) ---
  ROW_HEIGHT_PX: Math.round(ROW_HEIGHT_PT_3UP * CONVERSION.PT_TO_PX),  // 28px

  // --- 変換係数 ---
  PT_TO_PX: CONVERSION.PT_TO_PX,
  PX_TO_PT: CONVERSION.PX_TO_PT,
  PIXELS_PER_COL_UNIT: CONVERSION.PX_PER_EXCEL_COL,
  PT_PER_COL_UNIT: CONVERSION.PT_PER_EXCEL_COL,

  // --- 後方互換性 ---
  LABEL_WIDTH_EXCEL: LABEL_COL_WIDTH,
  IMAGE_RATIO: PDF_LAYOUT.PHOTO_WIDTH_RATIO / (PDF_LAYOUT.PHOTO_WIDTH_RATIO + PDF_LAYOUT.INFO_WIDTH_RATIO),
  INFO_RATIO: PDF_LAYOUT.INFO_WIDTH_RATIO / (PDF_LAYOUT.PHOTO_WIDTH_RATIO + PDF_LAYOUT.INFO_WIDTH_RATIO),
} as const;

// 後方互換性のためのエイリアス
export const ROWS_PER_PHOTO = DIMENSION.ROWS_PER_BLOCK_3UP;

// ============================================
// 変換ヘルパー関数
// ============================================

export const pxToPt = (px: number): number => Math.round(px * CONVERSION.PX_TO_PT);
export const ptToPx = (pt: number): number => Math.round(pt * CONVERSION.PT_TO_PX);
export const ptToExcelCol = (pt: number): number => Math.round(pt / CONVERSION.PT_PER_EXCEL_COL);
export const excelColToPt = (units: number): number => Math.round(units * CONVERSION.PT_PER_EXCEL_COL);
export const pxToExcelWidth = (px: number): number =>
  Math.round((px - CONVERSION.EXCEL_COL_OFFSET_PX) / CONVERSION.PX_PER_EXCEL_COL);
export const excelWidthToPx = (units: number): number =>
  Math.round(units * CONVERSION.PX_PER_EXCEL_COL + CONVERSION.EXCEL_COL_OFFSET_PX);

// ============================================
// レイアウト取得関数
// ============================================

export interface LayoutConfig {
  rowsPerBlock: number;
  rowHeightPt: number;
  colAWidth: number;
  colBWidth: number;
  colCWidth: number;
  photoWidthPt: number;
  photoHeightPt: number;
  infoWidthPt: number;
}

export const getLayoutConfig = (photosPerPage: 2 | 3): LayoutConfig => {
  const rowsPerBlock = photosPerPage === 2 ? DIMENSION.ROWS_PER_BLOCK_2UP : DIMENSION.ROWS_PER_BLOCK_3UP;
  const blockHeightPt = photosPerPage === 2 ? DIMENSION.BLOCK_HEIGHT_2UP_PT : DIMENSION.BLOCK_HEIGHT_3UP_PT;

  return {
    rowsPerBlock,
    rowHeightPt: DIMENSION.ROW_HEIGHT_PT,
    colAWidth: photosPerPage === 2 ? 60 : DIMENSION.COL_A_WIDTH,  // 2upは画像を大きく
    colBWidth: DIMENSION.COL_B_WIDTH,
    colCWidth: photosPerPage === 2 ? 35 : DIMENSION.COL_C_WIDTH,
    photoWidthPt: DIMENSION.PHOTO_WIDTH_PT,
    photoHeightPt: blockHeightPt - PDF_LAYOUT.GAP * 2,
    infoWidthPt: DIMENSION.INFO_WIDTH_PT,
  };
};

// ============================================
// フィールド定義
// ============================================

export interface FieldDefinition {
  id: string;
  key: keyof AIAnalysisResult | 'date';
  labelKey: string;
  rowSpan: number;
  heightClass: string;
  multiline: boolean;
  readOnly?: boolean;
}

/**
 * SHARED LAYOUT DEFINITION
 * Total Rows: 12 (Standard block size for 3-up on A4)
 * Base Row Height: ~28px (21pt in Excel)
 */
export const LAYOUT_FIELDS: FieldDefinition[] = [
  {
    id: 'f_date',
    key: 'date',
    labelKey: 'labelDate',
    rowSpan: 1,
    heightClass: 'h-[28px]',
    multiline: false,
    readOnly: true
  },
  {
    id: 'f_workType',
    key: 'workType',
    labelKey: 'labelWorkType',
    rowSpan: 1,
    heightClass: 'h-[28px]',
    multiline: false
  },
  {
    id: 'f_variety',
    key: 'variety',
    labelKey: 'labelVariety',
    rowSpan: 1,
    heightClass: 'h-[28px]',
    multiline: false
  },
  {
    id: 'f_detail',
    key: 'detail',
    labelKey: 'labelDetail',
    rowSpan: 1,
    heightClass: 'h-[28px]',
    multiline: false
  },
  {
    id: 'f_station',
    key: 'station',
    labelKey: 'labelStation',
    rowSpan: 1,
    heightClass: 'h-[28px]',
    multiline: false
  },
  {
    id: 'f_remarks',
    key: 'remarks',
    labelKey: 'labelRemarks',
    rowSpan: 2,
    heightClass: 'h-[56px]',
    multiline: true
  },
  {
    id: 'f_measurements',
    key: 'measurements',
    labelKey: 'labelMeasurements',
    rowSpan: 3,
    heightClass: 'flex-1',
    multiline: true
  }
];
