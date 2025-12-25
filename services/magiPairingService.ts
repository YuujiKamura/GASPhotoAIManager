/**
 * MAGI方式の景観写真ペアリングサービス
 * 
 * 3回独立してペアリング判断を行い、合議制で最終結果を決定する
 * 機械的なアルゴリズムではなく、AIに直接「同じ場所か」を判断させる
 */

import { GoogleGenAI } from "@google/genai";
import { PhotoRecord } from "../types";
import { extractBase64Data } from "../utils/imageUtils";
import { getGenericCache, setGenericCache, generatePhotoSetHash } from "../utils/storage";

const PRIMARY_MODEL = "gemini-2.5-flash";
const MAGI_ROUNDS = 3;
const REQUIRE_UNANIMOUS = false; // true: 全会一致のみ採用, false: 多数決も採用
const PARALLEL_EXECUTION = true; // true: 3ラウンド並列実行, false: 逐次実行

// プロファイラ
interface MagiProfile {
  totalTime: number;
  rounds: { round: number; time: number; pairs: number }[];
  apiCalls: number;
  inputTokensEstimate: number;
  outputTokensEstimate: number;
}

let currentProfile: MagiProfile | null = null;

export function getMagiProfile(): MagiProfile | null {
  return currentProfile;
}

interface PairingVote {
  beforeFileName: string;
  afterFileName: string;
  confidence: number;
  reason: string;
}

interface PairingResult {
  before: PhotoRecord;
  after: PhotoRecord;
  votes: number; // 3回中何回一致したか
  confidence: number;
  reasons: string[];
}

// キャッシュ用のシリアライズ可能な形式
interface CachedPairingResult {
  beforeFileName: string;
  afterFileName: string;
  votes: number;
  confidence: number;
  reasons: string[];
}

interface MagiCache {
  results: CachedPairingResult[];
  profile: MagiProfile;
  timestamp: number;
}

/**
 * 写真を日付で分類（着手前/完了）
 * 日付が異なる写真群を自動的に分類する
 */
function classifyByDate(records: PhotoRecord[]): {
  beforePhotos: PhotoRecord[];
  afterPhotos: PhotoRecord[];
} {
  // 日付でソート
  const sorted = [...records].sort((a, b) => (a.date || 0) - (b.date || 0));
  
  if (sorted.length < 2) {
    return { beforePhotos: sorted, afterPhotos: [] };
  }
  
  // 日付の差が大きい境界を見つける（日付が明らかに違う場合）
  let maxGapIndex = 0;
  let maxGap = 0;
  
  for (let i = 0; i < sorted.length - 1; i++) {
    const date1 = sorted[i].date || 0;
    const date2 = sorted[i + 1].date || 0;
    const gap = date2 - date1;
    
    if (gap > maxGap) {
      maxGap = gap;
      maxGapIndex = i;
    }
  }
  
  // 1日以上（86400000ms）の差があれば、そこで分割
  const ONE_DAY = 24 * 60 * 60 * 1000;
  
  if (maxGap >= ONE_DAY) {
    // 日付の差が明確な場合、そこで分割
    const beforePhotos = sorted.slice(0, maxGapIndex + 1);
    const afterPhotos = sorted.slice(maxGapIndex + 1);
    return { beforePhotos, afterPhotos };
  }
  
  // 日付の差が小さい場合（同日撮影など）は中央で分割
  const midIndex = Math.floor(sorted.length / 2);
  const beforePhotos = sorted.slice(0, midIndex);
  const afterPhotos = sorted.slice(midIndex);
  
  return { beforePhotos, afterPhotos };
}

/**
 * 1回のペアリング判断を実行
 */
