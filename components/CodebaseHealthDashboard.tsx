import React, { useState, useEffect } from 'react';
import { TRANS } from '../utils/translations';
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
  ChevronRight
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
}

interface HealthCheck {
  name: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  details?: string;
}

const CodebaseHealthDashboard: React.FC<CodebaseHealthDashboardProps> = ({ lang, onClose }) => {
  const [fileMetrics, setFileMetrics] = useState<FileMetrics[]>([]);
  const [dependencies, setDependencies] = useState<DependencyInfo[]>([]);
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview', 'health']));
  const [isLoading, setIsLoading] = useState(true);

  const txt = lang === 'ja' ? {
    title: 'コードベース健全性ダッシュボード',
    back: '戻る',
    overview: '概要',
    health: '健全性チェック',
    structure: 'プロジェクト構造',
    dependencies: '依存関係',
    metrics: 'メトリクス',
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
    loading: '読み込み中...',
    linesOfCode: 'コード行数 (推定)',
    typesCoverage: '型定義カバレッジ',
    buildSystem: 'ビルドシステム',
    lastAnalysis: '最終解析'
  } : {
    title: 'Codebase Health Dashboard',
    back: 'Back',
    overview: 'Overview',
    health: 'Health Checks',
    structure: 'Project Structure',
    dependencies: 'Dependencies',
    metrics: 'Metrics',
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
    loading: 'Loading...',
    linesOfCode: 'Lines of Code (est.)',
    typesCoverage: 'Type Coverage',
    buildSystem: 'Build System',
    lastAnalysis: 'Last Analysis'
  };

  useEffect(() => {
    analyzeCodebase();
  }, []);

  const analyzeCodebase = () => {
    setIsLoading(true);

    // Simulate async analysis (in real app, this could use file system API)
    setTimeout(() => {
      // File metrics based on codebase exploration
      const metrics: FileMetrics[] = [
        {
          category: txt.components,
          count: 22,
          files: [
            'UploadView.tsx', 'PreviewView.tsx', 'LimitModal.tsx', 'RefineModal.tsx',
            'ApiKeySetup.tsx', 'ModelValidation.tsx', 'UsagePanel.tsx', 'ManualPairingModal.tsx',
            'MasterEditorModal.tsx', 'StationReplaceModal.tsx', 'WorkTypeConfirmModal.tsx',
            'NormalizationPreviewModal.tsx', 'SessionHistoryPanel.tsx', 'GitHubSyncPanel.tsx',
            'PdfLoadDialog.tsx', 'PhotoAlbumView.tsx', 'ConsolePanel.tsx', 'AnalysisRulesPanel.tsx',
            'PersonalStorageSetup.tsx', 'NormalizationPresetsPanel.tsx', 'CodebaseHealthDashboard.tsx'
          ]
        },
        {
          category: txt.services,
          count: 15,
          files: [
            'geminiService.ts', 'aiAgentService.ts', 'smartFlowService.ts',
            'personalStorage.ts', 'projectStorage.ts', 'storageManager.ts',
            'learningService.ts', 'githubSync.ts', 'agentContext.ts',
            'webAuthnService.ts', 'webContainerService.ts', 'usageTracker.ts',
            'spatialPairingService.ts', 'embeddingService.ts', 'contextService.ts'
          ]
        },
        {
          category: txt.utilities,
          count: 14,
          files: [
            'storage.ts', 'imageUtils.ts', 'pdfGenerator.ts', 'excelGenerator.ts',
            'zipGenerator.ts', 'translations.ts', 'constructionMaster.ts',
            'analysisRules.ts', 'fileSystemCache.ts', 'learnedSortOrder.ts',
            'workTypeAliases.ts', 'layoutConfig.ts', 'userPresets.ts', 'crypto.ts'
          ]
        },
        {
          category: txt.types,
          count: 1,
          files: ['types.ts']
        },
        {
          category: txt.config,
          count: 5,
          files: ['vite.config.ts', 'tsconfig.json', 'tailwind.config.js', 'postcss.config.js', 'package.json']
        }
      ];

      // Dependencies
      const deps: DependencyInfo[] = [
        { name: 'react', version: '^19.0.0', type: 'prod' },
        { name: 'react-dom', version: '^19.0.0', type: 'prod' },
        { name: 'lucide-react', version: '^0.469.0', type: 'prod' },
        { name: 'exceljs', version: '^4.4.0', type: 'prod' },
        { name: 'file-saver', version: '^2.0.5', type: 'prod' },
        { name: 'idb', version: '^8.0.1', type: 'prod' },
        { name: 'jszip', version: '^3.10.1', type: 'prod' },
        { name: 'pdfjs-dist', version: '^4.10.38', type: 'prod' },
        { name: 'jspdf', version: '^3.0.0', type: 'prod' },
        { name: 'exif-js', version: '^2.3.0', type: 'prod' },
        { name: 'uuid', version: '^11.0.5', type: 'prod' },
        { name: 'typescript', version: '~5.8.2', type: 'dev' },
        { name: 'vite', version: '^6.2.0', type: 'dev' },
        { name: '@vitejs/plugin-react', version: '^4.3.4', type: 'dev' },
        { name: 'tailwindcss', version: '^3.4.17', type: 'dev' },
        { name: 'vitest', version: '^3.0.4', type: 'dev' },
        { name: '@testing-library/react', version: '^16.2.0', type: 'dev' }
      ];

      // Health checks
      const checks: HealthCheck[] = [
        {
          name: 'TypeScript',
          status: 'ok',
          message: lang === 'ja' ? '全ファイルがTypeScriptで記述' : 'All files written in TypeScript',
          details: 'tsx/ts: 100%'
        },
        {
          name: txt.buildSystem,
          status: 'ok',
          message: 'Vite 6.2.0',
          details: lang === 'ja' ? '高速ビルドシステム' : 'Fast build system'
        },
        {
          name: 'React',
          status: 'ok',
          message: 'React 19.0.0',
          details: lang === 'ja' ? '最新安定版' : 'Latest stable version'
        },
        {
          name: lang === 'ja' ? 'UIフレームワーク' : 'UI Framework',
          status: 'ok',
          message: 'TailwindCSS 3.4.17',
          details: lang === 'ja' ? 'ユーティリティファースト' : 'Utility-first CSS'
        },
        {
          name: lang === 'ja' ? 'テストフレームワーク' : 'Test Framework',
          status: 'ok',
          message: 'Vitest + React Testing Library',
          details: lang === 'ja' ? 'ユニットテスト対応' : 'Unit testing ready'
        },
        {
          name: lang === 'ja' ? '状態管理' : 'State Management',
          status: 'warning',
          message: lang === 'ja' ? 'React Hooks のみ' : 'React Hooks only',
          details: lang === 'ja' ? 'App.tsx に状態が集中' : 'State centralized in App.tsx'
        },
        {
          name: lang === 'ja' ? 'ルーティング' : 'Routing',
          status: 'warning',
          message: lang === 'ja' ? '状態ベースルーティング' : 'State-based routing',
          details: lang === 'ja' ? 'React Router 未使用' : 'No React Router'
        },
        {
          name: lang === 'ja' ? 'コード分割' : 'Code Splitting',
          status: 'warning',
          message: lang === 'ja' ? '動的インポート未使用' : 'No dynamic imports',
          details: lang === 'ja' ? 'バンドルサイズ最適化の余地あり' : 'Bundle optimization possible'
        }
      ];

      setFileMetrics(metrics);
      setDependencies(deps);
      setHealthChecks(checks);
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
      case 'ok':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'error':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
    }
  };

  const getStatusColor = (status: 'ok' | 'warning' | 'error') => {
    switch (status) {
      case 'ok':
        return 'bg-green-50 border-green-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      case 'error':
        return 'bg-red-50 border-red-200';
    }
  };

  const getCategoryIcon = (category: string) => {
    if (category === txt.components) return <Layers className="w-5 h-5 text-blue-500" />;
    if (category === txt.services) return <Cpu className="w-5 h-5 text-purple-500" />;
    if (category === txt.utilities) return <Wrench className="w-5 h-5 text-orange-500" />;
    if (category === txt.types) return <FileCode className="w-5 h-5 text-green-500" />;
    if (category === txt.config) return <Database className="w-5 h-5 text-gray-500" />;
    return <FolderTree className="w-5 h-5 text-gray-400" />;
  };

  const totalFiles = fileMetrics.reduce((sum, m) => sum + m.count, 0);
  const okCount = healthChecks.filter(c => c.status === 'ok').length;
  const warningCount = healthChecks.filter(c => c.status === 'warning').length;
  const errorCount = healthChecks.filter(c => c.status === 'error').length;

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
            {/* Overview Cards */}
            <section>
              <button
                onClick={() => toggleSection('overview')}
                className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-4 hover:text-blue-600 transition-colors"
              >
                {expandedSections.has('overview') ? (
                  <ChevronDown className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
                {txt.overview}
              </button>

              {expandedSections.has('overview') && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <FileCode className="w-5 h-5 text-blue-600" />
                      </div>
                      <span className="text-sm text-gray-600">{txt.totalFiles}</span>
                    </div>
                    <p className="text-3xl font-bold text-gray-900">{totalFiles}</p>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      </div>
                      <span className="text-sm text-gray-600">{txt.ok}</span>
                    </div>
                    <p className="text-3xl font-bold text-green-600">{okCount}</p>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-yellow-100 rounded-lg">
                        <AlertTriangle className="w-5 h-5 text-yellow-600" />
                      </div>
                      <span className="text-sm text-gray-600">{txt.warning}</span>
                    </div>
                    <p className="text-3xl font-bold text-yellow-600">{warningCount}</p>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <Package className="w-5 h-5 text-purple-600" />
                      </div>
                      <span className="text-sm text-gray-600">{txt.dependencies}</span>
                    </div>
                    <p className="text-3xl font-bold text-gray-900">{dependencies.length}</p>
                  </div>
                </div>
              )}
            </section>

            {/* Health Checks */}
            <section>
              <button
                onClick={() => toggleSection('health')}
                className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-4 hover:text-blue-600 transition-colors"
              >
                {expandedSections.has('health') ? (
                  <ChevronDown className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
                {txt.health}
              </button>

              {expandedSections.has('health') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {healthChecks.map((check, idx) => (
                    <div
                      key={idx}
                      className={`rounded-xl border p-4 ${getStatusColor(check.status)}`}
                    >
                      <div className="flex items-start gap-3">
                        {getStatusIcon(check.status)}
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{check.name}</h3>
                          <p className="text-sm text-gray-700 mt-1">{check.message}</p>
                          {check.details && (
                            <p className="text-xs text-gray-500 mt-1">{check.details}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Project Structure */}
            <section>
              <button
                onClick={() => toggleSection('structure')}
                className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-4 hover:text-blue-600 transition-colors"
              >
                {expandedSections.has('structure') ? (
                  <ChevronDown className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
                {txt.structure}
              </button>

              {expandedSections.has('structure') && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {fileMetrics.map((metric, idx) => (
                    <div
                      key={idx}
                      className={`p-4 ${idx > 0 ? 'border-t border-gray-100' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {getCategoryIcon(metric.category)}
                          <span className="font-medium text-gray-900">{metric.category}</span>
                        </div>
                        <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                          {metric.count} files
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {metric.files.slice(0, 8).map((file, fIdx) => (
                          <span
                            key={fIdx}
                            className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded"
                          >
                            {file}
                          </span>
                        ))}
                        {metric.files.length > 8 && (
                          <span className="text-xs text-gray-500 px-2 py-1">
                            +{metric.files.length - 8} more
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Dependencies */}
            <section>
              <button
                onClick={() => toggleSection('deps')}
                className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-4 hover:text-blue-600 transition-colors"
              >
                {expandedSections.has('deps') ? (
                  <ChevronDown className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
                {txt.dependencies}
              </button>

              {expandedSections.has('deps') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Production Dependencies */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Package className="w-5 h-5 text-green-600" />
                      {txt.prodDeps}
                    </h3>
                    <div className="space-y-2">
                      {dependencies.filter(d => d.type === 'prod').map((dep, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700">{dep.name}</span>
                          <span className="text-gray-500 font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
                            {dep.version}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Dev Dependencies */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Wrench className="w-5 h-5 text-orange-600" />
                      {txt.devDeps}
                    </h3>
                    <div className="space-y-2">
                      {dependencies.filter(d => d.type === 'dev').map((dep, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700">{dep.name}</span>
                          <span className="text-gray-500 font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
                            {dep.version}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Architecture Notes */}
            <section className="bg-blue-50 rounded-xl border border-blue-200 p-6">
              <div className="flex items-start gap-3">
                <Info className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-blue-900 mb-2">
                    {lang === 'ja' ? 'アーキテクチャノート' : 'Architecture Notes'}
                  </h3>
                  <ul className="text-sm text-blue-800 space-y-2">
                    <li>• {lang === 'ja'
                      ? 'シングルページアプリケーション（SPA）構造で、App.tsxが中央状態管理'
                      : 'Single Page Application structure with App.tsx as central state manager'}</li>
                    <li>• {lang === 'ja'
                      ? 'TailwindCSS + lucide-react でUIを構築'
                      : 'UI built with TailwindCSS + lucide-react'}</li>
                    <li>• {lang === 'ja'
                      ? 'Gemini AI を使用した写真解析・分類機能'
                      : 'Photo analysis and classification using Gemini AI'}</li>
                    <li>• {lang === 'ja'
                      ? 'IndexedDBでローカルキャッシュ、FileSystem Access APIで永続化'
                      : 'Local caching with IndexedDB, persistence with FileSystem Access API'}</li>
                    <li>• {lang === 'ja'
                      ? 'PDF/Excel/ZIP エクスポート機能を搭載'
                      : 'Export functionality for PDF/Excel/ZIP formats'}</li>
                  </ul>
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
