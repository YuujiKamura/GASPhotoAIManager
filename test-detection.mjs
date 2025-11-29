#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

const API_KEY = 'AIzaSyAoCXGQwsAHX8u-UrIQTLrMrW02pLEb7hw';
const TEST_DIR = 'H:/マイドライブ/〇東区市道（2工区）舗装補修工事（水防等含）（単価契約）/20251028小山4丁目/着手前、小山4丁目-6';

console.log('========================================');
console.log('写真タイプ検出テスト');
console.log('========================================');
console.log(`対象フォルダ: ${TEST_DIR}\n`);

function imageToBase64(filePath) {
  const bitmap = fs.readFileSync(filePath);
  return Buffer.from(bitmap).toString('base64');
}

async function testPhotoTypeDetection() {
  try {
    // 1. フォルダから写真を読み込み
    console.log('Step 1: 写真を読み込み中...');
    const files = fs.readdirSync(TEST_DIR)
      .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
      .slice(0, 3); // 最初の3枚をサンプルとして使用（実際のGUIフローと同じ）

    console.log(`サンプル写真: ${files.join(', ')}\n`);

    if (files.length === 0) {
      console.error('写真が見つかりません');
      return;
    }

    // 2. 写真をBase64エンコード
    const photos = files.map(fileName => {
      const filePath = path.join(TEST_DIR, fileName);
      return {
        fileName,
        base64: imageToBase64(filePath),
        mimeType: 'image/jpeg'
      };
    });

    // 3. detectPhotoType相当の処理を実行
    console.log('Step 2: 写真タイプを判定中...\n');

    const genAI = new GoogleGenAI({ apiKey: API_KEY });

    const inputs = photos.map(p => ({
      inlineData: {
        data: p.base64,
        mimeType: p.mimeType
      }
    }));

    // 複数のプロンプトでテスト
    const prompts = [
      {
        name: 'Original (smartFlowService - Updated)',
        prompt: `
建設現場の写真を分析してください。

工事黒板の判定基準：
- 明確な黒板（黒/白/緑の板）に文字が書かれている
- 工事名、測点、日付などの情報が記載されている板
- 電子黒板（タブレット等）も含む
- 通常は作業員が持つか、地面に立てかけてある

黒板がない場合：
- 景観のみの写真（道路、建物、電柱などの風景）
- 定点撮影の着手前・完了後の記録写真

重要な注意点：
- 地面の測点マーキングや番号は黒板ではない
- 一般的な標識や看板は黒板ではない
- ゴミ収集案内板などは黒板ではない
- 背景にある白い看板や掲示板は黒板ではない
- 工事黒板は通常、写真の前景に明確に配置される

工事黒板と判定するには以下の全てが必要：
1. 明確な板状の物体（黒、白、緑色のいずれか）
2. 工事関連の情報（工事名、日付、測点等）が読める
3. 意図的に写真に含めた配置（前景または中央）

複数枚ある場合、1枚でも上記の基準を全て満たす工事黒板があれば"WITH_BOARD"と判定。
それ以外は全て"LANDSCAPE"と判定。

出力（JSONのみ）:
{"type": "WITH_BOARD" または "LANDSCAPE", "confidence": "high/medium/low", "reason": "判定理由"}
`
      },
      {
        name: 'Strict Detection',
        prompt: `
建設現場の写真を分析してください。

工事黒板の判定基準：
- 明確な黒板（黒/白/緑の板）に文字が書かれている
- 工事名、測点、日付などの情報が記載されている
- 電子黒板（タブレット等）も含む

黒板がない場合：
- 景観のみの写真
- 道路、建物、電柱などの風景

重要：地面の測点マーキングや番号は黒板ではありません。

出力JSON:
{"type": "WITH_BOARD" または "LANDSCAPE", "reason": "判定理由"}
`
      },
      {
        name: 'Visual Check',
        prompt: `
写真を見て、以下を確認してください：

Q: 写真内に工事用の黒板（情報ボード）は見えますか？
- 黒板とは：工事名、日付、測点等が書かれた板状のもの
- 通常、作業員が持つか、地面に立てかけてある

注意：
- アスファルトに書かれた文字は黒板ではない
- 標識や看板は黒板ではない

出力JSON:
{"hasBlackboard": true/false, "whatISee": "見えるものの説明"}
`
      }
    ];

    for (const testPrompt of prompts) {
      console.log(`\n--- ${testPrompt.name} ---`);

      try {
        const result = await genAI.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: testPrompt.prompt }, ...inputs] }],
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1
          }
        });

        const response = JSON.parse(result.text);
        console.log('結果:', JSON.stringify(response, null, 2));

      } catch (error) {
        console.error('エラー:', error.message);
      }
    }

    // 4. 個別写真の内容を確認
    console.log('\n========================================');
    console.log('個別写真の内容確認');
    console.log('========================================\n');

    for (const photo of photos) {
      console.log(`\n${photo.fileName}:`);

      const descPrompt = `
この写真に何が写っているか説明してください：
- 黒板の有無
- 地面の状態
- 建物や構造物
- その他の特徴

出力JSON:
{
  "hasBlackboard": true/false,
  "groundCondition": "説明",
  "structures": ["リスト"],
  "otherFeatures": "その他"
}
`;

      try {
        const result = await genAI.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{
            role: 'user',
            parts: [
              { text: descPrompt },
              { inlineData: { data: photo.base64, mimeType: photo.mimeType } }
            ]
          }],
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1
          }
        });

        const desc = JSON.parse(result.text);
        console.log(JSON.stringify(desc, null, 2));

      } catch (error) {
        console.error('エラー:', error.message);
      }
    }

    // 5. 結論
    console.log('\n========================================');
    console.log('分析結果');
    console.log('========================================\n');

    console.log('考えられる原因：');
    console.log('1. アスファルトの測点マーキングを黒板と誤認？');
    console.log('2. P0000XXX.JPGファイルに黒板が含まれている？');
    console.log('3. 判定プロンプトが曖昧？');
    console.log('\n推奨対策：');
    console.log('- 黒板の定義をより厳密にする');
    console.log('- サンプル写真の選択を改善（全体からランダムに選ぶ）');
    console.log('- 景観写真モードを強制するオプションを追加');

  } catch (error) {
    console.error('テスト失敗:', error.message);
    if (error.stack) console.error(error.stack);
  }
}

// Run test
testPhotoTypeDetection();