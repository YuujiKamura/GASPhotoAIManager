export interface PhotoMetadata {
  fileName: string;
  originalFile?: File; // Optional because it might be missing after JSON import, but persisted in IDB
  base64: string; // Resized for display/AI
  mimeType: string;
  fileSize?: number; // Used for cache key generation without File object
  lastModified?: number; // Used for cache key generation without File object
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

export interface AIAnalysisResult {
  fileName: string;
  workType: string; // 工種 (Construction Type) OR Category
  variety?: string; // 種別 (Variety) OR Sub-category
  detail?: string; // 細別 (Detail)
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
}

export interface PhotoRecord extends PhotoMetadata {
  analysis?: AIAnalysisResult;
  status: 'pending' | 'processing' | 'done' | 'error';
  date?: number; // Capture timestamp
  fromCache?: boolean; // Indicates if the analysis came from local IndexedDB
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
  details?: any; // For JSON objects
}

// ソートポリシー
export type SortPolicy =
  | 'chronological'              // 時系列順
  | 'chronological_safety_first' // 時系列（安全管理を先頭に）
  | 'chronological_safety_last'  // 時系列（安全管理を末尾に）
  | 'by_detail'                  // 細別ごとにグループ化（時系列）
  | 'by_detail_safety_first'     // 安全管理先頭 + 細別順
  | 'by_detail_safety_last';     // 細別順 + 安全管理末尾

export const SORT_POLICIES: { id: SortPolicy; name: string; description: string }[] = [
  { id: 'chronological', name: '時系列', description: '撮影順に並べる' },
  { id: 'chronological_safety_first', name: '時系列＋安全先頭', description: '安全管理を先頭に、他は時系列' },
  { id: 'chronological_safety_last', name: '時系列＋安全末尾', description: '安全管理を末尾に、他は時系列' },
  { id: 'by_detail', name: '細別順', description: '細別ごとにグループ化（時系列）' },
  { id: 'by_detail_safety_first', name: '細別順＋安全先頭', description: '安全管理を先頭に、残りは細別順' },
  { id: 'by_detail_safety_last', name: '細別順＋安全末尾', description: '細別順、安全管理を末尾に' },
];

// お手本（Few-shot Example）として保存する解析例
export interface AnalysisExample {
  id: string;                      // ユニークID
  name: string;                    // お手本の名前（例: "舗装工事の着手前写真"）
  thumbnail: string;               // サムネイル画像（base64、縮小版）
  analysis: AIAnalysisResult;      // 解析結果
  category?: PhotoCategory;        // 写真区分（フィルタ用）
  tags?: string[];                 // 検索用タグ
  createdAt: number;               // 作成日時
  updatedAt: number;               // 更新日時
}

// お手本セッション（複数写真の解析結果セット）
export interface AnalysisSession {
  id: string;                      // ユニークID
  name: string;                    // セッション名（例: "A工区 舗装工事"）
  description?: string;            // 説明
  examples: AnalysisExample[];     // このセッションに含まれるお手本
  photoCount: number;              // 写真数
  createdAt: number;               // 作成日時
  updatedAt: number;               // 更新日時
}

// 解析履歴（セッション単位で保存）- 軽量版
export interface AnalysisHistoryEntry {
  id: string;                      // ユニークID (UUID)
  sessionKey: string;              // セッション識別キー（重複チェック用）
  createdAt: number;               // 解析日時
  photoCount: number;              // 写真数
  instruction: string;             // 使用した指示文
  workTypes: string[];             // 含まれる工種（サマリー用）
  photoKeys: string[];             // ファイルキーのリスト（軽量）
  modelUsed?: string;              // 使用モデル
}