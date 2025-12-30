/**
 * コードベース分析スクリプト
 * ビルド時に実行して src/generated/codebase-stats.json を生成
 *
 * 使用方法: npx tsx scripts/analyze-codebase.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import type { FileStats, Task, CodebaseStats } from './analyze-codebase-types.js';
import {
  analyzeModuleDependencies, analyzeComponents, detectArchitectureIssues,
  generateSuggestions, analyzeFeatureFlow, groupBackendModules, detectSimilarModules
} from './analyze-codebase-analyzers.js';
import { runHealthChecks } from './analyze-codebase-health.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'src', 'generated', 'codebase-stats.json');
const IGNORE_DIRS = ['node_modules', 'dist', '.git', 'test-output', 'public'];

function countLines(filePath: string): number {
  try { return fs.readFileSync(filePath, 'utf-8').split('\n').length; }
  catch { return 0; }
}

function walkDir(dir: string, ext: string[]): FileStats[] {
  const results: FileStats[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const item of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!IGNORE_DIRS.includes(item)) results.push(...walkDir(fullPath, ext));
    } else if (ext.some(e => item.endsWith(e))) {
      results.push({
        path: path.relative(ROOT, fullPath).replace(/\\/g, '/'),
        lines: countLines(fullPath),
        size: stat.size
      });
    }
  }
  return results;
}

function loadExistingTasks(): Map<string, Task> {
  const existing = new Map<string, Task>();
  try {
    if (fs.existsSync(OUTPUT)) {
      const data = JSON.parse(fs.readFileSync(OUTPUT, 'utf-8'));
      if (data.tasks) for (const task of data.tasks) existing.set(task.id, task);
    }
  } catch { /* ignore */ }
  return existing;
}

function generateTasks(largeFiles: FileStats[], hooks: FileStats[]): Task[] {
  const existingTasks = loadExistingTasks();
  const tasks: Task[] = [];

  // 1000行以上は分割タスク
  for (const file of largeFiles.filter(f => f.lines >= 1000)) {
    const id = `split-${file.path.replace(/[\/\.]/g, '-')}`;
    const existing = existingTasks.get(id);
    tasks.push({
      id, title: `${file.path} を分割`,
      description: `${file.lines}行 → 目標500行以下。ロジックを別モジュール/カスタムフックに抽出`,
      file: file.path,
      priority: file.lines >= 2000 ? 'high' : 'medium',
      status: existing?.status || 'todo',
      assignee: existing?.assignee,
      estimatedLines: Math.max(0, file.lines - 500)
    });
  }

  // 500-999行はリファクタ候補
  for (const file of largeFiles.filter(f => f.lines >= 500 && f.lines < 1000)) {
    const id = `refactor-${file.path.replace(/[\/\.]/g, '-')}`;
    const existing = existingTasks.get(id);
    tasks.push({
      id, title: `${file.path} をリファクタ`,
      description: `${file.lines}行。重複削除・ロジック整理で300行以下を目指す`,
      file: file.path,
      priority: 'low',
      status: existing?.status || 'todo',
      assignee: existing?.assignee,
      estimatedLines: Math.max(0, file.lines - 300)
    });
  }

  // hooks適用タスク
  if (hooks.length >= 5) {
    const id = 'apply-hooks';
    const existing = existingTasks.get(id);
    let isApplied = false;
    try {
      const appContent = fs.readFileSync(path.join(ROOT, 'App.tsx'), 'utf-8');
      isApplied = appContent.includes('usePhotosState') && appContent.includes('photosState');
    } catch { /* ignore */ }
    tasks.push({
      id, title: 'カスタムフックをApp.tsxに適用',
      description: `hooks/ の ${hooks.length} 個のフックをApp.tsxで使用して状態管理を整理`,
      file: 'App.tsx',
      priority: 'high',
      status: isApplied ? 'done' : (existing?.status || 'todo'),
      assignee: existing?.assignee,
      estimatedLines: 500
    });
  }

  // PDF遅延読込タスク
  const bundleId = 'lazy-load-pdf';
  const bundleExisting = existingTasks.get(bundleId);
  let isPdfLazy = false;
  try {
    const appContent = fs.readFileSync(path.join(ROOT, 'App.tsx'), 'utf-8');
    isPdfLazy = appContent.includes("lazy(() => import('./components/PdfLoadDialog')");
  } catch { /* ignore */ }
  tasks.push({
    id: bundleId, title: 'PDF機能を遅延読込',
    description: 'pdfGenerator.ts, PdfLoadDialog.tsx を動的importに変更',
    priority: 'medium',
    status: isPdfLazy ? 'done' : (bundleExisting?.status || 'todo'),
    assignee: bundleExisting?.assignee,
    estimatedLines: 0
  });

  return tasks;
}

