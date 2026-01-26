/**
 * explainService の振る舞いテスト
 *
 * Claude CLIを使ってプロンプトが意図通りに動作するか検証する。
 * - Gemini APIの代わりにClaude CLIを使用（定額なのでコストなし）
 * - 非決定的なので100%パスするとは限らない
 * - CIでは実行せず、プロンプト変更時に手動で確認用
 *
 * 実行方法: npm test -- tests/explainService.behavior.test.ts
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { buildExplainPrompt } from '../services/gemini/explainService';
import type { AIAnalysisResult } from '../types';

// Claude CLIを呼び出す
const askClaude = (prompt: string): string => {
  // テスト用のラッパープロンプト
  // Claude CLIがプロジェクトコンテキストを読み込むため、
  // 明示的に「ロールプレイ」であることを伝える
  const testPrompt = `
【テスト用プロンプト - ロールプレイとして回答してください】

以下は工事写真AI解析システムのテストです。
あなたは「工事写真の解析結果を説明するAIアシスタント」として、
下記のプロンプトに対して日本語で回答してください。

コードの修正や提案は不要です。プロンプトの指示に従って回答のみ出力してください。

---
${prompt}
---

上記のプロンプトに対する回答を日本語で出力してください：
`;

  // 一時ファイルに書き出してClaude CLIに渡す（特殊文字の問題を回避）
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const tmpFile = path.join(os.tmpdir(), `claude-test-${Date.now()}.txt`);

  try {
    fs.writeFileSync(tmpFile, testPrompt, 'utf-8');

    // Windows環境ではcmd経由で実行
    const result = execSync(
      `cmd /c "type "${tmpFile}" | claude -p --model haiku"`,
      { encoding: 'utf-8', timeout: 60000 }
    );
    return result.trim();
  } catch (error) {
    console.error('Claude CLI error:', error);
    return '';
  } finally {
    // 一時ファイルを削除
    try {
      fs.unlinkSync(tmpFile);
    } catch {}
  }
};

// CI環境ではスキップ
const isCI = process.env.CI === 'true';
const describeOrSkip = isCI ? describe.skip : describe;

describeOrSkip('explainService - 振る舞いテスト (Claude CLI)', () => {
  // テスト用の解析データ
  const baseAnalysis: AIAnalysisResult = {
    workType: '舗装工',
    variety: '表層',
    detail: 'アスファルト舗装',
    station: 'No.10+5.0',
    remarks: '',
    description: '表層施工状況',
    measurements: '',
    hasBoard: true,
    detectedText: '令和6年度 道路改良工事',
    reasoning: '',
  };

  describe('reasoning がある場合', () => {
    it('AIは判断根拠を参照した回答をする（「推測」を使わない）', async () => {
      const analysis: AIAnalysisResult = {
        ...baseAnalysis,
        reasoning: '黒板に「表層工」と明記されており、アスファルトフィニッシャーと作業員が写っているため舗装工・表層と判断した。',
      };

      const { prompt } = buildExplainPrompt(analysis, 'なぜ舗装工と判断したのですか？');
      const response = askClaude(prompt);

      console.log('=== reasoning あり ===');
      console.log('Response:', response);

      // 推測ではなく根拠に基づいた回答をしているはず
      expect(response.toLowerCase()).not.toContain('推測');
      // 黒板や表層など、判断根拠に含まれる情報を参照しているはず
      expect(response).toMatch(/黒板|表層|フィニッシャー|判断根拠/);
    }, 90000); // タイムアウト90秒
  });

  describe('reasoning がない場合', () => {
    it('AIは「推測」である旨を明示する', async () => {
      const analysis: AIAnalysisResult = {
        ...baseAnalysis,
        reasoning: '', // 空
      };

      const { prompt } = buildExplainPrompt(analysis, 'なぜ舗装工と判断したのですか？');
      const response = askClaude(prompt);

      console.log('=== reasoning なし ===');
      console.log('Response:', response);

      // 推測であることを明示しているはず
      expect(response).toMatch(/推測|記録.*ない|根拠.*ない/);
    }, 90000);
  });

  describe('質問への応答', () => {
    it('ユーザーの質問に対して適切に回答する', async () => {
      const analysis: AIAnalysisResult = {
        ...baseAnalysis,
        reasoning: '測点No.10+5.0の位置で撮影された写真。黒板の記載から特定。',
      };

      const { prompt } = buildExplainPrompt(analysis, '測点はどこですか？');
      const response = askClaude(prompt);

      console.log('=== 質問への応答 ===');
      console.log('Response:', response);

      // 測点に関する情報が含まれているはず
      expect(response).toMatch(/No\.10|測点|10\+5/);
    }, 90000);
  });
});
