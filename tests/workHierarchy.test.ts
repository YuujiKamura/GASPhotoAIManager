/**
 * workHierarchy.ts のテスト
 * 実行: npx tsx tests/workHierarchy.test.ts
 */

import {
  WORK_HIERARCHY,
  getPhotoCategoryFromHierarchy,
  getRemarksList,
  getWorkTypes,
  getVarieties,
  getDetails
} from '../utils/workHierarchy';

// テストヘルパー
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

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected "${expected}", got "${actual}"`);
  }
}

function assertNotNull<T>(value: T | null, message?: string): asserts value is T {
  if (value === null) {
    throw new Error(`${message || 'Assertion failed'}: value is null`);
  }
}

function assertIncludes<T>(arr: T[], item: T, message?: string) {
  if (!arr.includes(item)) {
    throw new Error(`${message || 'Assertion failed'}: array does not include "${item}"`);
  }
}

// ============================================
// テストケース
// ============================================

console.log('\n=== WORK_HIERARCHY 構造テスト ===\n');

test('WORK_HIERARCHYが存在する', () => {
  if (!WORK_HIERARCHY) {
    throw new Error('WORK_HIERARCHY is undefined');
  }
});

test('舗装工が存在する', () => {
  if (!WORK_HIERARCHY['舗装工']) {
    throw new Error('舗装工 not found');
  }
});

test('舗装工 > 舗装打換え工 > 表層工 が存在する', () => {
  const node = WORK_HIERARCHY['舗装工']?.['舗装打換え工']?.['表層工'];
  if (!node) {
    throw new Error('舗装工/舗装打換え工/表層工 not found');
  }
});

test('表層工にremarksがある', () => {
  const node = WORK_HIERARCHY['舗装工']?.['舗装打換え工']?.['表層工'];
  if (!node?.remarks) {
    throw new Error('remarks not found');
  }
});

console.log('\n=== getPhotoCategoryFromHierarchy テスト ===\n');

test('舗設状況 → 施工状況写真', () => {
  const result = getPhotoCategoryFromHierarchy('舗装工', '舗装打換え工', '表層工', '舗設状況');
  assertEqual(result, '施工状況写真');
});

test('着手前 → 着手前及び完成写真', () => {
  const result = getPhotoCategoryFromHierarchy('舗装工', '舗装打換え工', '表層工', '着手前');
  assertEqual(result, '着手前及び完成写真');
});

test('温度測定工 → 品質管理写真', () => {
  const result = getPhotoCategoryFromHierarchy('舗装工', '舗装打換え工', '表層工', '温度測定工');
  assertEqual(result, '品質管理写真');
});

test('材料検収状況 → 使用材料写真', () => {
  const result = getPhotoCategoryFromHierarchy('舗装工', '舗装打換え工', '表層工', '材料検収状況');
  assertEqual(result, '使用材料写真');
});

test('不陸整正出来形 → 出来形管理写真', () => {
  const result = getPhotoCategoryFromHierarchy('舗装工', '舗装打換え工', '上層路盤工', '不陸整正出来形');
  assertEqual(result, '出来形管理写真');
});

test('現場密度測定工 → 品質管理写真', () => {
  const result = getPhotoCategoryFromHierarchy('舗装工', '舗装打換え工', '上層路盤工', '現場密度測定工');
  assertEqual(result, '品質管理写真');
});

test('朝礼状況 → 安全管理写真', () => {
  const result = getPhotoCategoryFromHierarchy('安全管理', '安全衛生', '安全活動', '朝礼状況');
  assertEqual(result, '安全管理写真');
});

test('エイリアス検索: 温度管理 → 品質管理写真', () => {
  const result = getPhotoCategoryFromHierarchy('舗装工', '舗装打換え工', '表層工', '温度管理');
  assertEqual(result, '品質管理写真');
});

test('エイリアス検索: 密度測定 → 品質管理写真', () => {
  const result = getPhotoCategoryFromHierarchy('舗装工', '舗装打換え工', '上層路盤工', '密度測定');
  assertEqual(result, '品質管理写真');
});

test('存在しない工種 → null', () => {
  const result = getPhotoCategoryFromHierarchy('存在しない工種', '種別', '細別', '備考');
  assertEqual(result, null);
});

console.log('\n=== ヘルパー関数テスト ===\n');

test('getWorkTypes: 工種一覧を取得', () => {
  const types = getWorkTypes();
  assertIncludes(types, '舗装工');
  assertIncludes(types, '排水構造物工');
  assertIncludes(types, '仮設工');
});

test('getVarieties: 種別一覧を取得', () => {
  const varieties = getVarieties('舗装工');
  assertIncludes(varieties, '舗装打換え工');
  assertIncludes(varieties, '未舗装部舗装工');
});

test('getDetails: 細別一覧を取得', () => {
  const details = getDetails('舗装工', '舗装打換え工');
  assertIncludes(details, '表層工');
  assertIncludes(details, '上層路盤工');
  assertIncludes(details, '舗装版切断');
});

test('getRemarksList: 備考一覧を取得', () => {
  const remarks = getRemarksList('舗装工', '舗装打換え工', '表層工');
  assertIncludes(remarks, '舗設状況');
  assertIncludes(remarks, '着手前');
  assertIncludes(remarks, '温度測定工');
});

console.log('\n=== 写真区分の重複テスト ===\n');

test('完了は複数の写真区分を持つ', () => {
  const node = WORK_HIERARCHY['舗装工']?.['舗装打換え工']?.['表層工'];
  const remarkDef = node?.remarks['完了'];
  if (!remarkDef) throw new Error('完了 not found');
  if (remarkDef.categories.length < 2) {
    throw new Error(`Expected multiple categories, got ${remarkDef.categories.length}`);
  }
  assertIncludes(remarkDef.categories, '着手前及び完成写真');
  assertIncludes(remarkDef.categories, '施工状況写真');
});

test('誘導員配置状況は施工状況と安全管理の両方', () => {
  const node = WORK_HIERARCHY['仮設工']?.['交通管理工']?.['交通誘導員配置'];
  const remarkDef = node?.remarks['誘導員配置状況'];
  if (!remarkDef) throw new Error('誘導員配置状況 not found');
  assertIncludes(remarkDef.categories, '施工状況写真');
  assertIncludes(remarkDef.categories, '安全管理写真');
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
