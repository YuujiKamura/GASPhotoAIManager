import { useState, useEffect, useMemo, useCallback } from 'react';
import { getSystemInstruction } from '../services/gemini/systemPrompts';
import { formatHierarchyForPrompt, CONSTRUCTION_HIERARCHY } from '../utils/constructionMaster';
import {
  ANALYSIS_RULES, RuleSettings,
  loadRuleSettings, saveRuleSettings, rulesToPromptText, getDefaultRuleSettings
} from '../utils/analysisRules';
import { getSelectedModel, setSelectedModel, ModelType } from '../services/gemini/models';
import { getLearnedSettings, rulesToPromptText as learnedRulesToPromptText, saveSettingsLocally } from '../services/learningService';
import type { LearnedSettings, AppMode, AnalysisExample } from '../types';
import { getExamples, deleteExample, clearExamples } from '../utils/storage/examples';
import { formatExamplesForPrompt } from '../services/gemini/helpers';

type PromptLayerType = 'system' | 'hierarchy' | 'rules' | 'examples' | 'learned' | 'custom';
type TabType = 'prompt' | 'flow' | 'params' | 'debug';

const STORAGE_KEYS = {
  systemOverride: 'ai_system_prompt_override',
  hierarchyOverride: 'ai_hierarchy_override',
  customInstruction: 'ai_custom_instruction',
  flowSettings: 'ai_flow_settings',
  temperature: 'ai_temperature',
};

