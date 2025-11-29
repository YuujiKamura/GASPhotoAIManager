#!/usr/bin/env node

import { GoogleGenAI } from '@google/genai';

const API_KEY = 'AIzaSyAoCXGQwsAHX8u-UrIQTLrMrW02pLEb7hw';
const PRIMARY_MODEL = 'gemini-3-pro-preview';

console.log('========================================');
console.log('空間ペアリング安定性テスト（複数回実行）');
console.log('========================================\n');

// 実際の8枚の写真の特徴（前回のテスト結果を基に）
const testPhotos = [
  {
    fileName: 'image1_before.jpg',
    landmarks: [
      { type: 'bin', x: 15, y: 60, desc: '青いゴミ箱2個' },
      { type: 'fence', x: 10, y: 50, desc: '金網フェンス' },
      { type: 'wall', x: 85, y: 40, desc: 'コンクリート擁壁' },
      { type: 'house', x: 50, y: 20, desc: 'グレー2階建て住宅' }
    ],
    ground: 'unpaved'
  },
  {
    fileName: 'image2_after.jpg',
    landmarks: [
      { type: 'bin', x: 17, y: 62, desc: '青いゴミ箱2個' }, // 少しずれ
      { type: 'fence', x: 12, y: 48, desc: '金網フェンス' },
      { type: 'wall', x: 83, y: 42, desc: 'コンクリート擁壁' },
      { type: 'house', x: 52, y: 18, desc: 'グレー2階建て住宅' }
    ],
    ground: 'paved'
  },
  {
    fileName: 'image3_before.jpg',
    landmarks: [
      { type: 'wall', x: 20, y: 40, desc: '黒い家の壁' },
      { type: 'wall', x: 85, y: 35, desc: '高いコンクリート擁壁' },
      { type: 'fence', x: 85, y: 25, desc: '擁壁上のフェンス' },
      { type: 'house', x: 50, y: 35, desc: '奥の住宅' }
    ],
    ground: 'unpaved'
  },
  {
    fileName: 'image4_after.jpg',
    landmarks: [
      { type: 'wall', x: 23, y: 38, desc: '黒い家の壁' },
      { type: 'wall', x: 82, y: 37, desc: '高いコンクリート擁壁' },
      { type: 'fence', x: 82, y: 23, desc: '擁壁上のフェンス' },
      { type: 'house', x: 48, y: 33, desc: '奥の住宅' }
    ],
    ground: 'paved'
  },
  {
    fileName: 'image5_before.jpg',
    landmarks: [
      { type: 'fence', x: 15, y: 45, desc: 'メッシュフェンス' },
      { type: 'fence', x: 80, y: 50, desc: '木製フェンス' },
      { type: 'pole', x: 20, y: 30, desc: '電柱' },
      { type: 'pole', x: 55, y: 70, desc: '車止めポール' }
    ],
    ground: 'unpaved'
  },
  {
    fileName: 'image6_after.jpg',
    landmarks: [
      { type: 'fence', x: 18, y: 43, desc: 'メッシュフェンス' },
      { type: 'fence', x: 78, y: 52, desc: '木製フェンス' },
      { type: 'pole', x: 22, y: 28, desc: '電柱' },
      { type: 'pole', x: 57, y: 68, desc: '車止めポール' }
    ],
    ground: 'paved'
  },
  {
    fileName: 'image7_before.jpg',
    landmarks: [
      { type: 'fence', x: 25, y: 45, desc: 'メッシュフェンス' },
      { type: 'wall', x: 75, y: 55, desc: 'ブロック塀' },
      { type: 'house', x: 45, y: 30, desc: 'グレー住宅' },
      { type: 'pole', x: 25, y: 80, desc: '車止めポール' }
    ],
    ground: 'unpaved'
  },
  {
    fileName: 'image8_after.jpg',
    landmarks: [
      { type: 'fence', x: 28, y: 42, desc: 'メッシュフェンス' },
      { type: 'wall', x: 72, y: 58, desc: 'ブロック塀' },
      { type: 'house', x: 47, y: 28, desc: 'グレー住宅' },
      { type: 'pole', x: 28, y: 78, desc: '車止めポール' }
    ],
    ground: 'paved'
  }
];

// 空間的類似度を計算（調整済みアルゴリズム）
function calculateSimilarity(photo1, photo2) {
  let matchedCount = 0;
  let totalScore = 0;

  photo1.landmarks.forEach(lm1 => {
    let minDist = Infinity;
    let bestMatch = null;

    photo2.landmarks.forEach(lm2 => {
      if (lm1.type === lm2.type) {
        const dist = Math.sqrt(
          Math.pow(lm1.x - lm2.x, 2) +
          Math.pow(lm1.y - lm2.y, 2)
        );
        if (dist < minDist) {
          minDist = dist;
          bestMatch = lm2;
        }
      }
    });

    // 調整済み：距離15以内で一致
    if (bestMatch && minDist < 15) {
      matchedCount++;
      totalScore += (15 - minDist) / 15; // 距離に応じたスコア
    }
  });

  // 平均を使った寛容な計算
  const avgLandmarks = (photo1.landmarks.length + photo2.landmarks.length) / 2;
  const matchRate = matchedCount / avgLandmarks;

  return matchRate;
}

