import { describe, it, expect } from 'vitest';
import { buildExplainPrompt } from '../services/gemini/explainService';
import type { AIAnalysisResult } from '../types';

describe('explainService - buildExplainPrompt', () => {
  const baseAnalysis: AIAnalysisResult = {
    workType: '舗装工',
    variety: '表層',
    detail: 'アスファルト舗装',
    station: 'No.10+5.0',
    remarks: '',
    description: '表層施工状況',
    measurements: '',
    hasBoard: true,
    detectedText: '令和6年度 〇〇工事',
    reasoning: '',
  };

  describe('reasoning がある場合', () => {
    it('hasReasoning が true を返す', () => {
      const analysis = {
        ...baseAnalysis,
        reasoning: '黒板に「表層」と記載があり、アスファルトフィニッシャーが写っているため舗装工と判断',
      };

      const { hasReasoning } = buildExplainPrompt(analysis);
      expect(hasReasoning).toBe(true);
    });

    it('プロンプトに「判断根拠を元に」のルールが含まれる', () => {
      const analysis = {
        ...baseAnalysis,
        reasoning: '黒板に「表層」と記載があり、アスファルトフィニッシャーが写っているため舗装工と判断',
      };

      const { prompt } = buildExplainPrompt(analysis);
      expect(prompt).toContain('「判断根拠 (reasoning)」に記録された内容を元に');
      expect(prompt).toContain('元の判断根拠を補足・展開する形で回答する');
    });

    it('プロンプトに reasoning の値が含まれる', () => {
      const reasoningText = '黒板に「表層」と記載があり、アスファルトフィニッシャーが写っているため舗装工と判断';
      const analysis = {
        ...baseAnalysis,
        reasoning: reasoningText,
      };

      const { prompt } = buildExplainPrompt(analysis);
      expect(prompt).toContain(reasoningText);
    });

    it('「推測になるが」のルールが含まれない', () => {
      const analysis = {
        ...baseAnalysis,
        reasoning: '何らかの判断根拠',
      };

      const { prompt } = buildExplainPrompt(analysis);
      expect(prompt).not.toContain('推測になるが');
    });
  });

  describe('reasoning がない場合', () => {
    it('hasReasoning が false を返す（空文字）', () => {
      const analysis = {
        ...baseAnalysis,
        reasoning: '',
      };

      const { hasReasoning } = buildExplainPrompt(analysis);
      expect(hasReasoning).toBe(false);
    });

    it('hasReasoning が false を返す（undefined）', () => {
      const analysis = {
        ...baseAnalysis,
        reasoning: undefined,
      };

      const { hasReasoning } = buildExplainPrompt(analysis);
      expect(hasReasoning).toBe(false);
    });

    it('hasReasoning が false を返す（空白のみ）', () => {
      const analysis = {
        ...baseAnalysis,
        reasoning: '   ',
      };

      const { hasReasoning } = buildExplainPrompt(analysis);
      expect(hasReasoning).toBe(false);
    });

    it('プロンプトに「推測になるが」のルールが含まれる', () => {
      const analysis = {
        ...baseAnalysis,
        reasoning: '',
      };

      const { prompt } = buildExplainPrompt(analysis);
      expect(prompt).toContain('判断根拠が記録されていないため、写真を見て推測する');
      expect(prompt).toContain('「記録がないため推測になるが」と前置きしてから説明する');
    });

    it('プロンプトに「(記録なし)」が表示される', () => {
      const analysis = {
        ...baseAnalysis,
        reasoning: '',
      };

      const { prompt } = buildExplainPrompt(analysis);
      expect(prompt).toContain('- 判断根拠 (reasoning): (記録なし)');
    });
  });

  describe('ユーザー質問の処理', () => {
    it('質問が指定された場合、その質問がプロンプトに含まれる', () => {
      const analysis = { ...baseAnalysis };
      const question = '工種が舗装工になった理由は？';

      const { prompt } = buildExplainPrompt(analysis, question);
      expect(prompt).toContain(question);
    });

    it('質問が空の場合、デフォルトの質問が使われる', () => {
      const analysis = { ...baseAnalysis };

      const { prompt } = buildExplainPrompt(analysis, '');
      expect(prompt).toContain('この写真がなぜこの解析結果になったのか、理由を説明してください');
    });

    it('質問がundefinedの場合、デフォルトの質問が使われる', () => {
      const analysis = { ...baseAnalysis };

      const { prompt } = buildExplainPrompt(analysis);
      expect(prompt).toContain('この写真がなぜこの解析結果になったのか、理由を説明してください');
    });
  });

  describe('解析結果のフォーマット', () => {
    it('全フィールドがプロンプトに含まれる', () => {
      const analysis: AIAnalysisResult = {
        workType: '舗装工',
        variety: '表層',
        detail: 'アスファルト舗装',
        station: 'No.10+5.0',
        remarks: '天候：晴れ',
        description: '表層施工状況',
        measurements: '厚さ5cm',
        hasBoard: true,
        detectedText: '令和6年度 〇〇工事',
        reasoning: '判断根拠テスト',
      };

      const { prompt } = buildExplainPrompt(analysis);

      expect(prompt).toContain('- 工種 (workType): 舗装工');
      expect(prompt).toContain('- 種別 (variety): 表層');
      expect(prompt).toContain('- 細別 (detail): アスファルト舗装');
      expect(prompt).toContain('- 測点 (station): No.10+5.0');
      expect(prompt).toContain('- 備考 (remarks): 天候：晴れ');
      expect(prompt).toContain('- 記事 (description): 表層施工状況');
      expect(prompt).toContain('- 測定値 (measurements): 厚さ5cm');
      expect(prompt).toContain('- 黒板有無 (hasBoard): あり');
      expect(prompt).toContain('- 検出テキスト (detectedText): 令和6年度 〇〇工事');
      expect(prompt).toContain('- 判断根拠 (reasoning): 判断根拠テスト');
    });

    it('空のフィールドは「(空)」と表示される', () => {
      const analysis: AIAnalysisResult = {
        workType: '',
        variety: '',
        detail: '',
        station: '',
        remarks: '',
        description: '',
        measurements: '',
        hasBoard: false,
        detectedText: '',
        reasoning: '',
      };

      const { prompt } = buildExplainPrompt(analysis);

      expect(prompt).toContain('- 工種 (workType): (空)');
      expect(prompt).toContain('- 種別 (variety): (空)');
      expect(prompt).toContain('- 黒板有無 (hasBoard): なし');
    });
  });
});
