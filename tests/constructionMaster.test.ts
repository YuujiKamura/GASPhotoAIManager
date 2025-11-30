/**
 * constructionMaster.ts のテスト
 * 実行: npx tsx tests/constructionMaster.test.ts
 */

import {
  PHOTO_CATEGORIES,
  inferPhotoCategory,
  CONSTRUCTION_HIERARCHY
} from '../utils/constructionMaster';

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

function assertIncludes<T>(arr: readonly T[], item: T, message?: string) {
  if (!arr.includes(item)) {
    throw new Error(`${message || 'Assertion failed'}: array does not include "${item}"`);
  }
}

// ============================================
// テストケース
// ============================================

console.log('\n=== PHOTO_CATEGORIES テスト ===\n');

test('PHOTO_CATEGORIESは9つの区分を含む', () => {
  assertEqual(PHOTO_CATEGORIES.length, 9);
});

test('正式名称「着手前及び完成写真」が含まれる', () => {
  assertIncludes(PHOTO_CATEGORIES, '着手前及び完成写真');
});

test('正式名称「施工状況写真」が含まれる', () => {
  assertIncludes(PHOTO_CATEGORIES, '施工状況写真');
});

test('正式名称「出来形管理写真」が含まれる', () => {
  assertIncludes(PHOTO_CATEGORIES, '出来形管理写真');
});

test('正式名称「品質管理写真」が含まれる', () => {
  assertIncludes(PHOTO_CATEGORIES, '品質管理写真');
});

test('正式名称「安全管理写真」が含まれる', () => {
  assertIncludes(PHOTO_CATEGORIES, '安全管理写真');
});

test('正式名称「使用材料写真」が含まれる', () => {
  assertIncludes(PHOTO_CATEGORIES, '使用材料写真');
});

console.log('\n=== inferPhotoCategory テスト ===\n');

test('「着手前」を含む備考 → 着手前及び完成写真', () => {
  assertEqual(inferPhotoCategory('着手前'), '着手前及び完成写真');
});

test('「竣工」を含む備考 → 着手前及び完成写真', () => {
  assertEqual(inferPhotoCategory('竣工'), '着手前及び完成写真');
});

test('「完成」を含む備考 → 着手前及び完成写真', () => {
  assertEqual(inferPhotoCategory('完成写真'), '着手前及び完成写真');
});

test('「出来形」を含む備考 → 出来形管理写真', () => {
  assertEqual(inferPhotoCategory('出来形測定'), '出来形管理写真');
});

test('「測定」を含む備考 → 出来形管理写真', () => {
  assertEqual(inferPhotoCategory('幅員測定'), '出来形管理写真');
});

test('「温度」を含む備考 → 品質管理写真', () => {
  assertEqual(inferPhotoCategory('温度管理'), '品質管理写真');
});

test('「密度」を含む備考 → 品質管理写真', () => {
  assertEqual(inferPhotoCategory('現場密度試験'), '品質管理写真');
});

test('「材料」を含む備考 → 使用材料写真', () => {
  assertEqual(inferPhotoCategory('材料検収'), '使用材料写真');
});

test('「搬入」を含む備考 → 使用材料写真', () => {
  assertEqual(inferPhotoCategory('アスファルト搬入'), '使用材料写真');
});

test('「朝礼」を含む備考 → 安全管理写真', () => {
  assertEqual(inferPhotoCategory('朝礼状況'), '安全管理写真');
});

test('「KY」を含む備考 → 安全管理写真', () => {
  assertEqual(inferPhotoCategory('KY活動'), '安全管理写真');
});

test('一般的な備考 → 施工状況写真（デフォルト）', () => {
  assertEqual(inferPhotoCategory('舗設状況'), '施工状況写真');
});

test('転圧状況 → 施工状況写真', () => {
  assertEqual(inferPhotoCategory('転圧状況'), '施工状況写真');
});

console.log('\n=== CONSTRUCTION_HIERARCHY 構造テスト ===\n');

test('CONSTRUCTION_HIERARCHYが存在する', () => {
  if (!CONSTRUCTION_HIERARCHY) {
    throw new Error('CONSTRUCTION_HIERARCHY is undefined');
  }
});

test('直接工事費が最上位にある', () => {
  if (!CONSTRUCTION_HIERARCHY['直接工事費']) {
    throw new Error('直接工事費 not found');
  }
});

test('施工状況写真が存在する', () => {
  if (!CONSTRUCTION_HIERARCHY['直接工事費']['施工状況写真']) {
    throw new Error('施工状況写真 not found');
  }
});

test('舗装工 > 舗装打換え工 が存在する', () => {
  const path = CONSTRUCTION_HIERARCHY['直接工事費']?.['施工状況写真']?.['舗装工']?.['舗装打換え工'];
  if (!path) {
    throw new Error('舗装工/舗装打換え工 not found');
  }
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
