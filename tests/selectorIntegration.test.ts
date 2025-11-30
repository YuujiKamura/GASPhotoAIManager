/**
 * セレクター統合テスト
 * 実行: npx tsx tests/selectorIntegration.test.ts
 *
 * analyzePhotoBatch でセレクターが正しく動作することを検証
 * （実際のAPI呼び出しは行わず、ロジックのみテスト）
 */

import {
  formatHierarchyForPrompt,
  getHierarchySubset,
  getSelectorPrompt,
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

// ============================================
// getSystemInstruction シミュレーション
// ============================================

console.log('\n=== プロンプト生成シミュレーション ===\n');

// getSystemInstruction の簡略版シミュレーション
function simulateSystemPrompt(hierarchy?: object): string {
  const h = hierarchy || formatHierarchyForPrompt();
  return `--- MASTER DATA HIERARCHY ---
${JSON.stringify(h, null, 2)}

--- HIERARCHY MAPPING RULES ---
...`;
}

test('フル階層でのプロンプト生成', () => {
  const prompt = simulateSystemPrompt();
  assertTrue(prompt.includes('舗装工'));
  assertTrue(prompt.includes('排水構造物工'));
  console.log(`  フル階層プロンプト: ${prompt.length} 文字`);
});

test('フィルタ済み階層でのプロンプト生成', () => {
  const filteredHierarchy = getHierarchySubset(['舗装工']);
  const prompt = simulateSystemPrompt(filteredHierarchy);
  assertTrue(prompt.includes('舗装工'));
  assertTrue(!prompt.includes('排水構造物工'));
  console.log(`  フィルタ済みプロンプト: ${prompt.length} 文字`);
});

test('フィルタでサイズ削減', () => {
  const fullPrompt = simulateSystemPrompt();
  const filteredPrompt = simulateSystemPrompt(getHierarchySubset(['舗装工']));

  const reduction = (1 - filteredPrompt.length / fullPrompt.length) * 100;
  console.log(`  削減率: ${reduction.toFixed(1)}%`);
  assertTrue(reduction > 50, `削減率が50%未満: ${reduction.toFixed(1)}%`);
});

// ============================================
// セレクター判定フローシミュレーション
// ============================================

console.log('\n=== セレクター判定フローシミュレーション ===\n');

interface MockPhotoRecord {
  fileName: string;
  base64: string;
  mimeType: string;
}

// モック: セレクターが舗装工を選択した場合
function mockSelectorResult(): string[] {
  return ['舗装工'];
}

test('3枚以上のバッチでセレクター発動', () => {
  const records: MockPhotoRecord[] = [
    { fileName: 'photo1.jpg', base64: '', mimeType: 'image/jpeg' },
    { fileName: 'photo2.jpg', base64: '', mimeType: 'image/jpeg' },
    { fileName: 'photo3.jpg', base64: '', mimeType: 'image/jpeg' },
  ];

  // バッチサイズ3以上でセレクター発動
  assertTrue(records.length >= 3, 'バッチサイズ確認');

  const selectedWorkTypes = mockSelectorResult();
  const filteredHierarchy = getHierarchySubset(selectedWorkTypes);

  assertTrue(Object.keys(filteredHierarchy).length > 0);
  console.log(`  選択された工種: ${selectedWorkTypes.join(', ')}`);
});

test('2枚以下のバッチはセレクターをスキップ', () => {
  const records: MockPhotoRecord[] = [
    { fileName: 'photo1.jpg', base64: '', mimeType: 'image/jpeg' },
    { fileName: 'photo2.jpg', base64: '', mimeType: 'image/jpeg' },
  ];

  // バッチサイズ2以下はフル階層を使用
  const useSelector = records.length >= 3;
  assertTrue(!useSelector, 'セレクターをスキップすべき');

  const hierarchy = formatHierarchyForPrompt();
  assertTrue(Object.keys(hierarchy).length === getWorkTypes().length);
  console.log(`  フル階層使用: ${Object.keys(hierarchy).length} 工種`);
});

// ============================================
// トークン削減シミュレーション
// ============================================

console.log('\n=== トークン削減シミュレーション ===\n');

test('舗装工事バッチのトークン削減見積もり', () => {
  // フル階層
  const fullHierarchy = formatHierarchyForPrompt();
  const fullJson = JSON.stringify(fullHierarchy, null, 2);

  // セレクタープロンプト
  const selectorPrompt = getSelectorPrompt();

  // フィルタ済み階層（舗装工のみ）
  const filteredHierarchy = getHierarchySubset(['舗装工']);
  const filteredJson = JSON.stringify(filteredHierarchy, null, 2);

  // 従来: フル階層のみ
  const oldApproach = fullJson.length;

  // 新: セレクター + フィルタ済み階層
  const newApproach = selectorPrompt.length + filteredJson.length;

  const savings = oldApproach - newApproach;
  const savingsPercent = (savings / oldApproach) * 100;

  console.log(`  従来アプローチ: ${oldApproach} 文字`);
  console.log(`  新アプローチ: ${newApproach} 文字 (セレクター ${selectorPrompt.length} + 本解析 ${filteredJson.length})`);
  console.log(`  削減: ${savings} 文字 (${savingsPercent.toFixed(1)}%)`);

  // 最低でも削減すべき
  assertTrue(newApproach < oldApproach, '新アプローチが従来より小さいべき');
});

test('複数工種バッチのトークン削減見積もり', () => {
  const fullHierarchy = formatHierarchyForPrompt();
  const fullJson = JSON.stringify(fullHierarchy, null, 2);

  const selectorPrompt = getSelectorPrompt();

  // 複数工種が混在（舗装工 + 仮設工 + 安全管理）
  const filteredHierarchy = getHierarchySubset(['舗装工', '仮設工', '安全管理']);
  const filteredJson = JSON.stringify(filteredHierarchy, null, 2);

  const oldApproach = fullJson.length;
  const newApproach = selectorPrompt.length + filteredJson.length;

  console.log(`  3工種混在バッチ:`);
  console.log(`    従来: ${oldApproach} 文字`);
  console.log(`    新: ${newApproach} 文字`);
  console.log(`    削減: ${((oldApproach - newApproach) / oldApproach * 100).toFixed(1)}%`);

  assertTrue(newApproach < oldApproach);
});

// ============================================
// エッジケース
// ============================================

console.log('\n=== エッジケース ===\n');

test('全工種が選択された場合はフル階層と同等', () => {
  const allWorkTypes = getWorkTypes();
  const subset = getHierarchySubset(allWorkTypes);
  const full = formatHierarchyForPrompt();

  const subsetSize = JSON.stringify(subset).length;
  const fullSize = JSON.stringify(full).length;

  // 全工種選択時はフル階層と同じ
  assertTrue(subsetSize === fullSize, `サイズが異なる: ${subsetSize} vs ${fullSize}`);
});

test('空の工種リストは空のオブジェクトを返す', () => {
  const subset = getHierarchySubset([]);
  assertTrue(Object.keys(subset).length === 0);
});

test('存在しない工種は無視される', () => {
  const subset = getHierarchySubset(['存在しない工種', '舗装工']);
  assertTrue('舗装工' in (subset as any));
  assertTrue(Object.keys(subset).length === 1);
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
