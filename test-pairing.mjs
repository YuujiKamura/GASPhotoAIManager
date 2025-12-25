#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { GoogleGenAI } from '@google/genai';

// ===== Cost Estimation Module =====
const PRICING = {
  'gemini-2.5-flash': { input: 0.075, output: 0.30, imageTokens: 258, label: 'Gemini 2.5 Flash' },
  'gemini-2.5-pro': { input: 1.25, output: 10.0, imageTokens: 258, label: 'Gemini 2.5 Pro' },
};
const USD_TO_JPY = 150;

function estimateCost(imageCount, model = 'gemini-2.5-flash', apiCalls = 1) {
  const pricing = PRICING[model];
  const imageTokens = imageCount * pricing.imageTokens;
  const inputTokens = imageTokens * apiCalls;
  const outputTokens = imageCount * 50 * apiCalls;
  const costUSD = (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
  return { inputTokens, outputTokens, apiCalls, costUSD, costJPY: costUSD * USD_TO_JPY, imageCount, model };
}

function showEstimate(est) {
  const label = PRICING[est.model]?.label || est.model;
  console.log(`
📊 処理前見積もり
├─ 画像: ${est.imageCount}枚
├─ 推定トークン: 入力${est.inputTokens.toLocaleString()} / 出力${est.outputTokens.toLocaleString()}
├─ API呼び出し: ${est.apiCalls}回
├─ モデル: ${label}
└─ 推定コスト: $${est.costUSD.toFixed(4)} (約${Math.ceil(est.costJPY)}円)
`);
}

function askConfirmation() {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('[Y] 実行 / [N] キャンセル: ', answer => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes' || normalized === '');
    });
  });
}

function progressBar(pct, width = 20) {
  const filled = Math.round(width * pct / 100);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}
// ===== End Cost Module =====

const API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
if (!API_KEY) {
  console.error('❌ GEMINI_API_KEY 環境変数が設定されていません');
  console.error('   .envファイルに GEMINI_API_KEY=... を設定するか、');
  console.error('   環境変数として設定してください');
  process.exit(1);
}
const SKIP_CONFIRM = process.argv.includes('--yes') || process.argv.includes('-y');
const args = process.argv.slice(2).filter(a => !a.startsWith('-'));
const TEST_DIR = args[0] || './test-images';

console.log('========================================');
console.log('Photo Pairing Test Tool');
console.log('========================================');
console.log(`Target Directory: ${TEST_DIR}`);
console.log('');

function imageToBase64(filePath) {
  const bitmap = fs.readFileSync(filePath);
  return Buffer.from(bitmap).toString('base64');
}

