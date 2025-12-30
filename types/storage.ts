/**
 * ストレージ関連の型定義
 * 2層ストレージ、設定、同期など
 */

import type { SortPolicy } from './photo';

/**
 * プロジェクト設定（リポジトリ共有）
 */
export interface ProjectConfig {
  version: number;
  projectName?: string;
  defaultInstruction?: string;
  sortPolicy?: SortPolicy;
  updatedAt: string;
}

/**
 * 個人設定（別リポジトリ）
 */
export interface PersonalConfig {
  version: number;
  theme?: 'light' | 'dark' | 'system';
  language?: 'ja' | 'en';
  defaultApiProvider?: 'gemini' | 'openai';
  updatedAt: string;
}

/**
 * 暗号化された認証情報
 */
export interface EncryptedCredentials {
  geminiApiKey?: string;      // 暗号化済み
  githubToken?: string;       // 暗号化済み
  personalRepoUrl?: string;   // 個人リポジトリURL（平文）
  iv?: string;                // 初期化ベクトル（Base64）
  salt?: string;              // ソルト（Base64）
}

/**
 * セッションデータ（作業履歴）
 */
export interface SessionData {
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
export interface SyncResult {
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
export interface StorageState {
  projectConfigured: boolean;
  personalConfigured: boolean;
  personalRepoUrl?: string;
  lastSyncAt?: string;
  pendingChanges: boolean;
}
