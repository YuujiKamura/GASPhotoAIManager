#!/usr/bin/env node

import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
if (!API_KEY) {
  console.error('❌ GEMINI_API_KEY 環境変数が設定されていません');
  console.error('   .envファイルに GEMINI_API_KEY=... を設定するか、');
  console.error('   環境変数として設定してください');
  process.exit(1);
}

// テスト用のフォルダパス
const testFolderPath = 'H:\\マイドライブ\\〇東区市道（2工区）舗装補修工事（水防等含）（単価契約）\\20251028小山町1359-5\\着手前、小山1359-5';

console.log('\n🧪 シンプルペアリングテスト\n');
console.log('=' .repeat(50));

// フォルダから画像を読み込む
async function loadTestImages() {
  const files = await fs.readdir(testFolderPath);
  const imageFiles = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f));

  console.log(`📂 ${imageFiles.length}個の画像ファイルを発見`);

  const images = [];
  for (const fileName of imageFiles) {
    const filePath = path.join(testFolderPath, fileName);
    const buffer = await fs.readFile(filePath);
    const stats = await fs.stat(filePath);
    images.push({
      fileName,
      buffer,
      size: stats.size
    });
  }

  // ファイル名順でソート
  images.sort((a, b) => a.fileName.localeCompare(b.fileName));
  return images;
}

// AI解析を実行（画像は送らず、ファイル名だけで判定）
async function analyzeWithAI(images) {
  const genai = new GoogleGenAI({ apiKey: API_KEY });
  const model = { generateContent: (req) => genai.models.generateContent({
    model: 'gemini-1.5-flash',
    ...req
  }) };

  // ファイル名だけで判定するシンプルなプロンプト
  const prompt = `
建設工事の写真ファイル名から、着手前と竣工のペアを推測してください。

写真リスト：
${images.map((img, idx) => `${idx + 1}. ${img.fileName} (${(img.size/1024).toFixed(1)}KB)`).join('\n')}

ルール：
1. 日付が近い20251031_xxxxx.jpgは着手前の写真
2. P000xxxx.JPGは竣工写真
3. 番号順にペアリングする可能性が高い（最初の着手前写真は最後の竣工写真とペアなど）

出力形式（JSON）:
{
  "pairs": [
    {
      "before": "着手前ファイル名",
      "after": "竣工ファイル名",
      "confidence": 0.0-1.0,
      "reason": "ペアリング理由"
    }
  ],
  "analysis": "全体的な分析コメント"
}`;

  console.log('\n⚙️  AIによる分析中...');

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    });

    return JSON.parse(result.text);
  } catch (error) {
    console.error('❌ AI分析エラー:', error.message);
    return null;
  }
}

// spatialPairingServiceの実際の動作をシミュレート
async function testSpatialPairing(images) {
  console.log('\n🔧 spatialPairingService.tsの動作をシミュレート\n');

  // 画像を2つのバッチに分ける（5枚ずつ）
  const batch1 = images.slice(0, 5);  // 着手前写真
  const batch2 = images.slice(5);      // 竣工写真

  console.log('バッチ1（着手前候補）:');
  batch1.forEach(img => console.log(`  - ${img.fileName}`));
  console.log('\nバッチ2（竣工候補）:');
  batch2.forEach(img => console.log(`  - ${img.fileName}`));

  // 実際のペアリングロジックをテスト
  // spatialPairingService.tsは画像の内容を見て判定するので、
  // ここではファイル名の規則性から推測
  const pairs = [];

  // 逆順でペアリング（実際の動作を再現）
  for (let i = 0; i < Math.min(batch1.length, batch2.length); i++) {
    pairs.push({
      before: batch1[i].fileName,
      after: batch2[batch2.length - 1 - i].fileName,  // 逆順
      confidence: 0.8 + Math.random() * 0.2
    });
  }

  return pairs;
}

// メイン処理
async function main() {
  try {
    // 画像を読み込む
    const images = await loadTestImages();

    if (images.length === 0) {
      console.log('❌ 画像が見つかりません');
      return;
    }

    console.log('\n読み込んだ画像:');
    images.forEach((img, idx) => {
      const sizeKB = (img.size / 1024).toFixed(1);
      console.log(`  ${idx + 1}. ${img.fileName} (${sizeKB}KB)`);
    });

    // spatialPairingServiceの動作をテスト
    const spatialPairs = await testSpatialPairing(images);

    console.log('\n📊 spatialPairingServiceシミュレーション結果:');
    spatialPairs.forEach((pair, idx) => {
      console.log(`  ペア${idx + 1}: ${pair.before} <-> ${pair.after} (${(pair.confidence * 100).toFixed(0)}%)`);
    });

    // AIによる分析（参考）
    const result = await analyzeWithAI(images);

    if (result) {
      console.log('\n📊 AI分析結果:');
      console.log(`✅ ${result.pairs.length}組のペアを作成`);
      result.pairs.forEach((pair, idx) => {
        console.log(`  ペア${idx + 1}: ${pair.before} <-> ${pair.after} (${(pair.confidence * 100).toFixed(0)}%)`);
      });

      console.log('\n分析コメント:', result.analysis);
    }

    // 期待される結果との比較
    console.log('\n' + '=' .repeat(50));
    console.log('📋 期待との比較\n');

    const expectedPairs = [
      ['20251031_142150.jpg', 'P0000124.JPG'],
      ['20251031_142231.jpg', 'P0000123.JPG'],
      ['20251031_142252.jpg', 'P0000122.JPG'],
      ['20251031_142308.jpg', 'P0000121.JPG'],
      ['20251031_142321.jpg', 'P0000120.JPG']
    ];

    console.log('期待されるペア:');
    expectedPairs.forEach(([before, after], idx) => {
      console.log(`  ${idx + 1}. ${before} <-> ${after}`);
    });

    console.log('\n実際の結果（spatialPairingServiceシミュレーション）:');
    let correctCount = 0;
    spatialPairs.forEach((pair, idx) => {
      const expected = expectedPairs.find(([b, a]) => b === pair.before && a === pair.after);
      if (expected) {
        console.log(`  ✅ ペア${idx + 1}: ${pair.before} <-> ${pair.after}`);
        correctCount++;
      } else {
        console.log(`  ❌ ペア${idx + 1}: ${pair.before} <-> ${pair.after}`);
      }
    });

    console.log(`\n正解率: ${correctCount}/${expectedPairs.length} (${(correctCount/expectedPairs.length * 100).toFixed(0)}%)`);

    // 問題の分析
    console.log('\n🔍 問題の分析:');
    if (correctCount < expectedPairs.length) {
      console.log('ペアリングアルゴリズムが逆順でマッチングしているため、期待と異なる結果になっています。');
      console.log('実装では最初の着手前写真を最後の竣工写真とペアにしていますが、');
      console.log('実際には番号順（最初→最初、最後→最後）でペアにすべきです。');
    } else {
      console.log('✅ すべてのペアが正しくマッチしました！');
    }

  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

// 実行
main();