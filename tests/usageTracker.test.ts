import { describe, it, expect, beforeEach } from 'vitest';
import {
  estimateTokens,
  estimateImageTokens,
  trackUsage,
  getUsageSummary,
  resetUsage,
  formatBytes,
  formatCostJPY,
  estimateQuickCost,
  addUsageListener,
  removeUsageListener,
} from '../services/usageTracker';

describe('usageTracker', () => {
  beforeEach(() => {
    resetUsage();
  });

  describe('estimateTokens', () => {
    it('should return 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('should return 0 for null/undefined input', () => {
      expect(estimateTokens(null as unknown as string)).toBe(0);
      expect(estimateTokens(undefined as unknown as string)).toBe(0);
    });

    it('should estimate tokens for English text', () => {
      const text = 'Hello world';
      const tokens = estimateTokens(text);
      // 11 chars * 0.25 = 2.75, ceil = 3
      expect(tokens).toBe(3);
    });

    it('should estimate higher tokens for Japanese text', () => {
      const text = 'こんにちは';
      const tokens = estimateTokens(text);
      // 5 Japanese chars * 0.5 = 2.5, ceil = 3
      expect(tokens).toBe(3);
    });

    it('should handle mixed Japanese and English text', () => {
      const text = 'Hello こんにちは';
      const tokens = estimateTokens(text);
      // 6 English chars (including space) * 0.25 + 5 Japanese chars * 0.5
      // = 1.5 + 2.5 = 4
      expect(tokens).toBe(4);
    });
  });

  describe('estimateImageTokens', () => {
    it('should return 0 for 0 images', () => {
      expect(estimateImageTokens(0)).toBe(0);
    });

    it('should return 258 tokens per image', () => {
      expect(estimateImageTokens(1)).toBe(258);
      expect(estimateImageTokens(5)).toBe(1290);
      expect(estimateImageTokens(10)).toBe(2580);
    });
  });

  describe('trackUsage', () => {
    it('should record usage and update summary', () => {
      const record = trackUsage(
        'gemini-2.5-flash',
        'Test input',
        'Test output',
        1,
        'test-operation'
      );

      expect(record.model).toBe('gemini-2.5-flash');
      expect(record.imageCount).toBe(1);
      expect(record.operation).toBe('test-operation');
      expect(record.inputTokens).toBeGreaterThan(0);
      expect(record.outputTokens).toBeGreaterThan(0);
      expect(record.estimatedCost).toBeGreaterThan(0);

      const summary = getUsageSummary();
      expect(summary.totalCalls).toBe(1);
      expect(summary.totalImages).toBe(1);
      expect(summary.records).toHaveLength(1);
    });

    it('should accumulate multiple usage records', () => {
      trackUsage('gemini-2.5-flash', 'Input 1', 'Output 1', 2, 'op1');
      trackUsage('gemini-2.5-flash', 'Input 2', 'Output 2', 3, 'op2');

      const summary = getUsageSummary();
      expect(summary.totalCalls).toBe(2);
      expect(summary.totalImages).toBe(5);
      expect(summary.records).toHaveLength(2);
    });

    it('should use default pricing for unknown models', () => {
      const record = trackUsage(
        'unknown-model',
        'Test input',
        'Test output',
        1,
        'test'
      );

      // Should still calculate cost using default pricing
      expect(record.estimatedCost).toBeGreaterThan(0);
    });

    it('should calculate different costs for different models', () => {
      const flashRecord = trackUsage(
        'gemini-2.5-flash',
        'Same input text here',
        'Same output text',
        1,
        'test'
      );

      resetUsage();

      const proRecord = trackUsage(
        'gemini-3-pro-preview',
        'Same input text here',
        'Same output text',
        1,
        'test'
      );

      // Pro model should be more expensive
      expect(proRecord.estimatedCost).toBeGreaterThan(flashRecord.estimatedCost);
    });
  });

  describe('getUsageSummary', () => {
    it('should return a copy of the summary', () => {
      trackUsage('gemini-2.5-flash', 'Test', 'Output', 1, 'test');

      const summary1 = getUsageSummary();
      const summary2 = getUsageSummary();

      expect(summary1).not.toBe(summary2); // Different object references
      expect(summary1.records).not.toBe(summary2.records); // Different array references
    });

    it('should include JPY conversion', () => {
      trackUsage('gemini-2.5-flash', 'Test input', 'Test output', 5, 'test');

      const summary = getUsageSummary();
      expect(summary.estimatedCostJPY).toBe(summary.estimatedCostUSD * 150);
    });
  });

  describe('resetUsage', () => {
    it('should clear all usage data', () => {
      trackUsage('gemini-2.5-flash', 'Test', 'Output', 10, 'test');

      const beforeReset = getUsageSummary();
      expect(beforeReset.totalCalls).toBe(1);

      resetUsage();

      const afterReset = getUsageSummary();
      expect(afterReset.totalCalls).toBe(0);
      expect(afterReset.totalInputTokens).toBe(0);
      expect(afterReset.totalOutputTokens).toBe(0);
      expect(afterReset.totalImages).toBe(0);
      expect(afterReset.estimatedCostUSD).toBe(0);
      expect(afterReset.estimatedCostJPY).toBe(0);
      expect(afterReset.records).toHaveLength(0);
    });
  });

  describe('formatBytes', () => {
    it('should format 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('should format bytes', () => {
      expect(formatBytes(512)).toBe('512 B');
    });

    it('should format kilobytes', () => {
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('should format megabytes', () => {
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1572864)).toBe('1.5 MB');
    });

    it('should format gigabytes', () => {
      expect(formatBytes(1073741824)).toBe('1 GB');
    });
  });

  describe('formatCostJPY', () => {
    it('should format small costs with decimal places', () => {
      expect(formatCostJPY(0.001)).toBe('¥0.15');
      expect(formatCostJPY(0.005)).toBe('¥0.75');
    });

    it('should format larger costs as whole numbers', () => {
      expect(formatCostJPY(1)).toBe('¥150');
      expect(formatCostJPY(10)).toBe('¥1,500');
    });
  });

  describe('estimateQuickCost', () => {
    it('should return min, max, and typical costs', () => {
      const estimate = estimateQuickCost(10);

      expect(estimate).toHaveProperty('min');
      expect(estimate).toHaveProperty('max');
      expect(estimate).toHaveProperty('typical');
    });

    it('should have min < typical < max', () => {
      const estimate = estimateQuickCost(10);

      expect(estimate.min).toBeLessThan(estimate.typical);
      expect(estimate.typical).toBeLessThan(estimate.max);
    });

    it('should scale with image count', () => {
      const small = estimateQuickCost(5);
      const large = estimateQuickCost(50);

      expect(large.min).toBeGreaterThan(small.min);
      expect(large.max).toBeGreaterThan(small.max);
    });
  });

  describe('usage listeners', () => {
    it('should notify listeners on trackUsage', () => {
      let notified = false;
      let receivedSummary: ReturnType<typeof getUsageSummary> | null = null;

      const listener = (summary: ReturnType<typeof getUsageSummary>) => {
        notified = true;
        receivedSummary = summary;
      };

      addUsageListener(listener);
      trackUsage('gemini-2.5-flash', 'Test', 'Output', 1, 'test');

      expect(notified).toBe(true);
      expect(receivedSummary?.totalCalls).toBe(1);

      removeUsageListener(listener);
    });

    it('should notify listeners on resetUsage', () => {
      let callCount = 0;

      const listener = () => {
        callCount++;
      };

      addUsageListener(listener);

      trackUsage('gemini-2.5-flash', 'Test', 'Output', 1, 'test');
      expect(callCount).toBe(1);

      resetUsage();
      expect(callCount).toBe(2);

      removeUsageListener(listener);
    });

    it('should remove listener correctly', () => {
      let callCount = 0;

      const listener = () => {
        callCount++;
      };

      addUsageListener(listener);
      trackUsage('gemini-2.5-flash', 'Test', 'Output', 1, 'test');
      expect(callCount).toBe(1);

      removeUsageListener(listener);
      trackUsage('gemini-2.5-flash', 'Test', 'Output', 1, 'test');
      expect(callCount).toBe(1); // Should not have increased
    });
  });
});
