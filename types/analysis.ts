/**
 * 解析関連の型定義
 * AnalysisIssue, AnalysisExample, AnalysisHistoryEntry など
 */

import type { AIAnalysisResult, PhotoCategory } from './photo';

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
  updatedAt?: number;              // 最終更新日時
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
