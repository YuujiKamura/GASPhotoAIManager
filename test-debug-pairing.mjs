import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 期待されるペア
const expectedPairs = [
      { before: '20251031_142150', after: 'P0000124' },
      { before: '20251031_142231', after: 'P0000123' },
      { before: '20251031_142252', after: 'P0000122' },
      { before: '20251031_142308', after: 'P0000121' },
      { before: '20251031_142321', after: 'P0000120' }
];

// テスト用の画像フォルダパス
const testImageFolder = 'H:\\マイドライブ\\〇東区市道（2工区）舗装補修工事（水防等含）（単価契約）\\20251028小山町1359-5\\着手前、小山1359-5';

async function loadImages() {
      console.log('📂 画像フォルダをスキャン中...');

      if (!fs.existsSync(testImageFolder)) {
            console.error('❌ フォルダが見つかりません');
            return [];
      }

      const files = fs.readdirSync(testImageFolder);
      const imageFiles = files.filter(f =>
            /\.(jpg|jpeg|png)$/i.test(f)
      );

      const targetFiles = imageFiles.filter(f => {
            const baseName = path.basename(f, path.extname(f));
            return expectedPairs.some(pair =>
                  baseName.includes(pair.before) || baseName.includes(pair.after)
            );
      });

      const records = [];
      for (const file of targetFiles) {
            const filePath = path.join(testImageFolder, file);
            const buffer = fs.readFileSync(filePath);
            const base64 = buffer.toString('base64');
            const stat = fs.statSync(filePath);

            records.push({
                  fileName: file,
                  base64: `data:image/jpeg;base64,${base64}`,
                  mimeType: 'image/jpeg',
                  fileSize: stat.size,
                  lastModified: stat.mtimeMs,
                  date: stat.mtimeMs,
                  status: 'pending'
            });
      }

      records.sort((a, b) => a.fileName.localeCompare(b.fileName));
      return records;
}