export function useAIFrameworkState(appMode: AppMode) {
  // UI State
  const [activeTab, setActiveTab] = useState<TabType>('prompt');
  const [expandedLayers, setExpandedLayers] = useState<Set<PromptLayerType>>(new Set(['system', 'hierarchy', 'rules', 'examples', 'learned', 'custom']));
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [editingHierarchy, setEditingHierarchy] = useState(false);
  const [hierarchyError, setHierarchyError] = useState('');

  // Persistent Settings
  const [ruleSettings, setRuleSettings] = useState<RuleSettings>(loadRuleSettings());
  const [customInstruction, setCustomInstruction] = useState(() => localStorage.getItem(STORAGE_KEYS.customInstruction) || '');
  const [selectedModel, setSelectedModelState] = useState<ModelType>(getSelectedModel());
  const [temperature, setTemperature] = useState(() => parseFloat(localStorage.getItem(STORAGE_KEYS.temperature) || '0.1'));
  const [systemOverride, setSystemOverride] = useState(() => localStorage.getItem(STORAGE_KEYS.systemOverride) || '');
  const [hierarchyOverride, setHierarchyOverride] = useState(() => localStorage.getItem(STORAGE_KEYS.hierarchyOverride) || '');
  const [flowSettings, setFlowSettings] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.flowSettings);
    return saved ? JSON.parse(saved) : { detect: true, worktype: true, normalize: true, scene: true };
  });

  // Async Loaded Data
  const [learnedSettings, setLearnedSettings] = useState<LearnedSettings | null>(null);
  const [examples, setExamples] = useState<AnalysisExample[]>([]);

  // Load async data
  useEffect(() => {
    const loadData = async () => {
      try {
        const learned = await getLearnedSettings();
        setLearnedSettings(learned);
        const exs = await getExamples();
        setExamples(exs);
      } catch (e) {
        console.warn('Failed to load learned settings/examples:', e);
      }
    };
    loadData();
  }, []);

  // Save handlers
  const saveCustomInstruction = useCallback((value: string) => {
    setCustomInstruction(value);
    localStorage.setItem(STORAGE_KEYS.customInstruction, value);
  }, []);

  const saveSystemOverride = useCallback((value: string) => {
    setSystemOverride(value);
    localStorage.setItem(STORAGE_KEYS.systemOverride, value);
  }, []);

  const saveHierarchyOverride = useCallback((value: string) => {
    try {
      if (value.trim()) JSON.parse(value);
      setHierarchyOverride(value);
      localStorage.setItem(STORAGE_KEYS.hierarchyOverride, value);
      setHierarchyError('');
    } catch {
      setHierarchyError('無効なJSON形式です');
    }
  }, []);

  const saveFlowSettings = useCallback((newSettings: Record<string, boolean>) => {
    setFlowSettings(newSettings);
    localStorage.setItem(STORAGE_KEYS.flowSettings, JSON.stringify(newSettings));
  }, []);

  const saveTemperature = useCallback((value: number) => {
    setTemperature(value);
    localStorage.setItem(STORAGE_KEYS.temperature, value.toString());
  }, []);

  // Example handlers
  const handleDeleteExample = useCallback(async (id: string) => {
    try {
      await deleteExample(id);
      setExamples(prev => prev.filter(ex => ex.id !== id));
    } catch (e) {
      console.error('Failed to delete example:', e);
    }
  }, []);

  const handleClearExamples = useCallback(async () => {
    if (confirm('全てのお手本を削除しますか？')) {
      try {
        await clearExamples();
        setExamples([]);
      } catch (e) {
        console.error('Failed to clear examples:', e);
      }
    }
  }, []);

  // Learned settings handlers
  const handleDeleteLearnedRule = useCallback(async (ruleId: string) => {
    if (!learnedSettings) return;
    const newSettings = {
      ...learnedSettings,
      rules: learnedSettings.rules.filter(r => r.id !== ruleId),
      version: learnedSettings.version + 1,
      updatedAt: new Date().toISOString(),
    };
    await saveSettingsLocally(newSettings);
    setLearnedSettings(newSettings);
  }, [learnedSettings]);

  const handleDeleteLearnedAlias = useCallback(async (aliasId: string) => {
    if (!learnedSettings) return;
    const newSettings = {
      ...learnedSettings,
      aliases: learnedSettings.aliases.filter(a => a.id !== aliasId),
      version: learnedSettings.version + 1,
      updatedAt: new Date().toISOString(),
    };
    await saveSettingsLocally(newSettings);
    setLearnedSettings(newSettings);
  }, [learnedSettings]);

  const handleClearLearnedData = useCallback(async () => {
    if (confirm('全ての学習データをリセットしますか？')) {
      const emptySettings: LearnedSettings = {
        rules: [], aliases: [], examples: [],
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveSettingsLocally(emptySettings);
      setLearnedSettings(emptySettings);
    }
  }, []);

  // Rule handlers
  const handleRuleToggle = useCallback((ruleId: string) => {
    const rule = ANALYSIS_RULES.find(r => r.id === ruleId);
    if (rule?.isFixed) return;
    const newSettings = { ...ruleSettings, [ruleId]: !ruleSettings[ruleId] };
    setRuleSettings(newSettings);
    saveRuleSettings(newSettings);
  }, [ruleSettings]);

  const handleModelChange = useCallback((model: ModelType) => {
    setSelectedModelState(model);
    setSelectedModel(model);
  }, []);

  const toggleLayer = useCallback((layer: PromptLayerType) => {
    setExpandedLayers(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(layer)) newExpanded.delete(layer);
      else newExpanded.add(layer);
      return newExpanded;
    });
  }, []);

  const handleFlowToggle = useCallback((stepId: string) => {
    const newSettings = { ...flowSettings, [stepId]: !flowSettings[stepId] };
    saveFlowSettings(newSettings);
  }, [flowSettings, saveFlowSettings]);

  // Reset handlers
  const resetRuleSettings = useCallback(() => {
    setRuleSettings(getDefaultRuleSettings());
    saveRuleSettings(getDefaultRuleSettings());
  }, []);

  const resetCustomizations = useCallback(() => {
    saveSystemOverride('');
    saveHierarchyOverride('');
    saveCustomInstruction('');
    saveTemperature(0.1);
    saveFlowSettings({ detect: true, worktype: true, normalize: true, scene: true });
  }, [saveSystemOverride, saveHierarchyOverride, saveCustomInstruction, saveTemperature, saveFlowSettings]);

  // Preview generator
  const generatePreview = useMemo(() => {
    try {
      const parts: string[] = [];
      let hierarchy;
      try {
        hierarchy = hierarchyOverride ? JSON.parse(hierarchyOverride) : formatHierarchyForPrompt();
      } catch {
        hierarchy = formatHierarchyForPrompt();
      }
      const systemPrompt = getSystemInstruction(appMode, customInstruction, hierarchy, ruleSettings);
      const finalSystem = systemOverride || systemPrompt;
      parts.push('=== システムプロンプト ===\n' + finalSystem.slice(0, 800) + '...\n');
      parts.push('\n=== 分析ルール ===\n' + rulesToPromptText(ruleSettings));
      if (examples.length > 0) {
        const examplesText = formatExamplesForPrompt(examples);
        if (examplesText) {
          parts.push('\n=== お手本 ===\n' + examplesText.slice(0, 400) + '...');
        }
      }
      if (learnedSettings && learnedSettings.rules.length > 0) {
        parts.push('\n=== 学習ルール ===\n' + learnedRulesToPromptText(learnedSettings).slice(0, 400) + '...');
      }
      if (customInstruction) {
        parts.push('\n=== カスタム指示 ===\n' + customInstruction);
      }
      return parts.join('\n');
    } catch (e) {
      console.error('Failed to generate preview:', e);
      return 'プレビューの生成に失敗しました';
    }
  }, [appMode, ruleSettings, examples, learnedSettings, customInstruction, systemOverride, hierarchyOverride]);

  return {
    // UI State
    activeTab, setActiveTab,
    expandedLayers, toggleLayer,
    showFullPreview, setShowFullPreview,
    editingHierarchy, setEditingHierarchy,
    hierarchyError,

    // Settings
    ruleSettings, handleRuleToggle,
    customInstruction, saveCustomInstruction,
    selectedModel, handleModelChange,
    temperature, saveTemperature,
    systemOverride, saveSystemOverride,
    hierarchyOverride, saveHierarchyOverride,
    flowSettings, handleFlowToggle,

    // Data
    learnedSettings,
    examples,

    // Handlers
    handleDeleteExample, handleClearExamples,
    handleDeleteLearnedRule, handleDeleteLearnedAlias, handleClearLearnedData,
    resetRuleSettings, resetCustomizations,

    // Preview
    generatePreview,

    // Constants
    STORAGE_KEYS,
    CONSTRUCTION_HIERARCHY,
  };
}

export type { PromptLayerType, TabType };
