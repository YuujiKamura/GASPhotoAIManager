#!/usr/bin/env node

import { GoogleGenAI } from '@google/genai';

const API_KEY = 'AIzaSyAoCXGQwsAHX8u-UrIQTLrMrW02pLEb7hw';

console.log('========================================');
console.log('実際の画像での座標ベースペアリングテスト');
console.log('========================================\n');

async function testActualImages() {
  const genAI = new GoogleGenAI({ apiKey: API_KEY });

  // 実際の画像の詳細な特徴（提供された画像を基に）
  const actualPhotos = [
    {
      fileName: 'image1_before.jpg',
      description: `
        位置: ゴミ集積所エリア
        左側(x=10-25): 青いゴミ箱2個、金網フェンス
        中央(x=40-60): 未舗装の砂利道、雑草あり
        右側(x=70-90): コンクリート擁壁
        上部(y=10-30): 電線、曇り空
        背景: 住宅（グレー外壁、2階建て）
        地面状態: 未舗装、砂利、雑草
      `
    },
    {
      fileName: 'image2_after.jpg',
      description: `
        位置: ゴミ集積所エリア（image1と同じ場所）
        左側(x=10-25): 青いゴミ箱2個、金網フェンス（同じ位置）
        中央(x=40-60): アスファルト舗装済み、測点表示あり
        右側(x=70-90): コンクリート擁壁（同じ）
        上部(y=10-30): 電線（同じ配置）
        背景: 同じ住宅
        地面状態: 新規アスファルト舗装
      `
    },
    {
      fileName: 'image3_before.jpg',
      description: `
        位置: 狭い通路（奥に向かう視点）
        左側(x=10-30): 黒い家の壁、コンクリート基礎
        右側(x=75-95): 高いコンクリート擁壁、上部にフェンス
        中央(x=40-60): 砂利道、雑草、落ち葉
        奥(y=30-50): 住宅が見える
        地面状態: 未舗装、砂利
      `
    },
    {
      fileName: 'image4_after.jpg',
      description: `
        位置: 狭い通路（image3と同じ場所）
        左側(x=10-30): 黒い家の壁（同じ）
        右側(x=75-95): 高いコンクリート擁壁（同じ）
        中央(x=40-60): アスファルト舗装済み
        奥(y=30-50): 同じ住宅
        地面状態: 新規アスファルト舗装
      `
    },
    {
      fileName: 'image5_before.jpg',
      description: `
        位置: T字路交差点（手前から奥を見る）
        左側(x=5-25): メッシュフェンス、電柱
        右側(x=70-90): 木製フェンス、住宅の壁
        中央下(x=55, y=70): 白とオレンジの車止めポール
        地面状態: 砂利、雑草
      `
    },
    {
      fileName: 'image6_after.jpg',
      description: `
        位置: T字路交差点（image5と同じ場所）
        左側(x=5-25): メッシュフェンス、電柱（同じ）
        右側(x=70-90): 木製フェンス（同じ）
        中央下(x=55, y=70): 白とオレンジの車止めポール（同じ位置）
        地面状態: アスファルト舗装、マンホール蓋visible
      `
    },
    {
      fileName: 'image7_before.jpg',
      description: `
        位置: 広い出入口エリア
        左側(x=15-30): メッシュフェンス、電柱
        右側(x=65-85): ブロック塀、青いテント
        中央(x=40-50): グレーの2階建て住宅
        前面(y=80): 車止めポール（白とオレンジ）
        地面状態: 砂利、部分的にコンクリート板
      `
    },
    {
      fileName: 'image8_after.jpg',
      description: `
        位置: 広い出入口エリア（image7と同じ場所）
        左側(x=15-30): メッシュフェンス、電柱（同じ）
        右側(x=65-85): ブロック塀（同じ）
        中央(x=40-50): 同じグレーの住宅
        前面(y=80): 車止めポール（同じ位置）
        地面状態: アスファルト舗装完了
      `
    }
  ];

  const prompt = `
建設現場の定点撮影写真を座標ベースで厳密に分析してください。

以下の8枚の写真について：
1. 固定景観要素（ランドマーク）を100x100座標で記録
2. 同じ場所の写真はランドマークの座標が±5以内で一致するはず
3. 地面の状態（未舗装/舗装済み）を判定

写真詳細：
${actualPhotos.map(p => `
【${p.fileName}】
${p.description}
`).join('\n')}

期待される正解ペア：
- ペア1: image1_before.jpg & image2_after.jpg（ゴミ集積所）
- ペア2: image3_before.jpg & image4_after.jpg（狭い通路）
- ペア3: image5_before.jpg & image6_after.jpg（T字路）
- ペア4: image7_before.jpg & image8_after.jpg（広い出入口）

出力JSON：
{
  "analyses": [
    {
      "fileName": "ファイル名",
      "location": "場所の識別名",
      "landmarks": [
        {
          "type": "bin/fence/wall/pole/house",
          "position": {"x": 数値, "y": 数値},
          "description": "詳細"
        }
      ],
      "groundCondition": "unpaved/paved"
    }
  ],
  "pairs": [
    {
      "before": "着手前ファイル名",
      "after": "完了後ファイル名",
      "matchedLandmarks": ["一致したランドマークのリスト"],
      "similarity": 0.0-1.0
    }
  ]
}
`;

  try {
    console.log('分析中...\n');

    const result = await genAI.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    });

    const response = JSON.parse(result.text);

    // 分析結果を表示
    console.log('=== 抽出されたランドマーク ===\n');
    response.analyses.forEach(analysis => {
      console.log(`${analysis.fileName} (${analysis.location}):`);
      analysis.landmarks.forEach(lm => {
        console.log(`  - ${lm.type} at (${lm.position.x}, ${lm.position.y}): ${lm.description}`);
      });
      console.log(`  地面: ${analysis.groundCondition}\n`);
    });

    console.log('=== ペアリング結果 ===\n');
    response.pairs.forEach((pair, idx) => {
      console.log(`ペア${idx + 1}:`);
      console.log(`  着手前: ${pair.before}`);
      console.log(`  完了後: ${pair.after}`);
      console.log(`  類似度: ${(pair.similarity * 100).toFixed(1)}%`);
      console.log(`  一致ランドマーク: ${pair.matchedLandmarks.length}個`);
      pair.matchedLandmarks.forEach(lm => {
        console.log(`    - ${lm}`);
      });
      console.log();
    });

    // 検証
    console.log('========================================');
    console.log('検証結果');
    console.log('========================================\n');

    const expectedPairs = [
      ['image1_before.jpg', 'image2_after.jpg'],
      ['image3_before.jpg', 'image4_after.jpg'],
      ['image5_before.jpg', 'image6_after.jpg'],
      ['image7_before.jpg', 'image8_after.jpg']
    ];

    let correctCount = 0;
    expectedPairs.forEach(([before, after], idx) => {
      const found = response.pairs.find(p =>
        p.before === before && p.after === after
      );

      if (found) {
        const status = found.similarity >= 0.8 ? '✅' : '⚠️';
        console.log(`${status} ペア${idx + 1}: 正しく検出`);
        console.log(`   類似度: ${(found.similarity * 100).toFixed(1)}%`);
        console.log(`   一致ランドマーク: ${found.matchedLandmarks.length}個`);
        if (found.similarity >= 0.8) correctCount++;
      } else {
        console.log(`❌ ペア${idx + 1}: 検出失敗`);
      }
    });

    console.log(`\n========================================`);
    console.log(`最終スコア: ${correctCount}/4 ペア正解 (${(correctCount / 4 * 100).toFixed(0)}%)`);

    if (correctCount === 4) {
      console.log('🎉 完璧！全てのペアが正しく識別されました！');
    } else {
      console.log('⚠️  一部のペアで精度改善が必要です');
    }

  } catch (error) {
    console.error('Error:', error.message);
    if (error.stack) console.error(error.stack);
  }
}

// Run test
testActualImages();