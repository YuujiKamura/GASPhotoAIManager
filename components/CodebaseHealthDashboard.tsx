import React, { useState } from 'react';
import {
  ArrowLeft, GitBranch, CheckCircle, AlertTriangle, RefreshCw,
  ChevronDown, ChevronRight, Scale, AlertCircle, PackageX, MoreVertical, ExternalLink,
  Network, Layers, Zap, FileCode, Copy, Check, ArrowRight, TreePine, Folder, GitCompare
} from 'lucide-react';
import codebaseStats from '../src/generated/codebase-stats.json';
import { useDashboardState, useCopyState, useExpandedState } from '../hooks/useDashboardState';

interface CodebaseHealthDashboardProps {
  lang: 'en' | 'ja';
  onClose: () => void;
}

type Priority = 'high' | 'medium' | 'low';
type Status = 'ok' | 'warning' | 'error';

const PRIORITY_STYLES: Record<Priority, { border: string; bg: string; badge: string }> = {
  high: { border: 'border-red-300', bg: 'bg-red-50', badge: 'bg-red-100 text-red-700 border-red-300' },
  medium: { border: 'border-yellow-300', bg: 'bg-yellow-50', badge: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  low: { border: 'border-blue-200', bg: 'bg-blue-50', badge: 'bg-blue-100 text-blue-700 border-blue-300' } };

const STATUS_STYLES: Record<Status, { bg: string; border: string; countBg: string }> = {
  ok: { bg: 'bg-green-50', border: 'border-green-200', countBg: 'bg-gray-200 text-gray-700' },
  warning: { bg: 'bg-yellow-50', border: 'border-yellow-200', countBg: 'bg-yellow-200 text-yellow-700' },
  error: { bg: 'bg-red-50', border: 'border-red-200', countBg: 'bg-red-200 text-red-700' } };

const StatusIcon: React.FC<{ status: Status }> = ({ status }) => {
  const icons = {
    ok: <CheckCircle className="w-5 h-5 text-green-500" />,
    warning: <AlertTriangle className="w-5 h-5 text-yellow-500" />,
    error: <AlertCircle className="w-5 h-5 text-red-500" />
  };
  return icons[status];
};

const SectionToggle: React.FC<{ expanded: boolean; onClick: () => void; children: React.ReactNode }> =
  ({ expanded, onClick, children }) => (
    <button type="button" onClick={onClick} className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-4 hover:text-blue-600 transition-colors">
      {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
      {children}
    </button>
  );

const generateTaskPrompt = (task: any) => `# タスク: ${task.title}

## 概要
${task.description}

## 対象ファイル
${task.file || '複数ファイル'}

## 作業内容
${task.priority === 'high' ?
`1. 対象ファイルを読んで現状を把握
2. 分離できるロジックを特定
3. 新規ファイルを作成して移行
4. ビルド確認してコミット` :
`1. 対象ファイルを読んで冗長な部分を特定
2. 重複コードの共通化
3. 不要なコードの削除
4. ビルド確認してコミット`}

## 完了条件
${task.estimatedLines ? `- 目標: ${task.estimatedLines}行以上削減` : '- 機能が正常動作すること'}
- npm run build が通ること
- 完了したらダッシュボードのタスク状態を更新

## タスクID
${task.id}`;

const HEALTH_FIX_PROMPTS: Record<string, string> = {
  TypeScript: `# TypeScript型エラー修正

## 実行コマンド
\`\`\`bash
npx tsc --noEmit
\`\`\`

## 修正手順
1. エラー箇所を特定
2. エラーの種類を判断:
   - \`import.meta.env\` → vite-env.d.ts の型定義確認
   - \`Property 'X' does not exist\` → 型定義の追加または修正
3. 修正を適用
4. \`npx tsc --noEmit\` で再確認
5. エラーがなくなるまで繰り返す

## 完了条件
- \`npx tsc --noEmit\` がエラー0で完了
- \`npm run build\` が成功`,

  knip: `# 未使用ファイル整理

## 実行コマンド
\`\`\`bash
npx knip --reporter compact
\`\`\`

## 修正手順
1. 未使用ファイル一覧を取得
2. 各ファイルを分類:
   - 削除可能: 本当に使われていない古いコード
   - 除外設定: 手動実行スクリプト、設定ファイル等
3. 削除可能なファイルは \`git rm\` で削除
4. 除外設定が必要なファイルは knip.json に追加

## 除外すべきパターン
- scripts/ - 手動実行ユーティリティ
- .claude/ - Claude Code設定
- *.config.* - 設定ファイル

## 完了条件
- \`npx knip\` の警告が妥当な範囲
- \`npm run build\` が成功`,

  depcheck: `# 未使用依存関係の整理

## 実行コマンド
\`\`\`bash
npx depcheck
\`\`\`

## 修正手順
1. 未使用と報告された依存関係を確認
2. 本当に使われていないか確認（動的importに注意）
3. 不要なら \`npm uninstall パッケージ名\`
4. 必要なら .depcheckrc で除外設定

## 完了条件
- depcheck の警告が妥当な範囲
- \`npm run build\` が成功`
};

const generateHealthFixPrompt = (check: { name: string; details: string[] }) => {
  const base = HEALTH_FIX_PROMPTS[check.name];
  if (!base) return null;
  return `${base}

## 現在のエラー詳細
${check.details.join('\n')}`;
};

const TaskCard: React.FC<{ task: any }> = ({ task }) => {
  const style = PRIORITY_STYLES[task.priority as Priority] || PRIORITY_STYLES.low;
  return (
    <div className={`rounded-xl border-2 p-4 ${style.border} ${style.bg}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded border ${style.badge}`}>
              {task.priority.toUpperCase()}
            </span>
            <span className="font-mono text-sm bg-gray-200 px-2 py-0.5 rounded">{task.id}</span>
          </div>
          <p className="mt-2 text-gray-900 font-semibold">{task.title}</p>
          <p className="mt-1 text-sm text-gray-600">{task.description}</p>
          {task.estimatedLines > 0 && (
            <p className="mt-2 text-xs text-green-700">💡 削減見込み: {task.estimatedLines.toLocaleString()}行</p>
          )}
        </div>
        <button
          onClick={() => navigator.clipboard.writeText(generateTaskPrompt(task))}
          className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 whitespace-nowrap"
        >
          📋 指示をコピー
        </button>
      </div>
    </div>
  );
};

const DEPS = [
  { name: 'react + react-dom', size: '~140KB' }, { name: 'pdfjs-dist', size: '~1.1MB', issue: true },
  { name: 'pdf-lib', size: '~280KB' }, { name: 'lucide-react', size: '~25KB' }, { name: '@google/genai', size: '~50KB' },
];

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  architecture: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  performance: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  maintainability: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  ui: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
};

const EFFORT_LABELS: Record<string, { label: string; color: string }> = {
  small: { label: '小', color: 'bg-green-100 text-green-700' },
  medium: { label: '中', color: 'bg-yellow-100 text-yellow-700' },
  large: { label: '大', color: 'bg-red-100 text-red-700' },
};

// コピーボタンコンポーネント
const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label = '📋 指示をコピー' }) => {
  const { copied, handleCopy } = useCopyState();

  return (
    <button
      onClick={() => handleCopy(text)}
      className={`text-xs px-3 py-1.5 rounded flex items-center gap-1 transition-colors ${
        copied ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
      }`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'コピー済み' : label}
    </button>
  );
};

