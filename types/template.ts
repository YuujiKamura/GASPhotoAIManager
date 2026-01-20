/**
 * TemplateLayout型定義
 * PDF/Excel共通のレイアウト設定を一元管理
 */

/**
 * 定型デザインテンプレートのレイアウト定義
 */
export interface TemplateLayout {
  /** テンプレート識別子 */
  id: string;
  /** 表示名 */
  name: string;
  /** 1ページあたりの写真数 */
  photosPerPage: 2 | 3 | 4;

  // ============================================
  // mm基準寸法（Source of Truth）
  // ============================================
  /** ページ幅 (mm) */
  pageWidthMm: number;
  /** ページ高さ (mm) */
  pageHeightMm: number;
  /** 余白 (mm) */
  marginMm: number;
  /** 写真間ギャップ (mm) */
  photoGapMm: number;

  // ============================================
  // 比率設定
  // ============================================
  /** 写真領域の幅比率 (0-100) */
  photoWidthPercent: number;
  /** 情報欄の幅比率 (0-100) */
  infoWidthPercent: number;

  // ============================================
  // Excel用導出値
  // ============================================
  /** 1ブロックあたりの行数 */
  rowsPerBlock: number;
  /** 写真部分の行数（ブロック内） */
  photoRows: number;
  /** 行高さ (pt) */
  rowHeightPt: number;
  /** 列幅設定 */
  columnWidths: {
    /** 画像列 (Excel単位) */
    imageCol: number;
    /** ラベル列 (Excel単位) */
    labelCol: number;
    /** 値列 (Excel単位) */
    valueCol: number;
  };

  // ============================================
  // フィールド設定
  // ============================================
  /** 表示するフィールドIDの配列 */
  visibleFields: string[];

  // ============================================
  // メタデータ
  // ============================================
  /** デフォルトテンプレートかどうか */
  isDefault?: boolean;
}

/**
 * ビルトインテンプレートID
 */
export type BuiltInTemplateId = 'standard-3up' | 'simple-2up';
