import { CONSTRUCTION_HIERARCHY } from '../cli/adapters/masterAdapter.js';
import * as fs from 'fs';
import * as path from 'path';

interface Row {
  level1: string;
  level2: string;
  level3: string;
  level4: string;
  level5: string;
  level6: string;
  matchPatterns: string;
}

function flattenHierarchy(obj: unknown, pathArr: string[] = []): Row[] {
  const rows: Row[] = [];
  if (typeof obj !== 'object' || obj === null) return rows;

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const currentPath = [...pathArr, key];
    if (typeof value === 'object' && value !== null) {
      const valueObj = value as Record<string, unknown>;
      if ('matchPatterns' in valueObj && Array.isArray(valueObj.matchPatterns)) {
        const padded = [...currentPath];
        while (padded.length < 6) padded.push('');
        rows.push({
          level1: padded[0], level2: padded[1], level3: padded[2],
          level4: padded[3], level5: padded[4], level6: padded[5],
          matchPatterns: (valueObj.matchPatterns as string[]).join('|')
        });
      } else if (Object.keys(valueObj).length === 0) {
        const padded = [...currentPath];
        while (padded.length < 6) padded.push('');
        rows.push({
          level1: padded[0], level2: padded[1], level3: padded[2],
          level4: padded[3], level5: padded[4], level6: padded[5],
          matchPatterns: ''
        });
      } else {
        rows.push(...flattenHierarchy(value, currentPath));
      }
    }
  }
  return rows;
}

const rows = flattenHierarchy(CONSTRUCTION_HIERARCHY);
console.log('Generated rows:', rows.length);

const header = '写真区分,写真種別,工種,種別,細別,撮影内容,検索パターン';
const csv = [header, ...rows.map(r =>
  [r.level1, r.level2, r.level3, r.level4, r.level5, r.level6, r.matchPatterns]
    .map(v => '"' + v.replace(/"/g, '""') + '"').join(',')
)].join('\n');

const outputPath = path.resolve(__dirname, '../../photo-ai-rust/master/construction_hierarchy.csv');
fs.writeFileSync(outputPath, csv, 'utf-8');
console.log('CSV written to:', outputPath);
