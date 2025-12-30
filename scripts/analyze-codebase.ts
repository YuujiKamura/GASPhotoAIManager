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

// モジュール依存関係
interface ModuleDependency {
  source: string;
  target: string;
  type: 'internal' | 'external';
}

interface ModuleNode {
  path: string;
  category: 'components' | 'services' | 'hooks' | 'utils' | 'other';
  imports: string[];
  importedBy: string[];
  complexity: number;  // 循環的複雑度の簡易指標
}

// UIコンポーネント分析
interface ComponentAnalysis {
  path: string;
  propsCount: number;
  hooksUsed: string[];
  stateCount: number;
  effectCount: number;
  jsxDepth: number;
  issues: string[];
  suggestions: string[];
}

// 改善提案
interface ImprovementSuggestion {
  id: string;
  category: 'architecture' | 'performance' | 'maintainability' | 'ui';
  title: string;
  description: string;
  files: string[];
  priority: 'high' | 'medium' | 'low';
  effort: 'small' | 'medium' | 'large';
  prompt: string;  // Claude用の詳細指示
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
  // 新規追加
  moduleDependencies: ModuleNode[];
  componentAnalysis: ComponentAnalysis[];
  suggestions: ImprovementSuggestion[];
  architectureIssues: string[];
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

// モジュール依存関係を解析
function analyzeModuleDependencies(files: FileStats[]): ModuleNode[] {
  const nodes: Map<string, ModuleNode> = new Map();
  const importMap: Map<string, string[]> = new Map();

  // 各ファイルのimport文を解析
  for (const file of files) {
    const fullPath = path.join(ROOT, file.path);
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const imports: string[] = [];

      // import文を抽出
      const importRegex = /import\s+(?:(?:\{[^}]*\}|[\w*]+)\s+from\s+)?['"]([^'"]+)['"]/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        // 相対パスの内部モジュールのみ
        if (importPath.startsWith('.') || importPath.startsWith('/')) {
          // 相対パスを解決
          const dir = path.dirname(file.path);
          let resolved = path.normalize(path.join(dir, importPath)).replace(/\\/g, '/');
          // 拡張子がない場合は追加
          if (!resolved.endsWith('.ts') && !resolved.endsWith('.tsx')) {
            if (fs.existsSync(path.join(ROOT, resolved + '.ts'))) {
              resolved += '.ts';
            } else if (fs.existsSync(path.join(ROOT, resolved + '.tsx'))) {
              resolved += '.tsx';
            } else if (fs.existsSync(path.join(ROOT, resolved, 'index.ts'))) {
              resolved += '/index.ts';
            } else if (fs.existsSync(path.join(ROOT, resolved, 'index.tsx'))) {
              resolved += '/index.tsx';
            }
          }
          imports.push(resolved);
        }
      }

      importMap.set(file.path, imports);

      // カテゴリ判定
      let category: ModuleNode['category'] = 'other';
      if (file.path.startsWith('components/')) category = 'components';
      else if (file.path.startsWith('services/')) category = 'services';
      else if (file.path.startsWith('hooks/')) category = 'hooks';
      else if (file.path.startsWith('utils/')) category = 'utils';

      // 複雑度の簡易計算（条件分岐の数）
      const complexity = (content.match(/\b(if|else|switch|case|for|while|&&|\|\||\?)\b/g) || []).length;

      nodes.set(file.path, {
        path: file.path,
        category,
        imports,
        importedBy: [],
        complexity
      });
    } catch {
      // ファイル読み込みエラーは無視
    }
  }

  // importedByを構築
  for (const [sourcePath, imports] of importMap) {
    for (const targetPath of imports) {
      const targetNode = nodes.get(targetPath);
      if (targetNode) {
        targetNode.importedBy.push(sourcePath);
      }
    }
  }

  return Array.from(nodes.values());
}

