import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AVAILABLE_MODELS,
  getSelectedModel,
  setSelectedModel,
  getBestAvailableModel,
  PRIMARY_MODEL,
  FALLBACK_MODEL,
  SELECTOR_MODEL,
  ModelType,
  ModelAvailability,
} from '../services/geminiService';

describe('geminiService - Models', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('AVAILABLE_MODELS', () => {
    it('should have defined models', () => {
      expect(AVAILABLE_MODELS.length).toBeGreaterThan(0);
    });

    it('should have id, name, and description for each model', () => {
      AVAILABLE_MODELS.forEach(model => {
        expect(model.id).toBeDefined();
        expect(model.name).toBeDefined();
        expect(model.description).toBeDefined();
      });
    });

    it('should include flash and pro models', () => {
      const ids = AVAILABLE_MODELS.map(m => m.id);
      expect(ids.some(id => id.includes('flash'))).toBe(true);
      expect(ids.some(id => id.includes('pro'))).toBe(true);
    });
  });

  describe('getSelectedModel', () => {
    it('should return default model when nothing is saved', () => {
      const model = getSelectedModel();
      expect(model).toBe('gemini-3.0-flash');
    });

    it('should return saved model from localStorage', () => {
      localStorage.setItem('construction_album_model', 'gemini-2.5-flash');
      const model = getSelectedModel();
      expect(model).toBe('gemini-2.5-flash');
    });

    it('should return default if saved model is invalid', () => {
      localStorage.setItem('construction_album_model', 'invalid-model');
      const model = getSelectedModel();
      expect(model).toBe('gemini-3.0-flash');
    });
  });

  describe('setSelectedModel', () => {
    it('should save model to localStorage', () => {
      setSelectedModel('gemini-2.5-pro');
      expect(localStorage.getItem('construction_album_model')).toBe('gemini-2.5-pro');
    });

    it('should be retrievable via getSelectedModel', () => {
      setSelectedModel('gemini-2.0-flash');
      expect(getSelectedModel()).toBe('gemini-2.0-flash');
    });
  });

  describe('getBestAvailableModel', () => {
    it('should return null when no models are available', () => {
      const availabilities: ModelAvailability[] = AVAILABLE_MODELS.map(m => ({
        ...m,
        status: 'unavailable'
      }));
      expect(getBestAvailableModel(availabilities)).toBeNull();
    });

    it('should return first available model in priority order', () => {
      const availabilities: ModelAvailability[] = [
        { id: 'gemini-3.0-flash', name: '', description: '', status: 'unavailable' },
        { id: 'gemini-3.0-pro', name: '', description: '', status: 'available' },
        { id: 'gemini-2.5-flash', name: '', description: '', status: 'available' },
        { id: 'gemini-2.5-pro', name: '', description: '', status: 'available' },
        { id: 'gemini-2.0-flash', name: '', description: '', status: 'available' },
      ];
      expect(getBestAvailableModel(availabilities)).toBe('gemini-3.0-pro');
    });

    it('should prioritize 3.0-flash over other models', () => {
      const availabilities: ModelAvailability[] = [
        { id: 'gemini-3.0-flash', name: '', description: '', status: 'available' },
        { id: 'gemini-3.0-pro', name: '', description: '', status: 'available' },
        { id: 'gemini-2.5-flash', name: '', description: '', status: 'available' },
        { id: 'gemini-2.5-pro', name: '', description: '', status: 'available' },
        { id: 'gemini-2.0-flash', name: '', description: '', status: 'available' },
      ];
      expect(getBestAvailableModel(availabilities)).toBe('gemini-3.0-flash');
    });

    it('should skip quota_exceeded models', () => {
      const availabilities: ModelAvailability[] = [
        { id: 'gemini-3.0-flash', name: '', description: '', status: 'quota_exceeded' },
        { id: 'gemini-3.0-pro', name: '', description: '', status: 'quota_exceeded' },
        { id: 'gemini-2.5-flash', name: '', description: '', status: 'available' },
        { id: 'gemini-2.5-pro', name: '', description: '', status: 'unavailable' },
        { id: 'gemini-2.0-flash', name: '', description: '', status: 'available' },
      ];
      expect(getBestAvailableModel(availabilities)).toBe('gemini-2.5-flash');
    });

    it('should handle empty array', () => {
      expect(getBestAvailableModel([])).toBeNull();
    });
  });

  describe('Model constants', () => {
    it('PRIMARY_MODEL should be a valid model type', () => {
      const validIds = AVAILABLE_MODELS.map(m => m.id);
      expect(validIds).toContain(PRIMARY_MODEL);
    });

    it('FALLBACK_MODEL should be a valid model type', () => {
      const validIds = AVAILABLE_MODELS.map(m => m.id);
      expect(validIds).toContain(FALLBACK_MODEL);
    });

    it('SELECTOR_MODEL should be a valid model type', () => {
      const validIds = AVAILABLE_MODELS.map(m => m.id);
      expect(validIds).toContain(SELECTOR_MODEL);
    });

    it('FALLBACK_MODEL should be different from PRIMARY_MODEL', () => {
      // Fallback should be a different model for resilience
      expect(FALLBACK_MODEL).not.toBe(PRIMARY_MODEL);
    });
  });
});
