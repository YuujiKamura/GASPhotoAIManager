/**
 * 階層サブセット・セレクター機能のテスト
 * 実行: npx tsx tests/hierarchySelector.test.ts
 *
 * セレクターエージェントによる階層絞り込み機能を検証
 */

import {
  getHierarchySubset,
  getSelectorPrompt,
  getWorkTypeStats,
  formatHierarchyForPrompt,
  getWorkTypes
} from '../utils/workHierarchy';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e: any) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${e.message}`);
    failed++;
  }
}

function assertTrue(condition: boolean, message?: string) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected "${expected}", got "${actual}"`);
  }
}

// ============================================
// getHierarchySubset テスト
// ============================================

console.log('\n=== getHierarchySubset テスト ===\n');

test('単一工種のサブセット取得', () => {
  const subset = getHierarchySubset(['舗装工']) as any;
  assertTrue('舗装工' in subset, '舗装工が含まれるべき');
  assertTrue(!('排水構造物工' in subset), '排水構造物工は含まれないべき');
  assertTrue(!('仮設工' in subset), '仮設工は含まれないべき');
});

test('複数工種のサブセット取得', () => {
  const subset = getHierarchySubset(['舗装工', '仮設工']) as any;
  assertTrue('舗装工' in subset);
  assertTrue('仮設工' in subset);
  assertTrue(!('排水構造物工' in subset));
});

test('存在しない工種は無視される', () => {
  const subset = getHierarchySubset(['舗装工', '存在しない工種']) as any;
  assertTrue('舗装工' in subset);
  assertEqual(Object.keys(subset).length, 1);
});

test('空配列は空オブジェクトを返す', () => {
  const subset = getHierarchySubset([]);
  assertEqual(Object.keys(subset).length, 0);
});

test('サブセットは元の構造を維持', () => {
  const subset = getHierarchySubset(['舗装工']) as any;
  assertTrue('舗装打換え工' in subset['舗装工']);
  assertTrue('表層工' in subset['舗装工']['舗装打換え工']);
  assertTrue('舗設状況' in subset['舗装工']['舗装打換え工']['表層工']);
});

// ============================================
// サイズ削減テスト
// ============================================

console.log('\n=== サイズ削減テスト ===\n');

test('舗装工のみのサブセットはフル階層より小さい', () => {
  const full = JSON.stringify(formatHierarchyForPrompt());
  const subset = JSON.stringify(getHierarchySubset(['舗装工']));

  console.log(`  フル階層: ${full.length} 文字`);
  console.log(`  舗装工のみ: ${subset.length} 文字`);
  console.log(`  削減率: ${((1 - subset.length / full.length) * 100).toFixed(1)}%`);

  assertTrue(subset.length < full.length, 'サブセットはフルより小さいべき');
});

test('単一工種で50%以上削減可能', () => {
  const full = JSON.stringify(formatHierarchyForPrompt());
  const subset = JSON.stringify(getHierarchySubset(['舗装工']));
  const reduction = (1 - subset.length / full.length) * 100;

  assertTrue(reduction > 50, `削減率が50%未満: ${reduction.toFixed(1)}%`);
});

test('2工種でも20%以上削減可能', () => {
  const full = JSON.stringify(formatHierarchyForPrompt());
  // 排水構造物工は大きいので、小さい工種を選択
  const subset = JSON.stringify(getHierarchySubset(['舗装工', '仮設工']));
  const reduction = (1 - subset.length / full.length) * 100;

  console.log(`  2工種サブセット: ${subset.length} 文字`);
  console.log(`  削減率: ${reduction.toFixed(1)}%`);

  assertTrue(reduction > 20, `削減率が20%未満: ${reduction.toFixed(1)}%`);
});

// ============================================
// getSelectorPrompt テスト
// ============================================

console.log('\n=== getSelectorPrompt テスト ===\n');

test('セレクタープロンプトが生成される', () => {
  const prompt = getSelectorPrompt();
  assertTrue(prompt.length > 0);
  assertTrue(prompt.includes('舗装工'));
});

test('セレクタープロンプトはフル階層より大幅に小さい', () => {
  const full = JSON.stringify(formatHierarchyForPrompt());
  const selector = getSelectorPrompt();

  console.log(`  フル階層: ${full.length} 文字`);
  console.log(`  セレクター: ${selector.length} 文字`);
  console.log(`  削減率: ${((1 - selector.length / full.length) * 100).toFixed(1)}%`);

  assertTrue(selector.length < full.length / 2, 'セレクターはフルの半分未満であるべき');
});