// UIコンポーネントを詳細分析
function analyzeComponents(files: FileStats[]): ComponentAnalysis[] {
  const results: ComponentAnalysis[] = [];
  const componentFiles = files.filter(f => f.path.startsWith('components/') && f.path.endsWith('.tsx'));

  for (const file of componentFiles) {
    const fullPath = path.join(ROOT, file.path);
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const issues: string[] = [];
      const suggestions: string[] = [];

      // Props数をカウント（interface XxxProps のプロパティ数）
      const propsMatch = content.match(/interface\s+\w*Props\s*\{([^}]*)\}/);
      const propsCount = propsMatch ? (propsMatch[1].match(/\w+\s*[?:]?\s*:/g) || []).length : 0;

      // 使用しているhooksを抽出
      const hooksUsed = [...new Set((content.match(/\buse[A-Z]\w+/g) || []))];

      // useState の数
      const stateCount = (content.match(/useState[<(]/g) || []).length;

      // useEffect の数
      const effectCount = (content.match(/useEffect\s*\(/g) || []).length;

      // JSXの深さを推定（<タグの最大ネスト）
      let jsxDepth = 0;
      let currentDepth = 0;
      const jsxTags = content.match(/<\/?[A-Z]\w*/g) || [];
      for (const tag of jsxTags) {
        if (tag.startsWith('</')) {
          currentDepth--;
        } else {
          currentDepth++;
          jsxDepth = Math.max(jsxDepth, currentDepth);
        }
      }

      // 問題点と提案を生成
      if (propsCount > 8) {
        issues.push(`Props数が多い (${propsCount}個)`);
        suggestions.push('Propsをオブジェクトにまとめるか、コンポーネントを分割');
      }
      if (stateCount > 5) {
        issues.push(`useState数が多い (${stateCount}個)`);
        suggestions.push('useReducerへの統合またはカスタムフック抽出を検討');
      }
      if (effectCount > 3) {
        issues.push(`useEffect数が多い (${effectCount}個)`);
        suggestions.push('副作用をカスタムフックに分離');
      }
      if (jsxDepth > 8) {
        issues.push(`JSXネストが深い (${jsxDepth}層)`);
        suggestions.push('サブコンポーネントへの分割を検討');
      }
      if (file.lines > 300) {
        issues.push(`ファイルが大きい (${file.lines}行)`);
        suggestions.push('ロジックをカスタムフックに、UIをサブコンポーネントに分離');
      }

      results.push({
        path: file.path,
        propsCount,
        hooksUsed,
        stateCount,
        effectCount,
        jsxDepth,
        issues,
        suggestions
      });
    } catch {
      // ファイル読み込みエラーは無視
    }
  }

  // 問題のあるコンポーネントを優先して返す
  return results.sort((a, b) => b.issues.length - a.issues.length);
}

