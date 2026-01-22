/**
 * 写真関連の型定義
 * PhotoMetadata, PhotoRecord, AIAnalysisResult など
 */

export interface PhotoMetadata {
  fileName: string;
  originalFile?: File; // Optional because it might be missing after JSON import, but persisted in IDB
  base64: string; // Resized for display/AI
  mimeType: string;
  fileSize?: number; // Used for cache key generation without File object
  lastModified?: number; // Used for cache key generation without File object
}

/**
 * 画像選択時に即座に変換した処理済みファイル
 * モバイル環境でのFile GC問題を回避するため、
 * 画像選択時に即座にBase64に変換して保持する
 */
export interface ProcessedFile {
  fileName: string;
  base64: string;     // リサイズ済みBase64（AI解析・表示用）
  mimeType: string;
  fileSize: number;
  lastModified: number;
  date?: number;      // EXIF撮影日時
}

export type AppMode = 'construction' | 'general';

// 写真管理基準（国土交通省）による正式な写真区分
export type PhotoCategory =
  | "着手前及び完成写真"
  | "施工状況写真"
  | "安全管理写真"
  | "使用材料写真"
  | "品質管理写真"
  | "出来形管理写真"
  | "災害写真"
  | "事故写真"
  | "その他";

// 各フィールドの変更履歴
export interface FieldChange {
  field: string;           // フィールド名（workType, remarks など）
  stage: ChangeStage;      // どの段階で変更されたか
  before: string;          // 変更前の値
  after: string;           // 変更後の値
  reason?: string;         // 変更理由
}

// 処理段階
export type ChangeStage =
  | 'ai_initial'           // AI初期解析
  | 'context_relay'        // 前後写真からの継承
  | 'master_validation'    // マスタデータ照合
  | 'temperature_validation' // 温度バリデーション
  | 'normalization'        // 正規化処理
  | 'user_edit';           // ユーザー手動編集

export interface AIAnalysisResult {
  fileName: string;
  photoCategory?: string; // 写真区分 (Photo Category: 着手前及び完成写真, 施工状況写真, 品質管理写真等)
  workType: string; // 工種 (Construction Type: 舗装工, 道路土工, 区画線工等) - 現状は写真区分として使用
  variety?: string; // 種別 (Variety: 舗装打換え工, 上層路盤工等) - 現状は工種として使用
  detail?: string; // 細別 (Detail: 表層工, プライムコート等) - 現状は種別として使用
  subDetail?: string; // 細別 (Sub-detail: 実際の細別値) - 将来的に使用
  station: string; // 測点 OR Location/Time
  remarks: string; // 備考 (黒板の記載内容の正規化) OR Title/Key Point
  remarksCategory?: string; // 備考の種類（到着温度、敷均し温度、転圧状況など）- スキーマ分離用
  remarksValue?: string; // 備考の値（161.1℃、t=50mmなど）- スキーマ分離用
  description: string; // 記事（一般的な説明・コメント）
  measurements?: string; // 測定値（出来形管理の数値データ: 設計値、実測値、差など）
  hasBoard: boolean; // 黒板有無
  detectedText: string; // OCR text
  editedFields?: string[]; // Track which fields were manually modified by the user

  // Pairing Logic Cache
  sceneId?: string; // Unique ID grouping photos of the same location (Visual or Logical)
  phase?: 'before' | 'after' | 'status' | 'unknown'; // The phase within that scene
  visualAnchors?: string; // NEW: Verbalized description of background landmarks (e.g., "White house left, Pole right")
  reasoning?: string; // NEW: AI's thought process explaining the classification

  // Change tracking for transparency
  changeLog?: FieldChange[]; // History of changes made during processing
}

export interface PhotoRecord extends PhotoMetadata {
  analysis?: AIAnalysisResult;
  status: 'pending' | 'processing' | 'done' | 'error';
  date?: number; // Capture timestamp
  fromCache?: boolean; // Indicates if the analysis came from local IndexedDB
  sceneId?: string; // Scene/group identifier for PDF generation
  phase?: string; // Phase information for PDF generation
}

export interface ProcessingStats {
  total: number;
  processed: number;
  success: number;
  failed: number;
  cached: number; // Count of records retrieved from cache
}

export interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'json';
  details?: unknown; // For JSON objects
}

// ソートポリシー
export type SortPolicy =
  | 'chronological'              // 時系列順
  | 'chronological_safety_first' // 時系列（安全管理を先頭に）
  | 'chronological_safety_last'  // 時系列（安全管理を末尾に）
  | 'by_detail'                  // 細別ごとにグループ化（時系列）
  | 'by_detail_safety_first'     // 安全管理先頭 + 細別順
  | 'by_detail_safety_last'      // 細別順 + 安全管理末尾
  | 'by_worktype';               // 工種ごとにグループ化

export const SORT_POLICIES: { id: SortPolicy; name: string; description: string }[] = [
  { id: 'chronological', name: '時系列', description: '撮影順に並べる' },
  { id: 'chronological_safety_first', name: '時系列＋安全先頭', description: '安全管理を先頭に、他は時系列' },
  { id: 'chronological_safety_last', name: '時系列＋安全末尾', description: '安全管理を末尾に、他は時系列' },
  { id: 'by_detail', name: '細別順', description: '細別ごとにグループ化（時系列）' },
  { id: 'by_detail_safety_first', name: '細別順＋安全先頭', description: '安全管理を先頭に、残りは細別順' },
  { id: 'by_detail_safety_last', name: '細別順＋安全末尾', description: '細別順、安全管理を末尾に' },
];