async function executePairingRound(
  beforePhotos: PhotoRecord[],
  afterPhotos: PhotoRecord[],
  genAI: GoogleGenAI,
  roundNumber: number,
  onLog?: (msg: string, type: 'info' | 'success' | 'error') => void
): Promise<PairingVote[]> {
  
  onLog?.(`[MAGI_PAIR] ラウンド${roundNumber}: ペアリング判断中...`, 'info');
  
  // 着手前写真のパーツを作成
  const beforeParts: any[] = [];
  beforePhotos.forEach((photo, idx) => {
    beforeParts.push({
      inlineData: {
        data: extractBase64Data(photo.base64),
        mimeType: photo.mimeType
      }
    });
    beforeParts.push({ text: `[着手前${idx + 1}: ${photo.fileName}]\n` });
  });
  
  // 完了写真のパーツを作成
  const afterParts: any[] = [];
  afterPhotos.forEach((photo, idx) => {
    afterParts.push({
      inlineData: {
        data: extractBase64Data(photo.base64),
        mimeType: photo.mimeType
      }
    });
    afterParts.push({ text: `[完了${idx + 1}: ${photo.fileName}]\n` });
  });
  
  const prompt = `
あなたは建設現場の定点撮影写真のペアリング専門家です。

【タスク】
「着手前」の写真と「完了」の写真を見比べて、**同じ場所を撮影したペア**を特定してください。

【判断基準】
1. **建物の配置**: 背景に写っている建物の位置、形状、色
2. **電柱・電線**: 電柱の位置と本数、電線の走り方
3. **フェンス・塀**: 位置、材質、高さ
4. **道路の形状**: カーブ、幅、縁石の位置
5. **撮影角度**: カメラの向きと高さ

【重要】
- 地面の状態（舗装前/舗装後）は変わっているので無視してください
- 背景の恒久的な構造物で判断してください
- 確信度が低い場合は無理にペアリングしないでください

【着手前写真】
${beforePhotos.map((p, i) => `着手前${i + 1}: ${p.fileName}`).join('\n')}

【完了写真】
${afterPhotos.map((p, i) => `完了${i + 1}: ${p.fileName}`).join('\n')}

【出力形式（JSON）】
{
  "pairs": [
    {
      "beforeFileName": "着手前のファイル名",
      "afterFileName": "完了のファイル名",
      "confidence": 0.0-1.0,
      "reason": "ペアリングの根拠（例：左側の灰色の建物と右側の電柱の配置が一致）"
    }
  ]
}

各着手前写真に対して最も適切な完了写真を1つだけ選んでください。
確信度が0.5未満の場合はペアに含めないでください。
`;

  const parts = [
    { text: "【着手前写真】\n" },
    ...beforeParts,
    { text: "\n【完了写真】\n" },
    ...afterParts,
    { text: prompt }
  ];

  try {
    const result = await genAI.models.generateContent({
      model: PRIMARY_MODEL,
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.3 + (roundNumber * 0.1) // ラウンドごとに少し温度を変える
      }
    });

    const response = JSON.parse(result.text || '{}');
    return response.pairs || [];
    
  } catch (error: any) {
    onLog?.(`[MAGI_PAIR] ラウンド${roundNumber}でエラー: ${error.message}`, 'error');
    return [];
  }
}

/**
 * MAGI方式でペアリングを実行
 */