function getPhotoDate(filePath, fileName) {
  const match = fileName.match(/(\d{8})_(\d{6})/);
  if (match) {
    const year = match[1].substr(0, 4);
    const month = match[1].substr(4, 2);
    const day = match[1].substr(6, 2);
    const hour = match[2].substr(0, 2);
    const min = match[2].substr(2, 2);
    const sec = match[2].substr(4, 2);
    return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`).getTime();
  }
  const stats = fs.statSync(filePath);
  return stats.mtime.getTime();
}

async function testPairing() {
  const startTime = Date.now();
  let actualInputTokens = 0;
  let actualOutputTokens = 0;

  try {
    console.log('Step 1: Reading image files...');
    const files = fs.readdirSync(TEST_DIR)
      .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
      .slice(0, 10);

    console.log(`Found ${files.length} image files`);

    if (files.length === 0) {
      console.error('No image files found!');
      return;
    }

    // ===== コスト見積もり表示 =====
    const estimate = estimateCost(files.length, 'gemini-2.5-flash', 1);
    showEstimate(estimate);

    if (!SKIP_CONFIRM) {
      const confirmed = await askConfirmation();
      if (!confirmed) {
        console.log('キャンセルしました');
        return;
      }
    } else {
      console.log('--yes フラグにより自動実行');
    }
    console.log('');
    // ===== 見積もり表示終了 =====

    const photos = files.map(fileName => {
      const filePath = path.join(TEST_DIR, fileName);
      return {
        fileName,
        filePath,
        date: getPhotoDate(filePath, fileName),
        base64: `data:image/jpeg;base64,${imageToBase64(filePath)}`,
        mimeType: 'image/jpeg'
      };
    });

    photos.sort((a, b) => a.date - b.date);

    console.log('Photos to process:');
    photos.forEach(p => {
      const date = new Date(p.date);
      console.log(`  - ${p.fileName} (${date.toLocaleString('ja-JP')})`);
    });

    console.log('\nStep 2: Calling Gemini API for scene detection...');
    process.stdout.write(`⏳ 処理中 [${progressBar(0)}] 0%`);

    const genAI = new GoogleGenAI({ apiKey: API_KEY });

    const prompt = `
建設現場の定点撮影写真を分析してください。

以下の写真を見て、同じ撮影地点から撮られた写真をグループ化し、
各写真の工事段階（着手前/完了/施工中）を判定してください。

出力形式（JSON）:
{
  "photos": [
    {
      "fileName": "ファイル名",
      "sceneId": "場所ID（同じ場所ならS1, S2など同じIDを付ける）",
      "phase": "before/after/status",
      "description": "簡単な説明"
    }
  ]
}

写真リスト: ${photos.map(p => p.fileName).join(', ')}
`;

    const parts = [{ text: prompt }];
    photos.forEach(p => {
      const base64Data = p.base64.split(',')[1];
      parts.push({
        inlineData: { mimeType: p.mimeType, data: base64Data }
      });
    });

    const result = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts }],
      config: { responseMimeType: 'application/json', temperature: 0.3 }
    });
    const text = result.text;

    process.stdout.write(`\r⏳ 処理中 [${progressBar(100)}] 100%\n`);
    console.log('API Response received');

    actualInputTokens = estimate.inputTokens;
    actualOutputTokens = text.length / 4;

    let analysis;
    try {
      const jsonMatch = text.match(/{[\s\S]*}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (e) {
      console.error('Failed to parse API response:', e.message);
      console.log('Raw response:', text);
      return;
    }

    console.log('\nStep 3: Grouping photos by scene...');
    const groups = {};

    analysis.photos.forEach(photo => {
      const sceneId = photo.sceneId || 'UNKNOWN';
      if (!groups[sceneId]) groups[sceneId] = [];
      const original = photos.find(p => p.fileName === photo.fileName);
      if (original) {
        groups[sceneId].push({ ...original, ...photo });
      }
    });

    console.log('\nStep 4: Creating before-after pairs...');
    const pairs = [];

    Object.entries(groups).forEach(([sceneId, groupPhotos]) => {
      console.log(`\nScene ${sceneId}: ${groupPhotos.length} photos`);

      if (groupPhotos.length < 2) {
        console.log('  -> Not enough photos for a pair');
        return;
      }

      groupPhotos.sort((a, b) => a.date - b.date);

      let beforePhoto = groupPhotos.find(p => p.phase === 'before') || groupPhotos[0];
      let afterPhoto = groupPhotos.find(p => p.phase === 'after') || groupPhotos[groupPhotos.length - 1];

      if (beforePhoto && afterPhoto && beforePhoto.fileName !== afterPhoto.fileName) {
        pairs.push({ sceneId, before: beforePhoto, after: afterPhoto });
        console.log(`  -> Pair created:`);
        console.log(`     Before: ${beforePhoto.fileName} (${beforePhoto.description || 'N/A'})`);
        console.log(`     After:  ${afterPhoto.fileName} (${afterPhoto.description || 'N/A'})`);
      } else {
        console.log('  -> Could not create a valid pair');
      }
    });

    console.log('\n========================================');
    console.log('SUMMARY');
    console.log('========================================');
    console.log(`Total photos processed: ${photos.length}`);
    console.log(`Scenes identified: ${Object.keys(groups).length}`);
    console.log(`Pairs created: ${pairs.length}`);

    if (pairs.length > 0) {
      console.log('\nFinal pairs for photo album:');
      pairs.forEach((pair, idx) => {
        console.log(`\nPair ${idx + 1} (Scene ${pair.sceneId}):`);
        console.log(`  [着手前] ${pair.before.fileName}`);
        console.log(`  [竣工]   ${pair.after.fileName}`);
      });
    }

    // ===== コストレポート表示 =====
    const duration = Date.now() - startTime;
    const pricing = PRICING['gemini-2.5-flash'];
    const actualCostUSD = (actualInputTokens / 1_000_000) * pricing.input + (actualOutputTokens / 1_000_000) * pricing.output;
    const accuracy = estimate.costUSD > 0
      ? Math.round((1 - Math.abs(actualCostUSD - estimate.costUSD) / estimate.costUSD) * 100)
      : 100;

    console.log(`
✅ 処理完了
├─ 実際のトークン: 入力${actualInputTokens.toLocaleString()} / 出力${Math.round(actualOutputTokens).toLocaleString()}
├─ 実際のコスト: $${actualCostUSD.toFixed(4)} (約${Math.ceil(actualCostUSD * USD_TO_JPY)}円)
├─ 見積もり精度: ${Math.max(0, accuracy)}%
└─ 処理時間: ${(duration / 1000).toFixed(1)}秒
`);
    // ===== コストレポート終了 =====

  } catch (error) {
    console.error('\nError:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

testPairing();
