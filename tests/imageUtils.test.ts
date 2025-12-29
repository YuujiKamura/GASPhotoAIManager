import { describe, it, expect } from 'vitest';
import { extractBase64Data } from '../utils/imageUtils';

describe('extractBase64Data', () => {
  it('extracts base64 data from a valid data URL', () => {
    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    expect(extractBase64Data(dataUrl)).toBe('/9j/4AAQSkZJRg==');
  });

  it('handles data URL with different mime types', () => {
    const pngUrl = 'data:image/png;base64,iVBORw0KGgoAAAANS';
    expect(extractBase64Data(pngUrl)).toBe('iVBORw0KGgoAAAANS');
  });

  it('returns empty string for undefined input', () => {
    expect(extractBase64Data(undefined)).toBe('');
  });

  it('returns empty string for empty string input', () => {
    expect(extractBase64Data('')).toBe('');
  });

  it('returns empty string for string without comma', () => {
    expect(extractBase64Data('no-comma-here')).toBe('');
  });

  it('handles base64 data with special characters', () => {
    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQ+Sk/ZJRg==';
    expect(extractBase64Data(dataUrl)).toBe('/9j/4AAQ+Sk/ZJRg==');
  });
});
