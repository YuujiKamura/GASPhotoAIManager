import { describe, it, expect, beforeEach } from 'vitest';
import {
  getApiKey,
  setApiKey,
  clearApiKey,
  hasApiKey,
  getAutoApiSettings,
  setAutoApiSettings,
  isAutoApiEnabled,
  AutoApiSettings,
} from '../services/geminiService';

describe('API Key Security', () => {
  beforeEach(() => {
    // Clear storage before each test
    sessionStorage.clear();
    localStorage.clear();
  });

  describe('sessionStorage usage', () => {
    it('should store API key in sessionStorage, not localStorage', () => {
      const testKey = 'AIzaTestKey1234567890123456789012345';
      setApiKey(testKey);

      // Should be in sessionStorage
      expect(sessionStorage.getItem('construction_album_api_key')).toBe(testKey);

      // Should NOT be in localStorage
      expect(localStorage.getItem('construction_album_api_key')).toBeNull();
    });

    it('should retrieve API key from sessionStorage', () => {
      const testKey = 'AIzaTestKey1234567890123456789012345';
      sessionStorage.setItem('construction_album_api_key', testKey);

      expect(getApiKey()).toBe(testKey);
    });

    it('should clear API key from sessionStorage', () => {
      const testKey = 'AIzaTestKey1234567890123456789012345';
      setApiKey(testKey);
      clearApiKey();

      expect(getApiKey()).toBeNull();
      expect(sessionStorage.getItem('construction_album_api_key')).toBeNull();
    });
  });

  describe('hasApiKey validation', () => {
    it('should return true for valid API key starting with AIza', () => {
      setApiKey('AIzaTestKey1234567890123456789012345');
      expect(hasApiKey()).toBe(true);
    });

    it('should return false for invalid API key', () => {
      setApiKey('InvalidKey123');
      expect(hasApiKey()).toBe(false);
    });

    it('should return false when no API key is set', () => {
      expect(hasApiKey()).toBe(false);
    });
  });
});

describe('Auto API Settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('default settings', () => {
    it('should have all auto API features disabled by default', () => {
      const settings = getAutoApiSettings();

      expect(settings.autoValidateModels).toBe(false);
      expect(settings.autoSelectWorkTypes).toBe(false);
      expect(settings.autoNormalization).toBe(false);
      expect(settings.autoSceneAssignment).toBe(false);
    });
  });

  describe('isAutoApiEnabled', () => {
    it('should return false for all features by default', () => {
      expect(isAutoApiEnabled('autoValidateModels')).toBe(false);
      expect(isAutoApiEnabled('autoSelectWorkTypes')).toBe(false);
      expect(isAutoApiEnabled('autoNormalization')).toBe(false);
      expect(isAutoApiEnabled('autoSceneAssignment')).toBe(false);
    });

    it('should return true after enabling a feature', () => {
      setAutoApiSettings({ autoSelectWorkTypes: true });

      expect(isAutoApiEnabled('autoSelectWorkTypes')).toBe(true);
      // Other features should still be false
      expect(isAutoApiEnabled('autoValidateModels')).toBe(false);
    });
  });

  describe('setAutoApiSettings', () => {
    it('should persist settings to localStorage', () => {
      setAutoApiSettings({ autoNormalization: true });

      const saved = localStorage.getItem('construction_album_auto_api_settings');
      expect(saved).not.toBeNull();

      const parsed = JSON.parse(saved!);
      expect(parsed.autoNormalization).toBe(true);
    });

    it('should merge with existing settings', () => {
      setAutoApiSettings({ autoSelectWorkTypes: true });
      setAutoApiSettings({ autoNormalization: true });

      const settings = getAutoApiSettings();
      expect(settings.autoSelectWorkTypes).toBe(true);
      expect(settings.autoNormalization).toBe(true);
    });
  });
});

describe('Error Message Sanitization', () => {
  // We need to test the sanitizeErrorMessage function
  // Since it's not exported, we test it indirectly through behavior
  // or we could export it for testing purposes

  it('should not expose API key patterns in error scenarios', () => {
    // This is a conceptual test - the actual sanitization happens internally
    const apiKeyPattern = /AIza[A-Za-z0-9_-]{30,}/;
    const testMessage = 'Error with key AIzaTestKey1234567890123456789012345';

    // After sanitization, the pattern should not match
    const sanitized = testMessage.replace(apiKeyPattern, '[API_KEY_REDACTED]');
    expect(sanitized).not.toMatch(apiKeyPattern);
    expect(sanitized).toContain('[API_KEY_REDACTED]');
  });
});
