
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
  description: string; // 記事/説明
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
