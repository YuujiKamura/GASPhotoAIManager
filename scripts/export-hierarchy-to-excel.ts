/**
 * 工種階層マスタをExcel形式でエクスポートする
 * 出力先: ../photo-ai-rust/master/construction_hierarchy.xlsx
 */

import * as XLSX from 'xlsx';
import * as path from 'path';
import { CONSTRUCTION_HIERARCHY } from '../cli/adapters/masterAdapter.js';

interface HierarchyRow {
  level1: string;  // 写真区分 (直接工事費)
  level2: string;  // 写真種別 (着手前及び完成写真, 施工状況写真, etc.)
  level3: string;  // 工種 (舗装工, 道路土工, etc.)
  level4: string;  // 種別 (舗装打換え工, 掘削工, etc.)
  level5: string;  // 細別 (表層工, 上層路盤工, etc.)
  level6: string;  // 撮影内容
  matchPatterns: string;  // 検索パターン（カンマ区切り）
}

function flattenHierarchy(obj: unknown, path: string[] = []): HierarchyRow[] {
  const rows: HierarchyRow[] = [];

  if (typeof obj !== 'object' || obj === null) {
    return rows;
  }

  const entries = Object.entries(obj as Record<string, unknown>);

  for (const [key, value] of entries) {
    const currentPath = [...path, key];

    if (typeof value === 'object' && value !== null) {
      const valueObj = value as Record<string, unknown>;

      // matchPatternsがある場合は末端ノード
      if ('matchPatterns' in valueObj && Array.isArray(valueObj.matchPatterns)) {
        rows.push(createRow(currentPath, valueObj.matchPatterns as string[]));
      } else if (Object.keys(valueObj).length === 0) {
        // 空オブジェクト（_()の結果）は末端ノード
        rows.push(createRow(currentPath, []));
      } else {
        // 子要素を再帰的に処理
        rows.push(...flattenHierarchy(value, currentPath));
      }
    }
  }

  return rows;
}

function createRow(path: string[], matchPatterns: string[]): HierarchyRow {
  return {
    level1: path[0] || '',
    level2: path[1] || '',
    level3: path[2] || '',
    level4: path[3] || '',
    level5: path[4] || '',
    level6: path[5] || '',
    matchPatterns: matchPatterns.join(', ')
  };
}

function main() {
  console.log('工種階層マスタをExcelに変換中...');

  const rows = flattenHierarchy(CONSTRUCTION_HIERARCHY);

  console.log(`${rows.length} 行のデータを生成しました`);

  // ワークブック作成
  const wb = XLSX.utils.book_new();

  // ヘッダー付きのデータ配列を作成
  const headers = ['写真区分', '写真種別', '工種', '種別', '細別', '撮影内容', '検索パターン'];
  const data = [
    headers,
    ...rows.map(row => [
      row.level1,
      row.level2,
      row.level3,
      row.level4,
      row.level5,
      row.level6,
      row.matchPatterns
    ])
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);

  // 列幅を設定
  ws['!cols'] = [
    { wch: 15 },  // 写真区分
    { wch: 20 },  // 写真種別
    { wch: 20 },  // 工種
    { wch: 25 },  // 種別
    { wch: 25 },  // 細別
    { wch: 35 },  // 撮影内容
    { wch: 40 },  // 検索パターン
  ];

  XLSX.utils.book_append_sheet(wb, ws, '工種階層マスタ');

  // 出力先 - 絶対パスで指定
  const outputPath = 'C:/Users/yuuji/Sanyuu2Kouku/photo-ai-rust/master/construction_hierarchy.xlsx';

  console.log(`出力先: ${outputPath}`);
  XLSX.writeFile(wb, outputPath);

  console.log(`Excel出力完了: ${outputPath}`);
}

main();
