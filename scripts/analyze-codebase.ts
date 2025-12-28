/**
 * コードベース分析スクリプト
 * ビルド時に実行して src/generated/codebase-stats.json を生成
 *
 * 使用方法: npx tsx scripts/analyze-codebase.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

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

function analyzeCodebase(): CodebaseStats {
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
    tasks
  };

  return stats;
}

function main() {
  const stats = analyzeCodebase();

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
}

main();
