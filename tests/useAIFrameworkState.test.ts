import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAIFrameworkState } from '../hooks/useAIFrameworkState';
import type { AppMode } from '../types';

// Mock the dependencies
vi.mock('../services/gemini/systemPrompts', () => ({
  getSystemInstruction: vi.fn(() => 'Mocked system instruction'),
}));

vi.mock('../utils/constructionMaster', () => ({
  formatHierarchyForPrompt: vi.fn(() => ({ test: 'hierarchy' })),
  CONSTRUCTION_HIERARCHY: { test: 'hierarchy' },
}));

vi.mock('../utils/analysisRules', () => ({
  ANALYSIS_RULES: [
    { id: 'rule1', name: 'Rule 1', isFixed: false },
    { id: 'rule2', name: 'Rule 2', isFixed: true },
  ],
  loadRuleSettings: vi.fn(() => ({ rule1: true, rule2: true })),
  saveRuleSettings: vi.fn(),
  rulesToPromptText: vi.fn(() => 'Rules text'),
  getDefaultRuleSettings: vi.fn(() => ({ rule1: true, rule2: true })),
}));

vi.mock('../services/gemini/models', () => ({
  getSelectedModel: vi.fn(() => 'gemini-3.0-flash'),
  setSelectedModel: vi.fn(),
}));

vi.mock('../services/learningService', () => ({
  getLearnedSettings: vi.fn(() => Promise.resolve({
    rules: [],
    aliases: [],
    examples: [],
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })),
  rulesToPromptText: vi.fn(() => ''),
  saveSettingsLocally: vi.fn(() => Promise.resolve()),
}));

vi.mock('../utils/storage/examples', () => ({
  getExamples: vi.fn(() => Promise.resolve([])),
  deleteExample: vi.fn(() => Promise.resolve()),
  clearExamples: vi.fn(() => Promise.resolve()),
}));

vi.mock('../services/gemini/helpers', () => ({
  formatExamplesForPrompt: vi.fn(() => ''),
}));

