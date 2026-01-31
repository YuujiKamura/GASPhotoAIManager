#!/usr/bin/env npx tsx
/**
 * JavaScript レイアウト定数生成スクリプト
 *
 * layout-config.json から web-wasm/js/layout-constants.generated.js を生成
 * excel-bridge.js と pdf-bridge.js で使用
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, '../shared/layout-config/layout-config.json');
const OUTPUT_PATH = path.join(__dirname, '../photo-ai-rust/web-wasm/js/layout-constants.generated.js');

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
    rowSpan: number;
  }>;
}

function main() {
  console.log('Reading layout config from:', CONFIG_PATH);

  const configRaw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const config: LayoutConfig = JSON.parse(configRaw);

  const { units, page, ratios, excel, pdf, fields } = config;

  // 導出値を計算
  const USABLE_WIDTH_MM = page.A4_WIDTH_MM - page.MARGIN_MM * 2;
  const PHOTO_WIDTH_MM = USABLE_WIDTH_MM * ratios.IMAGE_RATIO;
  const PHOTO_HEIGHT_MM = (page.A4_HEIGHT_MM - page.MARGIN_MM * 2 - page.PHOTO_GAP_MM * 2) / 3;
  const PHOTO_HEIGHT_PT = PHOTO_HEIGHT_MM * units.MM_TO_PT;

  // RustKeyを使用してフィールド定義を生成
  const jsFields = fields.map(f => ({
    key: f.rustKey || f.key,
    label: f.label,
    rowSpan: f.rowSpan
  }));

  const output = `// ============================================
// AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY
// Generated from: shared/layout-config/layout-config.json
// Version: ${config.version}
// Generated at: ${new Date().toISOString()}
// ============================================

// ============================================
// 変換係数
// ============================================

export const MM_TO_PT = ${units.MM_TO_PT};
export const PT_TO_PX = ${units.PT_TO_PX};
export const PX_TO_PT = ${units.PX_TO_PT};
export const PT_PER_EXCEL_COL = ${units.PT_PER_EXCEL_COL};
export const PX_PER_EXCEL_COL = ${units.PX_PER_EXCEL_COL};
export const EXCEL_COL_OFFSET_PX = ${units.EXCEL_COL_OFFSET_PX};

// ============================================
// ページ設定
// ============================================

export const A4_WIDTH_MM = ${page.A4_WIDTH_MM};
export const A4_HEIGHT_MM = ${page.A4_HEIGHT_MM};
export const MARGIN_MM = ${page.MARGIN_MM};
export const PHOTO_GAP_MM = ${page.PHOTO_GAP_MM};

// ============================================
// 比率
// ============================================

export const IMAGE_RATIO = ${ratios.IMAGE_RATIO};
export const INFO_RATIO = ${ratios.INFO_RATIO};

// ============================================
// 導出値 (mm)
// ============================================

export const USABLE_WIDTH_MM = A4_WIDTH_MM - MARGIN_MM * 2;  // ${USABLE_WIDTH_MM}mm
export const PHOTO_WIDTH_MM = USABLE_WIDTH_MM * IMAGE_RATIO;  // ${PHOTO_WIDTH_MM.toFixed(1)}mm
export const PHOTO_HEIGHT_MM = (A4_HEIGHT_MM - MARGIN_MM * 2 - PHOTO_GAP_MM * 2) / 3;  // ${PHOTO_HEIGHT_MM.toFixed(2)}mm

// ============================================
// 導出値 (pt)
// ============================================

export const PHOTO_HEIGHT_PT = PHOTO_HEIGHT_MM * MM_TO_PT;

// ============================================
// Excel設定
// ============================================

export const SCALE = ${excel.SCALE};
export const PHOTO_ROWS = ${excel.PHOTO_ROWS_3UP};
export const GAP_ROWS = ${excel.GAP_ROWS};
export const ROWS_PER_BLOCK = PHOTO_ROWS + GAP_ROWS;  // ${excel.ROWS_PER_BLOCK_3UP}
export const ROW_HEIGHT_PT = Math.floor((PHOTO_HEIGHT_PT / PHOTO_ROWS) * SCALE);  // ${Math.floor((PHOTO_HEIGHT_PT / excel.PHOTO_ROWS_3UP) * excel.SCALE)}pt

export const COL_A_WIDTH = ${excel.PHOTO_COL_WIDTH};  // 写真列
export const COL_B_WIDTH = ${excel.LABEL_COL_WIDTH};  // ラベル列
export const COL_C_WIDTH = ${excel.VALUE_COL_WIDTH};  // 値列
export const FONT_NAME = '${excel.FONT_NAME}';
export const FONT_SIZE = ${excel.FONT_SIZE};

export const BORDER_THIN = {
  top: { style: 'thin', color: { argb: 'FFB5B5B5' } },
  left: { style: 'thin', color: { argb: 'FFB5B5B5' } },
  right: { style: 'thin', color: { argb: 'FFB5B5B5' } },
  bottom: { style: 'thin', color: { argb: 'FFB5B5B5' } }
};

// ============================================
// PDF設定
// ============================================

export const PDF_GAP_PT = ${pdf.GAP_PT};
export const PDF_BASE_FONT_SIZE = ${pdf.BASE_FONT_SIZE};
export const PDF_LINE_HEIGHT_MULTIPLIER = ${pdf.LINE_HEIGHT_MULTIPLIER};
export const PDF_TEXT_PADDING = ${pdf.TEXT_PADDING};
export const PDF_TITLE_FONT_SIZE = ${pdf.TITLE_FONT_SIZE};
export const PDF_PAGE_NUM_FONT_SIZE = ${pdf.PAGE_NUM_FONT_SIZE};

// ============================================
// フィールド定義
// ============================================

export const LAYOUT_FIELDS = ${JSON.stringify(jsFields, null, 2)};

// 2枚/ページ用のフィールド（測点と備考のみ）
export const LAYOUT_FIELDS_2UP = LAYOUT_FIELDS.filter(
  f => f.key === 'station' || f.key === 'remarks'
);

// ============================================
// ヘルパー関数
// ============================================

export function mmToPt(mm) {
  return mm * MM_TO_PT;
}

export function ptToMm(pt) {
  return pt / MM_TO_PT;
}

export function pxToPt(px) {
  return px * PX_TO_PT;
}

export function ptToPx(pt) {
  return pt * PT_TO_PX;
}
`;

  fs.writeFileSync(OUTPUT_PATH, output, 'utf-8');
  console.log('Generated:', OUTPUT_PATH);
  console.log('Version:', config.version);
}

main();
