import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getWorkHierarchy, getWorkTypes, getVarieties } from '../utils/workHierarchy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('=== Testing unit-price hierarchy ===');
  
  // まず、ファイルが存在するか確認
  const dirPath = path.resolve(__dirname, '..', 'src', 'data', 'unit-price');
  console.log('\nディレクトリ:', dirPath);
  console.log('存在:', fs.existsSync(dirPath));
  
  if (fs.existsSync(dirPath)) {
    const files = fs.readdirSync(dirPath);
    console.log('ファイル一覧:', files);
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const content = fs.readFileSync(path.join(dirPath, file), 'utf-8');
      const json = JSON.parse(content);
      console.log(`\n--- ${file} ---`);
      if (json.hierarchy) {
        console.log('  code:', json.code);
        console.log('  name:', json.name);
        console.log('  hierarchy items:', json.hierarchy.length);
        json.hierarchy.forEach((h: any) => {
          console.log(`    workType: ${h.workType}, variety: ${h.variety}, detail: ${h.detail}`);
        });
      } else if (Array.isArray(json)) {
        console.log('  array items:', json.length);
      }
    }
  }
  
  // 展開後のアイテムを確認
  console.log('\n\n=== 105.json expanded items ===');
  const content105 = fs.readFileSync(path.join(dirPath, '105.json'), 'utf-8');
  const json105 = JSON.parse(content105);
  for (const h of json105.hierarchy) {
    console.log(`  workType: ${h.workType}, variety: ${h.variety}, detail: ${h.detail}`);
    console.log(`    refRemarks: ${h.refRemarks}`);
    console.log(`    remarks: ${JSON.stringify(h.remarks)}`);
  }
  
  console.log('\n\n=== getWorkHierarchy result ===');
  const h = await getWorkHierarchy('unit-price');
  const workTypes = getWorkTypes(h);
  
  console.log('\nWork Types:', workTypes);
  
  for (const wt of workTypes) {
    console.log(`\n工種: ${wt}`);
    const varieties = getVarieties(wt, h);
    for (const v of varieties) {
      console.log(`  種別: ${v}`);
      const details = Object.keys((h as any)[wt]?.[v] || {});
      for (const d of details) {
        const remarks = Object.keys((h as any)[wt]?.[v]?.[d]?.remarks || {});
        console.log(`    細別: ${d} (備考: ${remarks.length}件)`);
        // 表層工の備考を全て表示
        if (d === '表層工' && wt === '舗装補修工' && v === 'アスファルト舗装補修工') {
          console.log(`      備考一覧: ${remarks.join(', ')}`);
        }
      }
    }
  }
}

main().catch(console.error);

