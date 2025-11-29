import { GoogleGenAI } from "@google/genai";
import { PhotoRecord } from "../types";
import { extractBase64Data } from "../utils/imageUtils";

const PRIMARY_MODEL = "gemini-3-pro-preview"; // 高精度モデルを使用

/**
 * 座標ベースの景観要素抽出とペアリングサービス
 * より厳密な空間的特徴の一致を判定
 */

interface LandmarkFeature {
  type: 'building' | 'pole' | 'sign' | 'fence' | 'wall' | 'tree' | 'road_edge';
  position: {
    x: number;  // 0-100 (左端を0、右端を100とする相対座標)
    y: number;  // 0-100 (上端を0、下端を100とする相対座標)
  };
  size: {
    width: number;  // 0-100 (画像幅に対する相対サイズ)
    height: number; // 0-100 (画像高さに対する相対サイズ)
  };
  description: string;
  confidence: number;
}

interface SpatialAnalysis {
  fileName: string;
  landmarks: LandmarkFeature[];
  viewpoint: {
    direction: 'north' | 'south' | 'east' | 'west' | 'unknown';
    elevation: 'ground' | 'elevated' | 'aerial';
    fov: 'narrow' | 'normal' | 'wide'; // 視野角
  };
  groundCondition: 'unpaved' | 'paved' | 'under_construction';
  signature: string; // 空間的特徴のハッシュ値
}

/**
 * 座標ベースで景観要素を抽出
 */
export const extractSpatialFeatures = async (
  records: PhotoRecord[],
  apiKey: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error') => void
): Promise<SpatialAnalysis[]> => {

  const genAI = new GoogleGenAI({ apiKey });
  onLog?.('座標ベースの景観要素を抽出中...', 'info');

  const inputs = records.map(r => ({
    fileName: r.fileName,
    image: {
      inlineData: {
        data: extractBase64Data(r.base64),
        mimeType: r.mimeType
      }
    }
  }));

  const prompt = `
あなたは建設現場の定点撮影写真の空間解析の専門家です。

各写真について、固定された景観要素（ランドマーク）を座標ベースで正確に抽出してください。

【重要な指示】
1. 画像を100x100のグリッドとして扱い、各要素の位置を座標で表現
2. 恒久的な構造物のみを抽出（一時的な物は除外）
3. 同じ場所から撮影された写真は、ランドマークの座標がほぼ一致するはず

【抽出する要素】
- 建物（屋根の形状、色、窓の配置も記録）
- 電柱・電線（位置と本数）
- 標識・看板
- フェンス・塀（材質と高さ）
- 擁壁・段差
- 道路の縁石
- 特徴的な樹木

【地面状態の判定（重要）】
- "unpaved": 未舗装（砂利、土、雑草、ひび割れたアスファルト）
- "paved": 舗装完了（新しいアスファルト、きれいな白線）
- "under_construction": 工事中間状態
  * 瀝青安定処理路盤工の完成状態（灰色の砂で一様に覆われている）
  * 下地処理完了状態
  * 中間舗装層

重要: 路面が一様に灰色の砂や砕石で覆われている場合は "under_construction" と判定してください。

【出力形式（JSON）】
{
  "analyses": [
    {
      "fileName": "xxx.jpg",
      "landmarks": [
        {
          "type": "building/pole/sign/fence/wall/tree/road_edge",
          "position": {"x": 0-100, "y": 0-100},
          "size": {"width": 0-100, "height": 0-100},
          "description": "詳細な説明（例：青い屋根の2階建て住宅）",
          "confidence": 0.0-1.0
        }
      ],
      "viewpoint": {
        "direction": "推定される撮影方向",
        "elevation": "ground/elevated",
        "fov": "narrow/normal/wide"
      },
      "groundCondition": "unpaved/paved/under_construction",
      "signature": "ランドマークの配置を表す一意の文字列"
    }
  ]
}

【座標の例】
- 左端の電柱: x=10, y=20
- 中央の建物: x=50, y=30, width=30, height=40
- 右端のフェンス: x=85, y=50

必ず各要素の正確な座標を記録してください。
`;

  const parts: any[] = [{ text: prompt }];
  inputs.forEach(input => {
    parts.push(input.image);
    parts.push({ text: `[${input.fileName}]\n` });
  });

  try {
    const result = await genAI.models.generateContent({
      model: PRIMARY_MODEL,
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1 // 低温度で一貫性を保つ
      }
    });

    const response = JSON.parse(result.text);
    onLog?.(`${response.analyses.length}枚の写真から空間特徴を抽出しました`, 'success');
    return response.analyses;

  } catch (error: any) {
    onLog?.('空間特徴の抽出に失敗しました', 'error');
    throw error;
  }
};

