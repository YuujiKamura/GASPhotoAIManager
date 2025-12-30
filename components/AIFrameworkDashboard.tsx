/**
 * AIフレームワークダッシュボード
 *
 * AI解析のプロンプト・フロー・パラメータを可視化・コントロール
 * 全レイヤー編集可能
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  X, ChevronDown, ChevronRight, Eye, Edit3, Plus, Trash2,
  Settings, FileText, Layers, GitBranch, Cpu, Thermometer,
  BookOpen, Brain, CheckCircle, ArrowRight, Zap,
  Save, RefreshCw, AlertTriangle, Info
} from 'lucide-react';
import { getSystemInstruction } from '../services/gemini/systemPrompts';
import { formatHierarchyForPrompt, CONSTRUCTION_HIERARCHY } from '../utils/constructionMaster';
import {
  ANALYSIS_RULES, RULE_CATEGORIES, RuleSettings,
  loadRuleSettings, saveRuleSettings, rulesToPromptText, getDefaultRuleSettings
} from '../utils/analysisRules';
import { AVAILABLE_MODELS, getSelectedModel, setSelectedModel, ModelType } from '../services/gemini/models';
import { getLearnedSettings, rulesToPromptText as learnedRulesToPromptText, LearnedSettings, saveSettingsLocally } from '../services/learningService';
import { getRelevantExamples, getExamples, deleteExample, clearExamples } from '../utils/storage/examples';
import { formatExamplesForPrompt } from '../services/gemini/helpers';
import { AppMode, AnalysisExample } from '../types';

interface AIFrameworkDashboardProps {
  onClose: () => void;
  appMode: AppMode;
}

type TabType = 'prompt' | 'flow' | 'params' | 'debug';
type PromptLayerType = 'system' | 'hierarchy' | 'rules' | 'examples' | 'learned' | 'custom';

interface PromptLayer {
  id: PromptLayerType;
  name: string;
  icon: React.ReactNode;
  description: string;
}

const PROMPT_LAYERS: PromptLayer[] = [
  { id: 'system', name: 'システムプロンプト', icon: <FileText size={16} />, description: '基本的なAI指示をカスタマイズ' },
  { id: 'hierarchy', name: '階層マスタ', icon: <Layers size={16} />, description: '工種→種別→細別→備考の構造をJSON編集' },
  { id: 'rules', name: '分析ルール', icon: <Settings size={16} />, description: '有効/無効を切り替え、新規追加も可能' },
  { id: 'examples', name: 'お手本（Few-shot）', icon: <BookOpen size={16} />, description: '正解例の追加・削除' },
  { id: 'learned', name: '学習ルール', icon: <Brain size={16} />, description: '学習済みルールの編集・削除' },
  { id: 'custom', name: 'カスタム指示', icon: <Edit3 size={16} />, description: 'ユーザー指定の追加指示' },
];

interface FlowStep {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  optional?: boolean;
  enabled: boolean;
}

const STORAGE_KEYS = {
  systemOverride: 'ai_system_prompt_override',
  hierarchyOverride: 'ai_hierarchy_override',
  customInstruction: 'ai_custom_instruction',
  flowSettings: 'ai_flow_settings',
  temperature: 'ai_temperature',
};

export const AIFrameworkDashboard: React.FC<AIFrameworkDashboardProps> = ({ onClose, appMode }) => {
  const [activeTab, setActiveTab] = useState<TabType>('prompt');
  const [expandedLayers, setExpandedLayers] = useState<Set<PromptLayerType>>(new Set(['rules']));
  const [ruleSettings, setRuleSettings] = useState<RuleSettings>(loadRuleSettings());
  const [customInstruction, setCustomInstruction] = useState(() => localStorage.getItem(STORAGE_KEYS.customInstruction) || '');
  const [selectedModel, setSelectedModelState] = useState<ModelType>(getSelectedModel());
  const [temperature, setTemperature] = useState(() => parseFloat(localStorage.getItem(STORAGE_KEYS.temperature) || '0.1'));
  const [learnedSettings, setLearnedSettings] = useState<LearnedSettings | null>(null);
  const [examples, setExamples] = useState<AnalysisExample[]>([]);
  const [showFullPreview, setShowFullPreview] = useState(false);

  // 編集モード
  const [systemOverride, setSystemOverride] = useState(() => localStorage.getItem(STORAGE_KEYS.systemOverride) || '');
  const [hierarchyOverride, setHierarchyOverride] = useState(() => localStorage.getItem(STORAGE_KEYS.hierarchyOverride) || '');
  const [editingHierarchy, setEditingHierarchy] = useState(false);
  const [hierarchyError, setHierarchyError] = useState('');

  // フロー設定
  const [flowSettings, setFlowSettings] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.flowSettings);
    return saved ? JSON.parse(saved) : {
      detect: true,
      worktype: true,
      normalize: true,
      scene: true,
    };
  });

  // 学習設定とお手本を読み込み
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

  // 保存処理
  const saveCustomInstruction = (value: string) => {
    setCustomInstruction(value);
    localStorage.setItem(STORAGE_KEYS.customInstruction, value);
  };

  const saveSystemOverride = (value: string) => {
    setSystemOverride(value);
    localStorage.setItem(STORAGE_KEYS.systemOverride, value);
  };

  const saveHierarchyOverride = (value: string) => {
    try {
      if (value.trim()) {
        JSON.parse(value); // バリデーション
      }
      setHierarchyOverride(value);
      localStorage.setItem(STORAGE_KEYS.hierarchyOverride, value);
      setHierarchyError('');
    } catch (e) {
      setHierarchyError('無効なJSON形式です');
    }
  };

  const saveFlowSettings = (newSettings: Record<string, boolean>) => {
    setFlowSettings(newSettings);
    localStorage.setItem(STORAGE_KEYS.flowSettings, JSON.stringify(newSettings));
  };

  const saveTemperature = (value: number) => {
    setTemperature(value);
    localStorage.setItem(STORAGE_KEYS.temperature, value.toString());
  };

  // お手本の削除
  const handleDeleteExample = async (id: string) => {
    try {
      await deleteExample(id);
      setExamples(prev => prev.filter(ex => ex.id !== id));
    } catch (e) {
      console.error('Failed to delete example:', e);
    }
  };

  // 全お手本のクリア
  const handleClearExamples = async () => {
    if (confirm('全てのお手本を削除しますか？')) {
      try {
        await clearExamples();
        setExamples([]);
      } catch (e) {
        console.error('Failed to clear examples:', e);
      }
    }
  };

  // 学習ルールの削除
  const handleDeleteLearnedRule = async (ruleId: string) => {
    if (!learnedSettings) return;
    const newSettings = {
      ...learnedSettings,
      rules: learnedSettings.rules.filter(r => r.id !== ruleId),
      version: learnedSettings.version + 1,
      updatedAt: new Date().toISOString(),
    };
    await saveSettingsLocally(newSettings);
    setLearnedSettings(newSettings);
  };

  // 学習エイリアスの削除
  const handleDeleteLearnedAlias = async (aliasId: string) => {
    if (!learnedSettings) return;
    const newSettings = {
      ...learnedSettings,
      aliases: learnedSettings.aliases.filter(a => a.id !== aliasId),
      version: learnedSettings.version + 1,
      updatedAt: new Date().toISOString(),
    };
    await saveSettingsLocally(newSettings);
    setLearnedSettings(newSettings);
  };

  // 全学習データのクリア
  const handleClearLearnedData = async () => {
    if (confirm('全ての学習データをリセットしますか？')) {
      const emptySettings: LearnedSettings = {
        rules: [],
        aliases: [],
        version: 1,
        updatedAt: new Date().toISOString(),
      };
      await saveSettingsLocally(emptySettings);
      setLearnedSettings(emptySettings);
    }
  };

  // プロンプトプレビューを生成
  const generatePreview = useMemo(() => {
    const parts: string[] = [];

    // システムプロンプト
    const hierarchy = hierarchyOverride ? JSON.parse(hierarchyOverride) : formatHierarchyForPrompt();
    const systemPrompt = getSystemInstruction(appMode, customInstruction, hierarchy, ruleSettings);
    const finalSystem = systemOverride || systemPrompt;
    parts.push('=== システムプロンプト ===\n' + finalSystem.slice(0, 800) + '...\n');

    // ルール
    parts.push('\n=== 分析ルール ===\n' + rulesToPromptText(ruleSettings));

    // お手本
    if (examples.length > 0) {
      parts.push('\n=== お手本 ===\n' + formatExamplesForPrompt(examples).slice(0, 400) + '...');
    }

    // 学習ルール
    if (learnedSettings && learnedSettings.rules.length > 0) {
      parts.push('\n=== 学習ルール ===\n' + learnedRulesToPromptText(learnedSettings).slice(0, 400) + '...');
    }

    // カスタム指示
    if (customInstruction) {
      parts.push('\n=== カスタム指示 ===\n' + customInstruction);
    }

    return parts.join('\n');
  }, [appMode, ruleSettings, examples, learnedSettings, customInstruction, systemOverride, hierarchyOverride]);

  const toggleLayer = (layer: PromptLayerType) => {
    const newExpanded = new Set(expandedLayers);
    if (newExpanded.has(layer)) {
      newExpanded.delete(layer);
    } else {
      newExpanded.add(layer);
    }
    setExpandedLayers(newExpanded);
  };

  const handleRuleToggle = (ruleId: string) => {
    const rule = ANALYSIS_RULES.find(r => r.id === ruleId);
    if (rule?.isFixed) return;

    const newSettings = { ...ruleSettings, [ruleId]: !ruleSettings[ruleId] };
    setRuleSettings(newSettings);
    saveRuleSettings(newSettings);
  };

  const handleModelChange = (model: ModelType) => {
    setSelectedModelState(model);
    setSelectedModel(model);
  };

  const getLayerContent = (layer: PromptLayerType): React.ReactNode => {
    switch (layer) {
      case 'system':
        return (
          <div className="space-y-3">
            <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
              ⚠️ 空欄の場合はデフォルトのシステムプロンプトが使用されます
            </div>
            <textarea
              value={systemOverride}
              onChange={(e) => saveSystemOverride(e.target.value)}
              placeholder="システムプロンプトをオーバーライド（上級者向け）..."
              className="w-full h-40 text-xs font-mono border rounded p-2 resize-none bg-gray-50"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const defaultPrompt = getSystemInstruction(appMode, '', formatHierarchyForPrompt(), ruleSettings);
                  saveSystemOverride(defaultPrompt);
                }}
                className="text-xs px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
              >
                デフォルトを読み込む
              </button>
              <button
                onClick={() => saveSystemOverride('')}
                className="text-xs px-3 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
              >
                クリア
              </button>
            </div>
          </div>
        );

      case 'hierarchy':
        return (
          <div className="space-y-3">
            {!editingHierarchy ? (
              <>
                <div className="text-xs text-gray-600 font-mono bg-gray-50 p-3 rounded max-h-40 overflow-auto">
                  <pre className="whitespace-pre-wrap">
                    {(hierarchyOverride || JSON.stringify(formatHierarchyForPrompt(), null, 2)).slice(0, 1000)}...
                  </pre>
                </div>
                <button
                  onClick={() => {
                    if (!hierarchyOverride) {
                      setHierarchyOverride(JSON.stringify(CONSTRUCTION_HIERARCHY, null, 2));
                    }
                    setEditingHierarchy(true);
                  }}
                  className="flex items-center gap-1 text-xs px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                  <Edit3 size={12} /> JSON編集モード
                </button>
              </>
            ) : (
              <>
                <textarea
                  value={hierarchyOverride}
                  onChange={(e) => saveHierarchyOverride(e.target.value)}
                  className={`w-full h-60 text-xs font-mono border rounded p-2 resize-none ${hierarchyError ? 'border-red-500' : ''}`}
                />
                {hierarchyError && (
                  <div className="text-xs text-red-600">{hierarchyError}</div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingHierarchy(false)}
                    className="text-xs px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                  >
                    <Save size={12} className="inline mr-1" />保存して閉じる
                  </button>
                  <button
                    onClick={() => {
                      setHierarchyOverride('');
                      localStorage.removeItem(STORAGE_KEYS.hierarchyOverride);
                      setEditingHierarchy(false);
                    }}
                    className="text-xs px-3 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                  >
                    デフォルトに戻す
                  </button>
                </div>
              </>
            )}
          </div>
        );

      case 'rules':
        return (
          <div className="space-y-3">
            {RULE_CATEGORIES.map(category => (
              <div key={category.id} className="border rounded p-2">
                <div className="font-medium text-sm flex items-center gap-2 mb-2">
                  <span>{category.icon}</span>
                  <span>{category.label}</span>
                </div>
                <div className="space-y-1">
                  {ANALYSIS_RULES.filter(r => r.category === category.id).map(rule => (
                    <label
                      key={rule.id}
                      className={`flex items-center gap-2 text-xs p-1 rounded hover:bg-gray-50 cursor-pointer`}
                    >
                      <input
                        type="checkbox"
                        checked={ruleSettings[rule.id]}
                        onChange={() => handleRuleToggle(rule.id)}
                        className="rounded"
                      />
                      <span className="flex-1">
                        <span className="font-medium">{rule.label}</span>
                        {rule.isFixed && <span className="ml-1 text-gray-400">🔒</span>}
                        <span className="block text-gray-500">{rule.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );

      case 'examples':
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">登録済みお手本: {examples.length}件</div>
              {examples.length > 0 && (
                <button
                  onClick={handleClearExamples}
                  className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded"
                >
                  <Trash2 size={12} className="inline mr-1" />全削除
                </button>
              )}
            </div>
            {examples.length > 0 ? (
              <div className="space-y-2 max-h-60 overflow-auto">
                {examples.map((ex) => (
                  <div key={ex.id} className="bg-gray-50 p-2 rounded flex items-start gap-2">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{ex.name}</div>
                      <div className="text-xs text-gray-500">
                        {ex.analysis.workType} / {ex.analysis.variety} / {ex.analysis.detail}
                      </div>
                      <div className="text-xs text-gray-400">
                        備考: {ex.analysis.remarks}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteExample(ex.id)}
                      className="p-1 text-red-500 hover:bg-red-100 rounded"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500 italic text-sm">
                お手本は未登録です。解析結果を右クリックして「お手本として登録」から追加できます。
              </div>
            )}
          </div>
        );

      case 'learned':
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                ルール: {learnedSettings?.rules.length || 0}件 / エイリアス: {learnedSettings?.aliases.length || 0}件
              </div>
              {(learnedSettings?.rules.length || learnedSettings?.aliases.length) ? (
                <button
                  onClick={handleClearLearnedData}
                  className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded"
                >
                  <RefreshCw size={12} className="inline mr-1" />リセット
                </button>
              ) : null}
            </div>

            {/* ルール */}
            {learnedSettings && learnedSettings.rules.length > 0 && (
              <div>
                <div className="text-xs font-medium mb-1">修正ルール:</div>
                <div className="space-y-1 max-h-40 overflow-auto">
                  {learnedSettings.rules.map((rule) => (
                    <div key={rule.id} className="bg-gray-50 p-2 rounded flex items-center gap-2 text-xs">
                      <div className="flex-1 font-mono">{rule.description}</div>
                      <button
                        onClick={() => handleDeleteLearnedRule(rule.id)}
                        className="p-1 text-red-500 hover:bg-red-100 rounded"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* エイリアス */}
            {learnedSettings && learnedSettings.aliases.length > 0 && (
              <div>
                <div className="text-xs font-medium mb-1">エイリアス:</div>
                <div className="space-y-1 max-h-40 overflow-auto">
                  {learnedSettings.aliases.map((alias) => (
                    <div key={alias.id} className="bg-blue-50 p-2 rounded flex items-center gap-2 text-xs">
                      <div className="flex-1 font-mono">
                        "{alias.from}" → "{alias.to}"
                        {alias.context && <span className="text-gray-500"> ({alias.context})</span>}
                      </div>
                      <button
                        onClick={() => handleDeleteLearnedAlias(alias.id)}
                        className="p-1 text-red-500 hover:bg-red-100 rounded"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(!learnedSettings || (learnedSettings.rules.length === 0 && learnedSettings.aliases.length === 0)) && (
              <div className="text-gray-500 italic text-sm">
                学習データはまだありません。解析結果を手動で修正すると自動的に学習されます。
              </div>
            )}
          </div>
        );

      case 'custom':
        return (
          <div className="space-y-2">
            <textarea
              value={customInstruction}
              onChange={(e) => saveCustomInstruction(e.target.value)}
              placeholder="追加の指示を入力（例: 北区桜町の写真です。測点をNo.1からNo.10としてください。）"
              className="w-full h-32 text-sm border rounded p-2 resize-none"
            />
            <div className="text-xs text-gray-500">
              この指示は全ての解析に適用されます
            </div>
          </div>
        );
    }
  };

  const renderPromptTab = () => (
    <div className="space-y-3">
      <div className="bg-green-50 border border-green-200 rounded p-3 text-sm">
        <div className="flex items-center gap-2 font-medium text-green-800">
          <Edit3 size={16} />
          全レイヤー編集可能
        </div>
        <div className="text-green-600 mt-1">
          各レイヤーを展開して編集できます。変更は即座に保存されます。
        </div>
      </div>

      {PROMPT_LAYERS.map((layer, index) => (
        <div key={layer.id} className="border rounded">
          <button
            onClick={() => toggleLayer(layer.id)}
            className="w-full flex items-center gap-2 p-3 hover:bg-gray-50 text-left"
          >
            <span className="text-gray-400 text-sm w-6">{index + 1}</span>
            {expandedLayers.has(layer.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span className="text-gray-600">{layer.icon}</span>
            <span className="font-medium flex-1">{layer.name}</span>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">編集可</span>
          </button>

          {expandedLayers.has(layer.id) && (
            <div className="px-3 pb-3 border-t bg-gray-50">
              <div className="text-xs text-gray-500 mb-2 mt-2">{layer.description}</div>
              {getLayerContent(layer.id)}
            </div>
          )}
        </div>
      ))}

      {/* プレビューボタン */}
      <button
        onClick={() => setShowFullPreview(!showFullPreview)}
        className="w-full flex items-center justify-center gap-2 p-2 border rounded hover:bg-gray-50"
      >
        <Eye size={16} />
        {showFullPreview ? '合成プロンプトを隠す' : '合成プロンプトをプレビュー'}
      </button>

      {showFullPreview && (
        <div className="border rounded p-3 bg-gray-900 text-green-400 text-xs font-mono max-h-96 overflow-auto">
          <pre className="whitespace-pre-wrap">{generatePreview}</pre>
        </div>
      )}
    </div>
  );

  const FLOW_STEPS: FlowStep[] = [
    { id: 'upload', name: '写真アップロード', description: 'Base64エンコード', icon: <FileText size={16} />, enabled: true },
    { id: 'detect', name: '黒板判定', description: 'スマートフローで3枚サンプル', icon: <Eye size={16} />, optional: true, enabled: flowSettings.detect },
    { id: 'worktype', name: '工種選択', description: '階層サブセット作成', icon: <Layers size={16} />, optional: true, enabled: flowSettings.worktype },
    { id: 'batch', name: 'バッチ解析', description: 'Gemini APIでストリーミング解析', icon: <Cpu size={16} />, enabled: true },
    { id: 'context', name: 'コンテキスト継承', description: '前の写真から情報を継承', icon: <GitBranch size={16} />, enabled: true },
    { id: 'validate', name: 'バリデーション', description: 'マスタ照合・警告生成', icon: <CheckCircle size={16} />, enabled: true },
    { id: 'normalize', name: '正規化提案', description: 'テキスト正規化の提案', icon: <RefreshCw size={16} />, optional: true, enabled: flowSettings.normalize },
    { id: 'scene', name: 'シーンID割当', description: 'ペアリング・グループ化', icon: <Zap size={16} />, optional: true, enabled: flowSettings.scene },
  ];

  const handleFlowToggle = (stepId: string) => {
    const newSettings = { ...flowSettings, [stepId]: !flowSettings[stepId] };
    saveFlowSettings(newSettings);
  };

  const renderFlowTab = () => (
    <div className="space-y-4">
      <div className="bg-purple-50 border border-purple-200 rounded p-3 text-sm">
        <div className="flex items-center gap-2 font-medium text-purple-800">
          <GitBranch size={16} />
          AI処理パイプライン（編集可能）
        </div>
        <div className="text-purple-600 mt-1">
          オプションステップの有効/無効を切り替えできます
        </div>
      </div>

      <div className="relative">
        {FLOW_STEPS.map((step, index) => (
          <div key={step.id} className="flex items-start gap-3 mb-4">
            {/* ステップ番号と接続線 */}
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                !step.enabled ? 'bg-gray-200 text-gray-400' :
                step.optional ? 'bg-yellow-500 text-white' : 'bg-blue-600 text-white'
              }`}>
                {index + 1}
              </div>
              {index < FLOW_STEPS.length - 1 && (
                <div className={`w-0.5 h-8 ${step.enabled ? 'bg-blue-200' : 'bg-gray-200'}`} />
              )}
            </div>

            {/* ステップ内容 */}
            <div className={`flex-1 p-3 rounded border ${
              !step.enabled ? 'border-gray-200 bg-gray-50 opacity-50' :
              step.optional ? 'border-yellow-200 bg-yellow-50' : 'border-gray-200 bg-white'
            }`}>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">{step.icon}</span>
                <span className="font-medium">{step.name}</span>
                {step.optional && (
                  <label className="flex items-center gap-1 ml-auto cursor-pointer">
                    <input
                      type="checkbox"
                      checked={step.enabled}
                      onChange={() => handleFlowToggle(step.id)}
                      className="rounded"
                    />
                    <span className="text-xs text-gray-500">有効</span>
                  </label>
                )}
              </div>
              <div className="text-sm text-gray-600 mt-1">{step.description}</div>
            </div>
          </div>
        ))}
      </div>

      {/* フロー図（簡易版） */}
      <div className="border rounded p-4 bg-gray-50">
        <div className="text-sm font-medium mb-3">処理フロー概要</div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="px-2 py-1 bg-blue-100 rounded">📷 写真</span>
          <ArrowRight size={14} className="text-gray-400" />
          <span className={`px-2 py-1 rounded ${flowSettings.detect ? 'bg-yellow-100' : 'bg-gray-200 line-through'}`}>🔍 黒板判定</span>
          <ArrowRight size={14} className="text-gray-400" />
          <span className="px-2 py-1 bg-green-100 rounded">🤖 Gemini API</span>
          <ArrowRight size={14} className="text-gray-400" />
          <span className="px-2 py-1 bg-purple-100 rounded">✅ 検証</span>
          <ArrowRight size={14} className="text-gray-400" />
          <span className="px-2 py-1 bg-orange-100 rounded">📋 結果</span>
        </div>
      </div>
    </div>
  );

  const renderParamsTab = () => (
    <div className="space-y-4">
      {/* モデル選択 */}
      <div className="border rounded p-4">
        <div className="flex items-center gap-2 font-medium mb-3">
          <Cpu size={16} />
          モデル選択
        </div>
        <div className="space-y-2">
          {AVAILABLE_MODELS.map(model => (
            <label
              key={model.id}
              className={`flex items-center gap-3 p-2 rounded cursor-pointer ${selectedModel === model.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'}`}
            >
              <input
                type="radio"
                name="model"
                checked={selectedModel === model.id}
                onChange={() => handleModelChange(model.id)}
                className="text-blue-600"
              />
              <div className="flex-1">
                <div className="font-medium text-sm">{model.name}</div>
                <div className="text-xs text-gray-500">{model.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* 温度設定 */}
      <div className="border rounded p-4">
        <div className="flex items-center gap-2 font-medium mb-3">
          <Thermometer size={16} />
          Temperature（創造性）
        </div>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={temperature}
            onChange={(e) => saveTemperature(parseFloat(e.target.value))}
            className="flex-1"
          />
          <span className="w-12 text-center font-mono text-sm">{temperature}</span>
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>確定的 (0.0)</span>
          <span>創造的 (1.0)</span>
        </div>
      </div>

      {/* API設定情報 */}
      <div className="border rounded p-4">
        <div className="flex items-center gap-2 font-medium mb-3">
          <Settings size={16} />
          API設定
        </div>
        <div className="text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">レスポンス形式</span>
            <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">application/json</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">ストリーミング</span>
            <span className="text-green-600">有効</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">リトライ回数</span>
            <span>3回</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">フォールバックモデル</span>
            <span className="font-mono text-xs">gemini-2.5-flash</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderDebugTab = () => (
    <div className="space-y-4">
      <div className="bg-orange-50 border border-orange-200 rounded p-3 text-sm">
        <div className="flex items-center gap-2 font-medium text-orange-800">
          <AlertTriangle size={16} />
          デバッグ情報
        </div>
        <div className="text-orange-600 mt-1">
          AI解析のトラブルシューティング用
        </div>
      </div>

      {/* 現在の設定サマリ */}
      <div className="border rounded p-4">
        <div className="font-medium mb-3">現在の設定サマリ</div>
        <div className="text-sm space-y-1 font-mono bg-gray-50 p-3 rounded">
          <div>appMode: {appMode}</div>
          <div>model: {selectedModel}</div>
          <div>temperature: {temperature}</div>
          <div>enabledRules: {Object.entries(ruleSettings).filter(([, v]) => v).length}/{ANALYSIS_RULES.length}</div>
          <div>examples: {examples.length}件</div>
          <div>learnedRules: {learnedSettings?.rules.length || 0}件</div>
          <div>learnedAliases: {learnedSettings?.aliases.length || 0}件</div>
          <div>systemOverride: {systemOverride ? '設定あり' : 'なし'}</div>
          <div>hierarchyOverride: {hierarchyOverride ? '設定あり' : 'なし'}</div>
          <div>customInstruction: {customInstruction ? '設定あり' : 'なし'}</div>
        </div>
      </div>

      {/* 全設定リセット */}
      <div className="border rounded p-4 border-red-200">
        <div className="font-medium mb-3 text-red-600">設定リセット</div>
        <div className="space-y-2">
          <button
            onClick={() => {
              setRuleSettings(getDefaultRuleSettings());
              saveRuleSettings(getDefaultRuleSettings());
            }}
            className="w-full flex items-center justify-center gap-2 p-2 border border-red-200 text-red-600 rounded hover:bg-red-50 text-sm"
          >
            <RefreshCw size={14} />
            ルール設定をリセット
          </button>
          <button
            onClick={() => {
              saveSystemOverride('');
              saveHierarchyOverride('');
              saveCustomInstruction('');
              saveTemperature(0.1);
              saveFlowSettings({ detect: true, worktype: true, normalize: true, scene: true });
            }}
            className="w-full flex items-center justify-center gap-2 p-2 border border-red-200 text-red-600 rounded hover:bg-red-50 text-sm"
          >
            <RefreshCw size={14} />
            カスタマイズをリセット
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <Brain className="text-purple-600" size={24} />
            <div>
              <h2 className="text-lg font-bold">AIフレームワーク ダッシュボード</h2>
              <p className="text-sm text-gray-500">プロンプト・フロー・パラメータの完全コントロール</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded">
            <X size={20} />
          </button>
        </div>

        {/* タブ */}
        <div className="flex border-b">
          {[
            { id: 'prompt', label: 'プロンプト構成', icon: <FileText size={16} /> },
            { id: 'flow', label: '処理フロー', icon: <GitBranch size={16} /> },
            { id: 'params', label: 'パラメータ', icon: <Settings size={16} /> },
            { id: 'debug', label: 'デバッグ', icon: <AlertTriangle size={16} /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-auto p-4">
          {activeTab === 'prompt' && renderPromptTab()}
          {activeTab === 'flow' && renderFlowTab()}
          {activeTab === 'params' && renderParamsTab()}
          {activeTab === 'debug' && renderDebugTab()}
        </div>

        {/* フッター */}
        <div className="flex items-center justify-between p-4 border-t bg-gray-50">
          <div className="text-sm text-gray-500">
            現在のモード: <span className="font-medium">{appMode === 'construction' ? '工事写真' : '汎用'}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border rounded hover:bg-gray-100"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIFrameworkDashboard;
