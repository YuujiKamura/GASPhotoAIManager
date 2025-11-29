import { GoogleGenAI } from "@google/genai";
import { PhotoRecord } from "../types";
import { extractBase64Data } from "../utils/imageUtils";

const PRIMARY_MODEL = "gemini-3-pro-preview";
const FAST_MODEL = "gemini-1.5-flash"; // 高速モデル

/**
 * 最適化された景観ペアリングサービス
 * 高速化のための改善:
 * 1. バッチ処理の最適化
 * 2. 並列処理の活用
 * 3. キャッシュの活用
 * 4. 軽量モデルでの前処理
 */

interface LandmarkFeature {
  type: 'building' | 'pole' | 'sign' | 'fence' | 'wall' | 'tree' | 'road_edge';
  position: { x: number; y: number };
  size: { width: number; height: number };
  description: string;
  confidence: number;
}

interface SpatialAnalysis {
  fileName: string;
  landmarks: LandmarkFeature[];
  viewpoint: {
    direction: 'north' | 'south' | 'east' | 'west' | 'unknown';
    elevation: 'ground' | 'elevated' | 'aerial';
    fov: 'narrow' | 'normal' | 'wide';
  };
  groundCondition: 'unpaved' | 'paved' | 'under_construction';
  signature: string;
  cachedHash?: string; // キャッシュ用のハッシュ
}

// グローバルキャッシュ（セッション中は維持）
const spatialCache = new Map<string, SpatialAnalysis>();

/**
 * ファイルからハッシュを生成（キャッシュキー用）
 */
const generateFileHash = (fileName: string, base64: string): string => {
  // ファイル名とbase64の最初の100文字でハッシュ生成（簡易版）
  return `${fileName}_${base64.substring(0, 100).replace(/[^a-zA-Z0-9]/g, '')}`;
};

/**
 * 高速な前処理（軽量モデルで基本分類）
 */
const quickClassifyImages = async (
  records: PhotoRecord[],
  apiKey: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error') => void
): Promise<Map<string, 'before' | 'after' | 'unknown'>> => {

  const genAI = new GoogleGenAI({ apiKey });
  const classification = new Map<string, 'before' | 'after' | 'unknown'>();

  // ファイル名から推測できるものは即座に分類
  records.forEach(record => {
    if (record.fileName.toLowerCase().includes('before') ||
        record.fileName.toLowerCase().includes('着手前')) {
      classification.set(record.fileName, 'before');
    } else if (record.fileName.toLowerCase().includes('after') ||
               record.fileName.toLowerCase().includes('竣工') ||
               record.fileName.toLowerCase().includes('完了')) {
      classification.set(record.fileName, 'after');
    }
  });

  // 未分類の画像のみAIで判定（軽量モデル使用）
  const unclassified = records.filter(r => !classification.has(r.fileName));

  if (unclassified.length > 0) {
    onLog?.(`${unclassified.length}枚を高速分類中...`, 'info');

    const prompt = `
写真のファイル名と内容から着手前/竣工を判定してください。
簡潔にJSON形式で回答:
{
  "classifications": {
    "ファイル名": "before|after|unknown"
  }
}`;

    const parts: any[] = [{ text: prompt }];
    unclassified.slice(0, 5).forEach(record => { // 最大5枚ずつ処理
      parts.push({
        inlineData: {
          data: extractBase64Data(record.base64),
          mimeType: record.mimeType
        }
      });
      parts.push({ text: record.fileName });
    });

    try {
      const result = await genAI.models.generateContent({
        model: FAST_MODEL, // 軽量モデル使用
        contents: [{ role: 'user', parts }],
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
          maxOutputTokens: 1000 // 出力を制限
        }
      });

      const response = JSON.parse(result.text);
      Object.entries(response.classifications).forEach(([fileName, type]) => {
        classification.set(fileName, type as 'before' | 'after' | 'unknown');
      });
    } catch (error) {
      onLog?.('高速分類に失敗、詳細分析にフォールバック', 'error');
    }
  }

  return classification;
};

