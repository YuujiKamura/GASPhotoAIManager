#!/usr/bin/env npx tsx
/**
 * detectPhotoType関数のユニットテスト
 * 景観写真と工事写真の判定が正しく動作するか確認
 */

import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { detectPhotoType } from '../services/smartFlowService';
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
  // base64データは既にdata URI形式でない場合はそのまま、data URI形式の場合は抽出
  let base64 = buffer.toString('base64');
  const ext = path.extname(fullPath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
  
  // data URI形式に変換（extractBase64Dataで抽出される想定）
  base64 = `data:${mimeType};base64,${base64}`;

  return {
    fileName: path.basename(fullPath),
    base64: base64,
    mimeType: mimeType,
    fileSize: stats.size,
    lastModified: stats.mtimeMs,
    status: 'pending',
    date: stats.mtimeMs
  };
}

async function testDetectPhotoType() {
  console.log('🧪 detectPhotoType ユニットテスト開始...\n');

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY が設定されていません');
    process.exit(1);
  }

  // テストケース1: 景観写真フォルダ
  console.log('--- [Test 1] 景観写真フォルダの判定 ---');
  const landscapeFolder = process.argv[2] || './test-images';
  
  if (!fs.existsSync(landscapeFolder)) {
    console.log(`⚠️  テストフォルダが見つかりません: ${landscapeFolder}`);
    console.log('   使用方法: npx tsx scripts/test-detect-photo-type.ts <フォルダパス>');
    process.exit(1);
  }

  const files = fs.readdirSync(landscapeFolder)
    .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
    .slice(0, 6); // 最大6枚

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
      console.log(`   ✓ ${file}`);
    } catch (e: any) {
      console.error(`   ✗ ${file}: ${e.message}`);
    }
  }

  if (records.length === 0) {
    console.error('❌ 画像の読み込みに失敗しました');
    process.exit(1);
  }

  console.log(`\n🔍 写真タイプを判定中... (${records.length}枚)`);
  
  const logs: string[] = [];
  const result = await detectPhotoType(
    records,
    apiKey,
    (msg, type) => {
      const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : '📋';
      const logMsg = `${prefix} ${msg}`;
      logs.push(logMsg);
      console.log(logMsg);
    }
  );

  console.log(`\n📊 判定結果: ${result === 'landscape_pairing' ? '景観写真（ペアリング対象）' : '工事写真（詳細解析対象）'}`);
  
  // 期待値の検証
  const expected = 'landscape_pairing';
  if (result === expected) {
    console.log('✅ テスト成功: 景観写真として正しく判定されました');
  } else {
    console.log(`❌ テスト失敗: 期待値「${expected}」に対して実際の結果は「${result}」`);
    console.log('\n📋 ログ出力:');
    logs.forEach(log => console.log(`   ${log}`));
    process.exit(1);
  }

  // テストケース2: キャッシュの動作確認（2回目はキャッシュから取得されるはず）
  console.log('\n--- [Test 2] キャッシュの動作確認 ---');
  console.log('🔍 2回目の判定（キャッシュから取得されるはず）...');
  
  const logs2: string[] = [];
  const result2 = await detectPhotoType(
    records,
    apiKey,
    (msg, type) => {
      const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : '📋';
      const logMsg = `${prefix} ${msg}`;
      logs2.push(logMsg);
      console.log(`   ${logMsg}`);
    }
  );

  const cacheHit = logs2.some(log => log.includes('キャッシュ'));
  if (cacheHit) {
    console.log('✅ キャッシュが正しく動作しています');
  } else {
    console.log('⚠️  キャッシュが使用されていない可能性があります');
    console.log('   ログ出力:');
    logs2.forEach(log => console.log(`      ${log}`));
  }

  if (result2 === result) {
    console.log('✅ キャッシュ後の結果が一致しています');
  } else {
    console.log(`❌ キャッシュ後の結果が一致しません: ${result} vs ${result2}`);
    process.exit(1);
  }

  console.log('\n🏁 テスト完了\n');
}

testDetectPhotoType().catch(e => {
  console.error('❌ テスト実行エラー:', e);
  process.exit(1);
});

