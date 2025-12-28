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

// ビルド時に生成された統計データ
import codebaseStats from '../src/generated/codebase-stats.json';

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
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['tasks', 'waste']));
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
      // === 動的データからWASTE検出 ===
      const waste: WasteItem[] = [];

      // 巨大ファイル (500行以上を警告)
      for (const file of codebaseStats.largeFiles) {
        if (file.lines >= 500) {
          waste.push({
            type: 'bloated_file',
            severity: file.lines >= 1000 ? 'high' : 'medium',
            file: file.path,
            lines: file.lines,
            description: lang === 'ja'
              ? `${file.path} が${file.lines.toLocaleString()}行で肥大化`
              : `${file.path} is bloated at ${file.lines.toLocaleString()} lines`,
            suggestion: lang === 'ja'
              ? 'ロジックを分離モジュール/カスタムフックに抽出'
              : 'Extract logic into separate modules/custom hooks',
            impact: lang === 'ja'
              ? 'ビルド時間増加、保守性低下'
              : 'Slower builds, reduced maintainability'
          });
        }
      }

      // バンドル肥大化 (静的 - ビルド結果から)
      waste.push({
        type: 'bundle_bloat',
        severity: 'high',
        file: 'index.js',
        description: lang === 'ja'
          ? 'メインバンドルが1.43MB (gzip: 521KB)'
          : 'Main bundle is 1.43MB (gzip: 521KB)',
        suggestion: lang === 'ja'
          ? 'manualChunksで重いモジュールを分割'
          : 'Use manualChunks to split heavy modules',
        impact: lang === 'ja'
          ? '初回ロード時間が長い'
          : 'Long initial load time'
      });

      waste.push({
        type: 'bundle_bloat',
        severity: 'medium',
        file: 'pdf.js + pdf.worker',
        description: lang === 'ja'
          ? 'PDF関連が合計1.95MB'
          : 'PDF total 1.95MB',
        suggestion: lang === 'ja'
          ? 'PDF機能を使用時のみ動的読込に変更'
          : 'Load PDF dynamically on demand',
        impact: lang === 'ja'
          ? 'PDF不要なユーザーにも負担'
          : 'Penalty for users not using PDF'
      });

      // 重複・類似機能 (静的)
      waste.push({
        type: 'duplicate_dep',
        severity: 'medium',
        description: lang === 'ja'
          ? 'pdfjs-dist と jspdf の両方を使用'
          : 'Both pdfjs-dist and jspdf used',
        suggestion: lang === 'ja'
          ? '読み込みにpdfjs、生成にjspdfと役割を明確化'
          : 'Clarify roles (read vs generate)',
        impact: lang === 'ja'
          ? 'バンドルサイズ増加'
          : 'Increased bundle size'
      });

      // 未使用フック (hooks/ の数が多いのに使われてない場合)
      if (codebaseStats.hooks.count >= 5) {
        waste.push({
          type: 'unused_code',
          severity: 'medium',
          file: 'hooks/*.ts',
          description: lang === 'ja'
            ? `カスタムフック${codebaseStats.hooks.count}個が作成済み`
            : `${codebaseStats.hooks.count} custom hooks created`,
          suggestion: lang === 'ja'
            ? 'App.tsxで活用して状態管理を整理'
            : 'Use in App.tsx to organize state',
          impact: lang === 'ja'
            ? 'フックが無駄に'
            : 'Hooks wasted'
        });
      }

      // 動的ファイルメトリクス
      const metrics: FileMetrics[] = [
        {
          category: txt.components,
          count: codebaseStats.components.count,
          files: codebaseStats.components.files.slice(0, 6)
        },
        {
          category: txt.services,
          count: codebaseStats.services.count,
          files: codebaseStats.services.files.slice(0, 6)
        },
        {
          category: txt.utilities,
          count: codebaseStats.utils.count,
          files: codebaseStats.utils.files.slice(0, 6)
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
          details: lang === 'ja' ? 'index.js 1.43MB (gzip: 521KB)' : 'index.js 1.43MB (gzip: 521KB)'
        },
        {
          name: lang === 'ja' ? 'コード分割' : 'Code Splitting',
          status: 'warning',
          message: lang === 'ja' ? '部分的に導入' : 'Partially implemented',
          details: lang === 'ja' ? 'React.lazy導入済み（8コンポーネント）' : 'React.lazy applied (8 components)'
        },
        {
          name: lang === 'ja' ? 'カスタムフック' : 'Custom Hooks',
          status: 'warning',
          message: lang === 'ja' ? '作成済み・未使用' : 'Created but unused',
          details: lang === 'ja' ? 'hooks/に5個作成済み' : '5 hooks in hooks/'
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

            {/* === TASK BOARD (タスクボード) === */}
            <section className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border-2 border-blue-200 overflow-hidden">
              <button
                onClick={() => toggleSection('tasks')}
                className="w-full flex items-center justify-between p-5 text-left hover:bg-blue-100/50 transition-colors"
              >
                <div>
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    {expandedSections.has('tasks') ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                    📋 {lang === 'ja' ? 'タスクボード' : 'Task Board'}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1 ml-7">
                    {lang === 'ja' ? 'Claudeが並列で作業可能なタスク一覧' : 'Tasks that can be worked on in parallel'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-red-500 text-white text-sm font-bold px-3 py-1 rounded-full">
                    {codebaseStats.tasks?.filter((t: any) => t.priority === 'high' && t.status === 'todo').length || 0} High
                  </span>
                  <span className="bg-yellow-500 text-white text-sm font-bold px-3 py-1 rounded-full">
                    {codebaseStats.tasks?.filter((t: any) => t.priority === 'medium' && t.status === 'todo').length || 0} Med
                  </span>
                </div>
              </button>

              {expandedSections.has('tasks') && (
                <div className="p-5 pt-0 space-y-3">
                  {codebaseStats.tasks?.filter((t: any) => t.status === 'todo').map((task: any) => (
                    <div
                      key={task.id}
                      className={`rounded-xl border-2 p-4 ${
                        task.priority === 'high' ? 'border-red-300 bg-red-50' :
                        task.priority === 'medium' ? 'border-yellow-300 bg-yellow-50' :
                        'border-blue-200 bg-blue-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded border ${
                              task.priority === 'high' ? 'bg-red-100 text-red-700 border-red-300' :
                              task.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 border-yellow-300' :
                              'bg-blue-100 text-blue-700 border-blue-300'
                            }`}>
                              {task.priority.toUpperCase()}
                            </span>
                            <span className="font-mono text-sm bg-gray-200 px-2 py-0.5 rounded">
                              {task.id}
                            </span>
                          </div>
                          <p className="mt-2 text-gray-900 font-semibold">{task.title}</p>
                          <p className="mt-1 text-sm text-gray-600">{task.description}</p>
                          {task.estimatedLines > 0 && (
                            <p className="mt-2 text-xs text-green-700">
                              💡 削減見込み: {task.estimatedLines.toLocaleString()}行
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(
                              `タスク: ${task.title}\nID: ${task.id}\n説明: ${task.description}\nファイル: ${task.file || 'なし'}`
                            );
                          }}
                          className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
                        >
                          📋 Copy
                        </button>
                      </div>
                    </div>
                  ))}
                  {(!codebaseStats.tasks || codebaseStats.tasks.filter((t: any) => t.status === 'todo').length === 0) && (
                    <p className="text-center text-gray-500 py-4">
                      {lang === 'ja' ? '🎉 すべてのタスクが完了しています！' : '🎉 All tasks completed!'}
                    </p>
                  )}
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
                      <span className="font-bold text-orange-600">3.37 MB (gzip: 841 KB)</span>
                    </div>
                    <div className="h-8 bg-gray-100 rounded-lg overflow-hidden flex">
                      <div className="bg-blue-500 h-full flex items-center justify-center text-white text-xs font-bold" style={{ width: '42%' }}>
                        index.js (1.43MB)
                      </div>
                      <div className="bg-purple-500 h-full flex items-center justify-center text-white text-xs font-bold" style={{ width: '26%' }}>
                        pdf.js (877KB)
                      </div>
                      <div className="bg-orange-500 h-full flex items-center justify-center text-white text-xs font-bold" style={{ width: '32%' }}>
                        pdf.worker (1.07MB)
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>0 MB</span>
                      <span className="text-yellow-600 font-medium">⚠️ 600KB推奨ライン</span>
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
                    {lang === 'ja' ? 'カスタムフックを適用' : 'Apply Custom Hooks'}
                  </p>
                  <p className="text-sm text-white/80 mt-1">
                    {lang === 'ja' ? 'hooks/の5個をApp.tsxで使用' : 'Use 5 hooks from hooks/ in App.tsx'}
                  </p>
                </div>
                <div className="bg-white/20 rounded-lg p-4">
                  <div className="text-2xl mb-2">✅</div>
                  <p className="font-medium text-green-300">
                    {lang === 'ja' ? 'geminiService分割完了' : 'geminiService Split Done'}
                  </p>
                  <p className="text-sm text-white/80 mt-1">
                    {lang === 'ja' ? 'services/gemini/に分離済み' : 'Extracted to services/gemini/'}
                  </p>
                </div>
                <div className="bg-white/20 rounded-lg p-4">
                  <div className="text-2xl mb-2">3️⃣</div>
                  <p className="font-medium">
                    {lang === 'ja' ? 'PDF機能を遅延読込' : 'Lazy Load PDF'}
                  </p>
                  <p className="text-sm text-white/80 mt-1">
                    {lang === 'ja' ? '約2MBの削減効果' : 'Save about 2MB'}
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
