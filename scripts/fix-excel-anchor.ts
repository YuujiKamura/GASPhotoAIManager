/**
 * ExcelJSで生成されたXLSXの画像アンカーを修正
 * oneCellAnchor → absoluteAnchor に変換
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// EMU変換定数
const EMU_PER_PIXEL = 9525;  // 1px = 9525 EMU (at 96dpi)
const EMU_PER_POINT = 12700; // 1pt = 12700 EMU

interface ColumnWidth {
  col: number;
  width: number; // Excel単位
}

interface RowHeight {
  row: number;
  height: number; // pt
}

/**
 * oneCellAnchorをabsoluteAnchorに変換
 */
function convertToAbsoluteAnchor(
  drawingXml: string,
  colWidths: ColumnWidth[],
  rowHeights: RowHeight[],
  defaultColWidth: number,
  defaultRowHeight: number
): string {
  // 列幅をピクセル換算で累積（EMU）
  const getColPosEmu = (col: number): number => {
    let pos = 0;
    for (let c = 0; c < col; c++) {
      const cw = colWidths.find(w => w.col === c)?.width || defaultColWidth;
      const px = cw * 7.1 + 5; // Excel列幅→px
      pos += px * EMU_PER_PIXEL;
    }
    return Math.round(pos);
  };

  // 行高さを累積（EMU）
  const getRowPosEmu = (row: number): number => {
    let pos = 0;
    for (let r = 0; r < row; r++) {
      const rh = rowHeights.find(h => h.row === r)?.height || defaultRowHeight;
      pos += rh * EMU_PER_POINT;
    }
    return Math.round(pos);
  };

  // oneCellAnchorを探して変換
  const oneCellPattern = /<xdr:oneCellAnchor[^>]*>([\s\S]*?)<\/xdr:oneCellAnchor>/g;

  return drawingXml.replace(oneCellPattern, (match, content) => {
    // from要素を解析
    const colMatch = content.match(/<xdr:col>(\d+)<\/xdr:col>/);
    const colOffMatch = content.match(/<xdr:colOff>(\d+)<\/xdr:colOff>/);
    const rowMatch = content.match(/<xdr:row>(\d+)<\/xdr:row>/);
    const rowOffMatch = content.match(/<xdr:rowOff>(\d+)<\/xdr:rowOff>/);

    if (!colMatch || !rowMatch) return match;

    const col = parseInt(colMatch[1], 10);
    const colOff = colOffMatch ? parseInt(colOffMatch[1], 10) : 0;
    const row = parseInt(rowMatch[1], 10);
    const rowOff = rowOffMatch ? parseInt(rowOffMatch[1], 10) : 0;

    // 絶対座標を計算
    const x = getColPosEmu(col) + colOff;
    const y = getRowPosEmu(row) + rowOff;

    // ext要素を取得
    const extMatch = content.match(/<xdr:ext\s+cx="(\d+)"\s+cy="(\d+)"\/>/);
    if (!extMatch) return match;
    const cx = extMatch[1];
    const cy = extMatch[2];

    // from要素を削除してpos要素に置換
    let newContent = content.replace(/<xdr:from>[\s\S]*?<\/xdr:from>/, `<xdr:pos x="${x}" y="${y}"/>`);

    return `<xdr:absoluteAnchor>${newContent}</xdr:absoluteAnchor>`;
  });
}

/**
 * シートXMLから列幅と行高さを取得
 */
function parseSheetDimensions(sheetXml: string): { colWidths: ColumnWidth[], rowHeights: RowHeight[] } {
  const colWidths: ColumnWidth[] = [];
  const rowHeights: RowHeight[] = [];

  // 列幅
  const colMatches = sheetXml.matchAll(/<col[^>]*min="(\d+)"[^>]*width="([\d.]+)"[^>]*\/?>/g);
  for (const m of colMatches) {
    colWidths.push({ col: parseInt(m[1], 10) - 1, width: parseFloat(m[2]) });
  }

  // 行高さ（属性順序に依存しないパターン）
  const rowMatches = sheetXml.matchAll(/<row[^>]*\br="(\d+)"[^>]*\bht="([\d.]+)"[^>]*>/g);
  for (const m of rowMatches) {
    rowHeights.push({ row: parseInt(m[1], 10) - 1, height: parseFloat(m[2]) });
  }

  return { colWidths, rowHeights };
}

export async function fixExcelAnchor(xlsxPath: string): Promise<void> {
  console.log(`🔧 修正中: ${path.basename(xlsxPath)}`);

  const zip = new AdmZip(xlsxPath);

  // 各シートと対応するdrawingを処理
  const entries = zip.getEntries();
  const sheetEntries = entries.filter(e => e.entryName.match(/xl\/worksheets\/sheet\d+\.xml$/));
  const drawingEntries = entries.filter(e => e.entryName.match(/xl\/drawings\/drawing\d+\.xml$/));

  for (let i = 0; i < drawingEntries.length; i++) {
    const drawingEntry = drawingEntries[i];
    const sheetEntry = sheetEntries[i];

    if (!sheetEntry) continue;

    const sheetXml = sheetEntry.getData().toString('utf8');
    const { colWidths, rowHeights } = parseSheetDimensions(sheetXml);

    const drawingXml = drawingEntry.getData().toString('utf8');
    const fixedXml = convertToAbsoluteAnchor(drawingXml, colWidths, rowHeights, 8.43, 15);

    zip.updateFile(drawingEntry.entryName, Buffer.from(fixedXml, 'utf8'));
    console.log(`  ✓ ${drawingEntry.entryName} を修正`);
  }

  zip.writeZip(xlsxPath);
  console.log(`✅ 保存完了: ${xlsxPath}`);
}

// メイン実行
async function main() {
  const testOutput = path.join(__dirname, '..', 'test-output');

  await fixExcelAnchor(path.join(testOutput, 'excel-demo-3up.xlsx'));
  await fixExcelAnchor(path.join(testOutput, 'excel-demo-2up.xlsx'));

  console.log('\n✨ 全ファイル修正完了');
}

main().catch(console.error);
