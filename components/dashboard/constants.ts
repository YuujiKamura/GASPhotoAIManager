export type Priority = 'high' | 'medium' | 'low';
export type Status = 'ok' | 'warning' | 'error';

export const PRIORITY_STYLES: Record<Priority, { border: string; bg: string; badge: string }> = {
  high: { border: 'border-red-300', bg: 'bg-red-50', badge: 'bg-red-100 text-red-700 border-red-300' },
  medium: { border: 'border-yellow-300', bg: 'bg-yellow-50', badge: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  low: { border: 'border-blue-200', bg: 'bg-blue-50', badge: 'bg-blue-100 text-blue-700 border-blue-300' },
};

export const STATUS_STYLES: Record<Status, { bg: string; border: string; countBg: string }> = {
  ok: { bg: 'bg-green-50', border: 'border-green-200', countBg: 'bg-gray-200 text-gray-700' },
  warning: { bg: 'bg-yellow-50', border: 'border-yellow-200', countBg: 'bg-yellow-200 text-yellow-700' },
  error: { bg: 'bg-red-50', border: 'border-red-200', countBg: 'bg-red-200 text-red-700' },
};

export const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  architecture: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  performance: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  maintainability: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  ui: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
};

export const EFFORT_LABELS: Record<string, { label: string; color: string }> = {
  small: { label: '小', color: 'bg-green-100 text-green-700' },
  medium: { label: '中', color: 'bg-yellow-100 text-yellow-700' },
  large: { label: '大', color: 'bg-red-100 text-red-700' },
};

export const DEPS = [
  { name: 'react + react-dom', size: '~140KB' },
  { name: 'pdfjs-dist', size: '~1.1MB', issue: true },
  { name: 'pdf-lib', size: '~280KB' },
  { name: 'lucide-react', size: '~25KB' },
  { name: '@google/genai', size: '~50KB' },
];

export const HEALTH_FIX_PROMPTS: Record<string, string> = {
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
- \`npm run build\` が成功`,
};

export const generateTaskPrompt = (task: { title: string; description: string; file?: string; priority: string; estimatedLines?: number; id: string }) => `# タスク: ${task.title}

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

## タスクID
${task.id}`;

export const generateHealthFixPrompt = (check: { name: string; details: string[] }) => {
  const base = HEALTH_FIX_PROMPTS[check.name];
  if (!base) return null;
  return `${base}\n\n## 現在のエラー詳細\n${check.details.join('\n')}`;
};

interface HealthCheck { name: string; status: string; details: string[]; }
interface Task { id: string; title: string; description: string; file?: string; priority: Priority; status: string; estimatedLines?: number; }
interface Suggestion { title: string; description: string; category: string; priority: Priority; affectedFiles?: string[]; }
interface SimilarModule { modules: string[]; similarity: number; }

export const generateClaudeInstructions = (
  healthChecks: HealthCheck[],
  tasks: Task[],
  suggestions: Suggestion[],
  architectureIssues: string[],
  similarModules: SimilarModule[]
): string => {
  const lines: string[] = [];

  lines.push('以下のタスクを順番に実行してください。各タスク完了後にビルド確認（npm run build）を行い、エラーがなければ次に進んでください。');
  lines.push('');

  // 1. 緊急: ビルドエラー・型エラー
  const criticalHealth = healthChecks.filter(h => h.status === 'error');
  if (criticalHealth.length > 0) {
    lines.push('## 緊急（ビルド不可）');
    criticalHealth.forEach(h => {
      lines.push(`- **${h.name}**: ${h.details.join(', ')}`);
    });
    lines.push('');
  }

  // 2. 高優先度タスク
  const highTasks = tasks.filter(t => t.priority === 'high' && t.status !== 'done');
  const highSuggestions = suggestions.filter(s => s.priority === 'high');
  if (highTasks.length > 0 || highSuggestions.length > 0) {
    lines.push('## 高優先度');
    highTasks.forEach(t => {
      lines.push(`- **${t.title}**: ${t.description}`);
    });
    highSuggestions.forEach(s => {
      lines.push(`- **[${s.category}] ${s.title}**: ${s.description}`);
      if (s.affectedFiles) lines.push(`  - 対象: ${s.affectedFiles.slice(0, 3).join(', ')}`);
    });
    lines.push('');
  }

  // 3. 中優先度タスク
  const mediumTasks = tasks.filter(t => t.priority === 'medium' && t.status !== 'done');
  const mediumSuggestions = suggestions.filter(s => s.priority === 'medium');
  if (mediumTasks.length > 0 || mediumSuggestions.length > 0) {
    lines.push('## 中優先度');
    mediumTasks.forEach(t => {
      lines.push(`- **${t.title}**: ${t.description}`);
    });
    mediumSuggestions.forEach(s => {
      lines.push(`- **[${s.category}] ${s.title}**: ${s.description}`);
    });
    lines.push('');
  }

  // 4. 低優先度タスク
  const lowTasks = tasks.filter(t => t.priority === 'low' && t.status !== 'done');
  const lowSuggestions = suggestions.filter(s => s.priority === 'low');
  if (lowTasks.length > 0 || lowSuggestions.length > 0) {
    lines.push('## 低優先度');
    lowTasks.slice(0, 5).forEach(t => {
      lines.push(`- **${t.title}**: ${t.description}`);
    });
    lowSuggestions.forEach(s => {
      lines.push(`- **[${s.category}] ${s.title}**: ${s.description}`);
    });
    lines.push('');
  }

  // 5. アーキテクチャ問題
  if (architectureIssues.length > 0) {
    lines.push('## アーキテクチャ改善');
    architectureIssues.slice(0, 3).forEach(issue => {
      lines.push(`- ${issue}`);
    });
    lines.push('');
  }

  // 6. 類似モジュール統合候補
  if (similarModules.length > 0) {
    lines.push('## 統合検討（類似モジュール）');
    similarModules.slice(0, 3).forEach(p => {
      lines.push(`- ${p.modules[0]} と ${p.modules[1]} (類似度${Math.round(p.similarity * 100)}%)`);
    });
    lines.push('');
  }

  // タスクがない場合
  if (lines.length <= 2) {
    lines.push('現在、対応が必要なタスクはありません。');
  }

  return lines.join('\n');
};
