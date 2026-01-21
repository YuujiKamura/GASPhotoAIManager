/**
 * プロンプトルールのユニットテスト
 * AI創作を防ぐためのルールが正しく機能するかテスト
 *
 * Usage: npx tsx scripts/test-prompt-rules.ts [--key YOUR_API_KEY]
 */

import { detectUnknownTerms, extractAllValidValues } from '../cli/adapters/masterAdapter.js';

// テストケース定義
interface TestCase {
  name: string;
  input: {
    workType: string;
    variety: string;
    detail: string;
    remarks: string;
  };
  expectWarnings: boolean;
  expectedWarningPatterns?: RegExp[];
}

const TEST_CASES: TestCase[] = [
  // 正常系：マスタに存在する値
  {
    name: '正常: 標準的な舗装工の分類',
    input: {
      workType: '舗装工',
      variety: '舗装打換え工',
      detail: '表層工',
      remarks: 'アスファルト混合物温度測定'
    },
    expectWarnings: false
  },
  {
    name: '正常: 状況写真の備考',
    input: {
      workType: '舗装工',
      variety: '舗装打換え工',
      detail: '上層路盤工',
      remarks: '転圧状況'
    },
    expectWarnings: false
  },
  {
    name: '正常: 出来形の備考',
    input: {
      workType: '舗装工',
      variety: '舗装打換え工',
      detail: '表層工',
      remarks: '舗装厚出来形確認 t=50mm'
    },
    expectWarnings: false
  },

  // 異常系：AI創作パターン
  {
    name: '異常: 備考に「〜工」が含まれる（温度測定工）',
    input: {
      workType: '舗装工',
      variety: '舗装打換え工',
      detail: '表層工',
      remarks: '温度測定工'
    },
    expectWarnings: true,
    expectedWarningPatterns: [/「〜工」が含まれ/]
  },
  {
    name: '異常: 備考に「〜工」が含まれる（密度管理工）',
    input: {
      workType: '舗装工',
      variety: '舗装打換え工',
      detail: '上層路盤工',
      remarks: '密度管理工'
    },
    expectWarnings: true,
    expectedWarningPatterns: [/「〜工」が含まれ/]
  },
  {
    name: '異常: 存在しない工種',
    input: {
      workType: '温度管理工',
      variety: '',
      detail: '',
      remarks: ''
    },
    expectWarnings: true,
    expectedWarningPatterns: [/マスタにありません/]
  },
  {
    name: '異常: 存在しない種別',
    input: {
      workType: '舗装工',
      variety: '温度測定工',
      detail: '',
      remarks: ''
    },
    expectWarnings: true,
    expectedWarningPatterns: [/マスタにありません/]
  },

  // エッジケース
  {
    name: 'エッジ: 空白は許容',
    input: {
      workType: '',
      variety: '',
      detail: '',
      remarks: ''
    },
    expectWarnings: false
  },
  {
    name: 'エッジ: 施工状況は許容（「施工」を含む）',
    input: {
      workType: '舗装工',
      variety: '舗装打換え工',
      detail: '表層工',
      remarks: '施工状況'
    },
    expectWarnings: false
  },
  {
    name: 'エッジ: 着手前工事は許容（「着手」を含む）',
    input: {
      workType: '舗装工',
      variety: '舗装打換え工',
      detail: '表層工',
      remarks: '着手前'
    },
    expectWarnings: false
  }
];

function runTests(): void {
  console.log('=== プロンプトルール ユニットテスト ===\n');

  // マスタの有効値を表示
  const { workTypes, varieties, details, remarks } = extractAllValidValues();
  console.log(`マスタ統計:`);
  console.log(`  工種: ${workTypes.size}件`);
  console.log(`  種別: ${varieties.size}件`);
  console.log(`  細別: ${details.size}件`);
  console.log(`  備考: ${remarks.size}件`);
  console.log('');

  let passed = 0;
  let failed = 0;

  for (const testCase of TEST_CASES) {
    const warnings = detectUnknownTerms(
      testCase.input.workType,
      testCase.input.variety,
      testCase.input.detail,
      testCase.input.remarks
    );

    const hasWarnings = warnings.length > 0;
    const testPassed = hasWarnings === testCase.expectWarnings;

    // パターンマッチングチェック
    let patternMatch = true;
    if (testCase.expectedWarningPatterns && hasWarnings) {
      for (const pattern of testCase.expectedWarningPatterns) {
        const found = warnings.some(w => pattern.test(w));
        if (!found) {
          patternMatch = false;
          break;
        }
      }
    }

    const finalPass = testPassed && patternMatch;

    if (finalPass) {
      console.log(`✅ PASS: ${testCase.name}`);
      passed++;
    } else {
      console.log(`❌ FAIL: ${testCase.name}`);
      console.log(`   期待: warnings=${testCase.expectWarnings}`);
      console.log(`   実際: warnings=${hasWarnings}`);
      if (warnings.length > 0) {
        console.log(`   警告: ${warnings.join(', ')}`);
      }
      if (!patternMatch) {
        console.log(`   パターン不一致: ${testCase.expectedWarningPatterns?.map(p => p.toString()).join(', ')}`);
      }
      failed++;
    }
  }

  console.log('\n=== 結果 ===');
  console.log(`合計: ${TEST_CASES.length}件`);
  console.log(`成功: ${passed}件`);
  console.log(`失敗: ${failed}件`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
