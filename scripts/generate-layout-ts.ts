#!/usr/bin/env npx tsx
/**
 * TypeScript レイアウト定数生成スクリプト
 *
 * layout-config.json から utils/layoutConfig.generated.ts を生成
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, '../shared/layout-config/layout-config.json');
const OUTPUT_PATH = path.join(__dirname, '../utils/layoutConfig.generated.ts');

interface LayoutConfig {
  version: string;
  units: {
    MM_TO_PT: number;
    PT_TO_PX: number;
    PX_TO_PT: number;
    PT_PER_EXCEL_COL: number;
    PX_PER_EXCEL_COL: number;
    EXCEL_COL_OFFSET_PX: number;
  };
  page: {
    A4_WIDTH_MM: number;
    A4_HEIGHT_MM: number;
    MARGIN_MM: number;
    PHOTO_GAP_MM: number;
  };
  ratios: {
    IMAGE_RATIO: number;
    INFO_RATIO: number;
  };
  excel: {
    SCALE: number;
    ROW_HEIGHT_PT: number;
    PHOTO_ROWS_3UP: number;
    PHOTO_ROWS_2UP: number;
    GAP_ROWS: number;
    ROWS_PER_BLOCK_3UP: number;
    ROWS_PER_BLOCK_2UP: number;
    PHOTO_COL_WIDTH: number;
    LABEL_COL_WIDTH: number;
    VALUE_COL_WIDTH: number;
    INFO_COL_WIDTH: number;
    FONT_NAME: string;
    FONT_SIZE: number;
  };
  pdf: {
    GAP_PT: number;
    BASE_FONT_SIZE: number;
    LINE_HEIGHT_MULTIPLIER: number;
    TEXT_PADDING: number;
    TITLE_FONT_SIZE: number;
    PAGE_NUM_FONT_SIZE: number;
  };
  fields: Array<{
    id: string;
    key: string;
    rustKey?: string;
    label: string;
    labelKey: string;
    rowSpan: number;
    heightClass: string;
    multiline: boolean;
    readOnly?: boolean;
  }>;
  templates: Record<string, {
    id: string;
    name: string;
    blocksPerPage: number;
    captionPosition: string;
    photoRatio: number;
    captionRatio: number;
    visibleFields: string[];
    isDefault: boolean;
  }>;
  fieldLabels: Record<string, string>;
  dateFormat: {
    includeTime: boolean;
    locale: string;
    options: Record<string, string>;
  };
}

function main() {
  console.log('Reading layout config from:', CONFIG_PATH);

  const configRaw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const config: LayoutConfig = JSON.parse(configRaw);

  const { units, page, ratios, excel, pdf, fields, templates, fieldLabels, dateFormat } = config;

  // 導出値を計算
  const USABLE_WIDTH_MM = page.A4_WIDTH_MM - page.MARGIN_MM * 2;
  const PHOTO_WIDTH_MM = USABLE_WIDTH_MM * ratios.IMAGE_RATIO;
  const INFO_WIDTH_MM = USABLE_WIDTH_MM * ratios.INFO_RATIO;
  const PHOTO_HEIGHT_MM = (page.A4_HEIGHT_MM - page.MARGIN_MM * 2 - page.PHOTO_GAP_MM * 2) / 3;

  const PHOTO_WIDTH_PT = PHOTO_WIDTH_MM * units.MM_TO_PT;
  const PHOTO_HEIGHT_PT = PHOTO_HEIGHT_MM * units.MM_TO_PT;
  const INFO_WIDTH_PT = INFO_WIDTH_MM * units.MM_TO_PT;

  const BLOCK_HEIGHT_3UP = PHOTO_HEIGHT_PT + page.PHOTO_GAP_MM * units.MM_TO_PT;
  const BLOCK_HEIGHT_2UP = PHOTO_HEIGHT_PT * 1.5;

  const output = `// ============================================
// AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY
// Generated from: shared/layout-config/layout-config.json
// Version: ${config.version}
// Generated at: ${new Date().toISOString()}
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
const A4_WIDTH_MM = ${page.A4_WIDTH_MM};
const A4_HEIGHT_MM = ${page.A4_HEIGHT_MM};

// 余白設定
const MARGIN_MM = ${page.MARGIN_MM};
const PHOTO_GAP_MM = ${page.PHOTO_GAP_MM};

// プレビュー比率
const IMAGE_RATIO = ${ratios.IMAGE_RATIO};
const INFO_RATIO = ${ratios.INFO_RATIO};

// 利用可能幅から写真/情報幅を計算
const USABLE_WIDTH_MM = A4_WIDTH_MM - MARGIN_MM * 2;  // ${USABLE_WIDTH_MM}mm
const PHOTO_WIDTH_MM = USABLE_WIDTH_MM * IMAGE_RATIO;  // ${PHOTO_WIDTH_MM.toFixed(1)}mm
const INFO_WIDTH_MM = USABLE_WIDTH_MM * INFO_RATIO;    // ${INFO_WIDTH_MM.toFixed(1)}mm

// 写真高さ: 3枚配置から計算
const PHOTO_HEIGHT_MM = (A4_HEIGHT_MM - MARGIN_MM * 2 - PHOTO_GAP_MM * 2) / 3;  // ${PHOTO_HEIGHT_MM.toFixed(2)}mm

// mm → pt変換 (1mm = 72/25.4 pt)
const MM_TO_PT = ${units.MM_TO_PT};

export const PDF_LAYOUT = {
  PAGE_WIDTH: A4_WIDTH_MM * MM_TO_PT,   // ${(page.A4_WIDTH_MM * units.MM_TO_PT).toFixed(2)}pt
  PAGE_HEIGHT: A4_HEIGHT_MM * MM_TO_PT, // ${(page.A4_HEIGHT_MM * units.MM_TO_PT).toFixed(2)}pt
  MARGIN: MARGIN_MM * MM_TO_PT,         // ${(page.MARGIN_MM * units.MM_TO_PT).toFixed(2)}pt
  HEADER_HEIGHT: 0,
  GAP: PHOTO_GAP_MM * MM_TO_PT,         // ${(page.PHOTO_GAP_MM * units.MM_TO_PT).toFixed(2)}pt
  PHOTO_WIDTH_MM,
  PHOTO_HEIGHT_MM,
  INFO_WIDTH_MM,
} as const;

// ============================================
// 計算された寸法値 (pt)
// ============================================

const PHOTO_WIDTH_PT = PHOTO_WIDTH_MM * MM_TO_PT;   // ${PHOTO_WIDTH_PT.toFixed(1)}pt
const PHOTO_HEIGHT_PT = PHOTO_HEIGHT_MM * MM_TO_PT; // ${PHOTO_HEIGHT_PT.toFixed(1)}pt
const INFO_WIDTH_PT = INFO_WIDTH_MM * MM_TO_PT;     // ${INFO_WIDTH_PT.toFixed(1)}pt

const BLOCK_HEIGHT_3UP = PHOTO_HEIGHT_PT + PDF_LAYOUT.GAP;  // ${BLOCK_HEIGHT_3UP.toFixed(2)}pt
const BLOCK_HEIGHT_2UP = PHOTO_HEIGHT_PT * 1.5;             // ${BLOCK_HEIGHT_2UP.toFixed(2)}pt

// ============================================
// 変換係数
// ============================================

export const CONVERSION = {
  PT_TO_PX: ${units.PT_TO_PX},        // 1pt = ${units.PT_TO_PX}px
  PX_TO_PT: ${units.PX_TO_PT},        // 1px = ${units.PX_TO_PT}pt
  PT_PER_EXCEL_COL: ${units.PT_PER_EXCEL_COL},
  PX_PER_EXCEL_COL: ${units.PX_PER_EXCEL_COL},
  EXCEL_COL_OFFSET_PX: ${units.EXCEL_COL_OFFSET_PX},
} as const;

// ============================================
// Excel用に導出された値
// ============================================

const SCALE = ${excel.SCALE};
const PHOTO_ROWS_3UP = ${excel.PHOTO_ROWS_3UP};
const GAP_ROWS = ${excel.GAP_ROWS};
const ROWS_3UP = ${excel.ROWS_PER_BLOCK_3UP};
const PHOTO_ROWS_2UP = ${excel.PHOTO_ROWS_2UP};
const ROWS_2UP = ${excel.ROWS_PER_BLOCK_2UP};

const ROW_HEIGHT_PT_3UP = ${excel.ROW_HEIGHT_PT};
const ROW_HEIGHT_PT_2UP = ${excel.ROW_HEIGHT_PT};

const PHOTO_COL_WIDTH = ${excel.PHOTO_COL_WIDTH};
const LABEL_COL_WIDTH = ${excel.LABEL_COL_WIDTH};
const VALUE_COL_WIDTH = ${excel.VALUE_COL_WIDTH};
const INFO_COL_WIDTH = ${excel.INFO_COL_WIDTH};

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
  gap: ${pdf.GAP_PT},
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

export const LAYOUT_FIELDS: FieldDefinition[] = ${JSON.stringify(
  fields.map(f => ({
    id: f.id,
    key: f.key,
    labelKey: f.labelKey,
    rowSpan: f.rowSpan,
    heightClass: f.heightClass,
    multiline: f.multiline,
    ...(f.readOnly !== undefined && { readOnly: f.readOnly })
  })), null, 2
).replace(/"([^"]+)":/g, '$1:')};

// ============================================
// フィールドラベル定義（PDF/Excel共通）
// ============================================

export const FIELD_LABELS = ${JSON.stringify(fieldLabels, null, 2)} as const;

// ============================================
// 日時フォーマット設定
// ============================================

export const DATE_FORMAT = {
  includeTime: ${dateFormat.includeTime},
  locale: '${dateFormat.locale}',
  options: ${JSON.stringify(dateFormat.options, null, 4).split('\n').map((line, i) => i === 0 ? line : '  ' + line).join('\n')},
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
  id: '${templates['standard-3up'].id}',
  name: '${templates['standard-3up'].name}',
  blocksPerPage: ${templates['standard-3up'].blocksPerPage},
  captionPosition: '${templates['standard-3up'].captionPosition}' as CaptionPosition,
  pageWidthMm: A4_WIDTH_MM,
  pageHeightMm: A4_HEIGHT_MM,
  marginMm: MARGIN_MM,
  blockGapMm: PHOTO_GAP_MM,
  photoRatio: ${templates['standard-3up'].photoRatio},
  captionRatio: ${templates['standard-3up'].captionRatio},
  rowsPerBlock: ROWS_3UP,
  photoRows: PHOTO_ROWS_3UP,
  rowHeightPt: ROW_HEIGHT_PT_3UP,
  columnWidths: {
    imageCol: PHOTO_COL_WIDTH,
    labelCol: LABEL_COL_WIDTH,
    valueCol: VALUE_COL_WIDTH,
  },
  visibleFields: ${JSON.stringify(templates['standard-3up'].visibleFields)},
  isDefault: ${templates['standard-3up'].isDefault},
  photosPerPage: ${templates['standard-3up'].blocksPerPage},
  photoWidthPercent: ${templates['standard-3up'].photoRatio},
  infoWidthPercent: ${templates['standard-3up'].captionRatio},
  photoGapMm: PHOTO_GAP_MM,
};

const TEMPLATE_2UP_BOTTOM: TemplateLayout = {
  id: '${templates['simple-2up'].id}',
  name: '${templates['simple-2up'].name}',
  blocksPerPage: ${templates['simple-2up'].blocksPerPage},
  captionPosition: '${templates['simple-2up'].captionPosition}' as CaptionPosition,
  pageWidthMm: A4_WIDTH_MM,
  pageHeightMm: A4_HEIGHT_MM,
  marginMm: MARGIN_MM,
  blockGapMm: PHOTO_GAP_MM,
  photoRatio: ${templates['simple-2up'].photoRatio},
  captionRatio: ${templates['simple-2up'].captionRatio},
  rowsPerBlock: ROWS_2UP,
  photoRows: PHOTO_ROWS_2UP,
  rowHeightPt: ROW_HEIGHT_PT_2UP,
  columnWidths: {
    imageCol: PHOTO_COL_WIDTH,
    labelCol: LABEL_COL_WIDTH,
    valueCol: VALUE_COL_WIDTH,
  },
  visibleFields: ${JSON.stringify(templates['simple-2up'].visibleFields)},
  isDefault: ${templates['simple-2up'].isDefault},
  photosPerPage: ${templates['simple-2up'].blocksPerPage},
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
  gapPt: number = ${pdf.GAP_PT}
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
`;

  fs.writeFileSync(OUTPUT_PATH, output, 'utf-8');
  console.log('Generated:', OUTPUT_PATH);
  console.log('Version:', config.version);
}

main();
