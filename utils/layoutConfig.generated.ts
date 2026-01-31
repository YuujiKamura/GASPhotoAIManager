// ============================================
// AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY
// Generated from: shared/layout-config/layout-config.json
// Version: 1.0.0
// Generated at: 2026-01-31T10:48:30.041Z
// ============================================

import {
  AIAnalysisResult,
  TemplateLayout,
  CaptionPosition,
  BlockLayoutMode,
  getBlockLayoutMode,
  isCaptionFirst
} from "../types";

// ============================================
// mm基準レイアウト（Source of Truth）
// ============================================

// A4サイズ
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

// 余白設定
const MARGIN_MM = 10;
const PHOTO_GAP_MM = 10;

// プレビュー比率
const IMAGE_RATIO = 0.65;
const INFO_RATIO = 0.35;

// 利用可能幅から写真/情報幅を計算
const USABLE_WIDTH_MM = A4_WIDTH_MM - MARGIN_MM * 2;  // 190mm
const PHOTO_WIDTH_MM = USABLE_WIDTH_MM * IMAGE_RATIO;  // 123.5mm
const INFO_WIDTH_MM = USABLE_WIDTH_MM * INFO_RATIO;    // 66.5mm

// 写真高さ: 3枚配置から計算
const PHOTO_HEIGHT_MM = (A4_HEIGHT_MM - MARGIN_MM * 2 - PHOTO_GAP_MM * 2) / 3;  // 85.67mm

// mm → pt変換 (1mm = 72/25.4 pt)
const MM_TO_PT = 2.8346456693;

export const PDF_LAYOUT = {
  PAGE_WIDTH: A4_WIDTH_MM * MM_TO_PT,   // 595.28pt
  PAGE_HEIGHT: A4_HEIGHT_MM * MM_TO_PT, // 841.89pt
  MARGIN: MARGIN_MM * MM_TO_PT,         // 28.35pt
  HEADER_HEIGHT: 0,
  GAP: PHOTO_GAP_MM * MM_TO_PT,         // 28.35pt
  PHOTO_WIDTH_MM,
  PHOTO_HEIGHT_MM,
  INFO_WIDTH_MM,
} as const;

// ============================================
// 計算された寸法値 (pt)
// ============================================

const PHOTO_WIDTH_PT = PHOTO_WIDTH_MM * MM_TO_PT;   // 350.1pt
const PHOTO_HEIGHT_PT = PHOTO_HEIGHT_MM * MM_TO_PT; // 242.8pt
const INFO_WIDTH_PT = INFO_WIDTH_MM * MM_TO_PT;     // 188.5pt

const BLOCK_HEIGHT_3UP = PHOTO_HEIGHT_PT + PDF_LAYOUT.GAP;  // 271.18pt
const BLOCK_HEIGHT_2UP = PHOTO_HEIGHT_PT * 1.5;             // 364.25pt

// ============================================
// 変換係数
// ============================================

export const CONVERSION = {
  PT_TO_PX: 1.3333333333,        // 1pt = 1.3333333333px
  PX_TO_PT: 0.75,        // 1px = 0.75pt
  PT_PER_EXCEL_COL: 5.3,
  PX_PER_EXCEL_COL: 7.1,
  EXCEL_COL_OFFSET_PX: 5,
} as const;

// ============================================
// Excel用に導出された値
// ============================================

const SCALE = 1.1;
const PHOTO_ROWS_3UP = 10;
const GAP_ROWS = 1;
const ROWS_3UP = 11;
const PHOTO_ROWS_2UP = 16;
const ROWS_2UP = 17;

const ROW_HEIGHT_PT_3UP = 26;
const ROW_HEIGHT_PT_2UP = 26;

const PHOTO_COL_WIDTH = 56.1;
const LABEL_COL_WIDTH = 11;
const VALUE_COL_WIDTH = 28.6;
const INFO_COL_WIDTH = 39.6;

// ============================================
// エクスポート用定数（PDF/Excel/CSS共通で使用）
// ============================================

