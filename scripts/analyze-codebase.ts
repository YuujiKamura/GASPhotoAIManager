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

function printSummary(stats: CodebaseStats) {
  console.log(`\n✅ Generated: ${OUTPUT}`);
  console.log(`   Total: ${stats.totalFiles} files, ${stats.totalLines.toLocaleString()} lines`);
  console.log(`   Large files (300+): ${stats.largeFiles.length}`);

  if (stats.largeFiles.length > 0) {
    console.log('\n📊 Top large files:');
    stats.largeFiles.slice(0, 5).forEach(f => console.log(`   ${f.lines.toString().padStart(5)} lines: ${f.path}`));
  }

  console.log('\n🏥 Health checks:');
  for (const c of stats.health) {
    const icon = c.status === 'ok' ? '✅' : c.status === 'warning' ? '⚠️' : '❌';
    console.log(`   ${icon} ${c.name}: ${c.details[0]}`);
  }

  if (stats.architectureIssues.length > 0) {
    console.log('\n🏛️ Architecture issues:');
    stats.architectureIssues.slice(0, 5).forEach(i => console.log(`   ⚠️ ${i}`));
  }

  if (stats.suggestions.length > 0) {
    console.log('\n💡 Suggestions:');
    stats.suggestions.slice(0, 3).forEach(s => {
      const icon = s.priority === 'high' ? '🔴' : s.priority === 'medium' ? '🟡' : '🔵';
      console.log(`   ${icon} [${s.category}] ${s.title}`);
    });
  }

  console.log('\n🌳 Feature flow:');
  console.log(`   ${stats.featureFlow.name}`);
  for (const c of stats.featureFlow.children) console.log(`   ├─ ${c.name} (${c.children.length}機能)`);

  console.log('\n📦 Backend groups:');
  for (const g of stats.backendGroups.slice(0, 5)) console.log(`   📂 ${g.category}: ${g.modules.length}モジュール`);

  if (stats.similarModules.length > 0) {
    console.log('\n🔍 Similar modules:');
    stats.similarModules.slice(0, 3).forEach(p => console.log(`   ${Math.round(p.similarity * 100)}%: ${p.modules[0]} ⟷ ${p.modules[1]}`));
  }
}

async function main() {
  const stats = await analyzeCodebase();

  const outputDir = path.dirname(OUTPUT);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(OUTPUT, JSON.stringify(stats, null, 2));
  printSummary(stats);
}

main().catch(console.error);