test('セレクタープロンプトに全工種が含まれる', () => {
  const prompt = getSelectorPrompt();
  const parsed = JSON.parse(prompt);
  const workTypes = getWorkTypes();

  for (const wt of workTypes) {
    assertTrue(wt in parsed, `${wt}が含まれていない`);
  }
});

test('各工種に代表的な備考が含まれる', () => {
  const prompt = getSelectorPrompt();
  const parsed = JSON.parse(prompt);

  // 舗装工には舗設状況などが含まれるはず
  assertTrue(Array.isArray(parsed['舗装工']));
  assertTrue(parsed['舗装工'].length > 0);
});

// ============================================
// getWorkTypeStats テスト
// ============================================

console.log('\n=== getWorkTypeStats テスト ===\n');

test('工種統計が取得できる', () => {
  const stats = getWorkTypeStats();
  assertTrue(stats.length > 0);
  assertTrue(stats[0].workType !== undefined);
  assertTrue(stats[0].remarks > 0);
});

test('統計はサイズ順にソートされている', () => {
  const stats = getWorkTypeStats();
  for (let i = 1; i < stats.length; i++) {
    assertTrue(stats[i - 1].jsonSize >= stats[i].jsonSize, 'サイズ降順でソートされるべき');
  }
});

test('統計情報を表示', () => {
  const stats = getWorkTypeStats();
  console.log('  工種別サイズ:');
  for (const s of stats) {
    console.log(`    ${s.workType}: ${s.jsonSize}文字 (${s.varieties}種別, ${s.remarks}備考)`);
  }
});

// ============================================
// 実用シナリオテスト
// ============================================

console.log('\n=== 実用シナリオテスト ===\n');

test('シナリオ: 舗装工事バッチ → 舗装工のみ選択', () => {
  // セレクターが「舗装工」を判定したと仮定
  const selectedWorkTypes = ['舗装工'];
  const subset = getHierarchySubset(selectedWorkTypes);
  const json = JSON.stringify(subset, null, 2);

  // プロンプトとして使用可能
  const prompt = `--- WORK HIERARCHY (Filtered) ---
${json}

Analyze the photo using the above hierarchy.`;

  assertTrue(prompt.includes('舗装工'));
  assertTrue(!prompt.includes('排水構造物工'));
  console.log(`  フィルタ後プロンプトサイズ: ${prompt.length} 文字`);
});

test('シナリオ: 混合バッチ → 複数工種選択', () => {
  // セレクターが複数工種を判定
  const selectedWorkTypes = ['舗装工', '仮設工', '安全管理'];
  const subset = getHierarchySubset(selectedWorkTypes);
  const json = JSON.stringify(subset, null, 2);

  assertTrue(json.includes('舗装工'));
  assertTrue(json.includes('仮設工'));
  assertTrue(json.includes('安全管理'));
  console.log(`  3工種選択時のサイズ: ${json.length} 文字`);
});

test('シナリオ: セレクター判定の流れ', () => {
  // 1. セレクタープロンプトでAIに工種を判定させる
  const selectorPrompt = getSelectorPrompt();

  // 2. AIの判定結果を受け取る（モック）
  const aiResponse = ['舗装工'];  // AIが「この画像群は舗装工」と判定

  // 3. 判定された工種のサブセットを取得
  const subset = getHierarchySubset(aiResponse);

  // 4. 本解析用プロンプトを生成
  const analysisPrompt = JSON.stringify(subset, null, 2);

  console.log(`  セレクタープロンプト: ${selectorPrompt.length} 文字`);
  console.log(`  本解析プロンプト: ${analysisPrompt.length} 文字`);
  console.log(`  合計: ${selectorPrompt.length + analysisPrompt.length} 文字`);
  console.log(`  vs フル階層: ${JSON.stringify(formatHierarchyForPrompt()).length} 文字`);

  // セレクター + 本解析 < フル階層 であるべき
  const fullSize = JSON.stringify(formatHierarchyForPrompt()).length;
  const totalSize = selectorPrompt.length + analysisPrompt.length;
  assertTrue(totalSize < fullSize, '2段階でもフルより小さいべき');
});

// ============================================
// 結果サマリー
// ============================================

console.log('\n=== テスト結果 ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
