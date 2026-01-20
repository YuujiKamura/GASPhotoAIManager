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
const PHOTO_ROWS_3UP = 10;  // 3枚モード: 写真部分の行数
const GAP_ROWS = 1;         // 余白行数
const ROWS_3UP = PHOTO_ROWS_3UP + GAP_ROWS;  // 11行/ブロック

// 2枚モード: A4高さ297mm / 2 = 148.5mm/ブロック
// 3枚モード: 297mm / 3 = 99mm/ブロック → 約1.5倍
const ROWS_2UP = Math.round(ROWS_3UP * 1.5);  // 17行/ブロック
const PHOTO_ROWS_2UP = ROWS_2UP - GAP_ROWS;   // 16行 (写真部分)

// 行高さ (pt) = 写真高さ ÷ 写真行数 × SCALE (切り捨て)
const ROW_HEIGHT_PT_3UP = Math.floor((PHOTO_HEIGHT_PT / PHOTO_ROWS_3UP) * SCALE);  // 26pt
const ROW_HEIGHT_PT_2UP = Math.floor((PHOTO_HEIGHT_PT / PHOTO_ROWS_3UP) * SCALE);  // 26pt (同じ行高さ)

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
  ROW_HEIGHT_PT: ROW_HEIGHT_PT_3UP,           // 26pt
  PHOTO_ROWS: PHOTO_ROWS_3UP,                 // 10行 (写真部分, 3枚モード)
  PHOTO_ROWS_2UP: PHOTO_ROWS_2UP,             // 16行 (写真部分, 2枚モード)
  GAP_ROWS: GAP_ROWS,                         // 1行 (余白部分)
  ROWS_PER_BLOCK_3UP: ROWS_3UP,               // 11行 (写真+余白)
  ROWS_PER_BLOCK_2UP: ROWS_2UP,               // 17行 (写真+余白)
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
  headerHeight: 0,                // ヘッダーなし
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
  // 内部でテンプレートから値を取得（後方互換性維持）
  const isTwoUp = photosPerPage === 2;
  const rowsPerBlock = isTwoUp ? DIMENSION.ROWS_PER_BLOCK_2UP : DIMENSION.ROWS_PER_BLOCK_3UP;
  const photoRows = isTwoUp ? DIMENSION.PHOTO_ROWS_2UP : DIMENSION.PHOTO_ROWS;

  return {
    rowsPerBlock,
    photoRows,                           // 2up: 16行, 3up: 10行
    rowHeightPt: DIMENSION.ROW_HEIGHT_PT,
    colAWidth: DIMENSION.COL_A_WIDTH,   // 56.1
    colBWidth: DIMENSION.COL_B_WIDTH,   // 11
    colCWidth: DIMENSION.COL_C_WIDTH,   // 28.6
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
    id: 'f_photoCategory',
    key: 'photoCategory',
    labelKey: 'labelPhotoCategory',
    rowSpan: 1,
    heightClass: 'h-[28px]',
    multiline: false
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

// ============================================
// フィールドラベル定義（PDF/Excel共通）
// ============================================

export const FIELD_LABELS = {
  date: '日時',
  category: '区分',
  workType: '工種',
  variety: '種別',
  detail: '細別',
  station: '測点',
  remarks: '備考',
  measurements: '測定値',
  // Excel用のlabelKeyマッピング
  labelDate: '日時',
  labelPhotoCategory: '区分',
  labelWorkType: '工種',
  labelVariety: '種別',
  labelDetail: '細別',
  labelStation: '測点',
  labelRemarks: '備考',
  labelMeasurements: '測定値',
} as const;

// ============================================
// 日時フォーマット設定
// ============================================

export const DATE_FORMAT = {
  includeTime: true,
  locale: 'ja-JP',
  options: {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  } as const,
} as const;

/**
 * 日時フォーマットヘルパー
 */
export function formatDateTime(timestamp: number | undefined): string {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString(
    DATE_FORMAT.locale,
    DATE_FORMAT.options
  );
}

// ============================================
// ビルトインテンプレート定義
// ============================================

/**
 * 標準3枚モードテンプレート
 * 全フィールド表示、写真左・キャプション右のレイアウト
 */
const TEMPLATE_3UP_RIGHT: TemplateLayout = {
  id: 'standard-3up',
  name: '標準（3枚/ページ）',
  blocksPerPage: 3,
  captionPosition: 'right',

  // mm基準
  pageWidthMm: A4_WIDTH_MM,
  pageHeightMm: A4_HEIGHT_MM,
  marginMm: MARGIN_MM,
  blockGapMm: PHOTO_GAP_MM,

  // 比率 (horizontal: 幅の比率)
  photoRatio: 65,
  captionRatio: 35,

  // Excel用
  rowsPerBlock: ROWS_3UP,
  photoRows: PHOTO_ROWS_3UP,
  rowHeightPt: ROW_HEIGHT_PT_3UP,
  columnWidths: {
    imageCol: PHOTO_COL_WIDTH,
    labelCol: LABEL_COL_WIDTH,
    valueCol: VALUE_COL_WIDTH,
  },

  // 全フィールド表示
  visibleFields: LAYOUT_FIELDS.map(f => f.id),

  isDefault: true,

  // 後方互換性
  photosPerPage: 3,
  photoWidthPercent: 65,
  infoWidthPercent: 35,
  photoGapMm: PHOTO_GAP_MM,
};

/**
 * シンプル2枚モードテンプレート
 * 測点・備考のみ表示、キャプション下
 */
const TEMPLATE_2UP_BOTTOM: TemplateLayout = {
  id: 'simple-2up',
  name: 'シンプル（2枚/ページ）',
  blocksPerPage: 2,
  captionPosition: 'bottom',

  // mm基準
  pageWidthMm: A4_WIDTH_MM,
  pageHeightMm: A4_HEIGHT_MM,
  marginMm: MARGIN_MM,
  blockGapMm: PHOTO_GAP_MM,

  // 比率 (vertical: 高さの比率)
  photoRatio: 85,
  captionRatio: 15,

  // Excel用
  rowsPerBlock: ROWS_2UP,
  photoRows: PHOTO_ROWS_2UP,
  rowHeightPt: ROW_HEIGHT_PT_2UP,
  columnWidths: {
    imageCol: PHOTO_COL_WIDTH,
    labelCol: LABEL_COL_WIDTH,
    valueCol: VALUE_COL_WIDTH,
  },

  // 測点・備考のみ
  visibleFields: ['f_station', 'f_remarks'],

  isDefault: false,

  // 後方互換性
  photosPerPage: 2,
  photoWidthPercent: 100,
  infoWidthPercent: 0,
  photoGapMm: PHOTO_GAP_MM,
};

/**
 * ビルトインテンプレート一覧
 */
export const BUILT_IN_TEMPLATES: Record<string, TemplateLayout> = {
  'standard-3up': TEMPLATE_3UP_RIGHT,
  'simple-2up': TEMPLATE_2UP_BOTTOM,
};

// ============================================
// ブロック寸法計算
// ============================================

/**
 * ブロック内の寸法情報
 */
export interface BlockDimensions {
  // 写真寸法 (pt)
  photoWidthPt: number;
  photoHeightPt: number;

  // キャプション寸法 (pt)
  captionWidthPt: number;
  captionHeightPt: number;

  // レイアウトモード
  mode: BlockLayoutMode;
  captionFirst: boolean;

  // オフセット (ブロック左上からの相対位置, pt)
  photoOffset: { x: number; y: number };
  captionOffset: { x: number; y: number };
}

/**
 * テンプレートとブロックサイズからブロック内寸法を計算
 * @param template テンプレート
 * @param blockWidthPt ブロック幅 (pt)
 * @param blockHeightPt ブロック高さ (pt)
 * @param gapPt 写真とキャプション間のギャップ (pt)
 */
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
    // 横並び: 幅を比率で分割
    const availableWidth = blockWidthPt - gapPt;
    photoWidthPt = availableWidth * (template.photoRatio / 100);
    captionWidthPt = availableWidth * (template.captionRatio / 100);
    photoHeightPt = blockHeightPt;
    captionHeightPt = blockHeightPt;

    if (captionFirst) {
      // left: キャプション左、写真右
      captionOffset = { x: 0, y: 0 };
      photoOffset = { x: captionWidthPt + gapPt, y: 0 };
    } else {
      // right: 写真左、キャプション右
      photoOffset = { x: 0, y: 0 };
      captionOffset = { x: photoWidthPt + gapPt, y: 0 };
    }
  } else {
    // 縦並び: 高さを比率で分割
    const availableHeight = blockHeightPt - gapPt;
    photoWidthPt = blockWidthPt;
    captionWidthPt = blockWidthPt;
    photoHeightPt = availableHeight * (template.photoRatio / 100);
    captionHeightPt = availableHeight * (template.captionRatio / 100);

    if (captionFirst) {
      // top: キャプション上、写真下
      captionOffset = { x: 0, y: 0 };
      photoOffset = { x: 0, y: captionHeightPt + gapPt };
    } else {
      // bottom: 写真上、キャプション下
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

/**
 * 写真枚数からテンプレートレイアウトを取得
 * @param photosPerPage 1ページあたりの写真数
 * @returns TemplateLayout
 */
export const getTemplateLayout = (photosPerPage: 2 | 3): TemplateLayout => {
  return photosPerPage === 2 ? TEMPLATE_2UP_BOTTOM : TEMPLATE_3UP_RIGHT;
};

/**
 * テンプレートIDからテンプレートを取得
 * @param templateId テンプレートID
 * @returns TemplateLayout or undefined
 */
export const getTemplateById = (templateId: string): TemplateLayout | undefined => {
  return BUILT_IN_TEMPLATES[templateId];
};

/**
 * 全ビルトインテンプレートを配列で取得（UI選択用）
 * @returns テンプレート配列
 */
export const getAllTemplates = (): TemplateLayout[] => {
  return Object.values(BUILT_IN_TEMPLATES);
};

/**
 * デフォルトテンプレートIDを取得
 */
export const getDefaultTemplateId = (): string => {
  return 'standard-3up';
};

/**
 * テンプレートから表示フィールドを取得
 * @param template テンプレート
 * @returns フィールド定義配列
 */
export const getVisibleFields = (template: TemplateLayout): FieldDefinition[] => {
  return LAYOUT_FIELDS.filter(field => template.visibleFields.includes(field.id));
};

// Re-export for convenience
export { getBlockLayoutMode, isCaptionFirst };