async function debugPairing() {
      console.log('\n🔍 詳細デバッグモード\n');

      const records = await loadImages();
      if (records.length === 0) return;

      console.log(`\n📊 画像リスト (${records.length}枚):`);
      records.forEach((r, i) => {
            console.log(`   ${i}. ${r.fileName}`);
      });

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
            console.error('❌ GEMINI_API_KEY環境変数が設定されていません');
            return;
      }

      try {
            // 空間特徴を直接抽出してデバッグ
            const { extractSpatialFeatures } = await import('./services/spatialPairingService.ts');

            console.log('\n⚙️  空間特徴を抽出中...\n');

            const analyses = await extractSpatialFeatures(records, apiKey, (msg, type) => {
                  console.log(`   ${msg}`);
            });

            console.log('\n📋 各画像の分析結果:\n');
            analyses.forEach((analysis, i) => {
                  const baseName = path.basename(analysis.fileName, path.extname(analysis.fileName));
                  console.log(`━━━ ${i + 1}. ${baseName} ━━━`);
                  console.log(`地面状態: ${analysis.groundCondition}`);
                  console.log(`撮影方向: ${analysis.viewpoint.direction}`);
                  console.log(`視野角: ${analysis.viewpoint.fov}`);
                  console.log(`ランドマーク数: ${analysis.landmarks.length}個`);
                  analysis.landmarks.slice(0, 3).forEach(lm => {
                        console.log(`  - ${lm.type}: ${lm.description} (x=${lm.position.x}, y=${lm.position.y})`);
                  });
                  console.log('');
            });

            // 類似度行列を計算
            console.log('\n📊 類似度行列:\n');
            console.log('    ', records.map((r, i) => i.toString().padStart(3)).join(''));

            for (let i = 0; i < analyses.length; i++) {
                  const row = [];
                  for (let j = 0; j < analyses.length; j++) {
                        if (i === j) {
                              row.push('  -');
                        } else {
                              const sim = calculateSimilarity(analyses[i], analyses[j]);
                              row.push((sim * 100).toFixed(0).padStart(3));
                        }
                  }
                  const baseName = path.basename(analyses[i].fileName, path.extname(analyses[i].fileName));
                  console.log(`${i.toString().padStart(2)}  ${row.join('')}  ${baseName.substring(0, 15)}`);
            }

            // グループ化のシミュレーション
            console.log('\n\n🔗 グループ化プロセス:\n');
            const groups = [];
            const used = new Set();
            const THRESHOLD = 0.6;

            for (let i = 0; i < analyses.length; i++) {
                  if (used.has(i)) continue;

                  const group = [i];
                  used.add(i);

                  for (let j = i + 1; j < analyses.length; j++) {
                        if (used.has(j)) continue;

                        const sim = calculateSimilarity(analyses[i], analyses[j]);
                        if (sim > THRESHOLD) {
                              group.push(j);
                              used.add(j);
                              console.log(`   ✅ ${i} と ${j} をグループ化 (類似度: ${(sim * 100).toFixed(1)}%)`);
                        } else {
                              console.log(`   ❌ ${i} と ${j} は類似度不足 (${(sim * 100).toFixed(1)}% < ${THRESHOLD * 100}%)`);
                        }
                  }

                  if (group.length >= 2) {
                        groups.push(group);
                        console.log(`   📦 グループ${groups.length}を作成: [${group.join(', ')}]`);
                  } else {
                        console.log(`   ⚠️  ${i} は単独のため除外`);
                  }
                  console.log('');
            }

            console.log(`\n🎯 最終グループ数: ${groups.length}組`);
            console.log(`⚠️  グループ化されなかった写真: ${analyses.length - used.size}枚`);

            // 各グループのペア作成をシミュレーション
            console.log('\n\n📸 各グループのペア作成:\n');
            groups.forEach((group, idx) => {
                  console.log(`━━━ グループ${idx + 1} ━━━`);
                  const groupRecords = group.map(i => ({
                        record: records[i],
                        analysis: analyses[i]
                  }));

                  // 日付でソート
                  groupRecords.sort((a, b) => (a.record.date || 0) - (b.record.date || 0));

                  console.log(`メンバー (日付順):`);
                  groupRecords.forEach((gr, i) => {
                        const baseName = path.basename(gr.record.fileName, path.extname(gr.record.fileName));
                        console.log(`  ${i}. ${baseName} - ${gr.analysis.groundCondition}`);
                  });

                  // 地面状態で分類
                  const unpaved = groupRecords.filter(r => r.analysis.groundCondition === 'unpaved');
                  const paved = groupRecords.filter(r => r.analysis.groundCondition === 'paved');
                  const underConstruction = groupRecords.filter(r => r.analysis.groundCondition === 'under_construction');

                  console.log(`\n分類結果:`);
                  console.log(`  unpaved: ${unpaved.length}枚`);
                  console.log(`  paved: ${paved.length}枚`);
                  console.log(`  under_construction: ${underConstruction.length}枚`);

                  // ペア判定
                  let beforeRecord = null;
                  let afterRecord = null;

                  if (unpaved.length > 0 && paved.length > 0) {
                        beforeRecord = unpaved[0];
                        afterRecord = paved[paved.length - 1];
                        console.log(`\n✅ ケース1: unpaved + paved でペア作成`);
                  } else if (unpaved.length > 0 && underConstruction.length > 0) {
                        beforeRecord = unpaved[0];
                        afterRecord = underConstruction[underConstruction.length - 1];
                        console.log(`\n✅ ケース2: unpaved + under_construction でペア作成`);
                  } else if (underConstruction.length > 0 && paved.length > 0) {
                        beforeRecord = underConstruction[0];
                        afterRecord = paved[paved.length - 1];
                        console.log(`\n✅ ケース3: under_construction + paved でペア作成`);
                  } else if (groupRecords.length >= 2) {
                        beforeRecord = groupRecords[0];
                        afterRecord = groupRecords[groupRecords.length - 1];
                        console.log(`\n⚠️  ケース4: フォールバック（日付で分割）`);
                  }

                  if (beforeRecord && afterRecord) {
                        const beforeName = path.basename(beforeRecord.record.fileName, path.extname(beforeRecord.record.fileName));
                        const afterName = path.basename(afterRecord.record.fileName, path.extname(afterRecord.record.fileName));
                        console.log(`\nペア結果:`);
                        console.log(`  着手前: ${beforeName}`);
                        console.log(`  竣工:   ${afterName}`);

                        const expected = expectedPairs.find(ep =>
                              beforeName.includes(ep.before) && afterName.includes(ep.after)
                        );
                        if (expected) {
                              console.log(`  ✅ 正解!`);
                        } else {
                              console.log(`  ❌ 期待と異なる`);
                        }
                  }
                  console.log('');
            });

      } catch (error) {
            console.error('\n❌ エラー:', error.message);
            console.error(error.stack);
      }
}

// 類似度計算のヘルパー
function calculateSimilarity(analysis1, analysis2) {
      let totalScore = 0;
      let matchedLandmarks = 0;

      analysis1.landmarks.forEach(landmark1 => {
            let minDistance = Infinity;
            let bestMatch = null;

            analysis2.landmarks.forEach(landmark2 => {
                  if (landmark1.type === landmark2.type) {
                        const distance = Math.sqrt(
                              Math.pow(landmark1.position.x - landmark2.position.x, 2) +
                              Math.pow(landmark1.position.y - landmark2.position.y, 2)
                        );

                        if (distance < minDistance) {
                              minDistance = distance;
                              bestMatch = landmark2;
                        }
                  }
            });

            if (bestMatch && minDistance < 15) {
                  matchedLandmarks++;
                  const sizeSimilarity = 1 - (
                        Math.abs(landmark1.size.width - bestMatch.size.width) +
                        Math.abs(landmark1.size.height - bestMatch.size.height)
                  ) / 300;
                  totalScore += sizeSimilarity;
            }
      });

      const avgLandmarks = (analysis1.landmarks.length + analysis2.landmarks.length) / 2;
      const matchRate = matchedLandmarks / avgLandmarks;

      const viewpointMatch =
            analysis1.viewpoint.direction === analysis2.viewpoint.direction ? 0.1 : 0;

      return Math.min(1.0, matchRate * 0.9 + viewpointMatch);
}

debugPairing().catch(console.error);