/**
 * 並列バッチ処理で空間特徴を抽出
 */
export const extractSpatialFeaturesOptimized = async (
  records: PhotoRecord[],
  apiKey: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error') => void
): Promise<SpatialAnalysis[]> => {

  const genAI = new GoogleGenAI({ apiKey });
  const analyses: SpatialAnalysis[] = [];

  // キャッシュチェック
  const uncachedRecords: PhotoRecord[] = [];
  records.forEach(record => {
    const hash = generateFileHash(record.fileName, record.base64);
    if (spatialCache.has(hash)) {
      analyses.push(spatialCache.get(hash)!);
      onLog?.(`${record.fileName} はキャッシュから取得`, 'info');
    } else {
      uncachedRecords.push(record);
    }
  });

  if (uncachedRecords.length === 0) {
    onLog?.('すべてキャッシュから取得しました', 'success');
    return analyses;
  }

  onLog?.(`${uncachedRecords.length}枚の空間特徴を抽出中...`, 'info');

  // バッチサイズを最適化（大きすぎるとタイムアウト、小さすぎると遅い）
  const OPTIMAL_BATCH_SIZE = 4;
  const batches = [];
  for (let i = 0; i < uncachedRecords.length; i += OPTIMAL_BATCH_SIZE) {
    batches.push(uncachedRecords.slice(i, i + OPTIMAL_BATCH_SIZE));
  }

  // 簡略化されたプロンプト（必要最小限の情報のみ要求）
  const prompt = `
建設現場写真の空間解析。各写真の主要ランドマーク（建物、電柱、フェンス等）の座標と地面状態を抽出。

出力JSON:
{
  "analyses": [
    {
      "fileName": "xxx.jpg",
      "landmarks": [
        {
          "type": "building|pole|fence|wall",
          "position": {"x": 0-100, "y": 0-100},
          "size": {"width": 10, "height": 10},
          "description": "簡潔な説明",
          "confidence": 0.8
        }
      ],
      "groundCondition": "unpaved|paved|under_construction",
      "signature": "L1B2F3"
    }
  ]
}`;

  // 各バッチを並列処理
  const batchPromises = batches.map(async (batch, batchIndex) => {
    const parts: any[] = [{ text: prompt }];
    batch.forEach(record => {
      parts.push({
        inlineData: {
          data: extractBase64Data(record.base64),
          mimeType: record.mimeType
        }
      });
      parts.push({ text: `[${record.fileName}]` });
    });

    try {
      const result = await genAI.models.generateContent({
        model: PRIMARY_MODEL,
        contents: [{ role: 'user', parts }],
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
          maxOutputTokens: 2000 // 出力トークンを制限
        }
      });

      const response = JSON.parse(result.text);

      // キャッシュに保存
      response.analyses.forEach((analysis: SpatialAnalysis) => {
        const record = batch.find(r => r.fileName === analysis.fileName);
        if (record) {
          const hash = generateFileHash(record.fileName, record.base64);
          analysis.cachedHash = hash;
          spatialCache.set(hash, analysis);
        }
      });

      onLog?.(`バッチ${batchIndex + 1}/${batches.length}完了`, 'info');
      return response.analyses;

    } catch (error: any) {
      onLog?.(`バッチ${batchIndex + 1}失敗: ${error.message}`, 'error');
      return [];
    }
  });

  // すべてのバッチの結果を待つ
  const batchResults = await Promise.all(batchPromises);
  const newAnalyses = batchResults.flat();

  onLog?.(`${newAnalyses.length}枚の空間特徴を抽出完了`, 'success');
  return [...analyses, ...newAnalyses];
};

/**
 * 高速な類似度計算（簡略化版）
 */
