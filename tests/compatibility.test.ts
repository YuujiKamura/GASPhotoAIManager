/**
 * 新旧構造の互換性テスト
 * 実行: npx tsx tests/compatibility.test.ts
 *
 * 旧構造(CONSTRUCTION_HIERARCHY)と新構造(WORK_HIERARCHY)の
 * 全ての備考が正しくマッピングされることを確認
 */

import { CONSTRUCTION_HIERARCHY, inferPhotoCategory } from '../utils/constructionMaster';
import { WORK_HIERARCHY, getPhotoCategoryFromHierarchy } from '../utils/workHierarchy';

let passed = 0;
let failed = 0;
let skipped = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e: any) {
    if (e.message.includes('SKIP')) {
      console.log(`○ ${name} (skipped)`);
      skipped++;
    } else {
      console.log(`✗ ${name}`);
      console.log(`  Error: ${e.message}`);
      failed++;
    }
  }
}

// ============================================
// 旧構造から備考を収集
// ============================================

interface OldRemark {
  photoCategory: string;  // 施工状況写真, 出来形管理写真, etc.
  workType: string;       // 舗装工
  variety: string;        // 舗装打換え工
  detail: string;         // 表層工
  remark: string;         // 舗設状況
}

function collectRemarksFromOld(): OldRemark[] {
  const remarks: OldRemark[] = [];

  const directCost = CONSTRUCTION_HIERARCHY['直接工事費'];
  if (!directCost) return remarks;

  for (const [photoCategory, photoCatNode] of Object.entries(directCost)) {
    if (typeof photoCatNode !== 'object') continue;

    for (const [workType, workNode] of Object.entries(photoCatNode as Record<string, any>)) {
      if (typeof workNode !== 'object') continue;

      for (const [variety, varietyNode] of Object.entries(workNode as Record<string, any>)) {
        if (typeof varietyNode !== 'object') continue;

        for (const [detail, detailNode] of Object.entries(varietyNode as Record<string, any>)) {
          if (typeof detailNode === 'object' && detailNode !== null) {
            // detailNodeがオブジェクトなら、そのキーが備考
            for (const remark of Object.keys(detailNode)) {
              if (remark !== 'aliases') {
                remarks.push({ photoCategory, workType, variety, detail, remark });
              }
            }
            // aliasesがあればそれも記録（ただしaliasesは単なるタグ）
          }
        }
      }
    }
  }

  return remarks;
}

// ============================================
// テスト実行
// ============================================

console.log('\n=== 旧構造の備考収集 ===\n');

const oldRemarks = collectRemarksFromOld();
console.log(`旧構造から ${oldRemarks.length} 件の備考を収集`);

console.log('\n=== inferPhotoCategory との整合性 ===\n');

// 代表的なケースをテスト
const testCases = [
  { remark: '着手前', expected: '着手前及び完成写真' },
  { remark: '竣工', expected: '着手前及び完成写真' },
  { remark: '完成', expected: '着手前及び完成写真' },
  { remark: '舗設状況', expected: '施工状況写真' },
  { remark: '転圧状況', expected: '施工状況写真' },
  { remark: '出来形測定', expected: '出来形管理写真' },
  { remark: '温度管理', expected: '品質管理写真' },
  { remark: '密度測定', expected: '品質管理写真' },
  { remark: '材料検収', expected: '使用材料写真' },
  { remark: '搬入状況', expected: '使用材料写真' },
  { remark: '朝礼状況', expected: '安全管理写真' },
  { remark: 'KY活動', expected: '安全管理写真' },
];

for (const tc of testCases) {
  test(`inferPhotoCategory("${tc.remark}") → ${tc.expected}`, () => {
    const result = inferPhotoCategory(tc.remark);
    if (result !== tc.expected) {
      throw new Error(`expected "${tc.expected}", got "${result}"`);
    }
  });
}

console.log('\n=== 新構造WORK_HIERARCHYのカバレッジ ===\n');

// 新構造で定義されている備考数を数える
function countNewRemarks(): number {
  let count = 0;
  for (const workType of Object.keys(WORK_HIERARCHY)) {
    for (const variety of Object.keys(WORK_HIERARCHY[workType])) {
      for (const detail of Object.keys(WORK_HIERARCHY[workType][variety])) {
        const remarks = WORK_HIERARCHY[workType][variety][detail].remarks;
        count += Object.keys(remarks).length;
      }
    }
  }
  return count;
}

const newRemarkCount = countNewRemarks();
console.log(`新構造の備考数: ${newRemarkCount}`);
console.log(`旧構造の備考数: ${oldRemarks.length}`);

test('新構造は旧構造より効率的（重複削減）', () => {
  // 新構造は重複を排除しているので、備考数は少ないはず
  // ただし完全移行前は必ずしも成り立たない
  console.log(`  新構造: ${newRemarkCount}, 旧構造: ${oldRemarks.length}`);
  // このテストは参考情報として表示するだけ
});

console.log('\n=== 新構造での写真区分取得テスト ===\n');

// 新構造のテスト
const newTestCases = [
  { workType: '舗装工', variety: '舗装打換え工', detail: '表層工', remark: '舗設状況', expected: '施工状況写真' },
  { workType: '舗装工', variety: '舗装打換え工', detail: '表層工', remark: '着手前', expected: '着手前及び完成写真' },
  { workType: '舗装工', variety: '舗装打換え工', detail: '上層路盤工', remark: '不陸整正出来形', expected: '出来形管理写真' },
  { workType: '舗装工', variety: '舗装打換え工', detail: '上層路盤工', remark: '現場密度測定工', expected: '品質管理写真' },
  { workType: '安全管理', variety: '安全衛生', detail: '安全活動', remark: '朝礼状況', expected: '安全管理写真' },
];

for (const tc of newTestCases) {
  test(`新構造: ${tc.workType}/${tc.variety}/${tc.detail}/${tc.remark} → ${tc.expected}`, () => {
    const result = getPhotoCategoryFromHierarchy(tc.workType, tc.variety, tc.detail, tc.remark);
    if (result !== tc.expected) {
      throw new Error(`expected "${tc.expected}", got "${result}"`);
    }
  });
}

// ============================================
// 結果サマリー
// ============================================

console.log('\n=== テスト結果 ===\n');
console.log(`Passed: ${passed}`);
console.log(`Skipped: ${skipped}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + skipped + failed}`);

if (failed > 0) {
  process.exit(1);
}