export const DIMENSION = {
  // --- mm基準値 ---
  PHOTO_WIDTH_MM: PDF_LAYOUT.PHOTO_WIDTH_MM,
  PHOTO_HEIGHT_MM: PDF_LAYOUT.PHOTO_HEIGHT_MM,
  INFO_WIDTH_MM: PDF_LAYOUT.INFO_WIDTH_MM,
  MARGIN_MM: MARGIN_MM,
  GAP_MM: PHOTO_GAP_MM,

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
  ROW_HEIGHT_PT: ROW_HEIGHT_PT_3UP,
  PHOTO_ROWS: PHOTO_ROWS_3UP,
  PHOTO_ROWS_2UP: PHOTO_ROWS_2UP,
  GAP_ROWS: GAP_ROWS,
  ROWS_PER_BLOCK_3UP: ROWS_3UP,
  ROWS_PER_BLOCK_2UP: ROWS_2UP,
  COL_A_WIDTH: PHOTO_COL_WIDTH,
  COL_B_WIDTH: LABEL_COL_WIDTH,
  COL_C_WIDTH: VALUE_COL_WIDTH,

  // --- CSS/Web用導出値 (px) ---
  ROW_HEIGHT_PX: Math.round(ROW_HEIGHT_PT_3UP * CONVERSION.PT_TO_PX),

  // --- 変換係数 ---
  PT_TO_PX: CONVERSION.PT_TO_PX,
  PX_TO_PT: CONVERSION.PX_TO_PT,
  PIXELS_PER_COL_UNIT: CONVERSION.PX_PER_EXCEL_COL,
  PT_PER_COL_UNIT: CONVERSION.PT_PER_EXCEL_COL,

  // --- 後方互換性 ---
  LABEL_WIDTH_EXCEL: LABEL_COL_WIDTH,
  IMAGE_RATIO,
  INFO_RATIO,
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
  imageWidthPercent: number;
  infoWidthPercent: number;
  pageHeightMm: number;
}

export const getPreviewLayout = (): PreviewLayout => ({
  imageWidthPercent: IMAGE_RATIO * 100,
  infoWidthPercent: INFO_RATIO * 100,
  pageHeightMm: A4_HEIGHT_MM,
});

// ============================================
// PDF用レイアウト取得関数
// ============================================

export interface PdfLayout {
  pageWidth: number;
  pageHeight: number;
  margin: number;
  headerHeight: number;
  gap: number;
  imageRatio: number;
  infoRatio: number;
}