/**
 * 空間的特徴の類似度を計算
 */
const calculateSpatialSimilarity = (
  analysis1: SpatialAnalysis,
  analysis2: SpatialAnalysis
): number => {

  let totalScore = 0;
  let matchedLandmarks = 0;

  // 各ランドマークについて最も近いものを探す
  analysis1.landmarks.forEach(landmark1 => {
    let minDistance = Infinity;
    let bestMatch: LandmarkFeature | null = null;

    analysis2.landmarks.forEach(landmark2 => {
      // 同じタイプのランドマークのみ比較
      if (landmark1.type === landmark2.type) {
        // ユークリッド距離を計算
        const distance = Math.sqrt(
          Math.pow(landmark1.position.x - landmark2.position.x, 2) +
          Math.pow(landmark1.position.y - landmark2.position.y, 2)
        );

        if (distance < minDistance) {
          minDistance = distance;
          bestMatch = landmark2;
        }
      }
    });

    // 距離が15以内なら同じランドマークと見なす（画角の変化を考慮）
    if (bestMatch && minDistance < 15) {
      matchedLandmarks++;
      // サイズの類似度も考慮（より寛容に）
      const sizeSimilarity = 1 - (
        Math.abs(landmark1.size.width - bestMatch.size.width) +
        Math.abs(landmark1.size.height - bestMatch.size.height)
      ) / 300; // 200から300に緩和
      totalScore += sizeSimilarity;
    }
  });

  // ランドマークの一致率を計算（平均値を使用してより寛容に）
  const avgLandmarks = (analysis1.landmarks.length + analysis2.landmarks.length) / 2;
  const matchRate = matchedLandmarks / avgLandmarks;

  // 視点の一致も考慮（重要度を下げる）
  const viewpointMatch =
    analysis1.viewpoint.direction === analysis2.viewpoint.direction ? 0.1 : 0;

  // 基本スコアを高めに設定
  return Math.min(1.0, matchRate * 0.9 + viewpointMatch);
};

/**
 * 座標ベースのペアリング
 */
