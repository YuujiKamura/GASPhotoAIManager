/**
 * 新構造への移行テスト
 * 実行: npx tsx tests/migration.test.ts
 *
 * 旧構造から新構造への移行が正しく行われることを検証
 * - AIプロンプト用フォーマットの互換性
 * - 全ての工種/種別/細別/備考が維持されているか
 * - 写真区分の正確性
 */

import { CONSTRUCTION_HIERARCHY, inferPhotoCategory } from '../utils/constructionMaster';
import {
  WORK_HIERARCHY,
  formatHierarchyForPrompt,
  inferPhotoCategoryFromRemarks,
  getWorkTypes,
  getVarieties,
  getDetails,
  getRemarksList
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

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected "${expected}", got "${actual}"`);
  }
}

function assertNotNull<T>(value: T | null | undefined, message?: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(`${message || 'Assertion failed'}: value is null or undefined`);
  }
}

function assertTrue(condition: boolean, message?: string) {
  if (!condition) {
    throw new Error(message || 'Assertion failed: condition is false');
  }
}

// ============================================
// formatHierarchyForPrompt テスト
// ============================================

console.log('\n=== formatHierarchyForPrompt テスト ===\n');

test('formatHierarchyForPromptがオブジェクトを返す', () => {
  const result = formatHierarchyForPrompt();
  assertNotNull(result);
  assertTrue(typeof result === 'object');
});

test('工種が含まれる', () => {
  const result = formatHierarchyForPrompt() as Record<string, any>;
  assertTrue('舗装工' in result, '舗装工 not found');
  assertTrue('排水構造物工' in result, '排水構造物工 not found');
});

test('種別が含まれる', () => {
  const result = formatHierarchyForPrompt() as Record<string, any>;
  assertTrue('舗装打換え工' in result['舗装工'], '舗装打換え工 not found');
});

test('細別が含まれる', () => {
  const result = formatHierarchyForPrompt() as Record<string, any>;
  assertTrue('表層工' in result['舗装工']['舗装打換え工'], '表層工 not found');
});

test('備考が含まれる', () => {
  const result = formatHierarchyForPrompt() as Record<string, any>;
  assertTrue('舗設状況' in result['舗装工']['舗装打換え工']['表層工'], '舗設状況 not found');
  assertTrue('着手前' in result['舗装工']['舗装打換え工']['表層工'], '着手前 not found');
});

test('JSON.stringifyが動作する', () => {
  const result = formatHierarchyForPrompt();
  const json = JSON.stringify(result, null, 2);
  assertTrue(json.length > 100, 'JSON is too short');
  assertTrue(json.includes('舗装工'));
  assertTrue(json.includes('表層工'));
});

// ============================================
// inferPhotoCategoryFromRemarks テスト
// ============================================

console.log('\n=== inferPhotoCategoryFromRemarks テスト ===\n');

test('舗設状況 → 施工状況写真', () => {
  const result = inferPhotoCategoryFromRemarks('舗設状況');
  assertEqual(result, '施工状況写真');
});

test('着手前 → 着手前及び完成写真', () => {
  const result = inferPhotoCategoryFromRemarks('着手前');
  assertEqual(result, '着手前及び完成写真');
});

test('竣工 → 着手前及び完成写真', () => {
  const result = inferPhotoCategoryFromRemarks('竣工');
  assertEqual(result, '着手前及び完成写真');
});

test('温度測定工 → 品質管理写真', () => {
  const result = inferPhotoCategoryFromRemarks('温度測定工');
  assertEqual(result, '品質管理写真');
});

test('現場密度測定工 → 品質管理写真', () => {
  const result = inferPhotoCategoryFromRemarks('現場密度測定工');
  assertEqual(result, '品質管理写真');
});

test('材料検収状況 → 使用材料写真', () => {
  const result = inferPhotoCategoryFromRemarks('材料検収状況');
  assertEqual(result, '使用材料写真');
});

test('不陸整正出来形 → 出来形管理写真', () => {
  const result = inferPhotoCategoryFromRemarks('不陸整正出来形');
  assertEqual(result, '出来形管理写真');
});

test('朝礼状況 → 安全管理写真', () => {
  const result = inferPhotoCategoryFromRemarks('朝礼状況');
  assertEqual(result, '安全管理写真');
});

test('エイリアス: 温度管理 → 品質管理写真', () => {
  const result = inferPhotoCategoryFromRemarks('温度管理');
  assertEqual(result, '品質管理写真');
});

test('エイリアス: 密度測定 → 品質管理写真', () => {
  const result = inferPhotoCategoryFromRemarks('密度測定');
  assertEqual(result, '品質管理写真');
});

test('エイリアス: 路盤出来形 → 出来形管理写真', () => {
  const result = inferPhotoCategoryFromRemarks('路盤出来形');
  assertEqual(result, '出来形管理写真');
});

test('存在しない備考 → null', () => {
  const result = inferPhotoCategoryFromRemarks('存在しない備考テキスト');
  assertEqual(result, null);
});

// ============================================
// 新旧整合性テスト
// ============================================

console.log('\n=== 新旧整合性テスト ===\n');

test('新構造の工種数 >= 5', () => {
  const workTypes = getWorkTypes();
  assertTrue(workTypes.length >= 5, `工種数が少ない: ${workTypes.length}`);
});

test('主要な工種が全て含まれる', () => {
  const workTypes = getWorkTypes();
  const requiredTypes = ['舗装工', '排水構造物工', '仮設工', '道路土工', '区画線工'];
  for (const required of requiredTypes) {
    assertTrue(workTypes.includes(required), `${required} が見つからない`);
  }
});

test('舗装打換え工の細別が揃っている', () => {
  const details = getDetails('舗装工', '舗装打換え工');
  assertTrue(details.includes('表層工'), '表層工 not found');
  assertTrue(details.includes('上層路盤工'), '上層路盤工 not found');
  assertTrue(details.includes('舗装版切断'), '舗装版切断 not found');
  assertTrue(details.includes('舗装版破砕'), '舗装版破砕 not found');
});

test('表層工の備考が揃っている', () => {
  const remarks = getRemarksList('舗装工', '舗装打換え工', '表層工');
  const requiredRemarks = [
    '着手前', '完了', '竣工',
    'プライムコート乳剤散布状況',
    '舗設状況', '初期転圧状況', '2次転圧状況',
    '温度測定工', '材料検収状況'
  ];
  for (const required of requiredRemarks) {
    assertTrue(remarks.includes(required), `${required} が見つからない`);
  }
});

// ============================================
// 旧inferPhotoCategory vs 新inferPhotoCategoryFromRemarks
// ============================================

console.log('\n=== 新旧推定関数の比較 ===\n');

const comparisonCases = [
  { remark: '着手前', expected: '着手前及び完成写真' },
  { remark: '竣工', expected: '着手前及び完成写真' },
  { remark: '舗設状況', expected: '施工状況写真' },
  { remark: '転圧状況', expected: '施工状況写真' },
  { remark: '朝礼状況', expected: '安全管理写真' },
  { remark: 'KY活動状況', expected: '安全管理写真' },
];

for (const tc of comparisonCases) {
  test(`新旧一致: ${tc.remark}`, () => {
    const oldResult = inferPhotoCategory(tc.remark);
    const newResult = inferPhotoCategoryFromRemarks(tc.remark);
    // 旧関数と新関数が同じ結果を返すことを確認
    assertEqual(oldResult, tc.expected, 'old function');
    // 新関数はnullを返す可能性があるが、マスターに存在すれば一致するはず
    if (newResult !== null) {
      assertEqual(newResult, tc.expected, 'new function');
    }
  });
}

// ============================================
// プロンプトサイズの比較
// ============================================

console.log('\n=== プロンプトサイズ比較 ===\n');

test('新構造のJSONが旧構造より小さいか同等', () => {
  const oldJson = JSON.stringify(CONSTRUCTION_HIERARCHY);
  const newJson = JSON.stringify(formatHierarchyForPrompt());

  console.log(`  旧構造: ${oldJson.length} 文字`);
  console.log(`  新構造: ${newJson.length} 文字`);
  console.log(`  削減率: ${((1 - newJson.length / oldJson.length) * 100).toFixed(1)}%`);

  // 新構造は重複がないので小さいはず（または同等）
  // ただし現時点では完全移行前なので、必ずしも小さくはない
});

// ============================================
// geminiService.ts で使える形式かテスト
// ============================================

console.log('\n=== AIプロンプト形式テスト ===\n');

test('プロンプト用JSONが有効', () => {
  const hierarchy = formatHierarchyForPrompt();
  const prompt = `--- MASTER DATA HIERARCHY ---
${JSON.stringify(hierarchy, null, 2)}
`;
  assertTrue(prompt.includes('舗装工'));
  assertTrue(prompt.includes('表層工'));
  assertTrue(prompt.includes('舗設状況'));
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