// 改善提案カード
const SuggestionCard: React.FC<{ suggestion: any; lang: 'en' | 'ja' }> = ({ suggestion, lang }) => {
  const { expanded, toggle } = useExpandedState();
  const categoryStyle = CATEGORY_COLORS[suggestion.category] || CATEGORY_COLORS.maintainability;
  const effortStyle = EFFORT_LABELS[suggestion.effort] || EFFORT_LABELS.medium;
  const priorityStyle = PRIORITY_STYLES[suggestion.priority as Priority] || PRIORITY_STYLES.low;

  return (
    <div className={`rounded-xl border-2 p-4 ${categoryStyle.bg} ${categoryStyle.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded border ${priorityStyle.badge}`}>
              {suggestion.priority.toUpperCase()}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded ${categoryStyle.text} bg-white/50`}>
              {suggestion.category}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded ${effortStyle.color}`}>
              工数: {effortStyle.label}
            </span>
          </div>
          <p className="text-gray-900 font-semibold">{suggestion.title}</p>
          <p className="mt-1 text-sm text-gray-600">{suggestion.description}</p>
          {suggestion.files && suggestion.files.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {suggestion.files.slice(0, 3).map((f: string, i: number) => (
                <span key={i} className="text-xs bg-white/70 px-2 py-0.5 rounded font-mono">{f}</span>
              ))}
              {suggestion.files.length > 3 && (
                <span className="text-xs text-gray-500">+{suggestion.files.length - 3}</span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <CopyButton text={suggestion.prompt} />
          <button
            type="button"
            onClick={toggle}
            className="text-xs text-gray-600 hover:text-gray-900"
          >
            {expanded ? '詳細を隠す' : '詳細を見る'}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-4 p-3 bg-white/70 rounded-lg">
          <pre className="text-xs text-gray-700 whitespace-pre-wrap overflow-auto max-h-64">
            {suggestion.prompt}
          </pre>
        </div>
      )}
    </div>
  );
};

