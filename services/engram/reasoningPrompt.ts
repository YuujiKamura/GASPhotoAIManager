/**
 * 推論専用プロンプト生成
 *
 * Engram Level 3: プロンプトは推論ルールのみ
 * - 知識は外部メモリから動的に取得
 * - プロンプトサイズを最小化
 * - 推論ロジックに集中
 */

import { KnowledgeEntry } from './knowledgeDB';
import { AppMode } from '../../types';

// ============================================
// 推論プロンプトテンプレート
// ============================================

/**
 * 推論専用システムプロンプト（最小版）
 *
 * 知識は外部メモリから注入されるため、プロンプトは推論ルールのみ
 */
export const REASONING_SYSTEM_PROMPT = `
# 工事写真解析AI

あなたは工事写真を解析し、適切な分類を行うAIです。

## 推論ルール

1. **工種判定**: 写真に写っている作業内容から工種を特定
2. **種別判定**: 工種の下位分類として種別を特定
3. **細別判定**: 種別の下位分類として細別を特定（該当する場合）
4. **摘要判定**: 写真の具体的な状況を簡潔に記述

## 判定優先順位

1. **視覚情報優先**: 写真に明確に写っている情報を最優先
2. **黒板情報活用**: 黒板に記載がある場合は参照
3. **コンテキスト推論**: 前後の写真や作業状況から推論
4. **知識ベース照合**: 提供された知識と照合して確定

## 出力形式

JSON形式で以下のフィールドを出力:
- fileName: ファイル名
- workType: 工種
- variety: 種別（該当する場合）
- detail: 細別（該当する場合）
- remarks: 摘要
- description: 写真の説明
- confidence: 確信度 (0-1)
- reasoning: 判定理由（簡潔に）

## 重要な注意

- 不明な場合は推測せず、確信度を下げて報告
- 安全管理写真（朝礼等）は時間帯も考慮
- 知識ベースにない分類は使用しない
`.trim();

// ============================================
// 知識注入用フォーマッタ
// ============================================

/**
 * マスタ知識をプロンプト用にフォーマット
 */
export const formatMasterKnowledge = (entries: KnowledgeEntry[]): string => {
  if (entries.length === 0) return '';

  const lines = ['## 利用可能な分類（工種→種別→細別→摘要）'];

  // 工種でグループ化
  const byWorkType = new Map<string, KnowledgeEntry[]>();
  for (const entry of entries) {
    const wt = entry.workType || '不明';
    if (!byWorkType.has(wt)) {
      byWorkType.set(wt, []);
    }
    byWorkType.get(wt)!.push(entry);
  }

  for (const [workType, wtEntries] of byWorkType) {
    lines.push(`\n### ${workType}`);

    // 種別でグループ化
    const byVariety = new Map<string, KnowledgeEntry[]>();
    for (const entry of wtEntries) {
      const v = entry.variety || '-';
      if (!byVariety.has(v)) {
        byVariety.set(v, []);
      }
      byVariety.get(v)!.push(entry);
    }

    for (const [variety, vEntries] of byVariety) {
      if (variety !== '-') {
        lines.push(`- ${variety}`);
        for (const entry of vEntries.slice(0, 5)) {
          if (entry.detail) {
            lines.push(`  - ${entry.detail}: ${entry.remarks || ''}`);
          } else if (entry.remarks) {
            lines.push(`  - ${entry.remarks}`);
          }
        }
      }
    }
  }

  return lines.join('\n');
};

/**
 * お手本知識をプロンプト用にフォーマット
 */
export const formatExampleKnowledge = (entries: KnowledgeEntry[]): string => {
  if (entries.length === 0) return '';

  const lines = ['## 参考例（過去の正しい分類）'];

  for (const entry of entries.slice(0, 3)) {
    const data = entry.data;
    if (data?.analysis) {
      lines.push(`\n### 例: ${data.name || entry.id}`);
      lines.push(`- 工種: ${data.analysis.workType || '不明'}`);
      if (data.analysis.variety) lines.push(`- 種別: ${data.analysis.variety}`);
      if (data.analysis.detail) lines.push(`- 細別: ${data.analysis.detail}`);
      if (data.analysis.remarks) lines.push(`- 摘要: ${data.analysis.remarks}`);
      if (data.analysis.description) lines.push(`- 説明: ${data.analysis.description}`);
    }
  }

  return lines.join('\n');
};

/**
 * ルール知識をプロンプト用にフォーマット
 */
export const formatRuleKnowledge = (entries: KnowledgeEntry[]): string => {
  if (entries.length === 0) return '';

  const lines = ['## 学習済み修正ルール'];

  for (const entry of entries.slice(0, 10)) {
    const data = entry.data;
    if (data?.condition && data?.correction) {
      const conditions = Object.entries(data.condition)
        .filter(([_, v]) => v)
        .map(([k, v]) => `${k}="${v}"`)
        .join(', ');
      const corrections = Object.entries(data.correction)
        .filter(([_, v]) => v)
        .map(([k, v]) => `${k}="${v}"`)
        .join(', ');
      lines.push(`- ${conditions} → ${corrections}`);
    }
  }

  return lines.join('\n');
};

/**
 * エイリアス知識をプロンプト用にフォーマット
 */
export const formatAliasKnowledge = (entries: KnowledgeEntry[]): string => {
  if (entries.length === 0) return '';

  const lines = ['## 用語変換（左側は使用禁止、右側を使用）'];

  for (const entry of entries.slice(0, 20)) {
    const data = entry.data;
    if (data?.from && data?.to) {
      const context = data.context ? ` (${data.context})` : '';
      lines.push(`- "${data.from}" → "${data.to}"${context}`);
    }
  }

  return lines.join('\n');
};

// ============================================
// プロンプト構築
// ============================================

export interface ReasoningPromptOptions {
  appMode: AppMode;
  instruction?: string;
  masters?: KnowledgeEntry[];
  examples?: KnowledgeEntry[];
  rules?: KnowledgeEntry[];
  aliases?: KnowledgeEntry[];
}

/**
 * 推論専用プロンプトを構築
 *
 * 知識は外部から注入され、最小限のプロンプトを生成
 */
export const buildReasoningPrompt = (options: ReasoningPromptOptions): string => {
  const {
    appMode,
    instruction,
    masters = [],
    examples = [],
    rules = [],
    aliases = []
  } = options;

  const parts: string[] = [];

  // 1. ベースプロンプト
  parts.push(REASONING_SYSTEM_PROMPT);

  // 2. カスタム指示
  if (instruction) {
    parts.push(`\n## 追加指示\n${instruction}`);
  }

  // 3. 知識注入（必要最小限）
  if (appMode === 'construction') {
    // マスタ（工種選択済みの場合のみ）
    if (masters.length > 0) {
      parts.push('\n' + formatMasterKnowledge(masters));
    }

    // お手本（最大3件）
    if (examples.length > 0) {
      parts.push('\n' + formatExampleKnowledge(examples));
    }

    // ルール（最大10件）
    if (rules.length > 0) {
      parts.push('\n' + formatRuleKnowledge(rules));
    }

    // エイリアス（最大20件）
    if (aliases.length > 0) {
      parts.push('\n' + formatAliasKnowledge(aliases));
    }
  }

  return parts.filter(Boolean).join('\n');
};

/**
 * プロンプトサイズを推定（トークン数概算）
 */
export const estimatePromptTokens = (prompt: string): number => {
  // 日本語は約1.5文字/トークン、英語は約4文字/トークン
  // 混在を想定して約2文字/トークンで概算
  return Math.ceil(prompt.length / 2);
};
