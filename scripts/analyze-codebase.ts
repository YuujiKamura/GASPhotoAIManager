/**
 * コードベース分析スクリプト
 * ビルド時に実行して src/generated/codebase-stats.json を生成
 *
 * 使用方法: npx tsx scripts/analyze-codebase.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FileStats {
  path: string;
  lines: number;
  size: number;
}

interface Task {
  id: string;
  title: string;
  description: string;
  file?: string;
  priority: 'high' | 'medium' | 'low';
  status: 'todo' | 'in_progress' | 'done';
  assignee?: string;  // Claude instance ID or empty
  estimatedLines?: number;  // 削減見込み行数
}

interface HealthCheck {
  name: string;
  status: 'ok' | 'warning' | 'error';
  count: number;
  details: string[];
}

interface CodebaseStats {
  generatedAt: string;
  totalFiles: number;
  totalLines: number;
  largeFiles: FileStats[];  // 300行以上
  components: { count: number; files: string[] };
  services: { count: number; files: string[] };
  hooks: { count: number; files: string[] };
  utils: { count: number; files: string[] };
  tasks: Task[];  // 自動生成タスク
  health: HealthCheck[];  // 健全性チェック結果
}

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'src', 'generated', 'codebase-stats.json');

// 無視するディレクトリ
const IGNORE_DIRS = ['node_modules', 'dist', '.git', 'test-output', 'public'];

function countLines(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

function walkDir(dir: string, ext: string[]): FileStats[] {
  const results: FileStats[] = [];

  if (!fs.existsSync(dir)) return results;

  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!IGNORE_DIRS.includes(item)) {
        results.push(...walkDir(fullPath, ext));
      }
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

// 健全性チェックを並列実行
async function runHealthChecks(): Promise<HealthCheck[]> {
  const checkFns = [
    // 1. npm audit
    async (): Promise<HealthCheck> => {
      try {
        execSync('npm audit --json', { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' });
        return { name: 'npm audit', status: 'ok', count: 0, details: ['脆弱性なし'] };
      } catch (e: any) {
        try {
          const result = JSON.parse(e.stdout || '{}');
          const vulns = result.metadata?.vulnerabilities || {};
          const total = (vulns.high || 0) + (vulns.critical || 0) + (vulns.moderate || 0) + (vulns.low || 0);
          const details: string[] = [];
          if (vulns.critical) details.push(`critical: ${vulns.critical}`);
          if (vulns.high) details.push(`high: ${vulns.high}`);
          return { name: 'npm audit', status: vulns.critical || vulns.high ? 'error' : total > 0 ? 'warning' : 'ok', count: total, details: details.length ? details : ['脆弱性なし'] };
        } catch { return { name: 'npm audit', status: 'warning', count: 0, details: ['解析失敗'] }; }
      }
    },
    // 2. depcheck
    async (): Promise<HealthCheck> => {
      try {
        const result = execSync('npx depcheck --json', { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' });
        const data = JSON.parse(result);
        const unused = Object.keys(data.dependencies || {});
        return { name: 'depcheck', status: unused.length > 3 ? 'warning' : 'ok', count: unused.length, details: unused.length ? [`未使用: ${unused.slice(0, 5).join(', ')}`] : ['問題なし'] };
      } catch { return { name: 'depcheck', status: 'warning', count: 0, details: ['解析失敗'] }; }
    },
    // 3. TypeScript
    async (): Promise<HealthCheck> => {
      try {
        execSync('npx tsc --noEmit', { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' });
        return { name: 'TypeScript', status: 'ok', count: 0, details: ['型エラーなし'] };
      } catch (e: any) {
        const output = e.stdout || e.stderr || '';
        const errorCount = (output.match(/error TS\d+/g) || []).length;
        const lines = output.split('\n').filter((l: string) => l.includes('error TS')).slice(0, 5);
        return { name: 'TypeScript', status: errorCount > 0 ? 'error' : 'ok', count: errorCount, details: lines.length ? lines.map((l: string) => l.slice(0, 80)) : ['型エラーなし'] };
      }
    },
    // 4. ESLint
    async (): Promise<HealthCheck> => {
      try {
        execSync('npx eslint . --ext .ts,.tsx --format json --max-warnings 0', { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' });
        return { name: 'ESLint', status: 'ok', count: 0, details: ['errors: 0, warnings: 0'] };
      } catch (e: any) {
        try {
          const results = JSON.parse(e.stdout || '[]');
          let errorCount = 0, warningCount = 0;
          for (const file of results) { errorCount += file.errorCount || 0; warningCount += file.warningCount || 0; }
          return { name: 'ESLint', status: errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'ok', count: errorCount + warningCount, details: [`errors: ${errorCount}, warnings: ${warningCount}`] };
        } catch { return { name: 'ESLint', status: 'ok', count: 0, details: ['設定なし or 問題なし'] }; }
      }
    },
    // 5. jscpd
    async (): Promise<HealthCheck> => {
      try {
        execSync('npx jscpd --min-tokens 50 --reporters json --output .jscpd --silent components services hooks utils', { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' });
        const reportPath = path.join(ROOT, '.jscpd', 'jscpd-report.json');
        if (fs.existsSync(reportPath)) {
          const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
          const clones = report.duplicates?.length || 0;
          const percentage = report.statistics?.total?.percentage || 0;
          fs.rmSync(path.join(ROOT, '.jscpd'), { recursive: true, force: true });
          return { name: 'jscpd', status: percentage > 10 ? 'warning' : 'ok', count: clones, details: [`重複: ${percentage.toFixed(1)}% (${clones}箇所)`] };
        }
        return { name: 'jscpd', status: 'ok', count: 0, details: ['重複なし'] };
      } catch { return { name: 'jscpd', status: 'ok', count: 0, details: ['解析スキップ'] }; }
    },
    // 6. knip
    async (): Promise<HealthCheck> => {
      try {
        execSync('npx knip --no-progress', { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' });
        return { name: 'knip', status: 'ok', count: 0, details: ['未使用コードなし'] };
      } catch (e: any) {
        const lines = (e.stdout || '').split('\n').filter((l: string) => l.trim());
        return { name: 'knip', status: lines.length > 10 ? 'warning' : 'ok', count: lines.length, details: lines.slice(0, 5).map((l: string) => l.slice(0, 60)) || ['未使用コードなし'] };
      }
    },
  ];

  console.log('  ⚡ Running 6 health checks in parallel...');
  return Promise.all(checkFns.map(fn => fn()));
}

// 既存のタスク状態を読み込む（status/assigneeを保持するため）
function loadExistingTasks(): Map<string, Task> {
  const existing = new Map<string, Task>();
  try {
    if (fs.existsSync(OUTPUT)) {
      const data = JSON.parse(fs.readFileSync(OUTPUT, 'utf-8'));
      if (data.tasks) {
        for (const task of data.tasks) {
          existing.set(task.id, task);
        }
      }
    }
  } catch {
    // ignore
  }
  return existing;
}

// タスクを生成（大きいファイルから自動生成）
function generateTasks(largeFiles: FileStats[], hooks: FileStats[]): Task[] {
  const existingTasks = loadExistingTasks();
  const tasks: Task[] = [];
  let taskNum = 1;

  // 1000行以上のファイルは分割タスク
  for (const file of largeFiles.filter(f => f.lines >= 1000)) {
    const id = `split-${file.path.replace(/[\/\.]/g, '-')}`;
    const existing = existingTasks.get(id);

    tasks.push({
      id,
      title: `${file.path} を分割`,
      description: `${file.lines}行 → 目標500行以下。ロジックを別モジュール/カスタムフックに抽出`,
      file: file.path,
      priority: file.lines >= 2000 ? 'high' : 'medium',
      status: existing?.status || 'todo',
      assignee: existing?.assignee,
      estimatedLines: Math.max(0, file.lines - 500)
    });
  }

  // 500-999行のファイルはリファクタ候補
  for (const file of largeFiles.filter(f => f.lines >= 500 && f.lines < 1000)) {
    const id = `refactor-${file.path.replace(/[\/\.]/g, '-')}`;
    const existing = existingTasks.get(id);

    tasks.push({
      id,
      title: `${file.path} をリファクタ`,
      description: `${file.lines}行。重複削除・ロジック整理で300行以下を目指す`,
      file: file.path,
      priority: 'low',
      status: existing?.status || 'todo',
      assignee: existing?.assignee,
      estimatedLines: Math.max(0, file.lines - 300)
    });
  }

  // hooks が作成済みなら適用タスク
  if (hooks.length >= 5) {
    const id = 'apply-hooks';
    const existing = existingTasks.get(id);
    tasks.push({
      id,
      title: 'カスタムフックをApp.tsxに適用',
      description: `hooks/ の ${hooks.length} 個のフックをApp.tsxで使用して状態管理を整理`,
      file: 'App.tsx',
      priority: 'high',
      status: existing?.status || 'todo',
      assignee: existing?.assignee,
      estimatedLines: 500
    });
  }

  // バンドルサイズ改善タスク（固定）
  const bundleTaskId = 'lazy-load-pdf';
  const bundleExisting = existingTasks.get(bundleTaskId);
  tasks.push({
    id: bundleTaskId,
    title: 'PDF機能を遅延読込',
    description: 'pdfGenerator.ts, PdfLoadDialog.tsx を動的importに変更',
    priority: 'medium',
    status: bundleExisting?.status || 'todo',
    assignee: bundleExisting?.assignee,
    estimatedLines: 0
  });

  return tasks;
}

async function analyzeCodebase(): Promise<CodebaseStats> {
  console.log('🔍 Analyzing codebase...');

  const allFiles = walkDir(ROOT, ['.ts', '.tsx']);
  const totalLines = allFiles.reduce((sum, f) => sum + f.lines, 0);

  // 300行以上のファイル
  const largeFiles = allFiles
    .filter(f => f.lines >= 300)
    .sort((a, b) => b.lines - a.lines);

  // カテゴリ別
  const components = allFiles.filter(f => f.path.startsWith('components/'));
  const services = allFiles.filter(f => f.path.startsWith('services/'));
  const hooks = allFiles.filter(f => f.path.startsWith('hooks/'));
  const utils = allFiles.filter(f => f.path.startsWith('utils/'));

  // タスク生成
  const tasks = generateTasks(largeFiles, hooks);

  // 健全性チェック（並列実行）
  console.log('🏥 Running health checks...');
  const health = await runHealthChecks();

  const stats: CodebaseStats = {
    generatedAt: new Date().toISOString(),
    totalFiles: allFiles.length,
    totalLines,
    largeFiles: largeFiles.slice(0, 10), // Top 10
    components: {
      count: components.length,
      files: components.map(f => `${f.path} (${f.lines}行)`)
    },
    services: {
      count: services.length,
      files: services.map(f => `${f.path} (${f.lines}行)`)
    },
    hooks: {
      count: hooks.length,
      files: hooks.map(f => `${f.path} (${f.lines}行)`)
    },
    utils: {
      count: utils.length,
      files: utils.map(f => `${f.path} (${f.lines}行)`)
    },
    health,
    tasks
  };

  return stats;
}

async function main() {
  const stats = await analyzeCodebase();

  // 出力ディレクトリ作成
  const outputDir = path.dirname(OUTPUT);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // JSON出力
  fs.writeFileSync(OUTPUT, JSON.stringify(stats, null, 2));

  console.log(`✅ Generated: ${OUTPUT}`);
  console.log(`   Total files: ${stats.totalFiles}`);
  console.log(`   Total lines: ${stats.totalLines.toLocaleString()}`);
  console.log(`   Large files (300+): ${stats.largeFiles.length}`);

  if (stats.largeFiles.length > 0) {
    console.log('\n📊 Top large files:');
    stats.largeFiles.slice(0, 5).forEach(f => {
      console.log(`   ${f.lines.toLocaleString().padStart(5)} lines: ${f.path}`);
    });
  }

  // 健全性チェック結果
  console.log('\n🏥 Health checks:');
  for (const check of stats.health) {
    const icon = check.status === 'ok' ? '✅' : check.status === 'warning' ? '⚠️' : '❌';
    console.log(`   ${icon} ${check.name}: ${check.details[0]}`);
  }
}

main().catch(console.error);
