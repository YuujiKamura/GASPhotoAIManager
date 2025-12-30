/**
 * コードベース分析関数
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  FileStats, ModuleNode, ComponentAnalysis, ImprovementSuggestion,
  FeatureFlowNode, BackendModuleGroup, SimilarModulePair
} from './analyze-codebase-types.js';

// モジュール依存関係を解析
export function analyzeModuleDependencies(files: FileStats[], ROOT: string): ModuleNode[] {
  const nodes: Map<string, ModuleNode> = new Map();
  const importMap: Map<string, string[]> = new Map();

  for (const file of files) {
    const fullPath = path.join(ROOT, file.path);
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const imports: string[] = [];
      const importRegex = /import\s+(?:(?:\{[^}]*\}|[\w*]+)\s+from\s+)?['"]([^'"]+)['"]/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        if (importPath.startsWith('.') || importPath.startsWith('/')) {
          const dir = path.dirname(file.path);
          let resolved = path.normalize(path.join(dir, importPath)).replace(/\\/g, '/');
          if (!resolved.endsWith('.ts') && !resolved.endsWith('.tsx')) {
            for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
              if (fs.existsSync(path.join(ROOT, resolved + ext))) {
                resolved += ext;
                break;
              }
            }
          }
          imports.push(resolved);
        }
      }
      importMap.set(file.path, imports);

      let category: ModuleNode['category'] = 'other';
      if (file.path.startsWith('components/')) category = 'components';
      else if (file.path.startsWith('services/')) category = 'services';
      else if (file.path.startsWith('hooks/')) category = 'hooks';
      else if (file.path.startsWith('utils/')) category = 'utils';

      const complexity = (content.match(/\b(if|else|switch|case|for|while|&&|\|\||\?)\b/g) || []).length;
      nodes.set(file.path, { path: file.path, category, imports, importedBy: [], complexity });
    } catch { /* ignore */ }
  }

  for (const [sourcePath, imports] of importMap) {
    for (const targetPath of imports) {
      const targetNode = nodes.get(targetPath);
      if (targetNode) targetNode.importedBy.push(sourcePath);
    }
  }
  return Array.from(nodes.values());
}

