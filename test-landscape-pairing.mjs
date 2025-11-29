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
      console.log(`   パス: ${testImageFolder}`);

      if (!fs.existsSync(testImageFolder)) {
            console.error('❌ フォルダが見つかりません');
            return [];
      }

      const files = fs.readdirSync(testImageFolder);
      const imageFiles = files.filter(f =>
            /\.(jpg|jpeg|png)$/i.test(f)
      );

      console.log(`✅ ${imageFiles.length}個の画像ファイルを発見`);

      // ファイル名から拡張子を除いたベース名でフィルタ
      const targetFiles = imageFiles.filter(f => {
            const baseName = path.basename(f, path.extname(f));
            return expectedPairs.some(pair =>
                  baseName.includes(pair.before) || baseName.includes(pair.after)
            );
      });

      console.log(`🎯 テスト対象: ${targetFiles.length}個`);
      targetFiles.forEach(f => console.log(`   - ${f}`));

      // 画像をBase64に変換
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

      // ファイル名でソート（日付順）
      records.sort((a, b) => a.fileName.localeCompare(b.fileName));

      return records;
}

async function testPairing() {
      console.log('\n🧪 景観ペアリングテスト開始\n');

      // 画像を読み込み
      const records = await loadImages();
      if (records.length === 0) {
            console.error('❌ テスト画像が見つかりません');
            return;
      }

      console.log(`\n📊 読み込んだ画像 (${records.length}枚):`);
      records.forEach((r, i) => {
            console.log(`   ${i + 1}. ${r.fileName} (${(r.fileSize / 1024).toFixed(1)}KB)`);
      });

      // APIキーを環境変数から取得
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
            console.error('❌ GEMINI_API_KEY環境変数が設定されていません');
            console.log('   .envファイルにGEMINI_API_KEY=your_key_hereを追加してください');
            return;
      }

      console.log('\n⚙️  空間的特徴を抽出中...');
      console.log('   (これには数十秒かかる場合があります)');

      try {
            // 動的インポート（ESM対応）
            const { createSpatialPairs } = await import('./services/spatialPairingService.ts');

            const logs = [];
            const onLog = (msg, type) => {
                  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
                  console.log(`${icon} ${msg}`);
                  logs.push({ msg, type });
            };

            const pairs = await createSpatialPairs(records, apiKey, onLog);

            console.log('\n📋 ペアリング結果:');
            console.log(`   作成されたペア数: ${pairs.length}組`);

            pairs.forEach((pair, i) => {
                  const beforeName = path.basename(pair.before.fileName, path.extname(pair.before.fileName));
                  const afterName = path.basename(pair.after.fileName, path.extname(pair.after.fileName));

                  console.log(`\n   ペア${i + 1}:`);
                  console.log(`     着手前: ${beforeName}`);
                  console.log(`     竣工:   ${afterName}`);
                  console.log(`     類似度: ${(pair.similarity * 100).toFixed(1)}%`);
                  console.log(`     一致したランドマーク: ${pair.matchedLandmarks.length}個`);

                  // 期待されるペアと照合
                  const expected = expectedPairs.find(ep =>
                        beforeName.includes(ep.before) && afterName.includes(ep.after)
                  );

                  if (expected) {
                        console.log(`     ✅ 正解!`);
                  } else {
                        console.log(`     ❌ 期待と異なる`);
                  }
            });

            // 正解率を計算
            let correctCount = 0;
            pairs.forEach(pair => {
                  const beforeName = path.basename(pair.before.fileName, path.extname(pair.before.fileName));
                  const afterName = path.basename(pair.after.fileName, path.extname(pair.after.fileName));

                  const expected = expectedPairs.find(ep =>
                        beforeName.includes(ep.before) && afterName.includes(ep.after)
                  );

                  if (expected) correctCount++;
            });

            console.log(`\n🎯 テスト結果:`);
            console.log(`   正解: ${correctCount}/${expectedPairs.length}組`);
            console.log(`   正解率: ${(correctCount / expectedPairs.length * 100).toFixed(1)}%`);

            if (correctCount === expectedPairs.length) {
                  console.log(`\n✨ テスト成功！すべてのペアが正しくマッチしました！`);
            } else {
                  console.log(`\n⚠️  一部のペアが期待と異なります`);
            }

      } catch (error) {
            console.error('\n❌ テスト失敗:', error.message);
            console.error(error.stack);
      }
}

// テスト実行
testPairing().catch(console.error);
