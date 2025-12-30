import { describe, it, expect, vi } from 'vitest';
import {
  checkAbort,
  formatDuration,
  trackFieldChange,
  formatExamplesForPrompt,
  parseAIResponse,
  mapToAnalysisResults,
  applyContextRelay,
  MAX_RETRIES,
  RETRY_DELAY_MS,
} from '../services/gemini/helpers';
import type { FieldChange, AnalysisExample, AIAnalysisResult } from '../types';

describe('geminiService - Helpers', () => {
  describe('checkAbort', () => {
    it('should not throw when no checker provided', () => {
      expect(() => checkAbort()).not.toThrow();
    });

    it('should not throw when checker returns false', () => {
      const checker = () => false;
      expect(() => checkAbort(checker)).not.toThrow();
    });

    it('should throw when checker returns true', () => {
      const checker = () => true;
      expect(() => checkAbort(checker)).toThrow('処理が中断されました');
    });

    it('should include context in error message', () => {
      const checker = () => true;
      expect(() => checkAbort(checker, 'バッチ処理中')).toThrow('処理が中断されました: バッチ処理中');
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds for short durations', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('should format seconds for longer durations', () => {
      expect(formatDuration(1000)).toBe('1.00s');
      expect(formatDuration(1500)).toBe('1.50s');
      expect(formatDuration(12345)).toBe('12.35s');
    });
  });

  describe('trackFieldChange', () => {
    it('should add change to log when values differ', () => {
      const log: FieldChange[] = [];
      trackFieldChange(log, 'workType', 'ai_analysis', 'old', 'new', 'AIが変更');

      expect(log).toHaveLength(1);
      expect(log[0]).toEqual({
        field: 'workType',
        stage: 'ai_analysis',
        before: 'old',
        after: 'new',
        reason: 'AIが変更'
      });
    });

    it('should not add change when values are same', () => {
      const log: FieldChange[] = [];
      trackFieldChange(log, 'workType', 'ai_analysis', 'same', 'same');

      expect(log).toHaveLength(0);
    });

    it('should accumulate multiple changes', () => {
      const log: FieldChange[] = [];
      trackFieldChange(log, 'workType', 'ai_analysis', 'a', 'b');
      trackFieldChange(log, 'station', 'master_validation', 'x', 'y');

      expect(log).toHaveLength(2);
    });
  });

  describe('formatExamplesForPrompt', () => {
    it('should return empty string for empty array', () => {
      expect(formatExamplesForPrompt([])).toBe('');
    });

    it('should format examples correctly', () => {
      const examples: AnalysisExample[] = [
        {
          id: '1',
          name: 'test.jpg',
          createdAt: new Date().toISOString(),
          analysis: {
            workType: '路盤工',
            variety: '下層路盤',
            detail: '',
            station: 'No.10',
            remarks: '到着温度',
            description: 'アスファルト舗装作業',
            hasBoard: true
          }
        }
      ];

      const result = formatExamplesForPrompt(examples);

      expect(result).toContain('FEW-SHOT EXAMPLES');
      expect(result).toContain('test.jpg');
      expect(result).toContain('路盤工');
      expect(result).toContain('下層路盤');
      expect(result).toContain('No.10');
    });

    it('should filter out examples without analysis', () => {
      const examples: AnalysisExample[] = [
        {
          id: '1',
          name: 'no-analysis.jpg',
          createdAt: new Date().toISOString()
        } as AnalysisExample
      ];

      const result = formatExamplesForPrompt(examples);
      // When all examples are filtered out, result contains header but no example content
      expect(result).toContain('FEW-SHOT EXAMPLES');
      expect(result).not.toContain('Example 1');
    });
  });

  describe('parseAIResponse', () => {
    it('should parse valid JSON array', () => {
      const json = '[{"fileName": "test.jpg", "workType": "路盤工"}]';
      const result = parseAIResponse(json);

      expect(result).toHaveLength(1);
      expect(result[0].fileName).toBe('test.jpg');
    });

    it('should wrap single object in array', () => {
      const json = '{"fileName": "test.jpg"}';
      const result = parseAIResponse(json);

      expect(result).toHaveLength(1);
      expect(result[0].fileName).toBe('test.jpg');
    });

    it('should extract JSON array from text with extra content', () => {
      const text = 'Here is the result: [{"fileName": "test.jpg"}] - done!';
      const result = parseAIResponse(text);

      expect(result).toHaveLength(1);
    });

    it('should throw for invalid JSON', () => {
      expect(() => parseAIResponse('not json at all')).toThrow('Invalid JSON response from AI');
    });
  });

  describe('mapToAnalysisResults', () => {
    it('should map parsed data to AIAnalysisResult format', () => {
      const parsed = [
        {
          fileName: 'test.jpg',
          workType: '路盤工',
          variety: '下層路盤',
          station: 'No.10',
          remarksCategory: '到着温度',
          description: 'テスト',
          hasBoard: true
        }
      ];

      const results = mapToAnalysisResults(parsed);

      expect(results).toHaveLength(1);
      expect(results[0].fileName).toBe('test.jpg');
      expect(results[0].workType).toBe('路盤工');
      expect(results[0].remarks).toBe('到着温度');
      expect(results[0].remarksCategory).toBe('到着温度');
      expect(results[0].hasBoard).toBe(true);
      expect(results[0].changeLog).toEqual([]);
    });

    it('should provide defaults for missing fields', () => {
      const parsed = [{ fileName: 'test.jpg' }];
      const results = mapToAnalysisResults(parsed);

      expect(results[0].workType).toBe('');
      expect(results[0].variety).toBe('');
      expect(results[0].hasBoard).toBe(false);
    });

    it('should default fileName to "unknown" if missing', () => {
      const parsed = [{}];
      const results = mapToAnalysisResults(parsed);

      expect(results[0].fileName).toBe('unknown');
    });
  });

  describe('applyContextRelay', () => {
    it('should inherit values from previous photos', () => {
      const results: AIAnalysisResult[] = [
        {
          fileName: 'photo1.jpg',
          workType: '路盤工',
          variety: '下層路盤',
          detail: '',
          station: 'No.10',
          remarks: '',
          remarksCategory: '',
          remarksValue: '',
          description: '',
          measurements: '',
          hasBoard: false,
          detectedText: '',
          reasoning: '',
          changeLog: []
        },
        {
          fileName: 'photo2.jpg',
          workType: '',
          variety: '',
          detail: '',
          station: '',
          remarks: '',
          remarksCategory: '',
          remarksValue: '',
          description: '',
          measurements: '',
          hasBoard: false,
          detectedText: '',
          reasoning: '',
          changeLog: []
        }
      ];

      const relayed = applyContextRelay(results);

      // Second photo should inherit from first
      expect(relayed[1].workType).toBe('路盤工');
      expect(relayed[1].variety).toBe('下層路盤');
      expect(relayed[1].station).toBe('No.10');
    });

    it('should not inherit for safety-related remarks', () => {
      const results: AIAnalysisResult[] = [
        {
          fileName: 'photo1.jpg',
          workType: '路盤工',
          variety: '下層路盤',
          detail: '',
          station: 'No.10',
          remarks: '',
          remarksCategory: '',
          remarksValue: '',
          description: '',
          measurements: '',
          hasBoard: false,
          detectedText: '',
          reasoning: '',
          changeLog: []
        },
        {
          fileName: 'safety.jpg',
          workType: '',
          variety: '',
          detail: '',
          station: '',
          remarks: '朝礼KY',  // Safety keyword
          remarksCategory: '',
          remarksValue: '',
          description: '',
          measurements: '',
          hasBoard: false,
          detectedText: '',
          reasoning: '',
          changeLog: []
        }
      ];

      const relayed = applyContextRelay(results);

      // Safety photo should NOT inherit
      expect(relayed[1].workType).toBe('');
      expect(relayed[1].station).toBe('');
    });
  });

  describe('Constants', () => {
    it('MAX_RETRIES should be positive', () => {
      expect(MAX_RETRIES).toBeGreaterThan(0);
    });

    it('RETRY_DELAY_MS should be positive', () => {
      expect(RETRY_DELAY_MS).toBeGreaterThan(0);
    });
  });
});
