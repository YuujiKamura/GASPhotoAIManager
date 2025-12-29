/**
 * 生成されたExcelファイルを分析するスクリプト
 */
import ExcelJS from 'exceljs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function analyzeExcel(filePath: string) {
  console.log(`\n📊 分析: ${path.basename(filePath)}`);
  console.log('='.repeat(50));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  workbook.eachSheet((sheet, sheetId) => {
    console.log(`\n📄 シート ${sheetId}: "${sheet.name}"`);

    // 列幅
    console.log('\n  列幅:');
    sheet.columns.forEach((col, idx) => {
      if (col.width) {
        const widthPx = col.width * 7.1 + 5;
        console.log(`    列${idx + 1}: ${col.width?.toFixed(1)} 単位 ≈ ${widthPx.toFixed(0)}px`);
      }
    });

    // 行高さ（最初の36行）
    console.log('\n  行高さ (pt):');
    const rowHeights: number[] = [];
    for (let r = 1; r <= Math.min(36, sheet.rowCount); r++) {
      const row = sheet.getRow(r);
      rowHeights.push(row.height || 15);
    }
    // ユニークな高さを表示
    const uniqueHeights = [...new Set(rowHeights)];
    console.log(`    高さの種類: ${uniqueHeights.join(', ')} pt`);
    console.log(`    1ブロック (12行) の合計高さ: ${rowHeights.slice(0, 12).reduce((a, b) => a + b, 0)} pt`);

    // マージされたセル
    console.log('\n  マージされたセル:');
    const merges = (sheet as any)._merges || {};
    const mergeList = Object.keys(merges);
    if (mergeList.length > 0) {
      mergeList.slice(0, 6).forEach(merge => {
        console.log(`    ${merge}`);
      });
      if (mergeList.length > 6) {
        console.log(`    ... 他 ${mergeList.length - 6} 件`);
      }
    }

    // 画像
    console.log('\n  画像:');
    const images = sheet.getImages();
    images.forEach((img, idx) => {
      const range = img.range;
      console.log(`    画像${idx + 1}:`);
      console.log(`      位置: tl(${range.tl.col.toFixed(2)}, ${range.tl.row.toFixed(2)})`);
      if (range.br) {
        console.log(`      範囲: br(${range.br.col.toFixed(2)}, ${range.br.row.toFixed(2)})`);
      }
      if ((range as any).ext) {
        const ext = (range as any).ext;
        console.log(`      サイズ: ${ext.width}x${ext.height} px`);
      }
      console.log(`      editAs: ${(range as any).editAs || 'undefined'}`);
    });
  });
}

async function main() {
  const testOutput = path.join(__dirname, '..', 'test-output');

  await analyzeExcel(path.join(testOutput, 'excel-demo-3up.xlsx'));
  await analyzeExcel(path.join(testOutput, 'excel-demo-2up.xlsx'));

  // PDF寸法との比較
  console.log('\n\n📐 PDF寸法（参考）:');
  console.log('='.repeat(50));
  console.log('  A4: 595.28 x 841.89 pt');
  console.log('  マージン: 20pt, ヘッダー: 40pt');
  console.log('  利用可能高さ: 761.89pt');
  console.log('  3枚貼り1ブロック: 253.96pt');
  console.log('  写真幅: 249.88pt (45%)');
  console.log('  写真高さ: 243.96pt (GAP引く)');
  console.log('  CALS写真(1280x960)描画サイズ: 249.88 x 187.4 pt');
}

main().catch(console.error);
