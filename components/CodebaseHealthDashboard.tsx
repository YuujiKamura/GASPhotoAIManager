import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  GitBranch,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Scale,
  Zap,
  AlertCircle,
  PackageX,
  MoreVertical,
  ExternalLink
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
  count: number;
  details: string[];
}

const CodebaseHealthDashboard: React.FC<CodebaseHealthDashboardProps> = ({ lang, onClose }) => {
  const [fileMetrics, setFileMetrics] = useState<FileMetrics[]>([]);
  const [dependencies, setDependencies] = useState<DependencyInfo[]>([]);
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['tasks']));
  const [isLoading, setIsLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);

  const txt = lang === 'ja' ? {
    title: 'コードベース健全性ダッシュボード',
    back: '戻る',
    bundle: 'バンドルサイズ分析',
    health: '健全性チェック',
    components: 'コンポーネント',
    services: 'サービス',
    utilities: 'ユーティリティ',
    refresh: '更新',
    loading: '分析中...',
    bundleTotal: 'バンドル合計',
    heavyDeps: '重い依存関係'
  } : {
    title: 'Codebase Health Dashboard',
    back: 'Back',
    bundle: 'Bundle Size Analysis',
    health: 'Health Checks',
    components: 'Components',
    services: 'Services',
    utilities: 'Utilities',
    refresh: 'Refresh',
    loading: 'Analyzing...',
    bundleTotal: 'Bundle Total',
    heavyDeps: 'Heavy Dependencies'
  };

  // 初期表示用: 静的データをロード
  const loadStaticData = () => {
    const metrics: FileMetrics[] = [
      { category: txt.components, count: codebaseStats.components.count, files: codebaseStats.components.files.slice(0, 6) },
      { category: txt.services, count: codebaseStats.services.count, files: codebaseStats.services.files.slice(0, 6) },
      { category: txt.utilities, count: codebaseStats.utils.count, files: codebaseStats.utils.files.slice(0, 6) }
    ];
    const deps: DependencyInfo[] = [
      { name: 'react + react-dom', version: '^19.0.0', type: 'prod', size: '~140KB' },
      { name: 'pdfjs-dist', version: '^4.10.38', type: 'prod', size: '~1.1MB', issue: lang === 'ja' ? '巨大' : 'Large' },
      { name: 'pdf-lib', version: '^1.17.1', type: 'prod', size: '~280KB' },
      { name: 'lucide-react', version: '^0.469.0', type: 'prod', size: '~25KB (tree-shaken)' },
      { name: '@google/genai', version: '-', type: 'prod', size: '~50KB' },
    ];
    const checks: HealthCheck[] = (codebaseStats as any).health || [];
    setFileMetrics(metrics);
    setDependencies(deps);
    setHealthChecks(checks);
    setIsLoading(false);
  };

  useEffect(() => {
    loadStaticData();
  }, []);

  // 更新ボタン: APIを呼んで分析を実行し、ページをリロード
  const runAnalysis = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/analyze');
      const data = await res.json();
      if (data.success) {
        // 分析完了後、ページをリロードして新しいデータを取得
        window.location.reload();
      } else {
        console.error('Analysis failed:', data.error);
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Failed to run analysis:', err);
      setIsLoading(false);
    }
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
              <span className="text-sm text-gray-500">
                {lang === 'ja' ? '更新: ' : 'Updated: '}
                {new Date(codebaseStats.generatedAt).toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-US')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {import.meta.env.DEV ? (
                <button
                  onClick={runAnalysis}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  {txt.refresh}
                </button>
              ) : (
                <a
                  href="https://github.com/YuujiKamura/GASPhotoAIManager/actions/workflows/deploy.yml"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  {lang === 'ja' ? '再デプロイ' : 'Redeploy'}
                </a>
              )}

              {/* Three-dot menu */}
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <MoreVertical className="w-5 h-5" />
                </button>

                {showMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowMenu(false)}
                    />
                    <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20 min-w-[200px]">
                      <a
                        href="https://github.com/YuujiKamura/GASPhotoAIManager/actions"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 transition-colors"
                        onClick={() => setShowMenu(false)}
                      >
                        <ExternalLink className="w-4 h-4" />
                        {lang === 'ja' ? 'GitHub Actions' : 'GitHub Actions'}
                      </a>
                      <a
                        href="https://github.com/YuujiKamura/GASPhotoAIManager"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 transition-colors"
                        onClick={() => setShowMenu(false)}
                      >
                        <GitBranch className="w-4 h-4" />
                        {lang === 'ja' ? 'リポジトリを開く' : 'Open Repository'}
                      </a>
                    </div>
                  </>
                )}
              </div>
            </div>
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

            {/* === UNIFIED TASK LIST === */}
            <section className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-2xl border-2 border-slate-200 overflow-hidden">
              <button
                onClick={() => toggleSection('tasks')}
                className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-100/50 transition-colors"
              >
                <div>
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    {expandedSections.has('tasks') ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                    🔧 {lang === 'ja' ? 'タスク一覧' : 'Task List'}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1 ml-7">
                    {lang === 'ja' ? '検出された課題とClaude用タスク' : 'Detected issues and Claude tasks'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {(codebaseStats.tasks?.filter((t: any) => t.priority === 'high' && t.status === 'todo').length || 0) > 0 && (
                    <span className="bg-red-500 text-white text-sm font-bold px-3 py-1 rounded-full">
                      {codebaseStats.tasks?.filter((t: any) => t.priority === 'high' && t.status === 'todo').length} High
                    </span>
                  )}
                  {(codebaseStats.tasks?.filter((t: any) => t.priority === 'medium' && t.status === 'todo').length || 0) > 0 && (
                    <span className="bg-yellow-500 text-white text-sm font-bold px-3 py-1 rounded-full">
                      {codebaseStats.tasks?.filter((t: any) => t.priority === 'medium' && t.status === 'todo').length} Med
                    </span>
                  )}
                  {(codebaseStats.tasks?.filter((t: any) => t.priority === 'low' && t.status === 'todo').length || 0) > 0 && (
                    <span className="bg-blue-500 text-white text-sm font-bold px-3 py-1 rounded-full">
                      {codebaseStats.tasks?.filter((t: any) => t.priority === 'low' && t.status === 'todo').length} Low
                    </span>
                  )}
                </div>
              </button>

              {expandedSections.has('tasks') && (
                <div className="p-5 pt-0 space-y-3">
                  {codebaseStats.tasks?.filter((t: any) => t.status === 'todo')
                    .sort((a: any, b: any) => {
                      const order = { high: 0, medium: 1, low: 2 };
                      return (order[a.priority as keyof typeof order] ?? 2) - (order[b.priority as keyof typeof order] ?? 2);
                    })
                    .map((task: any) => (
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
                            const prompt = `# タスク: ${task.title}

## 概要
${task.description}

## 対象ファイル
${task.file || '複数ファイル'}

## 作業内容
${task.priority === 'high' ?
`1. まず対象ファイルを読んで現状を把握
2. 分離できるロジックを特定（カスタムフック、ユーティリティ、サブコンポーネント等）
3. 新規ファイルを作成して移行
4. 元ファイルからimportに置き換え
5. ビルド確認してコミット` :
task.id.startsWith('refactor-') ?
`1. 対象ファイルを読んで冗長な部分を特定
2. 重複コードの共通化
3. 不要なコードの削除
4. ビルド確認してコミット` :
`1. 対象ファイルを確認
2. 必要な変更を実施
3. ビルド確認してコミット`}

## 完了条件
${task.estimatedLines ? `- 目標: ${task.estimatedLines}行以上削減` : '- 機能が正常動作すること'}
- npm run build が通ること
- 完了したらダッシュボードのタスク状態を更新

## タスクID
${task.id}`;
                            navigator.clipboard.writeText(prompt);
                          }}
                          className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 whitespace-nowrap"
                        >
                          📋 指示をコピー
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
                {healthChecks.length > 0 && (
                  <span className="ml-2 flex gap-1">
                    {healthChecks.filter(c => c.status === 'error').length > 0 && (
                      <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                        {healthChecks.filter(c => c.status === 'error').length}
                      </span>
                    )}
                    {healthChecks.filter(c => c.status === 'warning').length > 0 && (
                      <span className="bg-yellow-500 text-white text-xs px-2 py-0.5 rounded-full">
                        {healthChecks.filter(c => c.status === 'warning').length}
                      </span>
                    )}
                  </span>
                )}
              </button>

              {expandedSections.has('health') && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {healthChecks.map((check, idx) => (
                    <div
                      key={idx}
                      className={`rounded-xl border p-4 ${
                        check.status === 'ok' ? 'bg-green-50 border-green-200' :
                        check.status === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                        'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(check.status)}
                          <span className="font-semibold text-gray-900 text-sm">{check.name}</span>
                        </div>
                        {check.count > 0 && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                            check.status === 'error' ? 'bg-red-200 text-red-700' :
                            check.status === 'warning' ? 'bg-yellow-200 text-yellow-700' :
                            'bg-gray-200 text-gray-700'
                          }`}>
                            {check.count}
                          </span>
                        )}
                      </div>
                      {check.details.map((detail, i) => (
                        <p key={i} className="text-xs text-gray-600 truncate" title={detail}>
                          {detail}
                        </p>
                      ))}
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
