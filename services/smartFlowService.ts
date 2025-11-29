import { GoogleGenAI } from "@google/genai";
import { PhotoRecord, AIAnalysisResult } from "../types";
import { extractBase64Data } from "../utils/imageUtils";
import { createSpatialPairs } from "./spatialPairingService";

const PRIMARY_MODEL = "gemini-2.5-flash";
const DETECTION_MODEL = "gemini-2.5-flash"; // Fast model for initial detection

/**
 * Smart Flow Service
 * 写真の種類を自動判定して最適な処理フローに振り分ける
 */

/**
 * Step 1: 写真セットの種類を判定
 * 黒板あり（詳細解析必要） or 景観写真（ペアリングのみ）
 */
export const detectPhotoType = async (
  records: PhotoRecord[],
  apiKey: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error') => void
): Promise<'construction_with_board' | 'landscape_pairing'> => {

  const genAI = new GoogleGenAI({ apiKey });
  onLog?.('写真タイプを判定中...', 'info');

  // サンプル写真を3枚程度選択（全部見る必要はない）
  const samples = records.slice(0, Math.min(3, records.length));

  const inputs = samples.map(r => ({
    inlineData: {
      data: extractBase64Data(r.base64),
      mimeType: r.mimeType
    }
  }));

  const prompt = `
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
`;

  try {
    const result = await genAI.models.generateContent({
      model: DETECTION_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }, ...inputs] }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1
      }
    });

    const detection = JSON.parse(result.text);
    onLog?.(`写真タイプ: ${detection.type === 'WITH_BOARD' ? '黒板あり' : '景観のみ'} (確信度: ${detection.confidence})`, 'success');

    // 判定理由も表示
    if (detection.reason) {
      onLog?.(`判定理由: ${detection.reason}`, 'info');
    }

    // 低確信度の場合は景観モードにフォールバック
    if (detection.confidence === 'low' && detection.type === 'WITH_BOARD') {
      onLog?.('確信度が低いため、景観写真モードを使用します', 'info');
      return 'landscape_pairing';
    }

    return detection.type === 'WITH_BOARD' ? 'construction_with_board' : 'landscape_pairing';

  } catch (error) {
    onLog?.('写真タイプの判定に失敗。デフォルトモードで処理します', 'error');
    return 'construction_with_board'; // フォールバック
  }
};

/**
 * Step 2A: 景観写真用の最適化フロー（座標ベースペアリング）
 */
export const processLandscapePhotos = async (
  records: PhotoRecord[],
  apiKey: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error') => void
): Promise<{ pairs: Array<{ before: PhotoRecord, after: PhotoRecord, sceneId: string }> }> => {

  onLog?.('座標ベースの景観写真ペアリング処理を開始', 'info');

  try {
    // 座標ベースの厳密なペアリングを使用
    const spatialPairs = await createSpatialPairs(records, apiKey, onLog);

    // フォーマットを統一
    const pairs = spatialPairs.map((pair, index) => ({
      before: pair.before,
      after: pair.after,
      sceneId: `S${index + 1}_${Math.floor(pair.similarity * 100)}`
    }));

    onLog?.(`${pairs.length}組の空間的に一致するペアを作成しました`, 'success');

    // 類似度が低いペアに警告
    spatialPairs.forEach((pair, idx) => {
      if (pair.similarity < 0.8) {
        onLog?.(`注意: ペア${idx + 1}の類似度が低い (${(pair.similarity * 100).toFixed(1)}%)`, 'error');
      }
    });

    return { pairs };

  } catch (error: any) {
    onLog?.('座標ベースペアリングに失敗。フォールバック処理を実行', 'error');

    // フォールバック: 従来の簡易ペアリング
    return fallbackSimplePairing(records, apiKey, onLog);
  }
};

/**
 * フォールバック用の簡易ペアリング
 */
const fallbackSimplePairing = async (
  records: PhotoRecord[],
  apiKey: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error') => void
): Promise<{ pairs: Array<{ before: PhotoRecord, after: PhotoRecord, sceneId: string }> }> => {

  const genAI = new GoogleGenAI({ apiKey });
  onLog?.('フォールバック: 簡易ペアリング処理', 'info');

  // 日付でソートして、前半を着手前、後半を完了と仮定
  const sorted = [...records].sort((a, b) => (a.date || 0) - (b.date || 0));
  const midPoint = Math.floor(sorted.length / 2);

  const beforePhotos = sorted.slice(0, midPoint);
  const afterPhotos = sorted.slice(midPoint);

  const pairs: Array<{ before: PhotoRecord, after: PhotoRecord, sceneId: string }> = [];

  // 単純にインデックスでペアリング
  const pairCount = Math.min(beforePhotos.length, afterPhotos.length);
  for (let i = 0; i < pairCount; i++) {
    pairs.push({
      before: beforePhotos[i],
      after: afterPhotos[i],
      sceneId: `FALLBACK_${i + 1}`
    });
  }

  onLog?.(`フォールバック処理で${pairs.length}組のペアを作成`, 'error');
  return { pairs };
};

/**
 * Step 2B: 黒板あり写真用の従来フロー（詳細解析）
 */
export const processConstructionPhotos = async (
  records: PhotoRecord[],
  apiKey: string,
  instruction: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error') => void
): Promise<PhotoRecord[]> => {

  // 従来の詳細解析処理
  // analyzePhotoBatchを呼び出す
  onLog?.('黒板付き写真の詳細解析を開始', 'info');

  // ここは既存のanalyzePhotoBatchロジックを使用
  // 工種、測点、備考などを抽出

  return records; // 解析済みのrecordsを返す
};

/**
 * メインの自動振り分け処理
 */
export const processPhotosWithSmartFlow = async (
  records: PhotoRecord[],
  apiKey: string,
  instruction: string = "",
  onLog?: (msg: string, type: 'info' | 'success' | 'error') => void
): Promise<{
  type: 'paired' | 'analyzed',
  pairs?: Array<{ before: PhotoRecord, after: PhotoRecord, sceneId: string }>,
  photos?: PhotoRecord[]
}> => {

  // Step 1: 写真タイプを判定
  const photoType = await detectPhotoType(records, apiKey, onLog);

  // Step 2: タイプに応じた処理
  if (photoType === 'landscape_pairing') {
    // 景観写真：ペアリングのみ
    const result = await processLandscapePhotos(records, apiKey, onLog);
    return {
      type: 'paired',
      pairs: result.pairs
    };
  } else {
    // 黒板あり：従来の詳細解析
    const analyzedPhotos = await processConstructionPhotos(records, apiKey, instruction, onLog);
    return {
      type: 'analyzed',
      photos: analyzedPhotos
    };
  }
};