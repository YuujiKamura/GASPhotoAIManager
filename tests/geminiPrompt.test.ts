/**
 * geminiService.ts で使用するプロンプトのテスト
 * 実行: npx tsx tests/geminiPrompt.test.ts
 *
 * 新構造がAIプロンプトで正しく使用できることを検証
 */

import { formatHierarchyForPrompt } from '../utils/workHierarchy';

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
    throw new Error(message || 'Assertion failed: condition is false');
  }
}

function assertNotNull<T>(value: T | null | undefined, message?: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(`${message || 'Assertion failed'}: value is null or undefined`);
  }
}

// ============================================
// プロンプト生成テスト
// ============================================

console.log('\n=== プロンプト生成テスト ===\n');

test('formatHierarchyForPromptが有効なオブジェクトを返す', () => {
  const result = formatHierarchyForPrompt();
  assertNotNull(result);
  assertTrue(typeof result === 'object');
});

test('JSONへのシリアライズが可能', () => {
  const result = formatHierarchyForPrompt();
  const json = JSON.stringify(result, null, 2);
  assertTrue(json.length > 0);
});

test('プロンプトテンプレートに埋め込み可能', () => {
  const hierarchy = formatHierarchyForPrompt();
  const prompt = `--- MASTER DATA HIERARCHY ---
${JSON.stringify(hierarchy, null, 2)}

--- HIERARCHY MAPPING RULES ---
Use the above hierarchy...`;

  assertTrue(prompt.includes('MASTER DATA HIERARCHY'));
  assertTrue(prompt.includes('舗装工'));
});

// ============================================
// 階層構造テスト
// ============================================

console.log('\n=== 階層構造テスト ===\n');

test('4階層構造になっている（工種→種別→細別→備考）', () => {
  const result = formatHierarchyForPrompt() as any;

  // Level 1: 工種
  assertTrue('舗装工' in result, '工種が見つからない');

  // Level 2: 種別
  assertTrue('舗装打換え工' in result['舗装工'], '種別が見つからない');

  // Level 3: 細別
  assertTrue('表層工' in result['舗装工']['舗装打換え工'], '細別が見つからない');

  // Level 4: 備考
  assertTrue('舗設状況' in result['舗装工']['舗装打換え工']['表層工'], '備考が見つからない');
});

test('備考は空オブジェクトを値として持つ', () => {
  const result = formatHierarchyForPrompt() as any;
  const remark = result['舗装工']['舗装打換え工']['表層工']['舗設状況'];
  assertTrue(typeof remark === 'object');
  assertTrue(Object.keys(remark).length === 0, '備考の値は空オブジェクトであるべき');
});

// ============================================
// 主要パスのテスト
// ============================================

console.log('\n=== 主要パステスト ===\n');

const criticalPaths = [
  { path: ['舗装工', '舗装打換え工', '表層工', '舗設状況'], desc: '舗設状況' },
  { path: ['舗装工', '舗装打換え工', '表層工', '着手前'], desc: '着手前' },
  { path: ['舗装工', '舗装打換え工', '表層工', '完了'], desc: '完了' },
  { path: ['舗装工', '舗装打換え工', '上層路盤工', '転圧状況'], desc: '転圧状況' },
  { path: ['舗装工', '舗装打換え工', '上層路盤工', '不陸整正出来形'], desc: '出来形' },
  { path: ['舗装工', '舗装打換え工', '上層路盤工', '現場密度測定工'], desc: '密度測定' },
  { path: ['仮設工', '交通管理工', '交通誘導員配置', '誘導員配置状況'], desc: '誘導員配置' },
  { path: ['安全管理', '安全衛生', '安全活動', '朝礼状況'], desc: '朝礼' },
  { path: ['排水構造物工', '作業土工', '床掘り', '掘削状況'], desc: '掘削' },
];

for (const { path, desc } of criticalPaths) {
  test(`パス存在: ${desc}`, () => {
    let current: any = formatHierarchyForPrompt();
    for (const key of path) {
      assertTrue(key in current, `${key} not found in path`);
      current = current[key];
    }
  });
}

// ============================================
// サイズ効率テスト
// ============================================

console.log('\n=== サイズ効率テスト ===\n');

test('JSONサイズが適切（10KB未満）', () => {
  const json = JSON.stringify(formatHierarchyForPrompt());
  const sizeKB = json.length / 1024;
  console.log(`  JSONサイズ: ${sizeKB.toFixed(2)}KB`);
  assertTrue(sizeKB < 10, `JSONが大きすぎる: ${sizeKB.toFixed(2)}KB`);
});

test('プロンプト全体が適切なサイズ', () => {
  const hierarchy = formatHierarchyForPrompt();
  const prompt = `--- MASTER DATA HIERARCHY ---
${JSON.stringify(hierarchy, null, 2)}

Additional instructions here...`;

  const sizeKB = prompt.length / 1024;
  console.log(`  プロンプトサイズ: ${sizeKB.toFixed(2)}KB`);
  assertTrue(sizeKB < 15, `プロンプトが大きすぎる: ${sizeKB.toFixed(2)}KB`);
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