describe('useAIFrameworkState', () => {
  const appMode: AppMode = 'auto';

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('Initial State', () => {
    it('should initialize with default tab', () => {
      const { result } = renderHook(() => useAIFrameworkState(appMode));
      expect(result.current.activeTab).toBe('prompt');
    });

    it('should initialize with all layers expanded', () => {
      const { result } = renderHook(() => useAIFrameworkState(appMode));
      expect(result.current.expandedLayers.has('system')).toBe(true);
      expect(result.current.expandedLayers.has('hierarchy')).toBe(true);
      expect(result.current.expandedLayers.has('rules')).toBe(true);
    });

    it('should initialize with default temperature', () => {
      const { result } = renderHook(() => useAIFrameworkState(appMode));
      expect(result.current.temperature).toBe(0.1);
    });

    it('should initialize with default flow settings', () => {
      const { result } = renderHook(() => useAIFrameworkState(appMode));
      expect(result.current.flowSettings).toEqual({
        detect: true,
        worktype: true,
        normalize: true,
        scene: true
      });
    });
  });

  describe('Tab Navigation', () => {
    it('should change active tab', () => {
      const { result } = renderHook(() => useAIFrameworkState(appMode));

      act(() => {
        result.current.setActiveTab('flow');
      });

      expect(result.current.activeTab).toBe('flow');
    });
  });

  describe('Layer Toggle', () => {
    it('should toggle layer expansion', () => {
      const { result } = renderHook(() => useAIFrameworkState(appMode));

      // Initially expanded
      expect(result.current.expandedLayers.has('system')).toBe(true);

      act(() => {
        result.current.toggleLayer('system');
      });

      // Now collapsed
      expect(result.current.expandedLayers.has('system')).toBe(false);

      act(() => {
        result.current.toggleLayer('system');
      });

      // Expanded again
      expect(result.current.expandedLayers.has('system')).toBe(true);
    });
  });

  describe('Custom Instruction', () => {
    it('should save custom instruction', () => {
      const { result } = renderHook(() => useAIFrameworkState(appMode));

      act(() => {
        result.current.saveCustomInstruction('Test instruction');
      });

      expect(result.current.customInstruction).toBe('Test instruction');
      expect(localStorage.getItem('ai_custom_instruction')).toBe('Test instruction');
    });

    it('should load custom instruction from localStorage', () => {
      localStorage.setItem('ai_custom_instruction', 'Saved instruction');

      const { result } = renderHook(() => useAIFrameworkState(appMode));

      expect(result.current.customInstruction).toBe('Saved instruction');
    });
  });

  describe('System Override', () => {
    it('should save system override', () => {
      const { result } = renderHook(() => useAIFrameworkState(appMode));

      act(() => {
        result.current.saveSystemOverride('Custom system prompt');
      });

      expect(result.current.systemOverride).toBe('Custom system prompt');
      expect(localStorage.getItem('ai_system_prompt_override')).toBe('Custom system prompt');
    });
  });

  describe('Hierarchy Override', () => {
    it('should save valid JSON hierarchy override', () => {
      const { result } = renderHook(() => useAIFrameworkState(appMode));

      act(() => {
        result.current.saveHierarchyOverride('{"test": "value"}');
      });

      expect(result.current.hierarchyOverride).toBe('{"test": "value"}');
      expect(result.current.hierarchyError).toBe('');
    });

    it('should set error for invalid JSON', () => {
      const { result } = renderHook(() => useAIFrameworkState(appMode));

      act(() => {
        result.current.saveHierarchyOverride('invalid json');
      });

      expect(result.current.hierarchyError).toBe('無効なJSON形式です');
    });

    it('should accept empty string', () => {
      const { result } = renderHook(() => useAIFrameworkState(appMode));

      act(() => {
        result.current.saveHierarchyOverride('');
      });

      expect(result.current.hierarchyOverride).toBe('');
      expect(result.current.hierarchyError).toBe('');
    });
  });

  describe('Temperature', () => {
    it('should save temperature', () => {
      const { result } = renderHook(() => useAIFrameworkState(appMode));

      act(() => {
        result.current.saveTemperature(0.5);
      });

      expect(result.current.temperature).toBe(0.5);
      expect(localStorage.getItem('ai_temperature')).toBe('0.5');
    });

    it('should load temperature from localStorage', () => {
      localStorage.setItem('ai_temperature', '0.7');

      const { result } = renderHook(() => useAIFrameworkState(appMode));

      expect(result.current.temperature).toBe(0.7);
    });
  });

  describe('Flow Settings', () => {
    it('should toggle flow step', () => {
      const { result } = renderHook(() => useAIFrameworkState(appMode));

      act(() => {
        result.current.handleFlowToggle('detect');
      });

      expect(result.current.flowSettings.detect).toBe(false);
    });

    it('should persist flow settings', () => {
      const { result } = renderHook(() => useAIFrameworkState(appMode));

      act(() => {
        result.current.handleFlowToggle('normalize');
      });

      const saved = JSON.parse(localStorage.getItem('ai_flow_settings') || '{}');
      expect(saved.normalize).toBe(false);
    });
  });

  describe('Reset Functions', () => {
    it('should reset customizations', () => {
      const { result } = renderHook(() => useAIFrameworkState(appMode));

      // Set some customizations
      act(() => {
        result.current.saveSystemOverride('custom');
        result.current.saveHierarchyOverride('{"a": 1}');
        result.current.saveCustomInstruction('instruction');
        result.current.saveTemperature(0.9);
      });

      // Reset
      act(() => {
        result.current.resetCustomizations();
      });

      expect(result.current.systemOverride).toBe('');
      expect(result.current.hierarchyOverride).toBe('');
      expect(result.current.customInstruction).toBe('');
      expect(result.current.temperature).toBe(0.1);
    });
  });

  describe('Preview Generation', () => {
    it('should generate preview', () => {
      const { result } = renderHook(() => useAIFrameworkState(appMode));

      // generatePreview is a computed value (useMemo)
      expect(result.current.generatePreview).toContain('システムプロンプト');
    });
  });

  describe('STORAGE_KEYS export', () => {
    it('should expose storage keys', () => {
      const { result } = renderHook(() => useAIFrameworkState(appMode));

      expect(result.current.STORAGE_KEYS).toBeDefined();
      expect(result.current.STORAGE_KEYS.systemOverride).toBe('ai_system_prompt_override');
      expect(result.current.STORAGE_KEYS.customInstruction).toBe('ai_custom_instruction');
    });
  });
});
