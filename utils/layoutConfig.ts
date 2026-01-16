import { AIAnalysisResult } from "../types";

// ============================================
// mm基準レイアウト（Source of Truth）
// ============================================
// プレビュー(65%/35%)を基準にmm換算

// A4サイズ
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

// 余白設定
const MARGIN_MM = 10;        // 上下左右
const PHOTO_GAP_MM = 10;     // 画像間

// プレビュー比率（これが正）
const IMAGE_RATIO = 0.65;
const INFO_RATIO = 0.35;

// 利用可能幅から写真/情報幅を計算
const USABLE_WIDTH_MM = A4_WIDTH_MM - MARGIN_MM * 2;  // 190mm
const PHOTO_WIDTH_MM = USABLE_WIDTH_MM * IMAGE_RATIO;  // 123.5mm
const INFO_WIDTH_MM = USABLE_WIDTH_MM * INFO_RATIO;    // 66.5mm

// 写真高さ: 3枚配置から計算
const PHOTO_HEIGHT_MM = (A4_HEIGHT_MM - MARGIN_MM * 2 - PHOTO_GAP_MM * 2) / 3;  // 85.67mm

// mm → pt変換 (1mm = 2.835pt)
const MM_TO_PT = 2.835;

export const PDF_LAYOUT = {
  // A4サイズ (pt)
  PAGE_WIDTH: A4_WIDTH_MM * MM_TO_PT,   // 595.35pt
  PAGE_HEIGHT: A4_HEIGHT_MM * MM_TO_PT, // 842.0pt

  // マージン (pt)
  MARGIN: MARGIN_MM * MM_TO_PT,         // 28.35pt
  HEADER_HEIGHT: 0,                      // ヘッダーなし
  GAP: PHOTO_GAP_MM * MM_TO_PT,         // 28.35pt

  // 写真サイズ (mm)
  PHOTO_WIDTH_MM,   // 114.2mm
  PHOTO_HEIGHT_MM,  // 85.67mm
  INFO_WIDTH_MM,    // 75.8mm
} as const;

// ============================================
// 計算された寸法値 (pt)
// ============================================

const PHOTO_WIDTH_PT = PHOTO_WIDTH_MM * MM_TO_PT;   // 323.7pt
const PHOTO_HEIGHT_PT = PHOTO_HEIGHT_MM * MM_TO_PT; // 242.9pt
const INFO_WIDTH_PT = INFO_WIDTH_MM * MM_TO_PT;     // 214.9pt

// ブロック高さ（写真 + 間余白）
const BLOCK_HEIGHT_3UP = PHOTO_HEIGHT_PT + PDF_LAYOUT.GAP;  // 271.25pt
const BLOCK_HEIGHT_2UP = PHOTO_HEIGHT_PT * 1.5;             // 2upは別計算

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

// 全体スケール (1.0 = ベースサイズ)
const SCALE = 1.1;

// 行の設計（写真高さ242.9ptを10行 + 余白1行）
const PHOTO_ROWS = 10;  // 写真部分の行数
const GAP_ROWS = 1;     // 余白行数
const ROWS_3UP = PHOTO_ROWS + GAP_ROWS;  // 11行/ブロック
const ROWS_2UP = PHOTO_ROWS + GAP_ROWS;  // 2upも同様

// 行高さ (pt) = 写真高さ ÷ 写真行数 × SCALE (切り捨て)
const ROW_HEIGHT_PT_3UP = Math.floor((PHOTO_HEIGHT_PT / PHOTO_ROWS) * SCALE);  // 26pt
const ROW_HEIGHT_PT_2UP = Math.floor((PHOTO_HEIGHT_PT / PHOTO_ROWS) * SCALE);  // 26pt

// 列幅 (Excel単位) - 実測値で調整
const PHOTO_COL_WIDTH = 56.1;  // アスペクト比に合わせて調整
const LABEL_COL_WIDTH = 10 * SCALE;     // 11
const VALUE_COL_WIDTH = 26 * SCALE;     // 28.6
const INFO_COL_WIDTH = LABEL_COL_WIDTH + VALUE_COL_WIDTH;  // 39.6

// ============================================
// エクスポート用定数（PDF/Excel/CSS共通で使用）
// ============================================