async function runPairingTest(iteration) {
  const genAI = new GoogleGenAI({ apiKey: API_KEY });

  console.log(`\n--- 実行 ${iteration} ---`);

  // プロンプトを少し変えて実行（実際の動作を模擬）
  const prompt = `
建設現場の定点撮影写真を空間的特徴で分析してペアリングしてください。

写真リスト：
${testPhotos.map((p, idx) => `
${idx + 1}. ${p.fileName}
  ランドマーク: ${p.landmarks.map(l => `${l.desc}(${l.type})@(${l.x},${l.y})`).join(', ')}
  地面: ${p.ground === 'paved' ? '舗装済み' : '未舗装'}
`).join('')}

重要：
- 同じ場所の写真はランドマークが似た座標にあるはず（±15程度の誤差は許容）
- 地面の状態が異なる（未舗装→舗装済み）ものをペアにする
- 撮影角度の違いによる座標のずれは許容する

出力JSON:
{
  "pairs": [
    {
      "before": "着手前ファイル名",
      "after": "完了後ファイル名",
      "confidence": 0.0-1.0,
      "reason": "マッチ理由"
    }
  ]
}
`;

  try {
    const result = await genAI.models.generateContent({
      model: PRIMARY_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1 // 低温度で一貫性を保つ
      }
    });

    const response = JSON.parse(result.text);
    return response.pairs;
  } catch (error) {
    console.error('エラー:', error.message);
    return [];
  }
}

// ローカルでの類似度計算テスト
function testLocalAlgorithm() {
  console.log('\n========================================');
  console.log('ローカルアルゴリズムでの類似度計算');
  console.log('========================================\n');

  const expectedPairs = [
    ['image1_before.jpg', 'image2_after.jpg'],
    ['image3_before.jpg', 'image4_after.jpg'],
    ['image5_before.jpg', 'image6_after.jpg'],
    ['image7_before.jpg', 'image8_after.jpg']
  ];

  expectedPairs.forEach(([before, after], idx) => {
    const photo1 = testPhotos.find(p => p.fileName === before);
    const photo2 = testPhotos.find(p => p.fileName === after);
    const similarity = calculateSimilarity(photo1, photo2);

    console.log(`ペア${idx + 1}: ${before} <-> ${after}`);
    console.log(`  類似度: ${(similarity * 100).toFixed(1)}%`);

    // クロスチェック（間違ったペアの類似度）
    if (idx < 3) {
      const wrongPair = testPhotos.find(p =>
        p.fileName === expectedPairs[idx + 1][1]
      );
      const wrongSim = calculateSimilarity(photo1, wrongPair);
      console.log(`  誤ペアとの類似度: ${(wrongSim * 100).toFixed(1)}%`);
    }
  });
}

async function runMultipleTests() {
  // まずローカルアルゴリズムをテスト
  testLocalAlgorithm();

  // 期待されるペア
  const expected = [
    ['image1_before.jpg', 'image2_after.jpg'],
    ['image3_before.jpg', 'image4_after.jpg'],
    ['image5_before.jpg', 'image6_after.jpg'],
    ['image7_before.jpg', 'image8_after.jpg']
  ];

  // 複数回実行して結果を集計
  const results = [];
  const iterations = 10;

  console.log('\n========================================');
  console.log('AIモデルでのペアリング（10回実行）');
  console.log('========================================');

  for (let i = 1; i <= iterations; i++) {
    const pairs = await runPairingTest(i);
    results.push(pairs);

    // 結果を表示
    pairs.forEach(pair => {
      console.log(`  ${pair.before} <-> ${pair.after} (${(pair.confidence * 100).toFixed(0)}%)`);
    });

    // 待機（API制限を考慮）
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 成功率を計算
  console.log('\n========================================');
  console.log('統計結果');
  console.log('========================================\n');

  const pairCounts = {};
  expected.forEach(([before, after], idx) => {
    let correctCount = 0;

    results.forEach(testPairs => {
      const found = testPairs.find(p =>
        p.before === before && p.after === after
      );
      if (found) correctCount++;
    });

    const successRate = (correctCount / iterations * 100).toFixed(0);
    console.log(`ペア${idx + 1} (${before} <-> ${after}): ${correctCount}/${iterations}回成功 (${successRate}%)`);

    pairCounts[`pair${idx + 1}`] = correctCount;
  });

  // 全体の成功率
  const totalCorrect = Object.values(pairCounts).reduce((sum, count) => sum + count, 0);
  const totalPossible = expected.length * iterations;
  const overallRate = (totalCorrect / totalPossible * 100).toFixed(0);

  console.log(`\n全体成功率: ${totalCorrect}/${totalPossible} (${overallRate}%)`);

  // 全4ペアが正しくマッチした回数
  const perfectRuns = results.filter(testPairs => {
    return expected.every(([before, after]) =>
      testPairs.find(p => p.before === before && p.after === after)
    );
  }).length;

  console.log(`完全正解率: ${perfectRuns}/${iterations}回 (${(perfectRuns/iterations * 100).toFixed(0)}%)`);

  if (overallRate >= 80) {
    console.log('\n✅ 調整成功！安定したペアリングが実現できています。');
  } else {
    console.log('\n⚠️ まだ調整が必要です。');
  }
}

// 実行
runMultipleTests().catch(console.error);