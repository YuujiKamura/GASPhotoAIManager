/**
 * 学習データ関連の型定義
 * GitHub同期用のルール、エイリアス、お手本など
 */

import type { PhotoCategory } from './photo';

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