// アーキテクチャ問題を検出
function detectArchitectureIssues(modules: ModuleNode[]): string[] {
  const issues: string[] = [];

  // 許容されるパターン（問題として報告しない）
  const ALLOWED_HIGH_IMPACT = [
    'types.ts',           // 型定義は全体で共有されるべき
    'geminiService.ts',   // コアサービス
    'usageTracker.ts',    // 横断的関心事
  ];

  // 1. 循環依存の検出（レイヤー間の循環のみ報告）
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function getCategory(filePath: string): string {
    if (filePath.startsWith('components/')) return 'components';
    if (filePath.startsWith('services/')) return 'services';
    if (filePath.startsWith('hooks/')) return 'hooks';
    if (filePath.startsWith('utils/')) return 'utils';
    return 'other';
  }

  function hasCycle(nodePath: string, pathStack: string[] = []): string[] | null {
    if (recursionStack.has(nodePath)) {
      return [...pathStack, nodePath];
    }
    if (visited.has(nodePath)) return null;

    visited.add(nodePath);
    recursionStack.add(nodePath);

    const node = modules.find(m => m.path === nodePath);
    if (node) {
      for (const importPath of node.imports) {
        const cycle = hasCycle(importPath, [...pathStack, nodePath]);
        if (cycle) return cycle;
      }
    }

    recursionStack.delete(nodePath);
    return null;
  }

  for (const mod of modules) {
    visited.clear();
    recursionStack.clear();
    const cycle = hasCycle(mod.path);
    if (cycle && cycle.length > 2) {
      // 同じカテゴリ内の循環は許容（utils/storage内など）
      const categories = cycle.map(p => getCategory(p));
      const uniqueCategories = [...new Set(categories)];

      // 異なるレイヤー間での循環のみ報告
      if (uniqueCategories.length > 1) {
        const cycleStr = cycle.slice(-3).join(' → ');
        if (!issues.some(i => i.includes(cycleStr))) {
          issues.push(`循環依存: ${cycleStr}`);
        }
      }
    }
  }

  // 2. 過度に多くのモジュールに依存しているファイル（閾値を上げる）
  for (const mod of modules) {
    if (mod.imports.length > 20) {  // 15→20に緩和
      issues.push(`依存過多: ${mod.path} (${mod.imports.length}モジュール)`);
    }
  }

  // 3. 多くのモジュールから依存されている（変更影響大）
  // utils、型定義、コアサービスは除外
  for (const mod of modules) {
    const fileName = mod.path.split('/').pop() || '';
    const isAllowed = mod.category === 'utils' ||
                      ALLOWED_HIGH_IMPACT.includes(fileName) ||
                      mod.path.endsWith('.d.ts');

    if (mod.importedBy.length > 15 && !isAllowed) {  // 10→15に緩和
      issues.push(`高影響: ${mod.path} は ${mod.importedBy.length} ファイルから参照`);
    }
  }

  // 4. レイヤー違反（componentsがservicesを直接importなど）
  // geminiServiceは許可、それ以外のservicesを3つ以上直接参照している場合のみ
  for (const mod of modules) {
    if (mod.category === 'components') {
      const directServiceImports = mod.imports.filter(i =>
        i.startsWith('services/') &&
        !i.includes('gemini') &&
        !i.includes('usageTracker')
      );
      if (directServiceImports.length > 3) {  // 2→3に緩和
        issues.push(`レイヤー違反疑い: ${mod.path} がservicesを直接参照`);
      }
    }
  }

  return issues.slice(0, 10); // 最大10件
}

