#!/usr/bin/env npx tsx
/**
 * 景観写真ペアリング処理のユニットテスト
 * createSpatialPairs関数とprocessLandscapePhotos関数の動作確認
 */

import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { processLandscapePhotos } from '../services/smartFlowService';
import { PhotoRecord } from '../types';

dotenv.config();

// テスト用の画像を読み込むヘルパー関数
async function loadTestImage(imagePath: string): Promise<PhotoRecord> {
  const fullPath = path.resolve(imagePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`画像が見つかりません: ${fullPath}`);
  }

  const stats = fs.statSync(fullPath);
  const buffer = fs.readFileSync(fullPath);
  const base64 = buffer.toString('base64');
  const ext = path.extname(fullPath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
  
  // data URI形式に変換
  const base64DataUri = `data:${mimeType};base64,${base64}`;

  return {
    fileName: path.basename(fullPath),
    base64: base64DataUri,
    mimeType: mimeType,
    fileSize: stats.size,
    lastModified: stats.mtimeMs,
    status: 'pending',
    date: stats.mtimeMs
  };
}

async function testLandscapePairing() {
  console.log('🧪 景観写真ペアリング処理 ユニットテスト開始...\n');

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY が設定されていません');
    process.exit(1);
  }

  // テストケース1: 景観写真フォルダから画像を読み込み
  console.log('--- [Test 1] 景観写真のペアリング処理 ---');
  const landscapeFolder = process.argv[2] || './test-images';
  
  if (!fs.existsSync(landscapeFolder)) {
    console.log(`⚠️  テストフォルダが見つかりません: ${landscapeFolder}`);
    console.log('   使用方法: npx tsx scripts/test-landscape-pairing.ts <フォルダパス>');
    process.exit(1);
  }

  const files = fs.readdirSync(landscapeFolder)
    .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
    .sort();

  if (files.length === 0) {
    console.error('❌ 画像ファイルが見つかりません');
    process.exit(1);
  }

  console.log(`📷 ${files.length}枚の画像を読み込み中...`);
  const records: PhotoRecord[] = [];
  for (const file of files) {
    try {
      const record = await loadTestImage(path.join(landscapeFolder, file));
      records.push(record);
      console.log(`   ✓ ${file} (${(record.fileSize / 1024).toFixed(1)}KB)`);
    } catch (e: any) {
      console.error(`   ✗ ${file}: ${e.message}`);
    }
  }

  if (records.length === 0) {
    console.error('❌ 画像の読み込みに失敗しました');
    process.exit(1);
  }

  console.log(`\n🔍 景観写真のペアリング処理を実行中... (${records.length}枚)`);
  
  const logs: string[] = [];
  const startTime = Date.now();
  
  const result = await processLandscapePhotos(
    records,
    apiKey,
    (msg, type) => {
      const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : '📋';
      const logMsg = `${prefix} ${msg}`;
      logs.push(logMsg);
      console.log(`   ${logMsg}`);
    }
  );

  const elapsed = Date.now() - startTime;
  
  console.log(`\n📊 ペアリング結果:`);
  console.log(`   処理時間: ${(elapsed / 1000).toFixed(2)}秒`);
  console.log(`   ペア数: ${result.pairs.length}`);
  
  if (result.pairs.length === 0) {
    console.log('❌ テスト失敗: ペアが作成されませんでした');
    console.log('\n📋 ログ出力:');
    logs.forEach(log => console.log(`   ${log}`));
    process.exit(1);
  }

  // ペアの詳細を表示
  console.log(`\n📸 ペアリング結果の詳細:`);
  result.pairs.forEach((pair, index) => {
    const beforeDate = pair.before.date ? new Date(pair.before.date).toLocaleString('ja-JP') : '日付不明';
    const afterDate = pair.after.date ? new Date(pair.after.date).toLocaleString('ja-JP') : '日付不明';
    console.log(`\n   ペア ${index + 1} (${pair.sceneId}):`);
    console.log(`     📷 Before（着手前）: ${pair.before.fileName}`);
    console.log(`        日時: ${beforeDate}`);
    console.log(`     📷 After（完了）: ${pair.after.fileName}`);
    console.log(`        日時: ${afterDate}`);
  });

  // テストケース2: キャッシュの動作確認（2回目はキャッシュから取得されるはず）
  console.log('\n--- [Test 2] キャッシュの動作確認 ---');
  console.log('🔍 2回目のペアリング処理（キャッシュから取得されるはず）...');
  
  const logs2: string[] = [];
  const startTime2 = Date.now();
  
  const result2 = await processLandscapePhotos(
    records,
    apiKey,
    (msg, type) => {
      const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : '📋';
      const logMsg = `${prefix} ${msg}`;
      logs2.push(logMsg);
      console.log(`   ${logMsg}`);
    }
  );

  const elapsed2 = Date.now() - startTime2;
  
  console.log(`\n📊 2回目のペアリング結果:`);
  console.log(`   処理時間: ${(elapsed2 / 1000).toFixed(2)}秒`);
  console.log(`   ペア数: ${result2.pairs.length}`);

  // キャッシュが効いているか確認（2回目は大幅に速いはず）
  const cacheHit = logs2.some(log => log.includes('キャッシュ') || log.includes('SPATIAL_CACHE'));
  if (cacheHit || elapsed2 < elapsed * 0.5) {
    console.log('✅ キャッシュが正しく動作しています（2回目が大幅に高速化）');
  } else {
    console.log('⚠️  キャッシュが使用されていない可能性があります');
    console.log('   1回目:', elapsed, 'ms');
    console.log('   2回目:', elapsed2, 'ms');
    console.log('   ログ出力:');
    logs2.forEach(log => console.log(`      ${log}`));
  }

  // ペアリング結果の整合性チェック
  if (result2.pairs.length === result.pairs.length) {
    console.log('✅ ペアリング結果が一致しています');
    
    // 各ペアのファイル名が一致するか確認
    let allMatch = true;
    for (let i = 0; i < result.pairs.length; i++) {
      const pair1 = result.pairs[i];
      const pair2 = result2.pairs[i];
      if (pair1.before.fileName !== pair2.before.fileName || 
          pair1.after.fileName !== pair2.after.fileName) {
        allMatch = false;
        console.log(`⚠️  ペア${i + 1}のファイル名が一致しません`);
        console.log(`   1回目: ${pair1.before.fileName} / ${pair1.after.fileName}`);
        console.log(`   2回目: ${pair2.before.fileName} / ${pair2.after.fileName}`);
      }
    }
    
    if (allMatch) {
      console.log('✅ 全てのペアのファイル名が一致しています');
    }
  } else {
    console.log(`⚠️  ペア数が一致しません: ${result.pairs.length} vs ${result2.pairs.length}`);
  }

  // テストケース3: ペアリング結果の妥当性チェック
  console.log('\n--- [Test 3] ペアリング結果の妥当性チェック ---');
  
  // 全ての写真がペアに含まれているか確認
  const pairedFiles = new Set<string>();
  result.pairs.forEach(pair => {
    pairedFiles.add(pair.before.fileName);
    pairedFiles.add(pair.after.fileName);
  });

  const unpairedFiles = records.filter(r => !pairedFiles.has(r.fileName));
  if (unpairedFiles.length > 0) {
    console.log(`⚠️  ペアに含まれていない写真が${unpairedFiles.length}枚あります:`);
    unpairedFiles.forEach(r => console.log(`   - ${r.fileName}`));
  } else {
    console.log('✅ 全ての写真がペアに含まれています');
  }

  // before/afterの日付順序を確認
  let dateOrderValid = true;
  result.pairs.forEach((pair, index) => {
    const beforeDate = pair.before.date || 0;
    const afterDate = pair.after.date || 0;
    if (beforeDate > afterDate) {
      dateOrderValid = false;
      console.log(`⚠️  ペア${index + 1}: 日付順序が逆です`);
      console.log(`   Before: ${new Date(beforeDate).toISOString()}`);
      console.log(`   After: ${new Date(afterDate).toISOString()}`);
    }
  });

  if (dateOrderValid) {
    console.log('✅ 全てのペアで日付順序が正しいです');
  }

  console.log('\n🏁 テスト完了\n');
}

testLandscapePairing().catch(e => {
  console.error('❌ テスト実行エラー:', e);
  if (e.stack) {
    console.error(e.stack);
  }
  process.exit(1);
});