export async function magiPairing(
  records: PhotoRecord[],
  apiKey: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error') => void
): Promise<PairingResult[]> {
  
  // キャッシュチェック
  const cacheKey = `magi_pairing_${generatePhotoSetHash(records)}`;
  const cached = await getGenericCache<MagiCache>(cacheKey);
  
  if (cached) {
    onLog?.(`[MAGI_PAIR] キャッシュから結果を取得`, 'success');
    currentProfile = cached.profile;
    
    // キャッシュされた結果をPhotoRecordにマッピング
    const results: PairingResult[] = [];
    for (const cr of cached.results) {
      const before = records.find(r => r.fileName === cr.beforeFileName);
      const after = records.find(r => r.fileName === cr.afterFileName);
      if (before && after) {
        results.push({
          before,
          after,
          votes: cr.votes,
          confidence: cr.confidence,
          reasons: cr.reasons
        });
      }
    }
    
    // プロファイル出力（キャッシュヒット）
    onLog?.(`[MAGI_PROFILE] ━━━━━━━━ CACHE HIT ━━━━━━━━`, 'info');
    onLog?.(`[MAGI_PROFILE] 元の処理時間: ${(cached.profile.totalTime / 1000).toFixed(2)}s`, 'info');
    onLog?.(`[MAGI_PROFILE] 元のAPIコール: ${cached.profile.apiCalls}回`, 'info');
    onLog?.(`[MAGI_PROFILE] 今回のコスト: $0 (キャッシュ使用)`, 'info');
    onLog?.(`[MAGI_PROFILE] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');
    
    const unanimous = results.filter(r => r.votes === MAGI_ROUNDS).length;
    const majority = results.filter(r => r.votes < MAGI_ROUNDS).length;
    onLog?.(`[MAGI_PAIR] 結果: 全会一致=${unanimous}組, 多数決=${majority}組, 合計=${results.length}組`, 'success');
    
    return results;
  }
  
  const totalStart = Date.now();
  
  // プロファイル初期化
  currentProfile = {
    totalTime: 0,
    rounds: [],
    apiCalls: 0,
    inputTokensEstimate: 0,
    outputTokensEstimate: 0
  };
  
  const genAI = new GoogleGenAI({ apiKey });
  
  // 1. 写真を日付で分類
  const { beforePhotos, afterPhotos } = classifyByDate(records);
  
  onLog?.(`[MAGI_PAIR] 着手前: ${beforePhotos.length}枚, 完了: ${afterPhotos.length}枚`, 'info');
  
  if (beforePhotos.length === 0 || afterPhotos.length === 0) {
    onLog?.(`[MAGI_PAIR] 着手前または完了の写真がありません`, 'error');
    return [];
  }
  
  // 画像トークン数を推定（1枚あたり約258トークン @ 768px）
  const imageTokensPerPhoto = 258;
  const totalImageTokens = (beforePhotos.length + afterPhotos.length) * imageTokensPerPhoto;
  const promptTokens = 500; // プロンプト文字数から推定
  const inputTokensPerRound = totalImageTokens + promptTokens;
  
  // 2. 3回独立してペアリング判断
  const allVotes: PairingVote[][] = [];
  
  if (PARALLEL_EXECUTION) {
    // 並列実行モード
    onLog?.(`[MAGI_PAIR] 3ラウンド並列実行中...`, 'info');
    const parallelStart = Date.now();
    
    const roundPromises = Array.from({ length: MAGI_ROUNDS }, (_, i) => {
      const round = i + 1;
      const roundStart = Date.now();
      return executePairingRound(beforePhotos, afterPhotos, genAI, round, onLog)
        .then(votes => ({
          round,
          votes,
          time: Date.now() - roundStart
        }));
    });
    
    const results = await Promise.all(roundPromises);
    
    for (const result of results) {
      allVotes.push(result.votes);
      currentProfile.rounds.push({ round: result.round, time: result.time, pairs: result.votes.length });
      currentProfile.apiCalls++;
      currentProfile.inputTokensEstimate += inputTokensPerRound;
      currentProfile.outputTokensEstimate += result.votes.length * 50;
      onLog?.(`[MAGI_PAIR] ラウンド${result.round}完了: ${result.votes.length}組 (${(result.time / 1000).toFixed(2)}s)`, 'info');
    }
    
    const parallelTime = Date.now() - parallelStart;
    onLog?.(`[MAGI_PAIR] 並列実行完了: 実時間${(parallelTime / 1000).toFixed(2)}s`, 'info');
    
  } else {
    // 逐次実行モード
    for (let round = 1; round <= MAGI_ROUNDS; round++) {
      const roundStart = Date.now();
      const votes = await executePairingRound(
        beforePhotos,
        afterPhotos,
        genAI,
        round,
        onLog
      );
      const roundTime = Date.now() - roundStart;
      
      allVotes.push(votes);
      currentProfile.rounds.push({ round, time: roundTime, pairs: votes.length });
      currentProfile.apiCalls++;
      currentProfile.inputTokensEstimate += inputTokensPerRound;
      currentProfile.outputTokensEstimate += votes.length * 50; // 1ペアあたり約50トークン
      
      onLog?.(`[MAGI_PAIR] ラウンド${round}完了: ${votes.length}組 (${(roundTime / 1000).toFixed(2)}s)`, 'info');
    }
  }
  
  // 3. 合議制で最終結果を決定
  const voteCount = new Map<string, {
    votes: number;
    confidences: number[];
    reasons: string[];
  }>();
  
  allVotes.forEach(roundVotes => {
    roundVotes.forEach(vote => {
      const key = `${vote.beforeFileName}:${vote.afterFileName}`;
      const existing = voteCount.get(key) || { votes: 0, confidences: [], reasons: [] };
      existing.votes++;
      existing.confidences.push(vote.confidence);
      existing.reasons.push(vote.reason);
      voteCount.set(key, existing);
    });
  });
  
  // 4. 採用基準に従ってペアを選定
  const requiredVotes = REQUIRE_UNANIMOUS ? MAGI_ROUNDS : 2;
  const results: PairingResult[] = [];
  const usedBefore = new Set<string>();
  const usedAfter = new Set<string>();
  
  // 票数の多い順にソート
  const sortedVotes = Array.from(voteCount.entries())
    .sort((a, b) => b[1].votes - a[1].votes);
  
  for (const [key, data] of sortedVotes) {
    const [beforeFileName, afterFileName] = key.split(':');
    
    // 既に使用済みの写真はスキップ
    if (usedBefore.has(beforeFileName) || usedAfter.has(afterFileName)) {
      continue;
    }
    
    // 採用基準を満たすか確認
    if (data.votes >= requiredVotes) {
      const beforeRecord = beforePhotos.find(p => p.fileName === beforeFileName);
      const afterRecord = afterPhotos.find(p => p.fileName === afterFileName);
      
      if (beforeRecord && afterRecord) {
        const avgConfidence = data.confidences.reduce((a, b) => a + b, 0) / data.confidences.length;
        
        results.push({
          before: beforeRecord,
          after: afterRecord,
          votes: data.votes,
          confidence: avgConfidence,
          reasons: data.reasons
        });
        
        usedBefore.add(beforeFileName);
        usedAfter.add(afterFileName);
        
        const consensusType = data.votes === MAGI_ROUNDS ? '全会一致' : '多数決';
        onLog?.(`[MAGI_PAIR] ${consensusType}: ${beforeFileName} ↔ ${afterFileName} (${data.votes}/${MAGI_ROUNDS}票)`, 'success');
      }
    } else if (data.votes >= 2) {
      // 多数決だが採用されなかったペアを報告
      onLog?.(`[MAGI_PAIR] 除外(多数決): ${beforeFileName} ↔ ${afterFileName} (${data.votes}/${MAGI_ROUNDS}票) ※全会一致のみ採用`, 'info');
    }
  }
  
  // 5. 統計を出力
  const unanimous = results.filter(r => r.votes === MAGI_ROUNDS).length;
  const majority = results.filter(r => r.votes < MAGI_ROUNDS).length;
  
  // プロファイル完了
  currentProfile.totalTime = Date.now() - totalStart;
  
  // コスト推定 (gemini-2.5-flash: $0.075/1M input, $0.30/1M output)
  const inputCost = (currentProfile.inputTokensEstimate / 1_000_000) * 0.075;
  const outputCost = (currentProfile.outputTokensEstimate / 1_000_000) * 0.30;
  const totalCost = inputCost + outputCost;
  
  onLog?.(`[MAGI_PAIR] 結果: 全会一致=${unanimous}組, 多数決=${majority}組, 合計=${results.length}組`, 'success');
  onLog?.(`[MAGI_PROFILE] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');
  onLog?.(`[MAGI_PROFILE] 総時間: ${(currentProfile.totalTime / 1000).toFixed(2)}s`, 'info');
  onLog?.(`[MAGI_PROFILE] APIコール: ${currentProfile.apiCalls}回`, 'info');
  currentProfile.rounds.forEach(r => {
    onLog?.(`[MAGI_PROFILE]   ラウンド${r.round}: ${(r.time / 1000).toFixed(2)}s, ${r.pairs}組検出`, 'info');
  });
  onLog?.(`[MAGI_PROFILE] 推定トークン: 入力=${currentProfile.inputTokensEstimate}, 出力=${currentProfile.outputTokensEstimate}`, 'info');
  onLog?.(`[MAGI_PROFILE] 推定コスト: $${totalCost.toFixed(4)} (入力$${inputCost.toFixed(4)} + 出力$${outputCost.toFixed(4)})`, 'info');
  onLog?.(`[MAGI_PROFILE] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');
  
  // 結果をキャッシュに保存
  const cacheData: MagiCache = {
    results: results.map(r => ({
      beforeFileName: r.before.fileName,
      afterFileName: r.after.fileName,
      votes: r.votes,
      confidence: r.confidence,
      reasons: r.reasons
    })),
    profile: currentProfile,
    timestamp: Date.now()
  };
  await setGenericCache(cacheKey, cacheData, 'magi_pairing');
  onLog?.(`[MAGI_PAIR] 結果をキャッシュに保存`, 'info');
  
  return results;
}

/**
 * キャッシュ対応のMAGIペアリング
 */
export async function magiPairingWithCache(
  records: PhotoRecord[],
  apiKey: string,
  folderPath: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error') => void
): Promise<PairingResult[]> {
  // TODO: キャッシュ実装
  // 現時点ではキャッシュなしで実行
  return magiPairing(records, apiKey, onLog);
}