// UIコンポーネントを詳細分析
export function analyzeComponents(files: FileStats[], ROOT: string): ComponentAnalysis[] {
  const results: ComponentAnalysis[] = [];
  const componentFiles = files.filter(f => f.path.startsWith('components/') && f.path.endsWith('.tsx'));

  for (const file of componentFiles) {
    try {
      const content = fs.readFileSync(path.join(ROOT, file.path), 'utf-8');
      const issues: string[] = [];
      const suggestions: string[] = [];

      const propsMatch = content.match(/interface\s+\w*Props\s*\{([^}]*)\}/);
      const propsCount = propsMatch ? (propsMatch[1].match(/\w+\s*[?:]?\s*:/g) || []).length : 0;
      const hooksUsed = [...new Set((content.match(/\buse[A-Z]\w+/g) || []))];
      const stateCount = (content.match(/useState[<(]/g) || []).length;
      const effectCount = (content.match(/useEffect\s*\(/g) || []).length;

      let jsxDepth = 0, currentDepth = 0;
      for (const tag of (content.match(/<\/?[A-Z]\w*/g) || [])) {
        if (tag.startsWith('</')) currentDepth--;
        else { currentDepth++; jsxDepth = Math.max(jsxDepth, currentDepth); }
      }

      if (propsCount > 8) { issues.push(`Props数が多い (${propsCount}個)`); suggestions.push('Propsをオブジェクトにまとめるか分割'); }
      if (stateCount > 5) { issues.push(`useState数が多い (${stateCount}個)`); suggestions.push('useReducerまたはカスタムフック抽出'); }
      if (effectCount > 3) { issues.push(`useEffect数が多い (${effectCount}個)`); suggestions.push('副作用をカスタムフックに分離'); }
      if (jsxDepth > 8) { issues.push(`JSXネストが深い (${jsxDepth}層)`); suggestions.push('サブコンポーネントへの分割'); }
      if (file.lines > 300) { issues.push(`ファイルが大きい (${file.lines}行)`); suggestions.push('ロジックとUIを分離'); }

      results.push({ path: file.path, propsCount, hooksUsed, stateCount, effectCount, jsxDepth, issues, suggestions });
    } catch { /* ignore */ }
  }
  return results.sort((a, b) => b.issues.length - a.issues.length);
}

// アーキテクチャ問題を検出
export function detectArchitectureIssues(modules: ModuleNode[]): string[] {
  const issues: string[] = [];
  const ALLOWED_HIGH_IMPACT = ['types.ts', 'geminiService.ts', 'usageTracker.ts'];

  const getCategory = (p: string) => {
    if (p.startsWith('components/')) return 'components';
    if (p.startsWith('services/')) return 'services';
    if (p.startsWith('hooks/')) return 'hooks';
    if (p.startsWith('utils/')) return 'utils';
    return 'other';
  };

  // 循環依存検出
  for (const mod of modules) {
    const visited = new Set<string>();
    const stack = new Set<string>();
    const findCycle = (nodePath: string, pathArr: string[] = []): string[] | null => {
      if (stack.has(nodePath)) return [...pathArr, nodePath];
      if (visited.has(nodePath)) return null;
      visited.add(nodePath); stack.add(nodePath);
      const node = modules.find(m => m.path === nodePath);
      if (node) {
        for (const imp of node.imports) {
          const cycle = findCycle(imp, [...pathArr, nodePath]);
          if (cycle) return cycle;
        }
      }
      stack.delete(nodePath);
      return null;
    };
    const cycle = findCycle(mod.path);
    if (cycle && cycle.length > 2) {
      const cats = [...new Set(cycle.map(getCategory))];
      if (cats.length > 1) {
        const str = cycle.slice(-3).join(' → ');
        if (!issues.some(i => i.includes(str))) issues.push(`循環依存: ${str}`);
      }
    }
  }

  // 依存過多・高影響チェック
  for (const mod of modules) {
    if (mod.imports.length > 20) issues.push(`依存過多: ${mod.path} (${mod.imports.length}モジュール)`);
    const fileName = mod.path.split('/').pop() || '';
    const isAllowed = mod.category === 'utils' || ALLOWED_HIGH_IMPACT.includes(fileName);
    if (mod.importedBy.length > 15 && !isAllowed) issues.push(`高影響: ${mod.path} は ${mod.importedBy.length} ファイルから参照`);
    if (mod.category === 'components') {
      const directServices = mod.imports.filter(i => i.startsWith('services/') && !i.includes('gemini') && !i.includes('usageTracker'));
      if (directServices.length > 3) issues.push(`レイヤー違反疑い: ${mod.path}`);
    }
  }
  return issues.slice(0, 10);
}

// 改善提案を生成（簡略化）
export function generateSuggestions(
  modules: ModuleNode[], components: ComponentAnalysis[]
): ImprovementSuggestion[] {
  const suggestions: ImprovementSuggestion[] = [];

  const problematic = components.filter(c => c.issues.length >= 2);
  if (problematic.length > 0) {
    const targets = problematic.slice(0, 3);
    suggestions.push({
      id: 'refactor-complex-components',
      category: 'maintainability',
      title: '複雑なコンポーネントのリファクタリング',
      description: `${problematic.length}個のコンポーネントに複数の問題があります`,
      files: problematic.slice(0, 5).map(c => c.path),
      priority: 'high', effort: 'medium',
      prompt: `# 複雑なコンポーネントのリファクタリング

以下のコンポーネントをリファクタリングしてください。

## 対象ファイル
${targets.map(c => `- ${c.path}\n  - 問題: ${c.issues.join(', ')}\n  - 推奨: ${c.suggestions.join(', ')}`).join('\n')}

## 作業手順
1. 各ファイルを読んで現状を把握
2. Props数が多い場合: オブジェクトにグループ化（data, handlers, state等）
3. useState数が多い場合: カスタムフックに抽出
4. JSXが深い場合: サブコンポーネントに分割
5. ビルド確認してコミット

## 完了条件
- npm run build が成功
- 各問題が解消されていること`
    });
  }

  const manyStates = components.filter(c => c.stateCount > 3);
  if (manyStates.length > 0) {
    const targets = manyStates.slice(0, 3);
    suggestions.push({
      id: 'extract-custom-hooks',
      category: 'architecture',
      title: 'カスタムフック抽出',
      description: `${manyStates.length}個のコンポーネントでstate管理をフック化可能`,
      files: manyStates.slice(0, 5).map(c => c.path),
      priority: 'medium', effort: 'small',
      prompt: `# カスタムフック抽出

以下のコンポーネントからカスタムフックを抽出してください。

## 対象ファイル
${targets.map(c => `- ${c.path}: useState ${c.stateCount}個`).join('\n')}

## 作業手順
1. 関連するuseStateをグループ化
2. hooks/use[ComponentName].ts を作成
3. state と handlers をフックに移動
4. コンポーネントでフックを呼び出すように変更
5. ビルド確認してコミット

## 完了条件
- npm run build が成功
- useStateがカスタムフックに集約されていること`
    });
  }

  const heavyDeps = modules.filter(m => m.imports.length > 10);
  if (heavyDeps.length > 0) {
    const targets = heavyDeps.slice(0, 3);
    suggestions.push({
      id: 'split-heavy-modules',
      category: 'architecture',
      title: '依存過多モジュールの分割',
      description: `${heavyDeps.length}個のファイルが多くのモジュールに依存`,
      files: heavyDeps.slice(0, 5).map(m => m.path),
      priority: 'medium', effort: 'large',
      prompt: `# 依存過多モジュールの分割

以下のモジュールは依存が多すぎます。分割を検討してください。

## 対象ファイル
${targets.map(m => `- ${m.path}: ${m.imports.length}個の依存`).join('\n')}

## 作業手順
1. 各ファイルの責務を分析
2. 関連する機能ごとにファイルを分割
3. 共通部分は utils/ に抽出
4. importを整理
5. ビルド確認してコミット

## 完了条件
- npm run build が成功
- 各ファイルの依存が10個以下`
    });
  }

  const highImpact = modules.filter(m => m.importedBy.length > 5);
  if (highImpact.length > 0) {
    const targets = highImpact.slice(0, 5);
    suggestions.push({
      id: 'test-high-impact',
      category: 'maintainability',
      title: '高影響モジュールのテスト強化',
      description: `${highImpact.length}個のファイルが多くの場所から参照`,
      files: highImpact.slice(0, 5).map(m => m.path),
      priority: 'low', effort: 'medium',
      prompt: `# 高影響モジュールのテスト強化

以下のモジュールは多くの場所から参照されています。変更時の影響が大きいためテストを追加してください。

## 対象ファイル
${targets.map(m => `- ${m.path}: ${m.importedBy.length}箇所から参照`).join('\n')}

## 作業手順
1. 各モジュールの主要な関数を特定
2. tests/ にテストファイルを作成
3. 正常系・異常系のテストを記述
4. npm test で確認

## 完了条件
- テストが通ること
- 主要な関数がカバーされていること`
    });
  }

  const largeRender = components.filter(c => c.jsxDepth > 6 || c.effectCount > 2);
  if (largeRender.length > 0) {
    const targets = largeRender.slice(0, 3);
    suggestions.push({
      id: 'optimize-rendering',
      category: 'performance',
      title: 'レンダリング最適化',
      description: `${largeRender.length}個のコンポーネントで最適化可能`,
      files: largeRender.slice(0, 5).map(c => c.path),
      priority: 'low', effort: 'small',
      prompt: `# レンダリング最適化

以下のコンポーネントでレンダリング最適化が可能です。

## 対象ファイル
${targets.map(c => `- ${c.path}: JSX深度${c.jsxDepth}, useEffect${c.effectCount}個`).join('\n')}

## 作業手順
1. 深いJSXはサブコンポーネントに分割
2. useEffectの依存配列を最適化
3. React.memoの適用を検討
4. 不要な再レンダリングがないか確認
5. ビルド確認してコミット

## 完了条件
- npm run build が成功
- JSX深度が6以下になること`
    });
  }
  return suggestions;
}

// 機能フローツリーを解析
export function analyzeFeatureFlow(modules: ModuleNode[], ROOT: string): FeatureFlowNode {
  const createNode = (id: string, name: string, type: FeatureFlowNode['type'], component: string, desc: string, children: FeatureFlowNode[] = []): FeatureFlowNode => {
    const backendModules: string[] = [];
    const mod = modules.find(m => m.path === component || m.path === component.replace('.tsx', '/index.tsx'));
    if (mod) {
      for (const imp of mod.imports) {
        if (imp.startsWith('services/') || imp.startsWith('utils/')) backendModules.push(imp);
      }
    }
    return { id, name, type, component, description: desc, children, backendModules };
  };

  const uploadChildren = [
    createNode('pdf-load', 'PDF読み込み', 'modal', 'components/PdfLoadDialog.tsx', 'PDFから写真抽出'),
    createNode('api-key', 'APIキー設定', 'modal', 'components/ApiKeySetup.tsx', 'Gemini APIキー設定'),
    createNode('history', 'セッション履歴', 'panel', 'components/SessionHistoryPanel.tsx', '過去セッション読込'),
  ];

  const previewChildren = [
    createNode('refine', '再解析', 'modal', 'components/RefineModal.tsx', '分類を再解析'),
    createNode('manual-pairing', '手動ペアリング', 'modal', 'components/ManualPairingModal.tsx', '手動ペアリング'),
    createNode('export-excel', 'Excel出力', 'action', 'utils/excelGenerator.ts', 'Excel出力'),
  ];

  return {
    id: 'app', name: 'GASPhotoAIManager', type: 'screen', component: 'App.tsx',
    description: '写真管理・AI解析アプリ', backendModules: [],
    children: [
      { id: 'upload-view', name: 'アップロード画面', type: 'screen', component: 'components/UploadView.tsx', description: '写真アップロードと設定', backendModules: [], children: uploadChildren },
      { id: 'preview-view', name: 'プレビュー画面', type: 'screen', component: 'components/PreviewView/index.tsx', description: '解析結果プレビュー', backendModules: [], children: previewChildren }
    ]
  };
}

// 裏方モジュールをカテゴリ別にグループ化
export function groupBackendModules(modules: ModuleNode[], featureFlow: FeatureFlowNode, ROOT: string): BackendModuleGroup[] {
  const groups: BackendModuleGroup[] = [];
  const categoryDefs = [
    { category: 'AI/解析', description: 'Gemini APIを使った解析', patterns: ['gemini', 'analysis', 'classifier'] },
    { category: 'ストレージ', description: 'データの保存・読込', patterns: ['storage', 'cache', 'db', 'indexed'] },
    { category: 'エクスポート', description: 'Excel/PDF出力', patterns: ['excel', 'pdf', 'export', 'generator'] },
    { category: '正規化', description: '表記揺れ統一', patterns: ['normaliz', 'station', 'worktype'] },
    { category: 'ユーティリティ', description: '汎用ヘルパー', patterns: ['util', 'helper', 'common'] },
  ];

  const usageMap = new Map<string, string[]>();
  const collectUsage = (node: FeatureFlowNode) => {
    for (const backend of node.backendModules) {
      const existing = usageMap.get(backend) || [];
      if (!existing.includes(node.name)) existing.push(node.name);
      usageMap.set(backend, existing);
    }
    node.children.forEach(collectUsage);
  };
  collectUsage(featureFlow);

  const backendModules = modules.filter(m => m.path.startsWith('services/') || m.path.startsWith('utils/') || m.path.startsWith('hooks/'));
  const categorized = new Set<string>();

  for (const def of categoryDefs) {
    const mods = backendModules.filter(m => {
      const name = m.path.toLowerCase();
      return def.patterns.some(p => name.includes(p)) && !categorized.has(m.path);
    });
    if (mods.length > 0) {
      groups.push({
        category: def.category, description: def.description,
        modules: mods.map(m => {
          categorized.add(m.path);
          let exports: string[] = [];
          try {
            const content = fs.readFileSync(path.join(ROOT, m.path), 'utf-8');
            const matches = content.match(/export\s+(?:async\s+)?(?:function|const|class|interface|type)\s+(\w+)/g) || [];
            exports = matches.slice(0, 5).map(e => e.match(/(?:function|const|class|interface|type)\s+(\w+)/)?.[1] || '').filter(Boolean);
          } catch { /* ignore */ }
          return { path: m.path, name: m.path.split('/').pop()?.replace(/\.tsx?$/, '') || m.path, exports, usedBy: usageMap.get(m.path) || [] };
        })
      });
    }
  }

  const uncategorized = backendModules.filter(m => !categorized.has(m.path));
  if (uncategorized.length > 0) {
    groups.push({
      category: 'その他', description: '未分類モジュール',
      modules: uncategorized.map(m => ({ path: m.path, name: m.path.split('/').pop()?.replace(/\.tsx?$/, '') || m.path, exports: [], usedBy: usageMap.get(m.path) || [] }))
    });
  }
  return groups;
}

// 類似モジュールを検出
export function detectSimilarModules(modules: ModuleNode[], ROOT: string): SimilarModulePair[] {
  const pairs: SimilarModulePair[] = [];
  const backendModules = modules.filter(m => m.path.startsWith('services/') || m.path.startsWith('utils/'));
  const moduleTokens = new Map<string, Set<string>>();

  for (const mod of backendModules) {
    try {
      const content = fs.readFileSync(path.join(ROOT, mod.path), 'utf-8');
      const tokens = new Set<string>();
      for (const m of (content.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [])) {
        if (m.length > 3) tokens.add(m.toLowerCase());
      }
      moduleTokens.set(mod.path, tokens);
    } catch { /* ignore */ }
  }

  for (let i = 0; i < backendModules.length; i++) {
    for (let j = i + 1; j < backendModules.length; j++) {
      const [mod1, mod2] = [backendModules[i], backendModules[j]];
      const [t1, t2] = [moduleTokens.get(mod1.path), moduleTokens.get(mod2.path)];
      if (!t1 || !t2 || t1.size < 10 || t2.size < 10) continue;

      const intersection = new Set([...t1].filter(t => t2.has(t)));
      const union = new Set([...t1, ...t2]);
      const similarity = intersection.size / union.size;

      if (similarity > 0.3) {
        pairs.push({
          modules: [mod1.path, mod2.path],
          similarity: Math.round(similarity * 100) / 100,
          reason: `共通: ${[...intersection].slice(0, 5).join(', ')}`,
          comparisonPrompt: `# 類似モジュールの統合検討

以下の2つのモジュールが類似しています（${Math.round(similarity * 100)}%）。統合または役割分担の明確化を検討してください。

## 対象ファイル
- ${mod1.path}
- ${mod2.path}

## 共通トークン
${[...intersection].slice(0, 10).join(', ')}

## 作業手順
1. 両ファイルを読んで機能を比較
2. 統合可能か、役割分担が必要か判断
3. 統合する場合: 1つのファイルにまとめる
4. 分担する場合: 責務を明確化してリネーム
5. ビルド確認してコミット

## 完了条件
- npm run build が成功
- 重複コードが解消されていること`
        });
      }
    }
  }
  return pairs.sort((a, b) => b.similarity - a.similarity).slice(0, 10);
}
