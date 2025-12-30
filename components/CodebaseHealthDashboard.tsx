import React, { useState } from 'react';
import {
  ArrowLeft, GitBranch, RefreshCw, ChevronDown, ChevronRight,
  Scale, PackageX, MoreVertical, ExternalLink, Network, Layers, Zap, FileCode, AlertTriangle,
  TreePine, Folder, GitCompare
} from 'lucide-react';
import { useCodebaseHealth } from '../hooks/useCodebaseHealth';
import {
  Status, STATUS_STYLES, DEPS, generateHealthFixPrompt
} from './CodebaseHealthDashboard/constants';
import {
  StatusIcon, SectionToggle, TaskCard, SuggestionCard, ComponentAnalysisCard, DependencyGraph,
  FeatureFlowTree, BackendModuleGroupCard, SimilarModuleCard
} from './CodebaseHealthDashboard/components';

interface CodebaseHealthDashboardProps {
  lang: 'en' | 'ja';
  onClose: () => void;
}

const CodebaseHealthDashboard: React.FC<CodebaseHealthDashboardProps> = ({ lang, onClose }) => {
  const [showMenu, setShowMenu] = useState(false);
  const {
    expandedSections, isLoading, healthChecks, tasks, taskCounts, toggle, runAnalysis, stats
  } = useCodebaseHealth();

  const t = (ja: string, en: string) => lang === 'ja' ? ja : en;

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
              {t('更新: ', 'Updated: ')}{new Date(stats.generatedAt).toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-US')}
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
              <button onClick={() => toggle('tasks')} className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-100/50">
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
                          <button onClick={() => navigator.clipboard.writeText(fixPrompt)} className="mt-2 text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700">
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
            {stats.suggestions && stats.suggestions.length > 0 && (
              <section className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl border-2 border-purple-200 overflow-hidden">
                <button onClick={() => toggle('suggestions')} className="w-full flex items-center justify-between p-5 text-left hover:bg-purple-100/50">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                      {expandedSections.has('suggestions') ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                      💡 {t('改善提案', 'Improvement Suggestions')}
                    </h2>
                    <p className="text-sm text-gray-600 mt-1 ml-7">{t('アーキテクチャ・パフォーマンス・保守性の改善提案', 'Architecture, performance, and maintainability suggestions')}</p>
                  </div>
                  <span className="bg-purple-500 text-white text-sm font-bold px-3 py-1 rounded-full">{stats.suggestions.length}</span>
                </button>
                {expandedSections.has('suggestions') && (
                  <div className="p-5 pt-0 space-y-3">
                    {stats.suggestions.map((suggestion: any, i: number) => <SuggestionCard key={i} suggestion={suggestion} lang={lang} />)}
                  </div>
                )}
              </section>
            )}

            {/* モジュール依存関係 */}
            {stats.moduleDependencies && stats.moduleDependencies.length > 0 && (
              <section>
                <SectionToggle expanded={expandedSections.has('dependencies')} onClick={() => toggle('dependencies')}>
                  <Network className="w-5 h-5 text-purple-500" />{t('モジュール依存関係', 'Module Dependencies')}
                </SectionToggle>
                {expandedSections.has('dependencies') && <DependencyGraph modules={stats.moduleDependencies} />}
              </section>
            )}

            {/* コンポーネント分析 */}
            {stats.componentAnalysis && stats.componentAnalysis.length > 0 && (
              <section>
                <SectionToggle expanded={expandedSections.has('componentAnalysis')} onClick={() => toggle('componentAnalysis')}>
                  <FileCode className="w-5 h-5 text-blue-500" />{t('コンポーネント分析', 'Component Analysis')}
                  {stats.componentAnalysis.filter((c: any) => c.issues?.length > 0).length > 0 && (
                    <span className="ml-2 bg-yellow-500 text-white text-xs px-2 py-0.5 rounded-full">
                      {stats.componentAnalysis.filter((c: any) => c.issues?.length > 0).length}
                    </span>
                  )}
                </SectionToggle>
                {expandedSections.has('componentAnalysis') && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <div className="space-y-3">
                      {stats.componentAnalysis.slice(0, 10).map((comp: any, i: number) => <ComponentAnalysisCard key={i} component={comp} />)}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* アーキテクチャ問題 */}
            {stats.architectureIssues && stats.architectureIssues.length > 0 && (
              <section>
                <SectionToggle expanded={expandedSections.has('archIssues')} onClick={() => toggle('archIssues')}>
                  <Layers className="w-5 h-5 text-red-500" />{t('アーキテクチャ問題', 'Architecture Issues')}
                  <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{stats.architectureIssues.length}</span>
                </SectionToggle>
                {expandedSections.has('archIssues') && (
                  <div className="bg-white rounded-xl border border-red-200 p-5">
                    <div className="space-y-2">
                      {stats.architectureIssues.map((issue: string, i: number) => (
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
            {stats.featureFlow && (
              <section className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border-2 border-emerald-200 overflow-hidden">
                <button onClick={() => toggle('featureFlow')} className="w-full flex items-center justify-between p-5 text-left hover:bg-emerald-100/50">
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
                      <FeatureFlowTree node={stats.featureFlow} level={0} />
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* 裏方モジュールグループ */}
            {stats.backendGroups && stats.backendGroups.length > 0 && (
              <section className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border-2 border-amber-200 overflow-hidden">
                <button onClick={() => toggle('backendGroups')} className="w-full flex items-center justify-between p-5 text-left hover:bg-amber-100/50">
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
                      {stats.backendGroups.length} {t('カテゴリ', 'categories')}
                    </span>
                  </div>
                </button>
                {expandedSections.has('backendGroups') && (
                  <div className="p-5 pt-0 space-y-3">
                    {stats.backendGroups.map((group: any, i: number) => (
                      <BackendModuleGroupCard key={i} group={group} />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* 類似モジュール検出 */}
            {stats.similarModules && stats.similarModules.length > 0 && (
              <section className="bg-gradient-to-br from-rose-50 to-pink-50 rounded-2xl border-2 border-rose-200 overflow-hidden">
                <button onClick={() => toggle('similarModules')} className="w-full flex items-center justify-between p-5 text-left hover:bg-rose-100/50">
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
                      {stats.similarModules.length} {t('ペア', 'pairs')}
                    </span>
                  </div>
                </button>
                {expandedSections.has('similarModules') && (
                  <div className="p-5 pt-0 space-y-3">
                    {stats.similarModules.map((pair: any, i: number) => (
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