export const DIMENSION = {
  // --- mm基準値 ---
  PHOTO_WIDTH_MM: PDF_LAYOUT.PHOTO_WIDTH_MM,   // 114.2mm
  PHOTO_HEIGHT_MM: PDF_LAYOUT.PHOTO_HEIGHT_MM, // 85.67mm
  INFO_WIDTH_MM: PDF_LAYOUT.INFO_WIDTH_MM,     // 75.8mm
  MARGIN_MM: MARGIN_MM,                        // 10mm
  GAP_MM: PHOTO_GAP_MM,                        // 10mm

  // --- pt値 ---
  PDF_PAGE_WIDTH: PDF_LAYOUT.PAGE_WIDTH,
  PDF_PAGE_HEIGHT: PDF_LAYOUT.PAGE_HEIGHT,
  PDF_MARGIN: PDF_LAYOUT.MARGIN,
  PDF_GAP: PDF_LAYOUT.GAP,
  BLOCK_HEIGHT_3UP_PT: BLOCK_HEIGHT_3UP,
  BLOCK_HEIGHT_2UP_PT: BLOCK_HEIGHT_2UP,
  PHOTO_WIDTH_PT: PHOTO_WIDTH_PT,
  PHOTO_HEIGHT_PT: PHOTO_HEIGHT_PT,
  INFO_WIDTH_PT: INFO_WIDTH_PT,

  // --- Excel用導出値 ---
  ROW_HEIGHT_PT: ROW_HEIGHT_PT_3UP,           // 24pt
  PHOTO_ROWS: PHOTO_ROWS,                     // 10行 (写真部分)
  GAP_ROWS: GAP_ROWS,                         // 1行 (余白部分)
  ROWS_PER_BLOCK_3UP: ROWS_3UP,               // 11行 (写真+余白)
  ROWS_PER_BLOCK_2UP: ROWS_2UP,               // 11行
  COL_A_WIDTH: PHOTO_COL_WIDTH,               // 61 (画像列)
  COL_B_WIDTH: LABEL_COL_WIDTH,               // 8 (ラベル列)
  COL_C_WIDTH: VALUE_COL_WIDTH,               // 33 (値列)

  // --- CSS/Web用導出値 (px) ---
  ROW_HEIGHT_PX: Math.round(ROW_HEIGHT_PT_3UP * CONVERSION.PT_TO_PX),  // 32px

  // --- 変換係数 ---
  PT_TO_PX: CONVERSION.PT_TO_PX,
  PX_TO_PT: CONVERSION.PX_TO_PT,
  PIXELS_PER_COL_UNIT: CONVERSION.PX_PER_EXCEL_COL,
  PT_PER_COL_UNIT: CONVERSION.PT_PER_EXCEL_COL,

  // --- 後方互換性 ---
  LABEL_WIDTH_EXCEL: LABEL_COL_WIDTH,
  IMAGE_RATIO,  // 0.65
  INFO_RATIO,   // 0.35
} as const;

// 後方互換性のためのエイリアス
export const ROWS_PER_PHOTO = DIMENSION.ROWS_PER_BLOCK_3UP;

// ============================================
// 変換ヘルパー関数
// ============================================

export const pxToPt = (px: number): number => Math.round(px * CONVERSION.PX_TO_PT);
export const ptToPx = (pt: number): number => Math.round(pt * CONVERSION.PT_TO_PX);
const ptToExcelCol = (pt: number): number => Math.round(pt / CONVERSION.PT_PER_EXCEL_COL);
const excelColToPt = (units: number): number => Math.round(units * CONVERSION.PT_PER_EXCEL_COL);
export const pxToExcelWidth = (px: number): number =>
  Math.round((px - CONVERSION.EXCEL_COL_OFFSET_PX) / CONVERSION.PX_PER_EXCEL_COL);
export const excelWidthToPx = (units: number): number =>
  Math.round(units * CONVERSION.PX_PER_EXCEL_COL + CONVERSION.EXCEL_COL_OFFSET_PX);

// ============================================
// プレビュー用レイアウト取得関数
// ============================================

export interface PreviewLayout {
  imageWidthPercent: number;  // 65
  infoWidthPercent: number;   // 35
  pageHeightMm: number;       // 297
}

export const getPreviewLayout = (): PreviewLayout => ({
  imageWidthPercent: IMAGE_RATIO * 100,  // 65
  infoWidthPercent: INFO_RATIO * 100,    // 35
  pageHeightMm: A4_HEIGHT_MM,            // 297
});

// ============================================
// PDF用レイアウト取得関数
// ============================================

export interface PdfLayout {
  pageWidth: number;      // pt
  pageHeight: number;     // pt
  margin: number;         // pt
  headerHeight: number;   // pt
  gap: number;            // pt
  imageRatio: number;     // 0.65
  infoRatio: number;      // 0.35
}

export const getPdfLayout = (): PdfLayout => ({
  pageWidth: PDF_LAYOUT.PAGE_WIDTH,
  pageHeight: PDF_LAYOUT.PAGE_HEIGHT,
  margin: MARGIN_MM * MM_TO_PT,  // 28.35pt
  headerHeight: 40,               // ヘッダー高さ (pt)
  gap: 5,                         // 写真間ギャップ (pt)
  imageRatio: IMAGE_RATIO,        // 0.65
  infoRatio: INFO_RATIO,          // 0.35
});

// ============================================
// Excel用レイアウト取得関数
// ============================================

export interface LayoutConfig {
  rowsPerBlock: number;
  photoRows: number;
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

  return {
    rowsPerBlock,
    photoRows: DIMENSION.PHOTO_ROWS,    // 10 (写真部分のみ)
    rowHeightPt: DIMENSION.ROW_HEIGHT_PT,
    colAWidth: DIMENSION.COL_A_WIDTH,   // 61
    colBWidth: DIMENSION.COL_B_WIDTH,   // 8
    colCWidth: DIMENSION.COL_C_WIDTH,   // 33
    photoWidthPt: DIMENSION.PHOTO_WIDTH_PT,
    photoHeightPt: DIMENSION.PHOTO_HEIGHT_PT,
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