const calculateSpatialSimilarityFast = (
  analysis1: SpatialAnalysis,
  analysis2: SpatialAnalysis
): number => {

  // 地面状態が同じ場合は低スコア
  if (analysis1.groundCondition === analysis2.groundCondition) {
    return 0.2;
  }

  let matchedCount = 0;
  const maxDistance = 15; // 許容距離

  // より高速な比較アルゴリズム
  const landmarks2Map = new Map<string, LandmarkFeature[]>();
  analysis2.landmarks.forEach(lm => {
    if (!landmarks2Map.has(lm.type)) {
      landmarks2Map.set(lm.type, []);
    }
    landmarks2Map.get(lm.type)!.push(lm);
  });

  analysis1.landmarks.forEach(lm1 => {
    const candidates = landmarks2Map.get(lm1.type) || [];
    for (const lm2 of candidates) {
      const distance = Math.sqrt(
        Math.pow(lm1.position.x - lm2.position.x, 2) +
        Math.pow(lm1.position.y - lm2.position.y, 2)
      );
      if (distance < maxDistance) {
        matchedCount++;
        break; // 最初の一致で次へ
      }
    }
  });

  const avgLandmarks = (analysis1.landmarks.length + analysis2.landmarks.length) / 2;
  return avgLandmarks > 0 ? matchedCount / avgLandmarks : 0;
};

/**
 * 最適化されたペアリング
 */
export const createSpatialPairsOptimized = async (
  records: PhotoRecord[],
  apiKey: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error') => void
): Promise<Array<{
  before: PhotoRecord,
  after: PhotoRecord,
  similarity: number,
  matchedLandmarks: string[]
}>> => {

  // 1. 高速前処理
  const quickClassification = await quickClassifyImages(records, apiKey, onLog);

  // 2. 明らかなbefore/afterグループ分け
  const likelyBefore = records.filter(r =>
    quickClassification.get(r.fileName) === 'before' ||
    r.fileName.match(/^\d{8}_\d{6}/)); // 日付形式は着手前の可能性大

  const likelyAfter = records.filter(r =>
    quickClassification.get(r.fileName) === 'after' ||
    r.fileName.match(/^P\d{7}/)); // P番号は竣工の可能性大

  // 3. 空間特徴を並列抽出
  const [beforeAnalyses, afterAnalyses] = await Promise.all([
    extractSpatialFeaturesOptimized(likelyBefore, apiKey, onLog),
    extractSpatialFeaturesOptimized(likelyAfter, apiKey, onLog)
  ]);

  // 4. 高速ペアリング
  const pairs: Array<{
    before: PhotoRecord,
    after: PhotoRecord,
    similarity: number,
    matchedLandmarks: string[]
  }> = [];

  const used = new Set<string>();

  beforeAnalyses.forEach((beforeAnalysis, beforeIdx) => {
    let bestMatch: { analysis: SpatialAnalysis, record: PhotoRecord, similarity: number } | null = null;

    afterAnalyses.forEach((afterAnalysis, afterIdx) => {
      if (used.has(afterAnalysis.fileName)) return;

      const similarity = calculateSpatialSimilarityFast(beforeAnalysis, afterAnalysis);

      if (similarity > 0.6 && (!bestMatch || similarity > bestMatch.similarity)) {
        bestMatch = {
          analysis: afterAnalysis,
          record: likelyAfter[afterIdx],
          similarity
        };
      }
    });

    if (bestMatch) {
      used.add(bestMatch.analysis.fileName);

      // マッチしたランドマークのリスト（簡略版）
      const matchedLandmarks = beforeAnalysis.landmarks
        .filter(lm => lm.confidence > 0.7)
        .map(lm => `${lm.type}: ${lm.description}`)
        .slice(0, 3); // 最大3つまで

      pairs.push({
        before: likelyBefore[beforeIdx],
        after: bestMatch.record,
        similarity: bestMatch.similarity,
        matchedLandmarks
      });
    }
  });

  onLog?.(`${pairs.length}組のペアを高速作成しました`, 'success');

  return pairs;
};

/**
 * キャッシュのクリア
 */
export const clearSpatialCache = (): void => {
  spatialCache.clear();
  console.log('空間キャッシュをクリアしました');
};

/**
 * キャッシュ統計の取得
 */
export const getCacheStats = (): { size: number, entries: string[] } => {
  return {
    size: spatialCache.size,
    entries: Array.from(spatialCache.keys())
  };
};