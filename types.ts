export interface PhotoMetadata {
  fileName: string;
  originalFile?: File; // Optional because it cannot be persisted across reloads
  base64: string; // Resized for display/AI
  mimeType: string;
}

export interface AIAnalysisResult {
  fileName: string;
  workType: string; // 工種
  station: string; // 測点
  remarks: string; // 備考 (黒板の記載内容の正規化)
  description: string; // 記事/説明
  hasBoard: boolean; // 黒板有無
  detectedText: string; // OCR text
}

export interface PhotoRecord extends PhotoMetadata {
  analysis?: AIAnalysisResult;
  status: 'pending' | 'processing' | 'done' | 'error';
}

export interface ProcessingStats {
  total: number;
  processed: number;
  success: number;
  failed: number;
}