// コンポーネント分析カード
const ComponentAnalysisCard: React.FC<{ component: any }> = ({ component }) => {
  const hasIssues = component.issues && component.issues.length > 0;

  return (
    <div className={`rounded-lg border p-3 ${hasIssues ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="font-mono text-sm text-gray-900">{component.path}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
              Props: {component.propsCount}
            </span>
            <span className={`px-2 py-0.5 rounded ${component.stateCount > 3 ? 'bg-yellow-200 text-yellow-800' : 'bg-gray-200 text-gray-700'}`}>
              useState: {component.stateCount}
            </span>
            <span className={`px-2 py-0.5 rounded ${component.effectCount > 2 ? 'bg-yellow-200 text-yellow-800' : 'bg-gray-200 text-gray-700'}`}>
              useEffect: {component.effectCount}
            </span>
            <span className={`px-2 py-0.5 rounded ${component.jsxDepth > 6 ? 'bg-yellow-200 text-yellow-800' : 'bg-gray-200 text-gray-700'}`}>
              JSX深度: {component.jsxDepth}
            </span>
          </div>
          {hasIssues && (
            <div className="mt-2">
              {component.issues.map((issue: string, i: number) => (
                <p key={i} className="text-xs text-yellow-700">⚠️ {issue}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// モジュール依存関係の簡易ビジュアライゼーション
const DependencyGraph: React.FC<{ modules: any[] }> = ({ modules }) => {
  // カテゴリ別に集計
  const categoryStats = {
    components: { count: 0, totalImports: 0, totalImportedBy: 0 },
    services: { count: 0, totalImports: 0, totalImportedBy: 0 },
    hooks: { count: 0, totalImports: 0, totalImportedBy: 0 },
    utils: { count: 0, totalImports: 0, totalImportedBy: 0 },
    other: { count: 0, totalImports: 0, totalImportedBy: 0 },
  };

  for (const mod of modules) {
    const cat = mod.category as keyof typeof categoryStats;
    if (categoryStats[cat]) {
      categoryStats[cat].count++;
      categoryStats[cat].totalImports += mod.imports?.length || 0;
      categoryStats[cat].totalImportedBy += mod.importedBy?.length || 0;
    }
  }

  const categories = [
    { key: 'components', label: 'Components', color: 'bg-blue-500' },
    { key: 'hooks', label: 'Hooks', color: 'bg-purple-500' },
    { key: 'services', label: 'Services', color: 'bg-green-500' },
    { key: 'utils', label: 'Utils', color: 'bg-orange-500' },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Network className="w-4 h-4 text-purple-500" />
        モジュール依存関係サマリー
      </h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {categories.map(cat => {
          const stats = categoryStats[cat.key as keyof typeof categoryStats];
          return (
            <div key={cat.key} className="text-center p-3 bg-gray-50 rounded-lg">
              <div className={`w-12 h-12 ${cat.color} rounded-full mx-auto mb-2 flex items-center justify-center text-white font-bold`}>
                {stats.count}
              </div>
              <p className="text-sm font-medium text-gray-900">{cat.label}</p>
              <p className="text-xs text-gray-500">
                → {stats.totalImports} imports
              </p>
              <p className="text-xs text-gray-500">
                ← {stats.totalImportedBy} refs
              </p>
            </div>
          );
        })}
      </div>

      {/* 高依存モジュール */}
      <div className="mt-4 pt-4 border-t">
        <h5 className="text-sm font-medium text-gray-700 mb-2">🔥 高影響モジュール（参照数Top5）</h5>
        <div className="space-y-1">
          {modules
            .filter(m => m.importedBy && m.importedBy.length > 0)
            .sort((a, b) => (b.importedBy?.length || 0) - (a.importedBy?.length || 0))
            .slice(0, 5)
            .map((mod, i) => (
              <div key={i} className="flex items-center justify-between text-sm bg-gray-50 rounded px-3 py-1">
                <span className="font-mono text-xs truncate flex-1">{mod.path}</span>
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded ml-2">
                  {mod.importedBy?.length || 0} refs
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

// 機能フローツリー表示
const FeatureFlowTree: React.FC<{ node: any; level: number }> = ({ node, level }) => {
  const [expanded, setExpanded] = useState(level < 2);
  const hasChildren = node.children && node.children.length > 0;

  const typeIcons: Record<string, { icon: string; color: string }> = {
    screen: { icon: '🖥️', color: 'text-blue-600' },
    modal: { icon: '📦', color: 'text-purple-600' },
    panel: { icon: '📋', color: 'text-green-600' },
    action: { icon: '⚡', color: 'text-orange-600' },
  };

  const { icon, color } = typeIcons[node.type] || typeIcons.screen;

  return (
    <div className={`${level > 0 ? 'ml-6 border-l-2 border-gray-200 pl-4' : ''}`}>
      <div className="flex items-start gap-2 py-1">
        {hasChildren && (
          <button type="button" onClick={() => setExpanded(!expanded)} className="text-gray-400 hover:text-gray-600 mt-0.5">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        )}
        {!hasChildren && <span className="w-4" />}
        <span className="text-lg">{icon}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`font-semibold ${color}`}>{node.name}</span>
            <span className="text-xs text-gray-400 font-mono">{node.component}</span>
          </div>
          <p className="text-xs text-gray-500">{node.description}</p>
          {node.backendModules && node.backendModules.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {node.backendModules.slice(0, 3).map((mod: string, i: number) => (
                <span key={i} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                  {mod.split('/').pop()}
                </span>
              ))}
              {node.backendModules.length > 3 && (
                <span className="text-xs text-gray-400">+{node.backendModules.length - 3}</span>
              )}
            </div>
          )}
        </div>
      </div>
      {expanded && hasChildren && (
        <div className="mt-1">
          {node.children.map((child: any, i: number) => (
            <FeatureFlowTree key={i} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

// 裏方モジュールグループカード
const BackendModuleGroupCard: React.FC<{ group: any }> = ({ group }) => {
  const [expanded, setExpanded] = useState(false);

  const categoryIcons: Record<string, string> = {
    'AI/解析': '🤖',
    'ストレージ': '💾',
    'ソート/整列': '📊',
    'エクスポート': '📤',
    '正規化': '🔄',
    'ユーティリティ': '🔧',
    'API/通信': '🌐',
    '状態管理': '📦',
    'その他': '📁',
  };

  return (
    <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-amber-50"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{categoryIcons[group.category] || '📁'}</span>
          <div>
            <h3 className="font-semibold text-gray-900">{group.category}</h3>
            <p className="text-xs text-gray-500">{group.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
            {group.modules.length} モジュール
          </span>
          {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-amber-100 p-4 space-y-2">
          {group.modules.map((mod: any, i: number) => (
            <div key={i} className="bg-amber-50 rounded-lg p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-sm text-gray-900">{mod.path}</p>
                  {mod.exports.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {mod.exports.map((exp: string, j: number) => (
                        <span key={j} className="text-xs bg-white text-gray-600 px-1.5 py-0.5 rounded border">
                          {exp}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {mod.usedBy.length > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-gray-500">使用元:</p>
                    <p className="text-xs text-gray-700">{mod.usedBy.slice(0, 2).join(', ')}</p>
                    {mod.usedBy.length > 2 && <p className="text-xs text-gray-400">+{mod.usedBy.length - 2}</p>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// 類似モジュールカード
const SimilarModuleCard: React.FC<{ pair: any }> = ({ pair }) => {
  const [showPrompt, setShowPrompt] = useState(false);
  const similarityColor = pair.similarity >= 0.5 ? 'bg-red-100 text-red-700' :
                          pair.similarity >= 0.4 ? 'bg-orange-100 text-orange-700' :
                          'bg-yellow-100 text-yellow-700';

  return (
    <div className="bg-white rounded-xl border border-rose-200 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${similarityColor}`}>
              {Math.round(pair.similarity * 100)}% 類似
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{pair.modules[0]}</span>
            <ArrowRight className="w-4 h-4 text-gray-400" />
            <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{pair.modules[1]}</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">{pair.reason}</p>
        </div>
        <div className="flex flex-col gap-2">
          <CopyButton text={pair.comparisonPrompt} label="比較指示をコピー" />
          <button
            type="button"
            onClick={() => setShowPrompt(!showPrompt)}
            className="text-xs text-gray-600 hover:text-gray-900"
          >
            {showPrompt ? '詳細を隠す' : '詳細を見る'}
          </button>
        </div>
      </div>
      {showPrompt && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <pre className="text-xs text-gray-700 whitespace-pre-wrap overflow-auto max-h-64">
            {pair.comparisonPrompt}
          </pre>
        </div>
      )}
    </div>
  );
};

