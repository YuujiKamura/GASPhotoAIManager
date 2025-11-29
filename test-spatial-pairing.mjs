#!/usr/bin/env node

import { GoogleGenAI } from '@google/genai';

// Configuration
const API_KEY = 'AIzaSyAoCXGQwsAHX8u-UrIQTLrMrW02pLEb7hw';

console.log('========================================');
console.log('座標ベース空間ペアリングテスト');
console.log('========================================\n');

/**
 * 座標ベースの景観要素解析をテスト
 */
async function testSpatialAnalysis() {
  const genAI = new GoogleGenAI({ apiKey: API_KEY });

  // テスト用の写真説明（実際の8枚の写真を想定）
  const testPhotos = [
    {
      fileName: 'image1.jpg',
      description: '青いゴミ箱が左端(x=15)、コンクリート壁が右側(x=70-100)、未舗装'
    },
    {
      fileName: 'image2.jpg',
      description: '青いゴミ箱が左端(x=15)、コンクリート壁が右側(x=70-100)、舗装済み'
    },
    {
      fileName: 'image3.jpg',
      description: '木製フェンスが右側(x=80-95)、狭い通路、未舗装'
    },
    {
      fileName: 'image4.jpg',
      description: '木製フェンスが右側(x=80-95)、狭い通路、舗装済み'
    },
    {
      fileName: 'image5.jpg',
      description: 'バリアポールが中央やや右(x=60)、電柱が左(x=20)、未舗装'
    },
    {
      fileName: 'image6.jpg',
      description: 'バリアポールが中央やや右(x=60)、電柱が左(x=20)、舗装済み'
    },
    {
      fileName: 'image7.jpg',
      description: '広い入口、バリアが左(x=25)、建物が背景中央(x=40-60)、未舗装'
    },
    {
      fileName: 'image8.jpg',
      description: '広い入口、バリアが左(x=25)、建物が背景中央(x=40-60)、舗装済み'
    }
  ];

  const prompt = `
建設現場写真の空間的特徴を座標ベースで分析してください。

各写真の固定景観要素（ランドマーク）を100x100グリッドの座標で記録してください。

写真リスト:
${testPhotos.map(p => `- ${p.fileName}: ${p.description}`).join('\n')}

出力JSON:
{
  "analyses": [
    {
      "fileName": "写真名",
      "landmarks": [
        {
          "type": "タイプ",
          "position": {"x": 数値, "y": 数値},
          "size": {"width": 数値, "height": 数値},
          "description": "説明"
        }
      ],
      "groundCondition": "unpaved/paved"
    }
  ]
}

重要: 同じ場所の写真は、ランドマークの座標がほぼ一致（±5以内）するはずです。
`;

  try {
    console.log('Step 1: 空間特徴の抽出...\n');

    const result = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    });

    const analyses = JSON.parse(result.text).analyses;

    console.log('抽出された空間特徴:');
    analyses.forEach(analysis => {
      console.log(`\n${analysis.fileName}:`);
      analysis.landmarks.forEach(landmark => {
        console.log(`  - ${landmark.type} at (${landmark.position.x}, ${landmark.position.y}): ${landmark.description}`);
      });
    });

    console.log('\n----------------------------------------');
    console.log('Step 2: 空間的類似度の計算...\n');

    // 類似度を計算
    const pairs = [];
    for (let i = 0; i < analyses.length; i++) {
      for (let j = i + 1; j < analyses.length; j++) {
        const similarity = calculateSimilarity(analyses[i], analyses[j]);
        if (similarity > 0.7) {
          pairs.push({
            photo1: analyses[i].fileName,
            photo2: analyses[j].fileName,
            similarity: similarity,
            condition1: analyses[i].groundCondition,
            condition2: analyses[j].groundCondition
          });
        }
      }
    }

    // ペアをグループ化
    console.log('検出されたペア:');
    const groups = {};
    pairs.forEach(pair => {
      // 異なる地面状態のペアのみ
      if (pair.condition1 !== pair.condition2) {
        const key = [pair.photo1, pair.photo2].sort().join('-');
        const groupName = pair.photo1.replace(/\d+/, '');
        if (!groups[groupName]) groups[groupName] = [];
        groups[groupName].push(pair);
      }
    });

    Object.entries(groups).forEach(([name, groupPairs]) => {
      console.log(`\nグループ: ${name}`);
      groupPairs.forEach(pair => {
        console.log(`  ${pair.photo1} ←→ ${pair.photo2} (類似度: ${(pair.similarity * 100).toFixed(1)}%)`);
      });
    });

    // 期待される結果と比較
    console.log('\n========================================');
    console.log('検証結果');
    console.log('========================================');

    const expected = [
      ['image1.jpg', 'image2.jpg'],
      ['image3.jpg', 'image4.jpg'],
      ['image5.jpg', 'image6.jpg'],
      ['image7.jpg', 'image8.jpg']
    ];

    let correctCount = 0;
    expected.forEach(([before, after], idx) => {
      const found = pairs.find(p =>
        (p.photo1 === before && p.photo2 === after) ||
        (p.photo1 === after && p.photo2 === before)
      );
      if (found) {
        console.log(`✅ ペア${idx + 1}: 正しく検出 (類似度: ${(found.similarity * 100).toFixed(1)}%)`);
        correctCount++;
      } else {
        console.log(`❌ ペア${idx + 1}: 検出失敗`);
      }
    });

    console.log(`\n精度: ${correctCount}/4 (${(correctCount / 4 * 100).toFixed(0)}%)`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

/**
 * 空間的類似度を計算
 */
function calculateSimilarity(analysis1, analysis2) {
  let matchedLandmarks = 0;
  let totalLandmarks = 0;

  analysis1.landmarks.forEach(l1 => {
    totalLandmarks++;
    const match = analysis2.landmarks.find(l2 => {
      if (l1.type !== l2.type) return false;
      const distance = Math.sqrt(
        Math.pow(l1.position.x - l2.position.x, 2) +
        Math.pow(l1.position.y - l2.position.y, 2)
      );
      return distance < 10; // 座標差が10以内なら同じとみなす
    });
    if (match) matchedLandmarks++;
  });

  return totalLandmarks > 0 ? matchedLandmarks / totalLandmarks : 0;
}

// Run test
testSpatialAnalysis();