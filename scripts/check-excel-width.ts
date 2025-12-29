/**
 * Excel列幅の変換を検証
 */
import ExcelJS from 'exceljs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 様々な変換式で計算
function calcWidthVariants(units: number) {
  return {
    units,
    // 現在の計算式
    current: units * 7.1,
    // Excel公式に近い式: (units * 7 + 5)
    formula1: units * 7 + 5,
    // 別の式: (units + 0.71) * 7
    formula2: (units + 0.71) * 7,
    // Microsoft式: truncate((units * 7 + 5) / 7) * 7 + 5 ... 複雑
    // シンプルに: units * 8
    formula3: units * 8,
  };
}

async function main() {
  console.log('📐 Excel列幅変換の検証\n');
  console.log('='.repeat(60));

  // 設定値で計算
  const widths = [47, 60, 8, 44, 35];

  console.log('\n列幅の変換比較 (px):');
  console.log('-'.repeat(60));
  console.log('単位\t現在(7.1)\t+5式\t\t+0.71式\t\t*8式');
  console.log('-'.repeat(60));

  for (const w of widths) {
    const v = calcWidthVariants(w);
    console.log(`${v.units}\t${v.current.toFixed(0)}\t\t${v.formula1}\t\t${v.formula2.toFixed(0)}\t\t${v.formula3}`);
  }

  // 実際のファイルから読み取った値との比較
  console.log('\n\n📊 生成ファイルの列幅設定:');
  console.log('='.repeat(60));

  const testOutput = path.join(__dirname, '..', 'test-output');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.join(testOutput, 'excel-demo-3up.xlsx'));

  const sheet = workbook.getWorksheet(1);
  if (sheet) {
    sheet.columns.forEach((col, idx) => {
      if (col.width) {
        console.log(`列${idx + 1}: width=${col.width}`);
        // ExcelJSの内部値を確認
        console.log(`  → ExcelJS内部: ${JSON.stringify(col)}`);
      }
    });
  }

  // 印刷幅との関係
  console.log('\n\n📄 A4印刷との関係:');
  console.log('='.repeat(60));
  console.log('A4幅: 210mm = 595.28pt = 793.7px (96dpi)');
  console.log('マージン20pt両側: 555.28pt = 740.4px');
  console.log('');

  const totalWidth_current = (47 + 8 + 44) * 7.1;
  const totalWidth_formula1 = (47 + 8 + 44) * 7 + 5 * 3;
  console.log(`3列合計 (現在式): ${totalWidth_current.toFixed(0)}px`);
  console.log(`3列合計 (+5式): ${totalWidth_formula1}px`);
  console.log(`A4利用可能幅: 740px`);
  console.log(`差分 (現在): ${(740 - totalWidth_current).toFixed(0)}px`);
  console.log(`差分 (+5式): ${740 - totalWidth_formula1}px`);
}

main().catch(console.error);
