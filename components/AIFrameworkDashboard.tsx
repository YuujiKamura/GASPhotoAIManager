/**
 * AIフレームワークダッシュボード
 *
 * AI解析のプロンプト・フロー・パラメータを可視化・コントロール
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  X, ChevronDown, ChevronRight, Eye, Edit3, Play, Pause,
  Settings, FileText, Layers, GitBranch, Cpu, Thermometer,
  BookOpen, Brain, CheckCircle, Circle, ArrowRight, Zap,
  Save, RefreshCw, AlertTriangle, Info
} from 'lucide-react';
import { getSystemInstruction } from '../services/gemini/systemPrompts';
import { formatHierarchyForPrompt } from '../utils/constructionMaster';
import {
  ANALYSIS_RULES, RULE_CATEGORIES, RuleSettings,
  loadRuleSettings, saveRuleSettings, rulesToPromptText, getDefaultRuleSettings
} from '../utils/analysisRules';
import { AVAILABLE_MODELS, getSelectedModel, setSelectedModel, ModelType } from '../services/gemini/models';
import { getLearnedSettings, rulesToPromptText as learnedRulesToPromptText, LearnedSettings } from '../services/learningService';
import { getRelevantExamples } from '../utils/storage/examples';
import { formatExamplesForPrompt } from '../services/gemini/helpers';
import { AppMode } from '../types';

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
  editable: boolean;
}

const PROMPT_LAYERS: PromptLayer[] = [
  { id: 'system', name: 'システムプロンプト', icon: <FileText size={16} />, description: '基本的なAI指示（1500行）', editable: false },
  { id: 'hierarchy', name: '階層マスタ', icon: <Layers size={16} />, description: '工種→種別→細別→備考の構造', editable: false },
  { id: 'rules', name: '分析ルール', icon: <Settings size={16} />, description: '有効/無効を切り替え可能', editable: true },
  { id: 'examples', name: 'お手本（Few-shot）', icon: <BookOpen size={16} />, description: '正解例からの学習', editable: false },
  { id: 'learned', name: '学習ルール', icon: <Brain size={16} />, description: 'ユーザー修正から自動学習', editable: false },
  { id: 'custom', name: 'カスタム指示', icon: <Edit3 size={16} />, description: 'ユーザー指定の追加指示', editable: true },
];

interface FlowStep {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  optional?: boolean;
}

const FLOW_STEPS: FlowStep[] = [
  { id: 'upload', name: '写真アップロード', description: 'Base64エンコード', icon: <FileText size={16} /> },
  { id: 'detect', name: '黒板判定', description: 'スマートフローで3枚サンプル', icon: <Eye size={16} />, optional: true },
  { id: 'worktype', name: '工種選択', description: '階層サブセット作成', icon: <Layers size={16} />, optional: true },
  { id: 'batch', name: 'バッチ解析', description: 'Gemini APIでストリーミング解析', icon: <Cpu size={16} /> },
  { id: 'context', name: 'コンテキスト継承', description: '前の写真から情報を継承', icon: <GitBranch size={16} /> },
  { id: 'validate', name: 'バリデーション', description: 'マスタ照合・警告生成', icon: <CheckCircle size={16} /> },
  { id: 'normalize', name: '正規化提案', description: 'テキスト正規化の提案', icon: <RefreshCw size={16} />, optional: true },
  { id: 'scene', name: 'シーンID割当', description: 'ペアリング・グループ化', icon: <Zap size={16} />, optional: true },
];

export const AIFrameworkDashboard: React.FC<AIFrameworkDashboardProps> = ({ onClose, appMode }) => {
  const [activeTab, setActiveTab] = useState<TabType>('prompt');
  const [expandedLayers, setExpandedLayers] = useState<Set<PromptLayerType>>(new Set(['rules']));
  const [ruleSettings, setRuleSettings] = useState<RuleSettings>(loadRuleSettings());
  const [customInstruction, setCustomInstruction] = useState('');
  const [selectedModel, setSelectedModelState] = useState<ModelType>(getSelectedModel());
  const [temperature, setTemperature] = useState(0.1);
  const [learnedSettings, setLearnedSettings] = useState<LearnedSettings | null>(null);
  const [examples, setExamples] = useState<any[]>([]);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [showFullPreview, setShowFullPreview] = useState(false);

  // 学習設定とお手本を読み込み
  useEffect(() => {
    const loadData = async () => {
      try {
        const learned = await getLearnedSettings();
        setLearnedSettings(learned);
        const exs = await getRelevantExamples(undefined, undefined, 5);
        setExamples(exs);
      } catch (e) {
        console.warn('Failed to load learned settings/examples:', e);
      }
    };
    loadData();
  }, []);

  // プロンプトプレビューを生成
  const generatePreview = useMemo(() => {
    const parts: string[] = [];

    // システムプロンプト（最初の部分のみ）
    const systemPrompt = getSystemInstruction(appMode, customInstruction, formatHierarchyForPrompt(), ruleSettings);
    parts.push('=== システムプロンプト ===\n' + systemPrompt.slice(0, 500) + '...\n');

    // ルール
    parts.push('\n=== 分析ルール ===\n' + rulesToPromptText(ruleSettings));

    // お手本
    if (examples.length > 0) {
      parts.push('\n=== お手本 ===\n' + formatExamplesForPrompt(examples).slice(0, 300) + '...');
    }

    // 学習ルール
    if (learnedSettings && learnedSettings.rules.length > 0) {
      parts.push('\n=== 学習ルール ===\n' + learnedRulesToPromptText(learnedSettings).slice(0, 300) + '...');
    }

    // カスタム指示
    if (customInstruction) {
      parts.push('\n=== カスタム指示 ===\n' + customInstruction);
    }

    return parts.join('\n');
  }, [appMode, ruleSettings, examples, learnedSettings, customInstruction]);

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
          <div className="text-xs text-gray-600 font-mono bg-gray-50 p-3 rounded max-h-60 overflow-auto">
            <pre className="whitespace-pre-wrap">
              {getSystemInstruction(appMode, '', formatHierarchyForPrompt(), ruleSettings).slice(0, 2000)}...
            </pre>
          </div>
        );

      case 'hierarchy':
        return (
          <div className="text-xs text-gray-600 font-mono bg-gray-50 p-3 rounded max-h-60 overflow-auto">
            <pre className="whitespace-pre-wrap">
              {JSON.stringify(formatHierarchyForPrompt(), null, 2).slice(0, 1500)}...
            </pre>
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
                      className={`flex items-center gap-2 text-xs p-1 rounded hover:bg-gray-50 ${rule.isFixed ? 'opacity-60' : 'cursor-pointer'}`}
                    >
                      <input
                        type="checkbox"
                        checked={ruleSettings[rule.id]}
                        onChange={() => handleRuleToggle(rule.id)}
                        disabled={rule.isFixed}
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
          <div className="text-xs">
            {examples.length > 0 ? (
              <div className="space-y-2">
                <div className="text-gray-600">登録済みお手本: {examples.length}件</div>
                {examples.slice(0, 3).map((ex, i) => (
                  <div key={i} className="bg-gray-50 p-2 rounded">
                    <div className="font-medium">{ex.fileName}</div>
                    <div className="text-gray-500">{ex.workType} / {ex.variety} / {ex.detail}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500 italic">お手本は未登録です</div>
            )}
          </div>
        );

      case 'learned':
        return (
          <div className="text-xs">
            {learnedSettings && learnedSettings.rules.length > 0 ? (
              <div className="space-y-2">
                <div className="text-gray-600">学習済みルール: {learnedSettings.rules.length}件</div>
                {learnedSettings.rules.slice(0, 3).map((rule, i) => (
                  <div key={i} className="bg-gray-50 p-2 rounded">
                    <div className="text-gray-700">{rule.description}</div>
                    <div className="text-gray-500">適用回数: {rule.appliedCount}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500 italic">学習ルールはまだありません</div>
            )}
          </div>
        );

      case 'custom':
        return (
          <div>
            <textarea
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.target.value)}
              placeholder="追加の指示を入力（例: 北区桜町の写真です。測点をNo.1から...）"
              className="w-full h-24 text-sm border rounded p-2 resize-none"
            />
          </div>
        );
    }
  };

  const renderPromptTab = () => (
    <div className="space-y-3">
      <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
        <div className="flex items-center gap-2 font-medium text-blue-800">
          <Info size={16} />
          プロンプト構成（5レイヤー）
        </div>
        <div className="text-blue-600 mt-1">
          以下のレイヤーが順に結合されてAIに送信されます
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
            {layer.editable && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">編集可</span>
            )}
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

  const renderFlowTab = () => (
    <div className="space-y-4">
      <div className="bg-purple-50 border border-purple-200 rounded p-3 text-sm">
        <div className="flex items-center gap-2 font-medium text-purple-800">
          <GitBranch size={16} />
          AI処理パイプライン
        </div>
        <div className="text-purple-600 mt-1">
          写真がAIで解析される一連のフロー
        </div>
      </div>

      <div className="relative">
        {FLOW_STEPS.map((step, index) => (
          <div key={step.id} className="flex items-start gap-3 mb-4">
            {/* ステップ番号と接続線 */}
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step.optional ? 'bg-gray-200 text-gray-600' : 'bg-blue-600 text-white'}`}>
                {index + 1}
              </div>
              {index < FLOW_STEPS.length - 1 && (
                <div className={`w-0.5 h-8 ${step.optional ? 'bg-gray-200 border-l border-dashed border-gray-400' : 'bg-blue-200'}`} />
              )}
            </div>

            {/* ステップ内容 */}
            <div className={`flex-1 p-3 rounded border ${step.optional ? 'border-dashed border-gray-300 bg-gray-50' : 'border-gray-200 bg-white'}`}>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">{step.icon}</span>
                <span className="font-medium">{step.name}</span>
                {step.optional && (
                  <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">オプション</span>
                )}
              </div>
              <div className="text-sm text-gray-600 mt-1">{step.description}</div>
            </div>

            {/* 矢印 */}
            {index < FLOW_STEPS.length - 1 && (
              <div className="hidden md:flex items-center pt-2">
                <ArrowRight size={16} className="text-gray-300" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* フロー図（簡易版） */}
      <div className="border rounded p-4 bg-gray-50">
        <div className="text-sm font-medium mb-3">処理フロー概要</div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="px-2 py-1 bg-blue-100 rounded">📷 写真</span>
          <ArrowRight size={14} className="text-gray-400" />
          <span className="px-2 py-1 bg-yellow-100 rounded">🔍 黒板判定</span>
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
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="flex-1"
          />
          <span className="w-12 text-center font-mono text-sm">{temperature}</span>
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>確定的 (0.0)</span>
          <span>創造的 (1.0)</span>
        </div>
        <div className="text-xs text-gray-600 mt-2 bg-gray-50 p-2 rounded">
          現在の設定: 0.1（確定的な出力を優先）
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
          <div>customInstruction: {customInstruction ? '設定あり' : 'なし'}</div>
        </div>
      </div>

      {/* プロンプト文字数 */}
      <div className="border rounded p-4">
        <div className="font-medium mb-3">プロンプトサイズ概算</div>
        <div className="text-sm space-y-2">
          <div className="flex justify-between">
            <span>システムプロンプト</span>
            <span className="font-mono">~15,000文字</span>
          </div>
          <div className="flex justify-between">
            <span>階層マスタJSON</span>
            <span className="font-mono">~5,000文字</span>
          </div>
          <div className="flex justify-between">
            <span>ルールテキスト</span>
            <span className="font-mono">~500文字</span>
          </div>
          <div className="flex justify-between">
            <span>お手本</span>
            <span className="font-mono">~{examples.length * 200}文字</span>
          </div>
          <div className="flex justify-between font-medium pt-2 border-t">
            <span>合計（概算）</span>
            <span className="font-mono">~20,000文字</span>
          </div>
        </div>
      </div>

      {/* ルール詳細リセット */}
      <button
        onClick={() => {
          setRuleSettings(getDefaultRuleSettings());
          saveRuleSettings(getDefaultRuleSettings());
        }}
        className="w-full flex items-center justify-center gap-2 p-2 border border-red-200 text-red-600 rounded hover:bg-red-50"
      >
        <RefreshCw size={16} />
        ルール設定をリセット
      </button>
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
              <p className="text-sm text-gray-500">プロンプト・フロー・パラメータの可視化とコントロール</p>
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
