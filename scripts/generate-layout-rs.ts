#!/usr/bin/env npx tsx
/**
 * Rust レイアウト定数生成スクリプト
 *
 * layout-config.json から common/src/layout_generated.rs を生成
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, '../shared/layout-config/layout-config.json');
const OUTPUT_PATH = path.join(__dirname, '../photo-ai-rust/common/src/layout_generated.rs');

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
  };
  fields: Array<{
    id: string;
    key: string;
    rustKey?: string;
    label: string;
    rowSpan: number;
  }>;
}

function toF32(n: number): string {
  // Ensure float representation
  const str = n.toString();
  return str.includes('.') ? str : str + '.0';
}

function main() {
  console.log('Reading layout config from:', CONFIG_PATH);

  const configRaw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const config: LayoutConfig = JSON.parse(configRaw);

  const { units, page, ratios, excel, fields } = config;

  // 導出値を計算
  const USABLE_WIDTH_MM = page.A4_WIDTH_MM - page.MARGIN_MM * 2;
  const PHOTO_WIDTH_MM = USABLE_WIDTH_MM * ratios.IMAGE_RATIO;
  const INFO_WIDTH_MM = USABLE_WIDTH_MM * ratios.INFO_RATIO;
  const PHOTO_HEIGHT_MM_3UP = (page.A4_HEIGHT_MM - page.MARGIN_MM * 2 - page.PHOTO_GAP_MM * 2) / 3;
  const PHOTO_HEIGHT_MM_2UP = (page.A4_HEIGHT_MM - page.MARGIN_MM * 2 - page.PHOTO_GAP_MM) / 2;

  const PAGE_WIDTH_PT = page.A4_WIDTH_MM * units.MM_TO_PT;
  const PAGE_HEIGHT_PT = page.A4_HEIGHT_MM * units.MM_TO_PT;
  const MARGIN_PT = page.MARGIN_MM * units.MM_TO_PT;
  const GAP_PT = page.PHOTO_GAP_MM * units.MM_TO_PT;
  const PHOTO_WIDTH_PT = PHOTO_WIDTH_MM * units.MM_TO_PT;
  const PHOTO_HEIGHT_PT_3UP = PHOTO_HEIGHT_MM_3UP * units.MM_TO_PT;
  const PHOTO_HEIGHT_PT_2UP = PHOTO_HEIGHT_MM_2UP * units.MM_TO_PT;
  const INFO_WIDTH_PT = INFO_WIDTH_MM * units.MM_TO_PT;
  const BLOCK_HEIGHT_3UP_PT = PHOTO_HEIGHT_PT_3UP + GAP_PT;
  const BLOCK_HEIGHT_2UP_PT = PHOTO_HEIGHT_PT_2UP * 1.5;

  // フィールド定義用にRustキーを使用
  const rustFields = fields.map(f => ({
    key: f.rustKey || f.key,
    label: f.label,
    row_span: f.rowSpan
  }));

  const output = `//! AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY
//!
//! Generated from: shared/layout-config/layout-config.json
//! Version: ${config.version}
//! Generated at: ${new Date().toISOString()}

// ============================================
// mm基準レイアウト（Source of Truth）
// ============================================

/// A4サイズ（mm）
pub const A4_WIDTH_MM: f32 = ${toF32(page.A4_WIDTH_MM)};
pub const A4_HEIGHT_MM: f32 = ${toF32(page.A4_HEIGHT_MM)};

/// 余白設定（mm）
pub const MARGIN_MM: f32 = ${toF32(page.MARGIN_MM)};
pub const PHOTO_GAP_MM: f32 = ${toF32(page.PHOTO_GAP_MM)};

/// プレビュー比率（これが正）
pub const IMAGE_RATIO: f32 = ${toF32(ratios.IMAGE_RATIO)};
pub const INFO_RATIO: f32 = ${toF32(ratios.INFO_RATIO)};

/// 利用可能幅から写真/情報幅を計算（mm）
pub const USABLE_WIDTH_MM: f32 = A4_WIDTH_MM - MARGIN_MM * 2.0;  // ${USABLE_WIDTH_MM}mm
pub const PHOTO_WIDTH_MM: f32 = USABLE_WIDTH_MM * IMAGE_RATIO;   // ${PHOTO_WIDTH_MM.toFixed(1)}mm
pub const INFO_WIDTH_MM: f32 = USABLE_WIDTH_MM * INFO_RATIO;     // ${INFO_WIDTH_MM.toFixed(1)}mm

/// 写真アスペクト比（4:3）
pub const PHOTO_ASPECT_RATIO: f32 = 4.0 / 3.0;

/// 写真高さ: 4:3比率から計算（mm）
pub const PHOTO_HEIGHT_MM: f32 = PHOTO_WIDTH_MM / PHOTO_ASPECT_RATIO;  // ${(PHOTO_WIDTH_MM / (4/3)).toFixed(3)}mm

/// 写真高さ（ページ分割基準）
pub const PHOTO_HEIGHT_MM_3UP: f32 = (A4_HEIGHT_MM - MARGIN_MM * 2.0 - PHOTO_GAP_MM * 2.0) / 3.0;  // ${PHOTO_HEIGHT_MM_3UP.toFixed(2)}mm
pub const PHOTO_HEIGHT_MM_2UP: f32 = (A4_HEIGHT_MM - MARGIN_MM * 2.0 - PHOTO_GAP_MM) / 2.0;        // ${PHOTO_HEIGHT_MM_2UP.toFixed(2)}mm

// ============================================
// 変換係数
// ============================================

/// mm → pt変換 (1mm = 72/25.4 pt ≈ ${units.MM_TO_PT}pt)
pub const MM_TO_PT: f32 = 72.0 / 25.4;

/// pt → px変換 (96dpi基準)
pub const PT_TO_PX: f32 = 96.0 / 72.0;
pub const PX_TO_PT: f32 = 72.0 / 96.0;

/// Excel列幅変換係数
pub const PT_PER_EXCEL_COL: f32 = ${toF32(units.PT_PER_EXCEL_COL)};
pub const PX_PER_EXCEL_COL: f32 = ${toF32(units.PX_PER_EXCEL_COL)};
pub const EXCEL_COL_OFFSET_PX: f32 = ${toF32(units.EXCEL_COL_OFFSET_PX)};

// ============================================
// 導出されるpt値
// ============================================

/// ページサイズ（pt）
pub const PAGE_WIDTH_PT: f32 = A4_WIDTH_MM * MM_TO_PT;   // ${PAGE_WIDTH_PT.toFixed(2)}pt
pub const PAGE_HEIGHT_PT: f32 = A4_HEIGHT_MM * MM_TO_PT; // ${PAGE_HEIGHT_PT.toFixed(2)}pt

/// マージン（pt）
pub const MARGIN_PT: f32 = MARGIN_MM * MM_TO_PT;         // ${MARGIN_PT.toFixed(2)}pt
pub const GAP_PT: f32 = PHOTO_GAP_MM * MM_TO_PT;         // ${GAP_PT.toFixed(2)}pt

/// 写真サイズ（pt）
pub const PHOTO_WIDTH_PT: f32 = PHOTO_WIDTH_MM * MM_TO_PT;       // ${PHOTO_WIDTH_PT.toFixed(1)}pt
pub const PHOTO_HEIGHT_PT_3UP: f32 = PHOTO_HEIGHT_MM_3UP * MM_TO_PT; // ${PHOTO_HEIGHT_PT_3UP.toFixed(1)}pt
pub const PHOTO_HEIGHT_PT_2UP: f32 = PHOTO_HEIGHT_MM_2UP * MM_TO_PT; // ${PHOTO_HEIGHT_PT_2UP.toFixed(1)}pt

/// 情報パネル幅（pt）
pub const INFO_WIDTH_PT: f32 = INFO_WIDTH_MM * MM_TO_PT;         // ${INFO_WIDTH_PT.toFixed(1)}pt

/// ブロック高さ（pt）
pub const BLOCK_HEIGHT_3UP_PT: f32 = PHOTO_HEIGHT_PT_3UP + GAP_PT; // ${BLOCK_HEIGHT_3UP_PT.toFixed(2)}pt
pub const BLOCK_HEIGHT_2UP_PT: f32 = PHOTO_HEIGHT_PT_2UP * 1.5;    // ${BLOCK_HEIGHT_2UP_PT.toFixed(2)}pt

// ============================================
// Excel用レイアウト定数
// ============================================

/// 全体スケール
pub const EXCEL_SCALE: f32 = ${toF32(excel.SCALE)};

/// 行の設計
pub const PHOTO_ROWS: u8 = ${excel.PHOTO_ROWS_3UP};
pub const GAP_ROWS: u8 = ${excel.GAP_ROWS};
pub const ROWS_PER_BLOCK_3UP: u8 = PHOTO_ROWS + GAP_ROWS; // ${excel.ROWS_PER_BLOCK_3UP}行/ブロック
pub const ROWS_PER_BLOCK_2UP: u8 = ${excel.ROWS_PER_BLOCK_2UP}; // ${excel.ROWS_PER_BLOCK_2UP}行/ブロック

/// 行高さ (pt)
pub const ROW_HEIGHT_PT: f32 = ${toF32(excel.ROW_HEIGHT_PT)};

/// 列幅 (Excel単位)
pub const PHOTO_COL_WIDTH: f32 = ${toF32(excel.PHOTO_COL_WIDTH)};
pub const LABEL_COL_WIDTH: f32 = ${toF32(excel.LABEL_COL_WIDTH)};
pub const VALUE_COL_WIDTH: f32 = ${toF32(excel.VALUE_COL_WIDTH)};
pub const INFO_COL_WIDTH: f32 = ${toF32(excel.INFO_COL_WIDTH)};

// ============================================
// フィールド定義
// ============================================

/// 情報パネルに表示するフィールド
#[derive(Debug, Clone, Copy)]
pub struct FieldDefinition {
    pub key: &'static str,
    pub label: &'static str,
    pub row_span: u8,
}

/// レイアウトフィールド（React版 LAYOUT_FIELDS と同等）
pub const LAYOUT_FIELDS: &[FieldDefinition] = &[
${rustFields.map(f => `    FieldDefinition { key: "${f.key}", label: "${f.label}", row_span: ${f.row_span} },`).join('\n')}
];

// ============================================
// レイアウト設定構造体
// ============================================

/// PDFレイアウト設定
#[derive(Debug, Clone)]
pub struct PdfLayout {
    /// ページ幅（mm）
    pub page_width_mm: f32,
    /// ページ高さ（mm）
    pub page_height_mm: f32,
    /// マージン（mm）
    pub margin_mm: f32,
    /// 写真間ギャップ（mm）
    pub gap_mm: f32,
    /// 写真幅（mm）
    pub photo_width_mm: f32,
    /// 写真高さ（mm）
    pub photo_height_mm: f32,
    /// 情報パネル幅（mm）
    pub info_width_mm: f32,
    /// 1ページあたりの写真数
    pub photos_per_page: u8,
}

impl PdfLayout {
    /// 3枚/ページ用レイアウト
    pub fn three_up() -> Self {
        Self {
            page_width_mm: A4_WIDTH_MM,
            page_height_mm: A4_HEIGHT_MM,
            margin_mm: MARGIN_MM,
            gap_mm: PHOTO_GAP_MM,
            photo_width_mm: PHOTO_WIDTH_MM,
            photo_height_mm: PHOTO_HEIGHT_MM_3UP,
            info_width_mm: INFO_WIDTH_MM,
            photos_per_page: 3,
        }
    }

    /// 2枚/ページ用レイアウト
    pub fn two_up() -> Self {
        Self {
            page_width_mm: A4_WIDTH_MM,
            page_height_mm: A4_HEIGHT_MM,
            margin_mm: MARGIN_MM,
            gap_mm: PHOTO_GAP_MM,
            photo_width_mm: PHOTO_WIDTH_MM,
            photo_height_mm: PHOTO_HEIGHT_MM_2UP,
            info_width_mm: INFO_WIDTH_MM,
            photos_per_page: 2,
        }
    }

    /// 指定枚数でレイアウト取得
    pub fn for_photos_per_page(n: u8) -> Self {
        match n {
            2 => Self::two_up(),
            _ => Self::three_up(),
        }
    }

    /// ブロック高さ（写真 + ギャップ）mm
    pub fn block_height_mm(&self) -> f32 {
        self.photo_height_mm + self.gap_mm
    }

    /// 利用可能幅（mm）
    pub fn usable_width_mm(&self) -> f32 {
        self.page_width_mm - self.margin_mm * 2.0
    }

    /// 利用可能高さ（mm）
    pub fn usable_height_mm(&self) -> f32 {
        self.page_height_mm - self.margin_mm * 2.0
    }

    /// コンテンツ開始Y座標（mm、上から）
    pub fn content_start_y_mm(&self) -> f32 {
        self.page_height_mm - self.margin_mm
    }
}

// ============================================
// Excelレイアウト設定構造体
// ============================================

/// Excelレイアウト設定
#[derive(Debug, Clone)]
pub struct ExcelLayout {
    /// 1ブロックあたりの行数
    pub rows_per_block: u8,
    /// 写真部分の行数
    pub photo_rows: u8,
    /// 行高さ (pt)
    pub row_height_pt: f32,
    /// 列A幅（画像列）
    pub col_a_width: f32,
    /// 列B幅（ラベル列）
    pub col_b_width: f32,
    /// 列C幅（値列）
    pub col_c_width: f32,
    /// 写真幅 (pt)
    pub photo_width_pt: f32,
    /// 写真高さ (pt)
    pub photo_height_pt: f32,
    /// 情報パネル幅 (pt)
    pub info_width_pt: f32,
}

impl ExcelLayout {
    /// 3枚/ページ用レイアウト
    pub fn three_up() -> Self {
        Self {
            rows_per_block: ROWS_PER_BLOCK_3UP,
            photo_rows: PHOTO_ROWS,
            row_height_pt: ROW_HEIGHT_PT,
            col_a_width: PHOTO_COL_WIDTH,
            col_b_width: LABEL_COL_WIDTH,
            col_c_width: VALUE_COL_WIDTH,
            photo_width_pt: PHOTO_WIDTH_PT,
            photo_height_pt: PHOTO_HEIGHT_PT_3UP,
            info_width_pt: INFO_WIDTH_PT,
        }
    }

    /// 2枚/ページ用レイアウト
    pub fn two_up() -> Self {
        Self {
            rows_per_block: ROWS_PER_BLOCK_2UP,
            photo_rows: PHOTO_ROWS,
            row_height_pt: ROW_HEIGHT_PT,
            col_a_width: PHOTO_COL_WIDTH,
            col_b_width: LABEL_COL_WIDTH,
            col_c_width: VALUE_COL_WIDTH,
            photo_width_pt: PHOTO_WIDTH_PT,
            photo_height_pt: PHOTO_HEIGHT_PT_2UP,
            info_width_pt: INFO_WIDTH_PT,
        }
    }

    /// 指定枚数でレイアウト取得
    pub fn for_photos_per_page(n: u8) -> Self {
        match n {
            2 => Self::two_up(),
            _ => Self::three_up(),
        }
    }
}

// ============================================
// ヘルパー関数
// ============================================

/// mm → pt 変換
#[inline]
pub fn mm_to_pt(mm: f32) -> f32 {
    mm * MM_TO_PT
}

/// pt → mm 変換
#[inline]
pub fn pt_to_mm(pt: f32) -> f32 {
    pt / MM_TO_PT
}

/// px → pt 変換
#[inline]
pub fn px_to_pt(px: f32) -> f32 {
    px * PX_TO_PT
}

/// pt → px 変換
#[inline]
pub fn pt_to_px(pt: f32) -> f32 {
    pt * PT_TO_PX
}

/// pt → Excel列幅 変換
#[inline]
pub fn pt_to_excel_col(pt: f32) -> f32 {
    (pt / PT_PER_EXCEL_COL).round()
}

/// Excel列幅 → pt 変換
#[inline]
pub fn excel_col_to_pt(units: f32) -> f32 {
    (units * PT_PER_EXCEL_COL).round()
}

/// px → Excel幅 変換
#[inline]
pub fn px_to_excel_width(px: f32) -> f32 {
    ((px - EXCEL_COL_OFFSET_PX) / PX_PER_EXCEL_COL).round()
}

/// Excel幅 → px 変換
#[inline]
pub fn excel_width_to_px(units: f32) -> f32 {
    (units * PX_PER_EXCEL_COL + EXCEL_COL_OFFSET_PX).round()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dimensions() {
        // 基本寸法の確認
        assert!((USABLE_WIDTH_MM - 190.0).abs() < 0.01);
        assert!((PHOTO_WIDTH_MM - 123.5).abs() < 0.01);
        assert!((INFO_WIDTH_MM - 66.5).abs() < 0.01);
        assert!((PHOTO_HEIGHT_MM_3UP - 85.67).abs() < 0.1);
    }

    #[test]
    fn test_ratios() {
        // 比率の確認
        let total = IMAGE_RATIO + INFO_RATIO;
        assert!((total - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_conversion() {
        // 変換係数の確認
        assert!((MM_TO_PT - 2.835).abs() < 0.01);
        assert!((mm_to_pt(10.0) - 28.35).abs() < 0.1);
    }

    #[test]
    fn test_layout_config() {
        let layout = PdfLayout::three_up();
        assert_eq!(layout.photos_per_page, 3);
        assert!((layout.photo_width_mm - 123.5).abs() < 0.01);

        let layout2 = PdfLayout::two_up();
        assert_eq!(layout2.photos_per_page, 2);
        assert!(layout2.photo_height_mm > layout.photo_height_mm);
    }

    #[test]
    fn test_excel_layout() {
        let layout = ExcelLayout::three_up();
        assert_eq!(layout.rows_per_block, 11);
        assert_eq!(layout.photo_rows, 10);
        assert!((layout.row_height_pt - ${toF32(excel.ROW_HEIGHT_PT)}).abs() < 0.01);
        assert!((layout.col_a_width - ${toF32(excel.PHOTO_COL_WIDTH)}).abs() < 0.01);
        assert!((layout.col_b_width - ${toF32(excel.LABEL_COL_WIDTH)}).abs() < 0.01);
        assert!((layout.col_c_width - ${toF32(excel.VALUE_COL_WIDTH)}).abs() < 0.01);
    }

    #[test]
    fn test_excel_conversion() {
        // Excel列幅変換
        let pt = 53.0;
        let col = pt_to_excel_col(pt);
        assert_eq!(col, 10.0);

        let back = excel_col_to_pt(col);
        assert_eq!(back, 53.0);
    }

    #[test]
    fn test_layout_fields() {
        // フィールド数の確認
        assert_eq!(LAYOUT_FIELDS.len(), ${fields.length});

        // 最初と最後のフィールド確認
        assert_eq!(LAYOUT_FIELDS[0].key, "${rustFields[0].key}");
        assert_eq!(LAYOUT_FIELDS[0].label, "${rustFields[0].label}");
        assert_eq!(LAYOUT_FIELDS[${fields.length - 1}].key, "${rustFields[fields.length - 1].key}");
        assert_eq!(LAYOUT_FIELDS[${fields.length - 1}].row_span, ${rustFields[fields.length - 1].row_span});
    }
}
`;

  fs.writeFileSync(OUTPUT_PATH, output, 'utf-8');
  console.log('Generated:', OUTPUT_PATH);
  console.log('Version:', config.version);
}

main();
