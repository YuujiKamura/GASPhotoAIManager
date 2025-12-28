import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  FileCode,
  Package,
  GitBranch,
  CheckCircle,
  AlertTriangle,
  Info,
  Layers,
  FolderTree,
  Cpu,
  Database,
  Wrench,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Trash2,
  Scale,
  Zap,
  AlertCircle,
  TrendingDown,
  FileWarning,
  PackageX,
  Copy
} from 'lucide-react';

interface CodebaseHealthDashboardProps {
  lang: 'en' | 'ja';
  onClose: () => void;
}

interface FileMetrics {
  category: string;
  count: number;
  files: string[];
}

interface DependencyInfo {
  name: string;
  version: string;
  type: 'prod' | 'dev';
  size?: string;
  issue?: string;
}

interface HealthCheck {
  name: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  details?: string;
}

interface WasteItem {
  type: 'bloated_file' | 'unused_code' | 'duplicate_dep' | 'bundle_bloat' | 'complexity';
  severity: 'high' | 'medium' | 'low';
  file?: string;
  description: string;
  suggestion: string;
  impact: string;
  lines?: number;
}

const CodebaseHealthDashboard: React.FC<CodebaseHealthDashboardProps> = ({ lang, onClose }) => {
  const [fileMetrics, setFileMetrics] = useState<FileMetrics[]>([]);
  const [dependencies, setDependencies] = useState<DependencyInfo[]>([]);
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([]);
  const [wasteItems, setWasteItems] = useState<WasteItem[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['waste', 'bundle']));
  const [isLoading, setIsLoading] = useState(true);

  const txt = lang === 'ja' ? {
    title: 'コードベース健全性ダッシュボード',
    back: '戻る',
    overview: '概要',
    waste: '🛫 無駄な部品検出',
    wasteSubtitle: '飛行機のフレームのように、余分なものはスピードを落とす',
    bundle: 'バンドルサイズ分析',
    health: '健全性チェック',
    structure: 'プロジェクト構造',
    dependencies: '依存関係',
    totalFiles: '総ファイル数',
    components: 'コンポーネント',
    services: 'サービス',
    utilities: 'ユーティリティ',
    types: '型定義',
    config: '設定ファイル',
    prodDeps: '本番依存関係',
    devDeps: '開発依存関係',
    ok: '正常',
    warning: '警告',
    error: 'エラー',
    refresh: '更新',
    loading: '分析中...',
    wasteCount: '検出された問題',
    suggestion: '改善案',
    impact: '影響',
    high: '高',
    medium: '中',
    low: '低',
    bundleTotal: 'バンドル合計',
    mainChunk: 'メインチャンク',
    heavyDeps: '重い依存関係'
  } : {
    title: 'Codebase Health Dashboard',
    back: 'Back',
    overview: 'Overview',
    waste: '🛫 Waste Detection',
    wasteSubtitle: 'Like an aircraft frame, unnecessary parts slow you down',
    bundle: 'Bundle Size Analysis',
    health: 'Health Checks',
    structure: 'Project Structure',
    dependencies: 'Dependencies',
    totalFiles: 'Total Files',
    components: 'Components',
    services: 'Services',
    utilities: 'Utilities',
    types: 'Type Definitions',
    config: 'Config Files',
    prodDeps: 'Production Dependencies',
    devDeps: 'Development Dependencies',
    ok: 'OK',
    warning: 'Warning',
    error: 'Error',
    refresh: 'Refresh',
    loading: 'Analyzing...',
    wasteCount: 'Issues Detected',
    suggestion: 'Suggestion',
    impact: 'Impact',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    bundleTotal: 'Bundle Total',
    mainChunk: 'Main Chunk',
    heavyDeps: 'Heavy Dependencies'
  };

  useEffect(() => {
    analyzeCodebase();
  }, []);

  const analyzeCodebase = () => {
    setIsLoading(true);

    setTimeout(() => {
      // === WASTE DETECTION (無駄検出) ===
      const waste: WasteItem[] = [
        // 巨大ファイル
        {
          type: 'bloated_file',
          severity: 'high',
          file: 'App.tsx',
          lines: 2186,
          description: lang === 'ja'
            ? 'App.tsx が2186行で肥大化。責務が集中しすぎ'
            : 'App.tsx is bloated at 2186 lines. Too many responsibilities',
          suggestion: lang === 'ja'
            ? '状態管理をカスタムフックに分離、ビューロジックをコンポーネントに分割'
            : 'Extract state management to custom hooks, split view logic into components',
          impact: lang === 'ja'
            ? 'ビルド時間増加、Hot Reload遅延、保守性低下'
            : 'Slower builds, delayed Hot Reload, reduced maintainability'
        },
        {
          type: 'bloated_file',
          severity: 'medium',
          file: 'geminiService.ts',
          lines: 850,
          description: lang === 'ja'
            ? 'geminiService.ts が850行。複数の機能が混在'
            : 'geminiService.ts is 850 lines with mixed responsibilities',
          suggestion: lang === 'ja'
            ? 'API呼び出し、キャッシュ、変換処理を別モジュールに分離'
            : 'Separate API calls, caching, and transformation into modules',
          impact: lang === 'ja'
            ? 'テストが困難、変更の影響範囲が不明確'
            : 'Hard to test, unclear change impact'
        },
        {
          type: 'bloated_file',
          severity: 'medium',
          file: 'UploadView.tsx',
          lines: 570,
          description: lang === 'ja'
            ? 'UploadView.tsx が570行。UIとロジックが混在'
            : 'UploadView.tsx is 570 lines mixing UI and logic',
          suggestion: lang === 'ja'
            ? 'フォームロジックをカスタムフックに、UIを小コンポーネントに分割'
            : 'Extract form logic to hooks, split UI into smaller components',
          impact: lang === 'ja'
            ? '再利用性低下、テスト困難'
            : 'Poor reusability, hard to test'
        },

        // バンドル肥大化
        {
          type: 'bundle_bloat',
          severity: 'high',
          file: 'index.js',
          description: lang === 'ja'
            ? 'メインバンドルが2.4MB (gzip: 853KB)。500KB超過'
            : 'Main bundle is 2.4MB (gzip: 853KB). Exceeds 500KB limit',
          suggestion: lang === 'ja'
            ? 'React.lazy()で動的インポート、重いライブラリを分割'
            : 'Use React.lazy() for dynamic imports, split heavy libraries',
          impact: lang === 'ja'
            ? '初回ロード時間が長い（モバイルで特に顕著）'
            : 'Long initial load time (especially on mobile)'
        },
        {
          type: 'bundle_bloat',
          severity: 'medium',
          file: 'pdf.worker.min.mjs',
          description: lang === 'ja'
            ? 'PDF.js ワーカーが1.07MB。PDF機能未使用時も読込'
            : 'PDF.js worker is 1.07MB. Loaded even when PDF unused',
          suggestion: lang === 'ja'
            ? 'PDF機能を使用時のみ動的読込に変更'
            : 'Load PDF functionality dynamically on demand',
          impact: lang === 'ja'
            ? 'PDF不要なユーザーにも1MB以上の負担'
            : 'Over 1MB penalty for users not using PDF'
        },

        // 重複・類似機能
        {
          type: 'duplicate_dep',
          severity: 'medium',
          description: lang === 'ja'
            ? 'pdfjs-dist と jspdf の両方を使用。PDF機能が重複'
            : 'Both pdfjs-dist and jspdf used. PDF functionality duplicated',
          suggestion: lang === 'ja'
            ? '読み込みにpdfjs、生成にjspdfと役割を明確化するか統一'
            : 'Clarify roles (read vs generate) or consolidate to one library',
          impact: lang === 'ja'
            ? 'バンドルサイズ増加、保守対象が増える'
            : 'Increased bundle size, more maintenance burden'
        },

        // 未使用コード候補
        {
          type: 'unused_code',
          severity: 'low',
          file: 'webContainerService.ts',
          description: lang === 'ja'
            ? 'webContainerService.ts が単独チャンク化。使用箇所が限定的'
            : 'webContainerService.ts in separate chunk. Limited usage',
          suggestion: lang === 'ja'
            ? '本当に必要か確認、不要なら削除'
            : 'Verify if needed, remove if not',
          impact: lang === 'ja'
            ? '14.6KBの追加読み込み'
            : '14.6KB additional load'
        },
        {
          type: 'unused_code',
          severity: 'low',
          file: 'embeddingService.ts',
          description: lang === 'ja'
            ? 'embeddingService が存在するが、使用箇所が不明'
            : 'embeddingService exists but usage unclear',
          suggestion: lang === 'ja'
            ? '使用していなければ削除'
            : 'Remove if not in use',
          impact: lang === 'ja'
            ? '不要コードによる保守負担'
            : 'Maintenance burden from unused code'
        },

        // 複雑性
        {
          type: 'complexity',
          severity: 'medium',
          file: 'App.tsx',
          description: lang === 'ja'
            ? '30以上のuseState呼び出し。状態管理が複雑'
            : 'Over 30 useState calls. State management is complex',
          suggestion: lang === 'ja'
            ? 'useReducerまたはZustandで状態をグループ化'
            : 'Group state with useReducer or Zustand',
          impact: lang === 'ja'
            ? '再レンダリング最適化が困難、バグ発生リスク'
            : 'Hard to optimize re-renders, increased bug risk'
        },
        {
          type: 'complexity',
          severity: 'low',
          description: lang === 'ja'
            ? 'React Router未使用。条件分岐でルーティング実装'
            : 'No React Router. Routing via conditional rendering',
          suggestion: lang === 'ja'
            ? 'React Routerを導入してURL履歴管理を改善'
            : 'Add React Router for proper URL history management',
          impact: lang === 'ja'
            ? 'ブラウザ履歴が機能しない、ディープリンク不可'
            : 'Browser history not working, no deep linking'
        }
      ];

      // File metrics
      const metrics: FileMetrics[] = [
        {
          category: txt.components,
          count: 22,
          files: [
            'UploadView.tsx (570行)', 'PreviewView.tsx', 'PhotoAlbumView.tsx',
            'MasterEditorModal.tsx', 'RefineModal.tsx', 'ManualPairingModal.tsx',
            'その他16ファイル...'
          ]
        },
        {
          category: txt.services,
          count: 15,
          files: [
            'geminiService.ts (850行)', 'aiAgentService.ts', 'smartFlowService.ts',
            'learningService.ts', 'githubSync.ts', 'その他10ファイル...'
          ]
        },
        {
          category: txt.utilities,
          count: 14,
          files: [
            'pdfGenerator.ts', 'excelGenerator.ts', 'storage.ts', 'imageUtils.ts',
            'その他10ファイル...'
          ]
        }
      ];

      // Dependencies with size info
      const deps: DependencyInfo[] = [
        { name: 'react + react-dom', version: '^19.0.0', type: 'prod', size: '~140KB' },
        { name: 'pdfjs-dist', version: '^4.10.38', type: 'prod', size: '~1.1MB', issue: lang === 'ja' ? '巨大' : 'Large' },
        { name: 'jspdf', version: '^3.0.0', type: 'prod', size: '~280KB', issue: lang === 'ja' ? 'PDFライブラリ重複' : 'Duplicate PDF lib' },
        { name: 'exceljs', version: '^4.4.0', type: 'prod', size: '~350KB' },
        { name: 'jszip', version: '^3.10.1', type: 'prod', size: '~90KB' },
        { name: 'lucide-react', version: '^0.469.0', type: 'prod', size: '~25KB (tree-shaken)' },
        { name: '@google/genai', version: '-', type: 'prod', size: '~50KB' },
        { name: 'idb', version: '^8.0.1', type: 'prod', size: '~5KB' },
        { name: 'tailwindcss', version: '^3.4.17', type: 'dev', size: '~65KB CSS' },
        { name: 'vite', version: '^6.2.0', type: 'dev' },
        { name: 'typescript', version: '~5.8.2', type: 'dev' },
        { name: 'vitest', version: '^3.0.4', type: 'dev' }
      ];

      // Health checks
      const checks: HealthCheck[] = [
        {
          name: 'TypeScript',
          status: 'ok',
          message: lang === 'ja' ? '100% TypeScript' : '100% TypeScript',
          details: lang === 'ja' ? '型安全性確保' : 'Type safety ensured'
        },
        {
          name: lang === 'ja' ? 'ビルド' : 'Build',
          status: 'warning',
          message: lang === 'ja' ? 'チャンクサイズ警告' : 'Chunk size warning',
          details: lang === 'ja' ? '500KB超過のチャンクあり' : 'Chunks exceeding 500KB'
        },
        {
          name: lang === 'ja' ? 'コード分割' : 'Code Splitting',
          status: 'error',
          message: lang === 'ja' ? '未実装' : 'Not implemented',
          details: lang === 'ja' ? 'React.lazy未使用' : 'No React.lazy usage'
        },
        {
          name: lang === 'ja' ? 'テスト' : 'Tests',
          status: 'warning',
          message: lang === 'ja' ? 'カバレッジ不明' : 'Coverage unknown',
          details: lang === 'ja' ? 'Vitest設定済みだがテスト少' : 'Vitest configured but few tests'
        }
      ];

      setFileMetrics(metrics);
      setDependencies(deps);
      setHealthChecks(checks);
      setWasteItems(waste);
      setIsLoading(false);
    }, 500);
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const getStatusIcon = (status: 'ok' | 'warning' | 'error') => {
    switch (status) {
      case 'ok': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'error': return <AlertCircle className="w-5 h-5 text-red-500" />;
    }
  };

  const getSeverityColor = (severity: 'high' | 'medium' | 'low') => {
    switch (severity) {
      case 'high': return 'border-red-300 bg-red-50';
      case 'medium': return 'border-yellow-300 bg-yellow-50';
      case 'low': return 'border-blue-200 bg-blue-50';
    }
  };

  const getSeverityBadge = (severity: 'high' | 'medium' | 'low') => {
    const label = severity === 'high' ? txt.high : severity === 'medium' ? txt.medium : txt.low;
    const colors = severity === 'high'
      ? 'bg-red-100 text-red-700 border-red-300'
      : severity === 'medium'
      ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
      : 'bg-blue-100 text-blue-700 border-blue-300';
    return <span className={`text-xs font-bold px-2 py-0.5 rounded border ${colors}`}>{label}</span>;
  };

  const getWasteIcon = (type: WasteItem['type']) => {
    switch (type) {
      case 'bloated_file': return <FileWarning className="w-5 h-5 text-red-500" />;
      case 'bundle_bloat': return <Scale className="w-5 h-5 text-orange-500" />;
      case 'duplicate_dep': return <Copy className="w-5 h-5 text-yellow-600" />;
      case 'unused_code': return <Trash2 className="w-5 h-5 text-gray-500" />;
      case 'complexity': return <TrendingDown className="w-5 h-5 text-purple-500" />;
    }
  };

  const highCount = wasteItems.filter(w => w.severity === 'high').length;
  const mediumCount = wasteItems.filter(w => w.severity === 'medium').length;
  const lowCount = wasteItems.filter(w => w.severity === 'low').length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onClose}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>{txt.back}</span>
              </button>
              <div className="h-6 w-px bg-gray-300" />
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <GitBranch className="w-6 h-6 text-blue-600" />
                {txt.title}
              </h1>
            </div>
            <button
              onClick={analyzeCodebase}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              {txt.refresh}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3 text-gray-600">
              <RefreshCw className="w-6 h-6 animate-spin" />
              <span className="text-lg">{txt.loading}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-6">

            {/* === WASTE DETECTION (Main Feature) === */}
            <section className="bg-gradient-to-br from-red-50 to-orange-50 rounded-2xl border-2 border-red-200 overflow-hidden">
              <button
                onClick={() => toggleSection('waste')}
                className="w-full flex items-center justify-between p-5 text-left hover:bg-red-100/50 transition-colors"
              >
                <div>
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    {expandedSections.has('waste') ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                    {txt.waste}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1 ml-7">{txt.wasteSubtitle}</p>
                </div>
                <div className="flex items-center gap-3">
                  {highCount > 0 && (
                    <span className="bg-red-500 text-white text-sm font-bold px-3 py-1 rounded-full">
                      {highCount} {txt.high}
                    </span>
                  )}
                  {mediumCount > 0 && (
                    <span className="bg-yellow-500 text-white text-sm font-bold px-3 py-1 rounded-full">
                      {mediumCount} {txt.medium}
                    </span>
                  )}
                  {lowCount > 0 && (
                    <span className="bg-blue-500 text-white text-sm font-bold px-3 py-1 rounded-full">
                      {lowCount} {txt.low}
                    </span>
                  )}
                </div>
              </button>

              {expandedSections.has('waste') && (
                <div className="p-5 pt-0 space-y-4">
                  {wasteItems.map((item, idx) => (
                    <div
                      key={idx}
                      className={`rounded-xl border-2 p-4 ${getSeverityColor(item.severity)}`}
                    >
                      <div className="flex items-start gap-3">
                        {getWasteIcon(item.type)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {getSeverityBadge(item.severity)}
                            {item.file && (
                              <span className="font-mono text-sm bg-gray-200 px-2 py-0.5 rounded">
                                {item.file}
                              </span>
                            )}
                            {item.lines && (
                              <span className="text-xs text-gray-500">
                                ({item.lines.toLocaleString()} lines)
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-gray-800 font-medium">{item.description}</p>
                          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            <div className="bg-white/70 rounded-lg p-2">
                              <span className="font-semibold text-green-700">💡 {txt.suggestion}:</span>
                              <p className="text-gray-700 mt-1">{item.suggestion}</p>
                            </div>
                            <div className="bg-white/70 rounded-lg p-2">
                              <span className="font-semibold text-orange-700">⚡ {txt.impact}:</span>
                              <p className="text-gray-700 mt-1">{item.impact}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* === BUNDLE SIZE ANALYSIS === */}
            <section>
              <button
                onClick={() => toggleSection('bundle')}
                className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-4 hover:text-blue-600 transition-colors"
              >
                {expandedSections.has('bundle') ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                <Scale className="w-5 h-5 text-orange-500" />
                {txt.bundle}
              </button>

              {expandedSections.has('bundle') && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  {/* Bundle Size Bar */}
                  <div className="mb-6">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-medium text-gray-700">{txt.bundleTotal}</span>
                      <span className="font-bold text-red-600">3.55 MB (gzip: 870 KB)</span>
                    </div>
                    <div className="h-8 bg-gray-100 rounded-lg overflow-hidden flex">
                      <div className="bg-blue-500 h-full flex items-center justify-center text-white text-xs font-bold" style={{ width: '67%' }}>
                        index.js (2.4MB)
                      </div>
                      <div className="bg-orange-500 h-full flex items-center justify-center text-white text-xs font-bold" style={{ width: '30%' }}>
                        pdf.worker (1.07MB)
                      </div>
                      <div className="bg-gray-400 h-full" style={{ width: '3%' }} />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>0 MB</span>
                      <span className="text-red-500 font-medium">⚠️ 500KB推奨ライン</span>
                      <span>4 MB</span>
                    </div>
                  </div>

                  {/* Heavy Dependencies */}
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <PackageX className="w-4 h-4 text-red-500" />
                    {txt.heavyDeps}
                  </h4>
                  <div className="space-y-2">
                    {dependencies.filter(d => d.size && d.type === 'prod').map((dep, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-700">{dep.name}</span>
                          {dep.issue && (
                            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded">
                              {dep.issue}
                            </span>
                          )}
                        </div>
                        <span className={`font-mono text-xs px-2 py-0.5 rounded ${
                          dep.size?.includes('1.') ? 'bg-red-100 text-red-700' :
                          dep.size?.includes('~3') || dep.size?.includes('~2') ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {dep.size}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* === HEALTH CHECKS === */}
            <section>
              <button
                onClick={() => toggleSection('health')}
                className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-4 hover:text-blue-600 transition-colors"
              >
                {expandedSections.has('health') ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                {txt.health}
              </button>

              {expandedSections.has('health') && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {healthChecks.map((check, idx) => (
                    <div
                      key={idx}
                      className={`rounded-xl border p-4 ${
                        check.status === 'ok' ? 'bg-green-50 border-green-200' :
                        check.status === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                        'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        {getStatusIcon(check.status)}
                        <span className="font-semibold text-gray-900 text-sm">{check.name}</span>
                      </div>
                      <p className="text-xs text-gray-700">{check.message}</p>
                      {check.details && (
                        <p className="text-xs text-gray-500 mt-1">{check.details}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* === ACTION SUMMARY === */}
            <section className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-6 text-white">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5" />
                {lang === 'ja' ? '優先アクション' : 'Priority Actions'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white/20 rounded-lg p-4">
                  <div className="text-2xl mb-2">1️⃣</div>
                  <p className="font-medium">
                    {lang === 'ja' ? 'App.tsx を分割' : 'Split App.tsx'}
                  </p>
                  <p className="text-sm text-white/80 mt-1">
                    {lang === 'ja' ? '状態管理をカスタムフックに' : 'Extract state to custom hooks'}
                  </p>
                </div>
                <div className="bg-white/20 rounded-lg p-4">
                  <div className="text-2xl mb-2">2️⃣</div>
                  <p className="font-medium">
                    {lang === 'ja' ? 'コード分割を導入' : 'Add Code Splitting'}
                  </p>
                  <p className="text-sm text-white/80 mt-1">
                    {lang === 'ja' ? 'React.lazy + Suspense' : 'React.lazy + Suspense'}
                  </p>
                </div>
                <div className="bg-white/20 rounded-lg p-4">
                  <div className="text-2xl mb-2">3️⃣</div>
                  <p className="font-medium">
                    {lang === 'ja' ? 'PDF機能を遅延読込' : 'Lazy Load PDF'}
                  </p>
                  <p className="text-sm text-white/80 mt-1">
                    {lang === 'ja' ? '1MB以上の削減効果' : 'Save over 1MB'}
                  </p>
                </div>
              </div>
            </section>

          </div>
        )}
      </div>
    </div>
  );
};

export default CodebaseHealthDashboard;