const CodebaseHealthDashboard: React.FC<CodebaseHealthDashboardProps> = ({ lang, onClose }) => {
  const {
    expandedSections,
    isLoading,
    showMenu,
    healthChecks,
    toggle,
    setShowMenu,
    runAnalysis,
  } = useDashboardState();

  const t = (ja: string, en: string) => lang === 'ja' ? ja : en;

  const tasks = codebaseStats.tasks?.filter((t: any) => t.status === 'todo')
    .sort((a: any, b: any) => ({ high: 0, medium: 1, low: 2 }[a.priority as Priority] ?? 2) - ({ high: 0, medium: 1, low: 2 }[b.priority as Priority] ?? 2)) || [];

  const taskCounts = { high: 0, medium: 0, low: 0 };
  tasks.forEach((t: any) => taskCounts[t.priority as Priority]++);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onClose} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
              <ArrowLeft className="w-5 h-5" /><span>{t('戻る', 'Back')}</span>
            </button>
            <div className="h-6 w-px bg-gray-300" />
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <GitBranch className="w-6 h-6 text-blue-600" />
              {t('コードベース健全性ダッシュボード', 'Codebase Health Dashboard')}
            </h1>
            <span className="text-sm text-gray-500">
              {t('更新: ', 'Updated: ')}{new Date(codebaseStats.generatedAt).toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-US')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {import.meta.env.DEV ? (
              <button onClick={runAnalysis} disabled={isLoading} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />{t('更新', 'Refresh')}
              </button>
            ) : (
              <a href="https://github.com/YuujiKamura/GASPhotoAIManager/actions/workflows/deploy.yml" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <RefreshCw className="w-4 h-4" />{t('再デプロイ', 'Redeploy')}
              </a>
            )}
            <div className="relative">
              <button onClick={() => setShowMenu(!showMenu)} className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg">
                <MoreVertical className="w-5 h-5" />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border py-1 z-20 min-w-[200px]">
                    {[
                      { href: 'https://github.com/YuujiKamura/GASPhotoAIManager/actions', icon: ExternalLink, label: 'GitHub Actions' },
                      { href: 'https://github.com/YuujiKamura/GASPhotoAIManager', icon: GitBranch, label: t('リポジトリを開く', 'Open Repository') }
                    ].map(({ href, icon: Icon, label }) => (
                      <a key={href} href={href} target="_blank" rel="noopener noreferrer" onClick={() => setShowMenu(false)}
                        className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100">
                        <Icon className="w-4 h-4" />{label}
                      </a>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-6 h-6 animate-spin text-gray-600" />
            <span className="ml-3 text-lg text-gray-600">{t('分析中...', 'Analyzing...')}</span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Task List */}
            <section className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-2xl border-2 border-slate-200 overflow-hidden">
              <button type="button" onClick={() => toggle('tasks')} className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-100/50">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    {expandedSections.has('tasks') ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                    🔧 {t('タスク一覧', 'Task List')}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1 ml-7">{t('検出された課題とClaude用タスク', 'Detected issues and Claude tasks')}</p>
                </div>
                <div className="flex items-center gap-2">
                  {taskCounts.high > 0 && <span className="bg-red-500 text-white text-sm font-bold px-3 py-1 rounded-full">{taskCounts.high} High</span>}
                  {taskCounts.medium > 0 && <span className="bg-yellow-500 text-white text-sm font-bold px-3 py-1 rounded-full">{taskCounts.medium} Med</span>}
                  {taskCounts.low > 0 && <span className="bg-blue-500 text-white text-sm font-bold px-3 py-1 rounded-full">{taskCounts.low} Low</span>}
                </div>
              </button>
              {expandedSections.has('tasks') && (
                <div className="p-5 pt-0 space-y-3">
                  {tasks.map((task: any) => <TaskCard key={task.id} task={task} />)}
                  {tasks.length === 0 && <p className="text-center text-gray-500 py-4">🎉 {t('すべてのタスクが完了しています！', 'All tasks completed!')}</p>}
                </div>
              )}
            </section>

            {/* Bundle Size */}
            <section>
              <SectionToggle expanded={expandedSections.has('bundle')} onClick={() => toggle('bundle')}>
                <Scale className="w-5 h-5 text-orange-500" />{t('バンドルサイズ分析', 'Bundle Size Analysis')}
              </SectionToggle>
              {expandedSections.has('bundle') && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="mb-6">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-medium text-gray-700">{t('バンドル合計', 'Bundle Total')}</span>
                      <span className="font-bold text-orange-600">3.37 MB (gzip: 841 KB)</span>
                    </div>
                    <div className="h-8 bg-gray-100 rounded-lg overflow-hidden flex">
                      <div className="bg-blue-500 h-full flex items-center justify-center text-white text-xs font-bold" style={{ width: '42%' }}>index.js (1.43MB)</div>
                      <div className="bg-purple-500 h-full flex items-center justify-center text-white text-xs font-bold" style={{ width: '26%' }}>pdf.js (877KB)</div>
                      <div className="bg-orange-500 h-full flex items-center justify-center text-white text-xs font-bold" style={{ width: '32%' }}>pdf.worker (1.07MB)</div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>0 MB</span><span className="text-yellow-600 font-medium">⚠️ 600KB推奨ライン</span><span>4 MB</span>
                    </div>
                  </div>
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <PackageX className="w-4 h-4 text-red-500" />{t('重い依存関係', 'Heavy Dependencies')}
                  </h4>
                  <div className="space-y-2">
                    {DEPS.map((dep, i) => (
                      <div key={i} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-700">{dep.name}</span>
                          {dep.issue && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded">{t('巨大', 'Large')}</span>}
                        </div>
                        <span className={`font-mono text-xs px-2 py-0.5 rounded ${dep.size.includes('1.') ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{dep.size}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Health Checks */}
            <section>
              <SectionToggle expanded={expandedSections.has('health')} onClick={() => toggle('health')}>
                {t('健全性チェック', 'Health Checks')}
                {healthChecks.length > 0 && (
                  <span className="ml-2 flex gap-1">
                    {healthChecks.filter(c => c.status === 'error').length > 0 && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{healthChecks.filter(c => c.status === 'error').length}</span>}
                    {healthChecks.filter(c => c.status === 'warning').length > 0 && <span className="bg-yellow-500 text-white text-xs px-2 py-0.5 rounded-full">{healthChecks.filter(c => c.status === 'warning').length}</span>}
                  </span>
                )}
              </SectionToggle>
              {expandedSections.has('health') && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {healthChecks.map((check, i) => {
                    const style = STATUS_STYLES[check.status as Status];
                    const fixPrompt = generateHealthFixPrompt(check);
                    return (
                      <div key={i} className={`rounded-xl border p-4 ${style.bg} ${style.border}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <StatusIcon status={check.status} />
                            <span className="font-semibold text-gray-900 text-sm">{check.name}</span>
                          </div>
                          {check.count > 0 && <span className={`text-xs font-bold px-2 py-0.5 rounded ${style.countBg}`}>{check.count}</span>}
                        </div>
                        {check.details.map((d: string, j: number) => <p key={j} className="text-xs text-gray-600 truncate" title={d}>{d}</p>)}
                        {fixPrompt && check.status !== 'ok' && (
                          <button
                            onClick={() => navigator.clipboard.writeText(fixPrompt)}
                            className="mt-2 text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                          >
                            📋 {t('修正指示をコピー', 'Copy fix instructions')}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* 改善提案 */}
            {(codebaseStats as any).suggestions && (codebaseStats as any).suggestions.length > 0 && (
              <section className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl border-2 border-purple-200 overflow-hidden">
                <button type="button" onClick={() => toggle('suggestions')} className="w-full flex items-center justify-between p-5 text-left hover:bg-purple-100/50">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                      {expandedSections.has('suggestions') ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                      💡 {t('改善提案', 'Improvement Suggestions')}
                    </h2>
                    <p className="text-sm text-gray-600 mt-1 ml-7">{t('アーキテクチャ・パフォーマンス・保守性の改善提案', 'Architecture, performance, and maintainability suggestions')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-purple-500 text-white text-sm font-bold px-3 py-1 rounded-full">
                      {(codebaseStats as any).suggestions.length}
                    </span>
                  </div>
                </button>
                {expandedSections.has('suggestions') && (
                  <div className="p-5 pt-0 space-y-3">
                    {(codebaseStats as any).suggestions.map((suggestion: any, i: number) => (
                      <SuggestionCard key={i} suggestion={suggestion} lang={lang} />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* モジュール依存関係 */}
            {(codebaseStats as any).moduleDependencies && (codebaseStats as any).moduleDependencies.length > 0 && (
              <section>
                <SectionToggle expanded={expandedSections.has('dependencies')} onClick={() => toggle('dependencies')}>
                  <Network className="w-5 h-5 text-purple-500" />
                  {t('モジュール依存関係', 'Module Dependencies')}
                </SectionToggle>
                {expandedSections.has('dependencies') && (
                  <DependencyGraph modules={(codebaseStats as any).moduleDependencies} />
                )}
              </section>
            )}

            {/* コンポーネント分析 */}
            {(codebaseStats as any).componentAnalysis && (codebaseStats as any).componentAnalysis.length > 0 && (
              <section>
                <SectionToggle expanded={expandedSections.has('componentAnalysis')} onClick={() => toggle('componentAnalysis')}>
                  <FileCode className="w-5 h-5 text-blue-500" />
                  {t('コンポーネント分析', 'Component Analysis')}
                  {(codebaseStats as any).componentAnalysis.filter((c: any) => c.issues?.length > 0).length > 0 && (
                    <span className="ml-2 bg-yellow-500 text-white text-xs px-2 py-0.5 rounded-full">
                      {(codebaseStats as any).componentAnalysis.filter((c: any) => c.issues?.length > 0).length}
                    </span>
                  )}
                </SectionToggle>
                {expandedSections.has('componentAnalysis') && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <div className="space-y-3">
                      {(codebaseStats as any).componentAnalysis.slice(0, 10).map((comp: any, i: number) => (
                        <ComponentAnalysisCard key={i} component={comp} />
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* アーキテクチャ問題 */}
            {(codebaseStats as any).architectureIssues && (codebaseStats as any).architectureIssues.length > 0 && (
              <section>
                <SectionToggle expanded={expandedSections.has('archIssues')} onClick={() => toggle('archIssues')}>
                  <Layers className="w-5 h-5 text-red-500" />
                  {t('アーキテクチャ問題', 'Architecture Issues')}
                  <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                    {(codebaseStats as any).architectureIssues.length}
                  </span>
                </SectionToggle>
                {expandedSections.has('archIssues') && (
                  <div className="bg-white rounded-xl border border-red-200 p-5">
                    <div className="space-y-2">
                      {(codebaseStats as any).architectureIssues.map((issue: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 p-3 bg-red-50 rounded-lg">
                          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                          <p className="text-sm text-red-700">{issue}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* 機能フローツリー */}
            {(codebaseStats as any).featureFlow && (
              <section className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border-2 border-emerald-200 overflow-hidden">
                <button type="button" onClick={() => toggle('featureFlow')} className="w-full flex items-center justify-between p-5 text-left hover:bg-emerald-100/50">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                      {expandedSections.has('featureFlow') ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                      <TreePine className="w-5 h-5 text-emerald-600" />
                      {t('機能フローツリー', 'Feature Flow Tree')}
                    </h2>
                    <p className="text-sm text-gray-600 mt-1 ml-7">{t('画面とモーダルの階層構造', 'Screen and modal hierarchy')}</p>
                  </div>
                </button>
                {expandedSections.has('featureFlow') && (
                  <div className="p-5 pt-0">
                    <div className="bg-white rounded-xl border border-emerald-200 p-4">
                      <FeatureFlowTree node={(codebaseStats as any).featureFlow} level={0} />
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* 裏方モジュールグループ */}
            {(codebaseStats as any).backendGroups && (codebaseStats as any).backendGroups.length > 0 && (
              <section className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border-2 border-amber-200 overflow-hidden">
                <button type="button" onClick={() => toggle('backendGroups')} className="w-full flex items-center justify-between p-5 text-left hover:bg-amber-100/50">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                      {expandedSections.has('backendGroups') ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                      <Folder className="w-5 h-5 text-amber-600" />
                      {t('裏方モジュール', 'Backend Modules')}
                    </h2>
                    <p className="text-sm text-gray-600 mt-1 ml-7">{t('機能別にグループ化されたサービス・ユーティリティ', 'Services and utilities grouped by function')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-amber-500 text-white text-sm font-bold px-3 py-1 rounded-full">
                      {(codebaseStats as any).backendGroups.length} {t('カテゴリ', 'categories')}
                    </span>
                  </div>
                </button>
                {expandedSections.has('backendGroups') && (
                  <div className="p-5 pt-0 space-y-3">
                    {(codebaseStats as any).backendGroups.map((group: any, i: number) => (
                      <BackendModuleGroupCard key={i} group={group} />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* 類似モジュール検出 */}
            {(codebaseStats as any).similarModules && (codebaseStats as any).similarModules.length > 0 && (
              <section className="bg-gradient-to-br from-rose-50 to-pink-50 rounded-2xl border-2 border-rose-200 overflow-hidden">
                <button type="button" onClick={() => toggle('similarModules')} className="w-full flex items-center justify-between p-5 text-left hover:bg-rose-100/50">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                      {expandedSections.has('similarModules') ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                      <GitCompare className="w-5 h-5 text-rose-600" />
                      {t('類似モジュール', 'Similar Modules')}
                    </h2>
                    <p className="text-sm text-gray-600 mt-1 ml-7">{t('統合や役割分担の検討が必要な可能性があるモジュール', 'Modules that may need consolidation or role clarification')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-rose-500 text-white text-sm font-bold px-3 py-1 rounded-full">
                      {(codebaseStats as any).similarModules.length} {t('ペア', 'pairs')}
                    </span>
                  </div>
                </button>
                {expandedSections.has('similarModules') && (
                  <div className="p-5 pt-0 space-y-3">
                    {(codebaseStats as any).similarModules.map((pair: any, i: number) => (
                      <SimilarModuleCard key={i} pair={pair} />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CodebaseHealthDashboard;
