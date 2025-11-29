#!/usr/bin/env node

import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEY = 'AIzaSyAoCXGQwsAHX8u-UrIQTLrMrW02pLEb7hw';
const PRIMARY_MODEL = 'gemini-3-pro-preview';

// テスト用のフォルダパス
const testFolderPath = 'H:\\マイドライブ\\〇東区市道（2工区）舗装補修工事（水防等含）（単価契約）\\20251028小山町1359-5\\着手前、小山1359-5';

console.log('\n🔍 詳細デバッグモード（実画像）\n');
console.log('=' .repeat(50));

// 画像を読み込んでBase64に変換
async function loadImage(filePath) {
  const data = await fs.readFile(filePath);
  return data.toString('base64');
}

// フォルダから画像を読み込む
async function loadTestImages() {
  const files = await fs.readdir(testFolderPath);
  const imageFiles = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f));

  console.log(`📂 ${imageFiles.length}個の画像ファイルを発見`);

  const images = [];
  for (const fileName of imageFiles) {
    const filePath = path.join(testFolderPath, fileName);
    const base64 = await loadImage(filePath);
    const stats = await fs.stat(filePath);
    images.push({
      fileName,
      base64,
      size: stats.size
    });
  }

  // ファイル名順でソート
  images.sort((a, b) => a.fileName.localeCompare(b.fileName));
  return images;
}

// AI解析を実行
async function analyzeWithAI(images) {
  const genAI = new GoogleGenAI({ apiKey: API_KEY });

  // バッチ処理用プロンプト
  const prompt = `
建設工事の着手前・竣工写真を分析してください。
各写真について空間的特徴（ランドマーク）を抽出し、同じ場所で撮影されたペアを見つけてください。

写真リスト：
${images.map((img, idx) => `${idx + 1}. ${img.fileName}`).join('\n')}

各写真について以下を分析：
1. 視認できるランドマーク（建物、フェンス、電柱、壁など）とその位置
2. 地面の状態（舗装済み/未舗装）
3. 撮影場所の推定

その後、同じ場所で撮影された写真のペアを作成してください。
着手前（未舗装）と竣工（舗装済み）のペアになるはずです。

出力形式（JSON）:
{
  "photos": [
    {
      "fileName": "ファイル名",
      "landmarks": [
        {"type": "種類", "x": 座標X(0-100), "y": 座標Y(0-100), "description": "説明"}
      ],
      "groundState": "paved" | "unpaved",
      "viewAngle": "normal" | "wide" | "closeup"
    }
  ],
  "pairs": [
    {
      "before": "着手前ファイル名",
      "after": "竣工ファイル名",
      "confidence": 0.0-1.0,
      "matchedLandmarks": ["一致したランドマーク"],
      "reason": "ペアリング理由"
    }
  ],
  "unpaired": ["ペアにできなかった写真のファイル名"],
  "analysis": "全体的な分析コメント"
}`;

  // 画像データを含むリクエスト
  const parts = [{ text: prompt }];
  images.forEach(img => {
    parts.push({
      inline_data: {
        mime_type: 'image/jpeg',
        data: img.base64
      }
    });
  });

  console.log('\n⚙️  AIによる分析中...');

  try {
    const result = await genAI.models.generateContent({
      model: PRIMARY_MODEL,
      contents: [{ role: 'user', parts }],
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

// 結果の詳細表示
function displayResults(result, images) {
  console.log('\n' + '=' .repeat(50));
  console.log('📊 分析結果\n');

  // 各写真の詳細
  console.log('【写真の空間的特徴】');
  result.photos.forEach(photo => {
    console.log(`\n📷 ${photo.fileName}`);
    console.log(`  地面: ${photo.groundState === 'paved' ? '舗装済み' : '未舗装'}`);
    console.log(`  視野角: ${photo.viewAngle}`);
    console.log('  ランドマーク:');
    photo.landmarks.forEach(lm => {
      console.log(`    - ${lm.type}: ${lm.description} (座標: ${lm.x}, ${lm.y})`);
    });
  });

  console.log('\n' + '-'.repeat(50));
  console.log('\n【ペアリング結果】');

  if (result.pairs.length > 0) {
    console.log(`✅ ${result.pairs.length}組のペアを作成`);
    result.pairs.forEach((pair, idx) => {
      console.log(`\nペア${idx + 1}:`);
      console.log(`  着手前: ${pair.before}`);
      console.log(`  竣工:   ${pair.after}`);
      console.log(`  信頼度: ${(pair.confidence * 100).toFixed(0)}%`);
      console.log(`  一致したランドマーク: ${pair.matchedLandmarks.join(', ')}`);
      console.log(`  理由: ${pair.reason}`);
    });
  } else {
    console.log('❌ ペアが作成されませんでした');
  }

  if (result.unpaired && result.unpaired.length > 0) {
    console.log('\n⚠️  ペアにできなかった写真:');
    result.unpaired.forEach(fileName => {
      console.log(`  - ${fileName}`);
    });
  }

  console.log('\n【分析コメント】');
  console.log(result.analysis);

  // デバッグ情報の保存
  const debugData = {
    timestamp: new Date().toISOString(),
    imageCount: images.length,
    result
  };

  fs.writeFile(
    path.join(__dirname, 'debug-output.json'),
    JSON.stringify(debugData, null, 2)
  );
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

    // AI解析
    const result = await analyzeWithAI(images);

    if (result) {
      displayResults(result, images);

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

      let correctCount = 0;
      expectedPairs.forEach(([before, after]) => {
        const found = result.pairs?.find(p =>
          p.before === before && p.after === after
        );
        if (found) {
          console.log(`✅ ${before} <-> ${after}`);
          correctCount++;
        } else {
          console.log(`❌ ${before} <-> ${after} (見つからず)`);
        }
      });

      console.log(`\n正解率: ${correctCount}/${expectedPairs.length} (${(correctCount/expectedPairs.length * 100).toFixed(0)}%)`);
    }

  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

// 実行
main();