export const getPdfLayout = (): PdfLayout => ({
  pageWidth: PDF_LAYOUT.PAGE_WIDTH,
  pageHeight: PDF_LAYOUT.PAGE_HEIGHT,
  margin: MARGIN_MM * MM_TO_PT,
  headerHeight: 0,
  gap: 5,
  imageRatio: IMAGE_RATIO,
  infoRatio: INFO_RATIO,
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
  const isTwoUp = photosPerPage === 2;
  const rowsPerBlock = isTwoUp ? DIMENSION.ROWS_PER_BLOCK_2UP : DIMENSION.ROWS_PER_BLOCK_3UP;
  const photoRows = isTwoUp ? DIMENSION.PHOTO_ROWS_2UP : DIMENSION.PHOTO_ROWS;

  return {
    rowsPerBlock,
    photoRows,
    rowHeightPt: DIMENSION.ROW_HEIGHT_PT,
    colAWidth: DIMENSION.COL_A_WIDTH,
    colBWidth: DIMENSION.COL_B_WIDTH,
    colCWidth: DIMENSION.COL_C_WIDTH,
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

export const LAYOUT_FIELDS: FieldDefinition[] = [
  {
    id: "f_date",
    key: "date",
    labelKey: "labelDate",
    rowSpan: 1,
    heightClass: "h-[28px]",
    multiline: false,
    readOnly: true
  },
  {
    id: "f_photoCategory",
    key: "photoCategory",
    labelKey: "labelPhotoCategory",
    rowSpan: 1,
    heightClass: "h-[28px]",
    multiline: false,
    readOnly: false
  },
  {
    id: "f_workType",
    key: "workType",
    labelKey: "labelWorkType",
    rowSpan: 1,
    heightClass: "h-[28px]",
    multiline: false,
    readOnly: false
  },
  {
    id: "f_variety",
    key: "variety",
    labelKey: "labelVariety",
    rowSpan: 1,
    heightClass: "h-[28px]",
    multiline: false,
    readOnly: false
  },
  {
    id: "f_detail",
    key: "detail",
    labelKey: "labelDetail",
    rowSpan: 1,
    heightClass: "h-[28px]",
    multiline: false,
    readOnly: false
  },
  {
    id: "f_station",
    key: "station",
    labelKey: "labelStation",
    rowSpan: 1,
    heightClass: "h-[28px]",
    multiline: false,
    readOnly: false
  },
  {
    id: "f_remarks",
    key: "remarks",
    labelKey: "labelRemarks",
    rowSpan: 2,
    heightClass: "h-[56px]",
    multiline: true,
    readOnly: false
  },
  {
    id: "f_measurements",
    key: "measurements",
    labelKey: "labelMeasurements",
    rowSpan: 3,
    heightClass: "flex-1",
    multiline: true,
    readOnly: false
  }
];

// ============================================
// フィールドラベル定義（PDF/Excel共通）
// ============================================

export const FIELD_LABELS = {
  "date": "日時",
  "category": "区分",
  "photoCategory": "区分",
  "workType": "工種",
  "variety": "種別",
  "detail": "細別",
  "station": "測点",
  "remarks": "備考",
  "measurements": "測定値",
  "labelDate": "日時",
  "labelPhotoCategory": "区分",
  "labelWorkType": "工種",
  "labelVariety": "種別",
  "labelDetail": "細別",
  "labelStation": "測点",
  "labelRemarks": "備考",
  "labelMeasurements": "測定値"
} as const;

// ============================================
// 日時フォーマット設定
// ============================================

export const DATE_FORMAT = {
  includeTime: true,
  locale: 'ja-JP',
  options: {
      "year": "numeric",
      "month": "2-digit",
      "day": "2-digit",
      "hour": "2-digit",
      "minute": "2-digit"
  },
} as const;

export function formatDateTime(timestamp: number | undefined): string {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString(
    DATE_FORMAT.locale,
    DATE_FORMAT.options as Intl.DateTimeFormatOptions
  );
}

// ============================================
// ビルトインテンプレート定義
// ============================================

const TEMPLATE_3UP_RIGHT: TemplateLayout = {
  id: 'standard-3up',
  name: '標準（3枚/ページ）',
  blocksPerPage: 3,
  captionPosition: 'right' as CaptionPosition,
  pageWidthMm: A4_WIDTH_MM,
  pageHeightMm: A4_HEIGHT_MM,
  marginMm: MARGIN_MM,
  blockGapMm: PHOTO_GAP_MM,
  photoRatio: 65,
  captionRatio: 35,
  rowsPerBlock: ROWS_3UP,
  photoRows: PHOTO_ROWS_3UP,
  rowHeightPt: ROW_HEIGHT_PT_3UP,
  columnWidths: {
    imageCol: PHOTO_COL_WIDTH,
    labelCol: LABEL_COL_WIDTH,
    valueCol: VALUE_COL_WIDTH,
  },
  visibleFields: ["f_date","f_photoCategory","f_workType","f_variety","f_detail","f_station","f_remarks","f_measurements"],
  isDefault: true,
  photosPerPage: 3,
  photoWidthPercent: 65,
  infoWidthPercent: 35,
  photoGapMm: PHOTO_GAP_MM,
};

const TEMPLATE_2UP_BOTTOM: TemplateLayout = {
  id: 'simple-2up',
  name: 'シンプル（2枚/ページ）',
  blocksPerPage: 2,
  captionPosition: 'bottom' as CaptionPosition,
  pageWidthMm: A4_WIDTH_MM,
  pageHeightMm: A4_HEIGHT_MM,
  marginMm: MARGIN_MM,
  blockGapMm: PHOTO_GAP_MM,
  photoRatio: 85,
  captionRatio: 15,
  rowsPerBlock: ROWS_2UP,
  photoRows: PHOTO_ROWS_2UP,
  rowHeightPt: ROW_HEIGHT_PT_2UP,
  columnWidths: {
    imageCol: PHOTO_COL_WIDTH,
    labelCol: LABEL_COL_WIDTH,
    valueCol: VALUE_COL_WIDTH,
  },
  visibleFields: ["f_station","f_remarks"],
  isDefault: false,
  photosPerPage: 2,
  photoWidthPercent: 100,
  infoWidthPercent: 0,
  photoGapMm: PHOTO_GAP_MM,
};

export const BUILT_IN_TEMPLATES: Record<string, TemplateLayout> = {
  'standard-3up': TEMPLATE_3UP_RIGHT,
  'simple-2up': TEMPLATE_2UP_BOTTOM,
};

// ============================================
// ブロック寸法計算
// ============================================

export interface BlockDimensions {
  photoWidthPt: number;
  photoHeightPt: number;
  captionWidthPt: number;
  captionHeightPt: number;
  mode: BlockLayoutMode;
  captionFirst: boolean;
  photoOffset: { x: number; y: number };
  captionOffset: { x: number; y: number };
}

export const calculateBlockDimensions = (
  template: TemplateLayout,
  blockWidthPt: number,
  blockHeightPt: number,
  gapPt: number = 5
): BlockDimensions => {
  const mode = getBlockLayoutMode(template.captionPosition);
  const captionFirst = isCaptionFirst(template.captionPosition);

  let photoWidthPt: number;
  let photoHeightPt: number;
  let captionWidthPt: number;
  let captionHeightPt: number;
  let photoOffset: { x: number; y: number };
  let captionOffset: { x: number; y: number };

  if (mode === 'horizontal') {
    const availableWidth = blockWidthPt - gapPt;
    photoWidthPt = availableWidth * (template.photoRatio / 100);
    captionWidthPt = availableWidth * (template.captionRatio / 100);
    photoHeightPt = blockHeightPt;
    captionHeightPt = blockHeightPt;

    if (captionFirst) {
      captionOffset = { x: 0, y: 0 };
      photoOffset = { x: captionWidthPt + gapPt, y: 0 };
    } else {
      photoOffset = { x: 0, y: 0 };
      captionOffset = { x: photoWidthPt + gapPt, y: 0 };
    }
  } else {
    const availableHeight = blockHeightPt - gapPt;
    photoWidthPt = blockWidthPt;
    captionWidthPt = blockWidthPt;
    photoHeightPt = availableHeight * (template.photoRatio / 100);
    captionHeightPt = availableHeight * (template.captionRatio / 100);

    if (captionFirst) {
      captionOffset = { x: 0, y: 0 };
      photoOffset = { x: 0, y: captionHeightPt + gapPt };
    } else {
      photoOffset = { x: 0, y: 0 };
      captionOffset = { x: 0, y: photoHeightPt + gapPt };
    }
  }

  return {
    photoWidthPt,
    photoHeightPt,
    captionWidthPt,
    captionHeightPt,
    mode,
    captionFirst,
    photoOffset,
    captionOffset,
  };
};

// ============================================
// テンプレート取得関数
// ============================================

export const getTemplateLayout = (photosPerPage: 2 | 3): TemplateLayout => {
  return photosPerPage === 2 ? TEMPLATE_2UP_BOTTOM : TEMPLATE_3UP_RIGHT;
};

export const getTemplateById = (templateId: string): TemplateLayout | undefined => {
  return BUILT_IN_TEMPLATES[templateId];
};

export const getAllTemplates = (): TemplateLayout[] => {
  return Object.values(BUILT_IN_TEMPLATES);
};

export const getDefaultTemplateId = (): string => {
  return 'standard-3up';
};

export const getVisibleFields = (template: TemplateLayout): FieldDefinition[] => {
  return LAYOUT_FIELDS.filter(field => template.visibleFields.includes(field.id));
};

// Re-export for convenience
export { getBlockLayoutMode, isCaptionFirst };
