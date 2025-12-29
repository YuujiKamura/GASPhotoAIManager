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

  // Change tracking for transparency
  changeLog?: FieldChange[]; // History of changes made during processing
}

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
  details?: any; // For JSON objects
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

// 問題ケース（期待と異なる解析結果を検証用に保存）
export interface AnalysisIssue {
  id: string;                      // ユニークID
  fileName: string;                // 元のファイル名
  thumbnail: string;               // サムネイル画像（base64）
  actualAnalysis: AIAnalysisResult; // 実際の解析結果
  expectedValues?: {               // 期待していた値（ユーザー入力、任意）
    workType?: string;
    variety?: string;
    detail?: string;
    station?: string;
    remarks?: string;
    measurements?: string;
  };
  issueDescription: string;        // 問題の説明
  issueType: IssueType;            // 問題の種類
  status: IssueStatus;             // 対応状況
  createdAt: number;               // 作成日時
  resolvedAt?: number;             // 解決日時
  notes?: string;                  // メモ
}

// 問題の種類
export type IssueType =
  | 'wrong_classification'   // 分類が間違い
  | 'wrong_inheritance'      // 継承が不適切
  | 'master_rejection'       // マスタ検証で消された
  | 'temperature_error'      // 温度解析エラー
  | 'ocr_error'              // OCR読み取りエラー
  | 'other';                 // その他

// 対応状況
export type IssueStatus =
  | 'open'                   // 未対応
  | 'investigating'          // 調査中
  | 'resolved'               // 解決済み
  | 'wont_fix';              // 対応しない

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

// 解析履歴（セッション単位で保存）- お手本機能統合版
export interface AnalysisHistoryEntry {
  id: string;                      // ユニークID (UUID)
  sessionKey: string;              // セッション識別キー（重複チェック用）
  createdAt: number;               // 解析日時
  photoCount: number;              // 写真数
  instruction: string;             // 使用した指示文
  workTypes: string[];             // 含まれる工種（サマリー用）
  photoKeys: string[];             // ファイルキーのリスト（軽量）
  modelUsed?: string;              // 使用モデル
  // お手本機能（統合）
  isExampleSession?: boolean;      // お手本として使用するか
  name?: string;                   // セッション名（お手本用、自動生成可）
  thumbnails?: string[];           // サムネイル（お手本用、最大6枚）
}

// ============================================
// GitHub同期: 学習データの型定義
// ============================================

/**
 * 学習済みルール（問題ケースから生成）
 */
export interface LearnedRule {
  id: string;
  description: string;
  condition: {
    workType?: string;
    variety?: string;
    detail?: string;
    remarks?: string;
  };
  correction: {
    workType?: string;
    variety?: string;
    detail?: string;
    station?: string;
    remarks?: string;
    measurements?: string;
  };
  createdAt: string;
  source: 'issue' | 'manual';
}

/**
 * 学習済みエイリアス（表記揺れの対応）
 */
export interface LearnedAlias {
  id: string;
  from: string;           // 誤った表現
  to: string;             // 正しい表現
  context?: string;       // 適用コンテキスト（workType等）
  createdAt: string;
}

/**
 * エクスポート用のお手本
 */
export interface LearnedExample {
  id: string;
  name: string;
  analysis: {
    workType: string;
    variety?: string;
    detail?: string;
    station: string;
    remarks: string;
    description: string;
  };
  category?: PhotoCategory;
  tags?: string[];
  createdAt: string;
}

/**
 * GitHub同期用の学習データ全体
 */
export interface LearnedSettings {
  version: number;           // バージョン番号（競合検出用）
  createdAt: string;
  updatedAt: string;
  rules: LearnedRule[];      // 問題ケースから生成されたルール
  aliases: LearnedAlias[];   // 表記揺れ対応
  examples: LearnedExample[]; // お手本データ
  ruleSettings?: Record<string, boolean>; // analysisRulesの設定
}

// ============================================
// 2層ストレージ: 型定義
// ============================================

/**
 * プロジェクト設定（リポジトリ共有）
 */
interface ProjectConfig {
  version: number;
  projectName?: string;
  defaultInstruction?: string;
  sortPolicy?: SortPolicy;
  updatedAt: string;
}

/**
 * 個人設定（別リポジトリ）
 */
interface PersonalConfig {
  version: number;
  theme?: 'light' | 'dark' | 'system';
  language?: 'ja' | 'en';
  defaultApiProvider?: 'gemini' | 'openai';
  updatedAt: string;
}

/**
 * 暗号化された認証情報
 */
interface EncryptedCredentials {
  geminiApiKey?: string;      // 暗号化済み
  githubToken?: string;       // 暗号化済み
  personalRepoUrl?: string;   // 個人リポジトリURL（平文）
  iv?: string;                // 初期化ベクトル（Base64）
  salt?: string;              // ソルト（Base64）
}

/**
 * セッションデータ（作業履歴）
 */
interface SessionData {
  id: string;
  projectId: string;
  createdAt: string;
  photoCount: number;
  instruction: string;
  workTypes: string[];
  modelUsed?: string;
  duration?: number;          // 処理時間（ms）
}

/**
 * 同期結果
 */
interface SyncResult {
  success: boolean;
  pushed: number;
  pulled: number;
  conflicts?: ConflictInfo[];
  error?: string;
}

/**
 * コンフリクト情報
 */
export interface ConflictInfo {
  file: string;
  localVersion: number;
  remoteVersion: number;
  resolution?: 'local' | 'remote' | 'merged';
}

/**
 * ストレージ設定状態
 */
interface StorageState {
  projectConfigured: boolean;
  personalConfigured: boolean;
  personalRepoUrl?: string;
  lastSyncAt?: string;
  pendingChanges: boolean;
}