export const createSpatialPairs = async (
  records: PhotoRecord[],
  apiKey: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error') => void
): Promise<Array<{
  before: PhotoRecord,
  after: PhotoRecord,
  similarity: number,
  matchedLandmarks: string[]
}>> => {

  // 1. 空間特徴を抽出
  const analyses = await extractSpatialFeatures(records, apiKey, onLog);

  // 2. 分析結果をレコードにマッピング
  const analyzedRecords = records.map(record => {
    const analysis = analyses.find(a => a.fileName === record.fileName);
    return { record, analysis };
  }).filter(item => item.analysis !== undefined);

  // 3. 類似度行列を作成
  const similarityMatrix: number[][] = [];
  for (let i = 0; i < analyzedRecords.length; i++) {
    similarityMatrix[i] = [];
    for (let j = 0; j < analyzedRecords.length; j++) {
      if (i === j) {
        similarityMatrix[i][j] = 0;
      } else {
        similarityMatrix[i][j] = calculateSpatialSimilarity(
          analyzedRecords[i].analysis!,
          analyzedRecords[j].analysis!
        );
      }
    }
  }

  // 4. 類似度の高いペアをグループ化
  const groups: number[][] = [];
  const used = new Set<number>();

  for (let i = 0; i < analyzedRecords.length; i++) {
    if (used.has(i)) continue;

    const group = [i];
    used.add(i);

    for (let j = i + 1; j < analyzedRecords.length; j++) {
      if (used.has(j)) continue;

      // 類似度が0.6以上なら同じグループ（画角の変化を許容）
      if (similarityMatrix[i][j] > 0.6) {
        group.push(j);
        used.add(j);
      }
    }

    if (group.length >= 2) {
      groups.push(group);
    }
  }

  // 5. 各グループからペアを作成
  const pairs: Array<{
    before: PhotoRecord,
    after: PhotoRecord,
    similarity: number,
    matchedLandmarks: string[]
  }> = [];

  groups.forEach((group, groupIndex) => {
    const groupRecords = group.map(idx => analyzedRecords[idx]);

    // 日付でソート（古い順）
    groupRecords.sort((a, b) => (a.record.date || 0) - (b.record.date || 0));

    // 地面の状態で分類
    const unpaved = groupRecords.filter(r =>
      r.analysis?.groundCondition === 'unpaved'
    );
    const paved = groupRecords.filter(r =>
      r.analysis?.groundCondition === 'paved'
    );
    const underConstruction = groupRecords.filter(r =>
      r.analysis?.groundCondition === 'under_construction'
    );

    let beforeRecord: typeof groupRecords[0] | null = null;
    let afterRecord: typeof groupRecords[0] | null = null;

    // ケース1: unpaved と paved が明確に分かれている場合
    if (unpaved.length > 0 && paved.length > 0) {
      beforeRecord = unpaved[0];
      afterRecord = paved[paved.length - 1];
    }
    // ケース2: unpaved と under_construction の組み合わせ
    // （瀝青安定処理など、中間的な完成状態）
    else if (unpaved.length > 0 && underConstruction.length > 0) {
      beforeRecord = unpaved[0];
      afterRecord = underConstruction[underConstruction.length - 1];
    }
    // ケース3: under_construction と paved の組み合わせ
    else if (underConstruction.length > 0 && paved.length > 0) {
      beforeRecord = underConstruction[0];
      afterRecord = paved[paved.length - 1];
    }
    // ケース4: 地面状態による分類が失敗した場合のフォールバック
    // 単純に最初と最後をペアにする
    else if (groupRecords.length >= 2) {
      beforeRecord = groupRecords[0];
      afterRecord = groupRecords[groupRecords.length - 1];
      onLog?.(`警告: グループ${groupIndex + 1}は地面状態で分類できないため、日付で分割しました`, 'error');
    }

    if (beforeRecord && afterRecord && beforeRecord !== afterRecord) {
      // マッチしたランドマークのリスト
      const matchedLandmarks: string[] = [];
      beforeRecord.analysis?.landmarks.forEach(landmark => {
        afterRecord!.analysis?.landmarks.forEach(landmark2 => {
          if (landmark.type === landmark2.type) {
            const distance = Math.sqrt(
              Math.pow(landmark.position.x - landmark2.position.x, 2) +
              Math.pow(landmark.position.y - landmark2.position.y, 2)
            );
            if (distance < 15) {
              matchedLandmarks.push(
                `${landmark.type}: ${landmark.description} (座標: ${landmark.position.x}, ${landmark.position.y})`
              );
            }
          }
        });
      });

      pairs.push({
        before: beforeRecord.record,
        after: afterRecord.record,
        similarity: similarityMatrix[
          analyzedRecords.indexOf(beforeRecord)
        ][analyzedRecords.indexOf(afterRecord)],
        matchedLandmarks
      });
    }
  });

  onLog?.(`${pairs.length}組の空間的に一致するペアを作成しました`, 'success');

  // デバッグ情報を出力
  pairs.forEach((pair, idx) => {
    onLog?.(`ペア${idx + 1}: 類似度${(pair.similarity * 100).toFixed(1)}%`, 'info');
    pair.matchedLandmarks.forEach(landmark => {
      onLog?.(`  - ${landmark}`, 'info');
    });
  });

  return pairs;
};