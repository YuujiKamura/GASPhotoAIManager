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

interface CodebaseStats {
  generatedAt: string;
  totalFiles: number;
  totalLines: number;
  largeFiles: FileStats[];  // 300行以上
  components: { count: number; files: string[] };
  services: { count: number; files: string[] };
  hooks: { count: number; files: string[] };
  utils: { count: number; files: string[] };
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
    }
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
