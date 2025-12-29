import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, GitBranch, CheckCircle, AlertTriangle, RefreshCw,
  ChevronDown, ChevronRight, Scale, AlertCircle, PackageX, MoreVertical, ExternalLink
} from 'lucide-react';
import codebaseStats from '../src/generated/codebase-stats.json';

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
    <button onClick={onClick} className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-4 hover:text-blue-600 transition-colors">
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

const CodebaseHealthDashboard: React.FC<CodebaseHealthDashboardProps> = ({ lang, onClose }) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['tasks']));
  const [isLoading, setIsLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [healthChecks, setHealthChecks] = useState<any[]>([]);

  const t = (ja: string, en: string) => lang === 'ja' ? ja : en;
  const toggle = (s: string) => setExpandedSections(prev => {
    const next = new Set(prev);
    next.has(s) ? next.delete(s) : next.add(s);
    return next;
  });

  useEffect(() => {
    setHealthChecks((codebaseStats as any).health || []);
    setIsLoading(false);
  }, []);

  const runAnalysis = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/analyze');
      if ((await res.json()).success) window.location.reload();
      else setIsLoading(false);
    } catch { setIsLoading(false); }
  };

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
          </div>
        )}
      </div>
    </div>
  );
};

export default CodebaseHealthDashboard;
