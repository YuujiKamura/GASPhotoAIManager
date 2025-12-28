import { AIAnalysisResult } from "../types";

// ============================================
// 寸法変換定数 (CSS px ⟷ Excel pt/units)
// ============================================

// 基準値: A4用紙 (210mm × 297mm) に合わせた設計
export const DIMENSION = {
  // --- 行高さ ---
  ROW_HEIGHT_PX: 28,              // CSS pixels (h-[28px])
  ROW_HEIGHT_PT: 21,              // Excel points (21pt = 28px @ 96dpi)

  // --- 変換係数 ---
  PX_TO_PT: 72 / 96,              // px → pt: px * 0.75
  PT_TO_PX: 96 / 72,              // pt → px: pt * 1.333

  // --- Excel列幅 ---
  // Excel列幅単位は「標準フォントの0の文字幅」基準
  // 近似式: pixels ≈ (units × 7) + 5
  PIXELS_PER_COL_UNIT: 7.1,
  COL_OFFSET_PX: 5,

  // --- ラベル列幅 ---
  LABEL_WIDTH_PX: 48,             // CSS: w-12 = 3rem = 48px
  LABEL_WIDTH_EXCEL: 8,           // Excel: (48-5)/7 ≈ 6.1 → 8 (余裕込み)

  // --- レイアウト比率 (3-up) ---
  IMAGE_RATIO: 0.65,              // 画像部分 65%
  INFO_RATIO: 0.35,               // 情報部分 35%
} as const;

// 変換ヘルパー関数
export const pxToPt = (px: number): number => Math.round(px * DIMENSION.PX_TO_PT);
export const ptToPx = (pt: number): number => Math.round(pt * DIMENSION.PT_TO_PX);
export const pxToExcelWidth = (px: number): number =>
  Math.round((px - DIMENSION.COL_OFFSET_PX) / DIMENSION.PIXELS_PER_COL_UNIT);
export const excelWidthToPx = (units: number): number =>
  Math.round(units * DIMENSION.PIXELS_PER_COL_UNIT + DIMENSION.COL_OFFSET_PX);

// ============================================
// フィールド定義
// ============================================

export interface FieldDefinition {
  id: string; // Unique ID for key mapping
  key: keyof AIAnalysisResult | 'date'; // Data key
  labelKey: string; // Translation key in TRANS
  rowSpan: number; // Height weight (1 unit = ROW_HEIGHT_PX)
  heightClass: string; // Tailwind class for Web View
  multiline: boolean; // Textarea vs Input
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
    heightClass: 'h-[56px]', // 2 rows * 28px = 56px
    multiline: true 
  },
  {
    id: 'f_measurements',
    key: 'measurements',
    labelKey: 'labelMeasurements',
    rowSpan: 3,
    heightClass: 'flex-1', // Takes remaining space (was description's role)
    multiline: true
  }
];

export const ROWS_PER_PHOTO = 12;