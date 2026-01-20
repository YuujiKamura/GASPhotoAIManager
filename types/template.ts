/**
 * TemplateLayout型定義
 * PDF/Excel共通のレイアウト設定を一元管理
 */

// ============================================
// キャプション配置パターン
// ============================================

/**
 * ブロック内のキャプション配置位置
 * - right: 写真左 + キャプション右
 * - bottom: 写真上 + キャプション下
 * - left: キャプション左 + 写真右
 * - top: キャプション上 + 写真下
 */
export type CaptionPosition = 'right' | 'bottom' | 'left' | 'top';

/**
 * ブロックレイアウトモード
 * - horizontal: 写真とキャプションが横並び (left/right)
 * - vertical: 写真とキャプションが縦並び (top/bottom)
 */
export type BlockLayoutMode = 'horizontal' | 'vertical';

// ============================================
// ヘルパー関数
// ============================================

/**
 * キャプション位置からレイアウトモードを取得
 */
export const getBlockLayoutMode = (position: CaptionPosition): BlockLayoutMode => {
  return position === 'left' || position === 'right' ? 'horizontal' : 'vertical';
};

/**
 * キャプションが写真より先に来るかどうか
 */
export const isCaptionFirst = (position: CaptionPosition): boolean => {
  return position === 'left' || position === 'top';
};

// ============================================
// テンプレートレイアウト定義
// ============================================

/**
 * 定型デザインテンプレートのレイアウト定義
 */
export interface TemplateLayout {
  /** テンプレート識別子 */
  id: string;
  /** 表示名 */
  name: string;
  /** 1ページあたりのブロック数 (旧: photosPerPage) */
  blocksPerPage: 2 | 3 | 4;

  // ============================================
  // ブロック内配置設定
  // ============================================
  /** キャプション配置位置 */
  captionPosition: CaptionPosition;

  // ============================================
  // mm基準寸法（Source of Truth）
  // ============================================
  /** ページ幅 (mm) */
  pageWidthMm: number;
  /** ページ高さ (mm) */
  pageHeightMm: number;
  /** 余白 (mm) */
  marginMm: number;
  /** ブロック間ギャップ (mm) */
  blockGapMm: number;

  // ============================================
  // 比率設定 (captionPositionに応じて解釈)
  // horizontal: 幅の比率、vertical: 高さの比率
  // ============================================
  /** 写真エリアの比率 (0-100) */
  photoRatio: number;
  /** キャプションエリアの比率 (0-100) */
  captionRatio: number;

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

  // ============================================
  // 後方互換性 (deprecated)
  // ============================================
  /** @deprecated Use blocksPerPage instead */
  photosPerPage?: 2 | 3 | 4;
  /** @deprecated Use photoRatio instead */
  photoWidthPercent?: number;
  /** @deprecated Use captionRatio instead */
  infoWidthPercent?: number;
  /** @deprecated Use blockGapMm instead */
  photoGapMm?: number;
}

/**
 * ビルトインテンプレートID
 */
export type BuiltInTemplateId = 'standard-3up' | 'simple-2up' | 'detail-3up-left' | 'caption-top-2up';
