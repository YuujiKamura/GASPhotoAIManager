import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadAliasSettings,
  saveAliasSettings,
  applyPreset,
  clearAliasSettings,
  hasAliases,
  applyWorkTypeAlias,
  applyVarietyAlias,
  PRESET_ALIASES,
  AliasSettings
} from '../utils/workTypeAliases';

describe('workTypeAliases', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('loadAliasSettings', () => {
    it('returns default settings when nothing is saved', () => {
      const settings = loadAliasSettings();
      expect(settings.enabled).toBe(false);
      expect(settings.mappings.workType).toEqual({});
      expect(settings.mappings.variety).toEqual({});
    });

    it('loads saved settings from localStorage', () => {
      const saved: AliasSettings = {
        enabled: true,
        mappings: {
          workType: { '舗装工': '舗装補修工' },
          variety: {},
          detail: {}
        }
      };
      localStorage.setItem('worktype_aliases', JSON.stringify(saved));

      const settings = loadAliasSettings();
      expect(settings.enabled).toBe(true);
      expect(settings.mappings.workType['舗装工']).toBe('舗装補修工');
    });

    it('returns default settings for invalid JSON', () => {
      localStorage.setItem('worktype_aliases', 'not-valid-json');
      const settings = loadAliasSettings();
      expect(settings.enabled).toBe(false);
    });
  });

  describe('saveAliasSettings', () => {
    it('saves settings to localStorage', () => {
      const settings: AliasSettings = {
        enabled: true,
        mappings: {
          workType: { 'A': 'B' },
          variety: {},
          detail: {}
        }
      };
      saveAliasSettings(settings);

      const saved = JSON.parse(localStorage.getItem('worktype_aliases') || '{}');
      expect(saved.enabled).toBe(true);
      expect(saved.mappings.workType['A']).toBe('B');
    });
  });

  describe('applyPreset', () => {
    it('applies preset and enables settings', () => {
      const settings = applyPreset('舗装補修');
      expect(settings.enabled).toBe(true);
      expect(settings.activePreset).toBe('舗装補修');
      expect(settings.mappings.workType['舗装工']).toBe('舗装補修工');
    });
  });

  describe('clearAliasSettings', () => {
    it('clears all settings', () => {
      applyPreset('舗装補修');
      const cleared = clearAliasSettings();
      expect(cleared.enabled).toBe(false);
      expect(cleared.mappings.workType).toEqual({});
    });
  });

  describe('hasAliases', () => {
    it('returns false for empty mappings', () => {
      const settings: AliasSettings = {
        enabled: true,
        mappings: { workType: {}, variety: {}, detail: {} }
      };
      expect(hasAliases(settings)).toBe(false);
    });

    it('returns true when workType has mappings', () => {
      const settings: AliasSettings = {
        enabled: true,
        mappings: { workType: { 'A': 'B' }, variety: {}, detail: {} }
      };
      expect(hasAliases(settings)).toBe(true);
    });
  });

  describe('applyWorkTypeAlias', () => {
    it('returns original value when no alias exists', () => {
      const settings: AliasSettings = {
        enabled: true,
        mappings: { workType: {}, variety: {}, detail: {} }
      };
      saveAliasSettings(settings);
      expect(applyWorkTypeAlias('舗装工')).toBe('舗装工');
    });

    it('returns aliased value when alias exists', () => {
      const settings: AliasSettings = {
        enabled: true,
        mappings: {
          workType: { '舗装工': '舗装補修工' },
          variety: {},
          detail: {}
        }
      };
      saveAliasSettings(settings);
      expect(applyWorkTypeAlias('舗装工')).toBe('舗装補修工');
    });

    it('returns original value when disabled', () => {
      const settings: AliasSettings = {
        enabled: false,
        mappings: {
          workType: { '舗装工': '舗装補修工' },
          variety: {},
          detail: {}
        }
      };
      saveAliasSettings(settings);
      expect(applyWorkTypeAlias('舗装工')).toBe('舗装工');
    });
  });

  describe('applyVarietyAlias', () => {
    it('returns aliased variety value', () => {
      const settings: AliasSettings = {
        enabled: true,
        mappings: {
          workType: {},
          variety: { '舗装打換え工': 'アスファルト舗装補修工' },
          detail: {}
        }
      };
      saveAliasSettings(settings);
      expect(applyVarietyAlias('舗装打換え工')).toBe('アスファルト舗装補修工');
    });
  });

  describe('PRESET_ALIASES', () => {
    it('has 舗装補修 preset', () => {
      expect(PRESET_ALIASES['舗装補修']).toBeDefined();
      expect(PRESET_ALIASES['舗装補修'].name).toBe('舗装補修工プリセット');
    });
  });
});