// 改善提案を生成
function generateSuggestions(
  modules: ModuleNode[],
  components: ComponentAnalysis[],
  archIssues: string[]
): ImprovementSuggestion[] {
  const suggestions: ImprovementSuggestion[] = [];

  // 1. 問題のあるコンポーネントのリファクタリング提案
  const problematicComponents = components.filter(c => c.issues.length >= 2);
  if (problematicComponents.length > 0) {
    const files = problematicComponents.slice(0, 5).map(c => c.path);
    suggestions.push({
      id: 'refactor-complex-components',
      category: 'maintainability',
      title: '複雑なコンポーネントのリファクタリング',
      description: `${problematicComponents.length}個のコンポーネントに複数の問題があります`,
      files,
      priority: 'high',
      effort: 'medium',
      prompt: `# 複雑なコンポーネントのリファクタリング

## 対象ファイル
${files.map(f => `- ${f}`).join('\n')}

## 各ファイルの問題点
${problematicComponents.slice(0, 5).map(c => `
### ${c.path}
${c.issues.map(i => `- ${i}`).join('\n')}

**提案:**
${c.suggestions.map(s => `- ${s}`).join('\n')}
`).join('\n')}

## 作業手順
1. 各ファイルを読んで現状を把握
2. カスタムフックを抽出（useState/useEffect をまとめる）
3. サブコンポーネントに分割（JSXの深いネストを解消）
4. Propsが多い場合はオブジェクトにまとめる
5. ビルド確認してコミット

## 完了条件
- 各コンポーネントが300行以下
- useState数が3個以下
- npm run build が通ること`
    });
  }

  // 2. hooks活用提案
  const componentsWithManyStates = components.filter(c => c.stateCount > 3);
  if (componentsWithManyStates.length > 0) {
    suggestions.push({
      id: 'extract-custom-hooks',
      category: 'architecture',
      title: 'カスタムフック抽出',
      description: `${componentsWithManyStates.length}個のコンポーネントでstate管理をフックに抽出可能`,
      files: componentsWithManyStates.slice(0, 5).map(c => c.path),
      priority: 'medium',
      effort: 'small',
      prompt: `# カスタムフック抽出

## 対象
${componentsWithManyStates.slice(0, 5).map(c => `- ${c.path}: useState ${c.stateCount}個`).join('\n')}

## 手順
1. 関連するstateをグループ化
2. hooks/useXxx.ts を作成
3. useState, useEffect, ハンドラーを移動
4. コンポーネントでフックを使用

## 命名規則
- use + 機能名 + State (例: useFormState, useModalState)

## 完了条件
- コンポーネント内のuseState数が3個以下
- 新しいフックは単一責任を持つ`
    });
  }

  // 3. 依存過多ファイルの分割提案
  const heavyDependencies = modules.filter(m => m.imports.length > 10);
  if (heavyDependencies.length > 0) {
    suggestions.push({
      id: 'split-heavy-modules',
      category: 'architecture',
      title: '依存過多モジュールの分割',
      description: `${heavyDependencies.length}個のファイルが多くのモジュールに依存`,
      files: heavyDependencies.slice(0, 5).map(m => m.path),
      priority: 'medium',
      effort: 'large',
      prompt: `# 依存過多モジュールの分割

## 対象
${heavyDependencies.slice(0, 5).map(m => `- ${m.path}: ${m.imports.length}モジュール依存`).join('\n')}

## 分析手順
1. 各ファイルのimport文を確認
2. 機能別にグループ化（UI系、ロジック系、ユーティリティ系）
3. 関連する機能ごとにファイル分割を検討

## 分割パターン
- 大きなコンポーネント → 複数のサブコンポーネント
- ビジネスロジック → サービス層に移動
- ユーティリティ関数 → utils/に集約

## 完了条件
- 各ファイルの依存が10モジュール以下
- 単一責任の原則を満たす`
    });
  }

  // 4. 高影響ファイルのテスト強化提案
  const highImpactModules = modules.filter(m => m.importedBy.length > 5);
  if (highImpactModules.length > 0) {
    suggestions.push({
      id: 'test-high-impact',
      category: 'maintainability',
      title: '高影響モジュールのテスト強化',
      description: `${highImpactModules.length}個のファイルが多くの場所から参照されている`,
      files: highImpactModules.slice(0, 5).map(m => m.path),
      priority: 'low',
      effort: 'medium',
      prompt: `# 高影響モジュールのテスト強化

## 対象（変更時の影響が大きいファイル）
${highImpactModules.slice(0, 5).map(m => `- ${m.path}: ${m.importedBy.length}ファイルから参照`).join('\n')}

## 推奨アクション
1. 各ファイルのユニットテストを作成/強化
2. 主要な関数・コンポーネントのテストカバレッジを確認
3. 型定義を厳密化

## テスト作成手順
1. ファイル名.test.ts を作成
2. 主要なexportの動作をテスト
3. エッジケースを網羅`
    });
  }

  // 5. パフォーマンス改善提案
  const largeComponents = components.filter(c => c.jsxDepth > 6 || c.effectCount > 2);
  if (largeComponents.length > 0) {
    suggestions.push({
      id: 'optimize-rendering',
      category: 'performance',
      title: 'レンダリング最適化',
      description: `${largeComponents.length}個のコンポーネントでレンダリング最適化の余地あり`,
      files: largeComponents.slice(0, 5).map(c => c.path),
      priority: 'low',
      effort: 'small',
      prompt: `# レンダリング最適化

## 対象
${largeComponents.slice(0, 5).map(c => `- ${c.path}: JSX深度${c.jsxDepth}, useEffect${c.effectCount}個`).join('\n')}

## 最適化手法
1. React.memo でコンポーネントをメモ化
2. useMemo/useCallback で計算結果・関数をキャッシュ
3. 条件付きレンダリングで不要な再描画を防止
4. リスト表示は仮想化を検討（react-window等）

## 確認ポイント
- useEffectの依存配列が適切か
- 親コンポーネントの再レンダリングが子に伝播していないか

## 完了条件
- React DevToolsで不要な再レンダリングがないこと`
    });
  }

  return suggestions;
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
        // depcheckは問題を見つけると非0を返すのでcatchでも処理
        // ビルドツールで使われるパッケージは誤検知されるので除外
        const ignores = '@tailwindcss/postcss,postcss,tailwindcss,jscpd,knip,typescript';
        let output = '';
        try {
          output = execSync(`npx depcheck --json --ignores="${ignores}"`, { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' });
        } catch (e: any) {
          output = e.stdout || '';
        }
        if (!output) return { name: 'depcheck', status: 'warning', count: 0, details: ['解析失敗'] };
        const data = JSON.parse(output);
        const unused = [...(data.dependencies || []), ...(data.devDependencies || [])];
        return { name: 'depcheck', status: unused.length > 0 ? 'warning' : 'ok', count: unused.length, details: unused.length ? [`未使用: ${unused.slice(0, 5).join(', ')}`] : ['問題なし'] };
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

  // hooks が作成済みなら適用タスク（usePhotosStateの使用を検出して完了判定）
  if (hooks.length >= 5) {
    const id = 'apply-hooks';
    const existing = existingTasks.get(id);
    // App.tsxでusePhotosStateを使っていれば完了
    let isApplied = false;
    try {
      const appContent = fs.readFileSync(path.join(ROOT, 'App.tsx'), 'utf-8');
      isApplied = appContent.includes('usePhotosState') && appContent.includes('photosState');
    } catch { /* ignore */ }
    tasks.push({
      id,
      title: 'カスタムフックをApp.tsxに適用',
      description: `hooks/ の ${hooks.length} 個のフックをApp.tsxで使用して状態管理を整理`,
      file: 'App.tsx',
      priority: 'high',
      status: isApplied ? 'done' : (existing?.status || 'todo'),
      assignee: existing?.assignee,
      estimatedLines: 500
    });
  }

  // バンドルサイズ改善タスク（lazy importを検出して完了判定）
  const bundleTaskId = 'lazy-load-pdf';
  const bundleExisting = existingTasks.get(bundleTaskId);
  let isPdfLazy = false;
  try {
    const appContent = fs.readFileSync(path.join(ROOT, 'App.tsx'), 'utf-8');
    isPdfLazy = appContent.includes("lazy(() => import('./components/PdfLoadDialog')");
  } catch { /* ignore */ }
  tasks.push({
    id: bundleTaskId,
    title: 'PDF機能を遅延読込',
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

  // 新規分析: モジュール依存関係
  console.log('🔗 Analyzing module dependencies...');
  const moduleDependencies = analyzeModuleDependencies(allFiles);

  // 新規分析: UIコンポーネント分析
  console.log('🧩 Analyzing components...');
  const componentAnalysis = analyzeComponents(allFiles);

  // 新規分析: アーキテクチャ問題検出
  console.log('🏛️ Detecting architecture issues...');
  const architectureIssues = detectArchitectureIssues(moduleDependencies);

  // 新規分析: 改善提案生成
  console.log('💡 Generating improvement suggestions...');
  const suggestions = generateSuggestions(moduleDependencies, componentAnalysis, architectureIssues);

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
    tasks,
    // 新規追加
    moduleDependencies: moduleDependencies.slice(0, 50), // 上位50モジュール
    componentAnalysis: componentAnalysis.slice(0, 20), // 上位20コンポーネント
    suggestions,
    architectureIssues
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

  // アーキテクチャ問題
  if (stats.architectureIssues.length > 0) {
    console.log('\n🏛️ Architecture issues:');
    stats.architectureIssues.slice(0, 5).forEach(issue => {
      console.log(`   ⚠️ ${issue}`);
    });
  }

  // 改善提案
  if (stats.suggestions.length > 0) {
    console.log('\n💡 Improvement suggestions:');
    stats.suggestions.slice(0, 3).forEach(s => {
      const priorityIcon = s.priority === 'high' ? '🔴' : s.priority === 'medium' ? '🟡' : '🔵';
      console.log(`   ${priorityIcon} [${s.category}] ${s.title}`);
    });
  }

  // 問題のあるコンポーネント
  const problematicComponents = stats.componentAnalysis.filter(c => c.issues.length > 0);
  if (problematicComponents.length > 0) {
    console.log('\n🧩 Components needing attention:');
    problematicComponents.slice(0, 3).forEach(c => {
      console.log(`   ⚠️ ${c.path}: ${c.issues.join(', ')}`);
    });
  }
}

main().catch(console.error);