async function analyzeCodebase(): Promise<CodebaseStats> {
  console.log('🔍 Analyzing codebase...');

  const allFiles = walkDir(ROOT, ['.ts', '.tsx']);
  const totalLines = allFiles.reduce((sum, f) => sum + f.lines, 0);
  const largeFiles = allFiles.filter(f => f.lines >= 300).sort((a, b) => b.lines - a.lines);

  const components = allFiles.filter(f => f.path.startsWith('components/'));
  const services = allFiles.filter(f => f.path.startsWith('services/'));
  const hooks = allFiles.filter(f => f.path.startsWith('hooks/'));
  const utils = allFiles.filter(f => f.path.startsWith('utils/'));

  const tasks = generateTasks(largeFiles, hooks);

  console.log('🏥 Running health checks...');
  const health = await runHealthChecks(ROOT);

  console.log('🔗 Analyzing dependencies...');
  const moduleDependencies = analyzeModuleDependencies(allFiles, ROOT);

  console.log('🧩 Analyzing components...');
  const componentAnalysis = analyzeComponents(allFiles, ROOT);

  console.log('🏛️ Detecting issues...');
  const architectureIssues = detectArchitectureIssues(moduleDependencies);

  console.log('💡 Generating suggestions...');
  const suggestions = generateSuggestions(moduleDependencies, componentAnalysis);

  console.log('🌳 Analyzing flow...');
  const featureFlow = analyzeFeatureFlow(moduleDependencies, ROOT);

  console.log('📦 Grouping modules...');
  const backendGroups = groupBackendModules(moduleDependencies, featureFlow, ROOT);

  console.log('🔍 Detecting similar modules...');
  const similarModules = detectSimilarModules(moduleDependencies, ROOT);

  return {
    generatedAt: new Date().toISOString(),
    totalFiles: allFiles.length,
    totalLines,
    largeFiles: largeFiles.slice(0, 10),
    components: { count: components.length, files: components.map(f => `${f.path} (${f.lines}行)`) },
    services: { count: services.length, files: services.map(f => `${f.path} (${f.lines}行)`) },
    hooks: { count: hooks.length, files: hooks.map(f => `${f.path} (${f.lines}行)`) },
    utils: { count: utils.length, files: utils.map(f => `${f.path} (${f.lines}行)`) },
    health, tasks,
    moduleDependencies: moduleDependencies.slice(0, 50),
    componentAnalysis: componentAnalysis.slice(0, 20),
    suggestions, architectureIssues, featureFlow, backendGroups, similarModules
  };
}

function generateClaudeInstructions(stats: CodebaseStats): string {
  const lines: string[] = [];

  lines.push('以下のタスクを順番に実行してください。各タスク完了後にビルド確認（npm run build）を行い、エラーがなければ次に進んでください。\n');

  // 1. 緊急: ビルドエラー・型エラー
  const criticalHealth = stats.health.filter(h => h.status === 'error');
  if (criticalHealth.length > 0) {
    lines.push('## 緊急（ビルド不可）');
    criticalHealth.forEach(h => {
      lines.push(`- **${h.name}**: ${h.details.join(', ')}`);
    });
    lines.push('');
  }

  // 2. 高優先度タスク
  const highTasks = stats.tasks.filter(t => t.priority === 'high' && t.status !== 'done');
  const highSuggestions = stats.suggestions.filter(s => s.priority === 'high');
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
  const mediumTasks = stats.tasks.filter(t => t.priority === 'medium' && t.status !== 'done');
  const mediumSuggestions = stats.suggestions.filter(s => s.priority === 'medium');
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
  const lowTasks = stats.tasks.filter(t => t.priority === 'low' && t.status !== 'done');
  const lowSuggestions = stats.suggestions.filter(s => s.priority === 'low');
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
  if (stats.architectureIssues.length > 0) {
    lines.push('## アーキテクチャ改善');
    stats.architectureIssues.slice(0, 3).forEach(issue => {
      lines.push(`- ${issue}`);
    });
    lines.push('');
  }

  // 6. 類似モジュール統合候補
  if (stats.similarModules.length > 0) {
    lines.push('## 統合検討（類似モジュール）');
    stats.similarModules.slice(0, 3).forEach(p => {
      lines.push(`- ${p.modules[0]} と ${p.modules[1]} (類似度${Math.round(p.similarity * 100)}%)`);
    });
    lines.push('');
  }

  // タスクがない場合
  if (lines.length === 1) {
    lines.push('現在、対応が必要なタスクはありません。');
  }

  return lines.join('\n');
}

function printSummary(stats: CodebaseStats) {
  console.log(`\n✅ Generated: ${OUTPUT}`);
  console.log(`   Total: ${stats.totalFiles} files, ${stats.totalLines.toLocaleString()} lines`);

  // ステータスサマリー
  const okCount = stats.health.filter(h => h.status === 'ok').length;
  const warnCount = stats.health.filter(h => h.status === 'warning').length;
  const errCount = stats.health.filter(h => h.status === 'error').length;
  console.log(`   Health: ✅${okCount} ⚠️${warnCount} ❌${errCount}`);

  const todoTasks = stats.tasks.filter(t => t.status !== 'done').length;
  console.log(`   Pending tasks: ${todoTasks}`);

  // Claude用指示文を生成・表示
  console.log('\n' + '='.repeat(60));
  console.log('📋 CLAUDE用指示文（以下をコピーしてClaudeに貼り付け）:');
  console.log('='.repeat(60) + '\n');

  const instructions = generateClaudeInstructions(stats);
  console.log(instructions);

  console.log('='.repeat(60));
}

async function main() {
  const stats = await analyzeCodebase();

  const outputDir = path.dirname(OUTPUT);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(OUTPUT, JSON.stringify(stats, null, 2));
  printSummary(stats);
}

main().catch(console.error);
