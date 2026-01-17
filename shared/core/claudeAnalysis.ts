/**
 * Claude Code CLI - Core Analysis Module (2段階処理)
 *
 * Step1: 画像認識 (Vision) - OCR、数値抽出、シーン説明
 * Step2: マスタ照合 (Text) - 階層マスタとの照合で分類
 *
 * ## 変更履歴
 * - 2026-01-17: 2段階処理に変更（マスタ整合性向上）
 */

import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================
// 型定義
// ============================================

export interface PhotoInput {
  fileName: string;
  base64: string;
  mimeType: string;
  filePath?: string;
  date?: number;
}

/** Step1の出力: 画像から抽出した生データ */
interface RawImageData {
  fileName: string;
  hasBoard: boolean;
  detectedText: string;
  measurements: string;
  sceneDescription: string;
  photoCategoryGuess: string;  // 品質管理/施工状況/出来形/安全管理/着手前完成/使用材料
}

export interface AnalysisResult {
  fileName: string;
  workType: string;
  variety?: string;
  detail?: string;
  station: string;
  remarks: string;
  remarksCategory?: string;
  remarksValue?: string;
  description: string;
  measurements?: string;
  hasBoard: boolean;
  detectedText: string;
  reasoning?: string;
}

export type AppMode = 'construction' | 'general';

export type LogFunction = (
  msg: string,
  type: 'info' | 'success' | 'error' | 'json',
  details?: unknown
) => void;

export type AbortChecker = () => boolean;

export type ProgressCallback = (
  current: number,
  total: number,
  fileName: string,
  result?: AnalysisResult
) => void;

// ============================================
// メトリクス型定義
// ============================================

export interface BatchMetrics {
  index: number;
  imageCount: number;
  startTime: number;
  endTime: number;
  step1Duration: number;
  step2Duration: number;
  images: string[];
}

export interface ImageMetrics {
  fileName: string;
  step1Time: number;
  step2Time: number;
  totalTime: number;
  status: 'success' | 'error';
  error?: string;
}

export interface AnalysisMetrics {
  folderPath?: string;
  mode: AppMode;
  totalImages: number;
  timestamps: {
    analysisStart: number;
    analysisEnd: number;
  };
  batches: BatchMetrics[];
  perImage: ImageMetrics[];
  summary: {
    totalTime: number;
    avgTimePerImage: number;
    imagesPerSecond: number;
    successCount: number;
    errorCount: number;
    step1TotalTime: number;
    step2TotalTime: number;
  };
  rawResponses: {
    step: 'step1' | 'step2';
    batchIndex: number;
    response: string;
    parseSuccess: boolean;
    duration: number;
  }[];
}

export type MetricsEvent =
  | { type: 'analysis_start'; totalImages: number; mode: AppMode }
  | { type: 'batch_start'; batchIndex: number; totalBatches: number; imageCount: number; images: string[] }
  | { type: 'step_start'; step: 1 | 2; batchIndex: number }
  | { type: 'step_complete'; step: 1 | 2; batchIndex: number; duration: number }
  | { type: 'raw_response'; step: 1 | 2; batchIndex: number; response: string; duration: number }
  | { type: 'batch_complete'; batchIndex: number; duration: number; step1Duration: number; step2Duration: number }
  | { type: 'image_complete'; fileName: string; result: AnalysisResult }
  | { type: 'error'; message: string; batchIndex?: number; fileName?: string }
  | { type: 'analysis_complete'; metrics: AnalysisMetrics };

export type MetricsCallback = (event: MetricsEvent) => void;

export interface AnalyzeOptions {
  apiKey?: string;
  mode?: AppMode;
  instruction?: string;
  batchSize?: number;
  parallelBatches?: number;  // 同時実行バッチ数 (default: 1)
  model?: string;
  onLog?: LogFunction;
  onProgress?: ProgressCallback;
  onMetrics?: MetricsCallback;
  shouldAbort?: AbortChecker;
  hierarchy?: Record<string, unknown>;
}

// ============================================
// 定数
// ============================================

export const PRIMARY_MODEL = 'claude-sonnet-4-20250514';
export const MAX_RETRIES = 3;
export const RETRY_DELAY_MS = 2000;

// ============================================
// ヘルパー関数
// ============================================

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const checkAbort = (shouldAbort?: AbortChecker, context?: string): void => {
  if (shouldAbort?.()) {
    const msg = context ? `処理が中断されました: ${context}` : '処理が中断されました';
    throw new Error(msg);
  }
};

const formatShootingTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

// ============================================
// Claude Code CLI実行
// ============================================

function runClaudeCode(
  prompt: string,
  imagePaths?: string[],
  onLog?: LogFunction
): string {
  const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, ' ');

  let cmd: string;
  if (imagePaths && imagePaths.length > 0) {
    // ファイル存在確認
    for (const p of imagePaths) {
      if (!existsSync(p)) {
        onLog?.(`Warning: File not found: ${p}`, 'error');
      } else {
        onLog?.(`File exists: ${p}`, 'info');
      }
    }
    // 相対パスに変換（Claude CLIがアクセスしやすい）
    const cwd = process.cwd();
    const relativePaths = imagePaths.map(p => {
      const rel = path.relative(cwd, p).replace(/\\/g, '/');
      return rel.startsWith('.') ? rel : `./${rel}`;
    });
    const imageArgs = relativePaths.map(p => `"${p}"`).join(' ');
    cmd = `claude -p "${escapedPrompt}" --output-format text ${imageArgs}`;
    onLog?.(`Command: ${cmd.substring(0, 200)}...`, 'info');
  } else {
    cmd = `claude -p "${escapedPrompt}" --output-format text`;
    onLog?.(`Step2: claude [text only]`, 'info');
  }

  try {
    const result = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return result;
  } catch (error: unknown) {
    const err = error as Error & { stderr?: string; status?: number };
    throw new Error(`claude failed (code ${err.status}): ${err.stderr || err.message}`);
  }
}

// ============================================
// Step1: 画像認識 (Vision)
// ============================================

// 備考カテゴリ（Gemini版と同じ）
const REMARKS_CATEGORIES = [
  "到着温度", "敷均し温度", "初期締固め前温度", "開放温度",
  "アスファルト混合物温度測定", "現場密度測定",
  "転圧状況", "敷均し状況", "舗設状況", "初期転圧状況", "2次転圧状況",
  "乳剤散布状況", "端部乳剤塗布状況", "養生砂散布状況", "清掃状況",
  "掘削状況", "積込状況", "取壊し状況", "据付状況", "設置状況",
  "着手前", "完了", "竣工", "施工完了", "既済部分",
  "不陸整正出来形", "路盤厚出来形", "表層厚出来形", "幅員出来形",
  "朝礼実施状況", "朝礼・KYミーティング実施状況", "朝礼状況",
  "KY活動状況", "危険予知活動状況", "KYミーティング実施状況",
  "新規入場者教育状況", "新規入場者教育実施状況",
  "保安施設設置状況", "点灯確認状況", "安全巡視状況",
  "安全訓練実施状況", "避難訓練実施状況",
  "災害発生状況", "事故発生状況", "被害状況",
  "環境対策状況", "騒音対策状況", "粉塵対策状況",
  "その他"
];

const STEP1_PROMPT = `
あなたは工事写真帳を作成する現場監督です。複数の写真を同時に解析し、一貫性のある分類を行ってください。

## 写真区分
1. 着手前及び完成写真 - 工事前後の状態
2. 施工状況写真 - 作業中の様子
3. 安全管理写真 - 朝礼、KY活動
4. 使用材料写真 - 材料の搬入・検収
5. 品質管理写真 - 温度測定、密度測定
6. 出来形管理写真 - 完成寸法の測定
7. 災害写真・事故写真 - 異常事態
8. その他

## 備考カテゴリ（以下から選択）
${REMARKS_CATEGORIES.join(', ')}

## 出力形式（厳密にこのJSON配列形式で出力）
[
  {
    "fileName": "ファイル名",
    "hasBoard": true/false,
    "detectedText": "黒板・看板から読み取った全テキスト",
    "measurements": "数値データ（温度、寸法、密度等）単位付き",
    "sceneDescription": "写真に写っているものの客観的な説明",
    "photoCategoryGuess": "備考カテゴリから選択"
  }
]

## 注意
- 黒板のテキストは正確にOCR
- 数値は単位も含めて正確に（例: "160.4℃", "厚さ50mm"）
- 同じ場所・同じ作業の写真は一貫した分類を
- 推測せず、見えるものだけを記載
- JSON配列のみ出力。説明文は不要
`;

function buildStep1Prompt(photos: PhotoInput[]): string {
  const photoInfoList = photos.map(p => {
    const timeInfo = p.date ? formatShootingTime(p.date) : 'unknown';
    return `- ${p.fileName} (撮影: ${timeInfo})`;
  }).join('\n');

  return `${STEP1_PROMPT}

対象写真:
${photoInfoList}
`.trim();
}

async function executeStep1(
  photos: PhotoInput[],
  onLog?: LogFunction
): Promise<RawImageData[]> {
  const imagePaths = photos.map(p => p.filePath).filter(Boolean) as string[];
  const prompt = buildStep1Prompt(photos);

  const response = runClaudeCode(prompt, imagePaths, onLog);
  return parseJsonResponse<RawImageData>(response, photos.length, onLog);
}

// ============================================
// Step2: マスタ照合 (Text only)
// ============================================

function buildStep2Prompt(
  rawData: RawImageData[],
  hierarchy: Record<string, unknown>
): string {
  // 階層をコンパクトに整形
  const hierarchyStr = JSON.stringify(hierarchy, null, 0);

  const rawDataStr = rawData.map(d => `
ファイル: ${d.fileName}
黒板: ${d.hasBoard ? 'あり' : 'なし'}
OCRテキスト: ${d.detectedText || 'なし'}
数値: ${d.measurements || 'なし'}
シーン: ${d.sceneDescription}
推定区分: ${d.photoCategoryGuess}
`).join('\n---\n');

  return `
あなたは工事写真の分類専門家です。
以下の画像解析結果を、工種マスタに基づいて正確に分類してください。

## 工種マスタ（階層構造）
${hierarchyStr}

## 画像解析結果
${rawDataStr}

## 出力ルール
1. workType, variety, detail は必ずマスタに存在する値を選択
2. マスタにない値は絶対に使用しない
3. remarks はマスタの最下層キー（正式名称）を出力
   - matchPatterns は検索用パターン。OCRテキストがmatchPatternsにマッチした場合、その親キーを出力
   - 例: OCRで"到着温度"→ 親キー"アスファルト混合物温度測定"を出力
4. 該当なしの場合は空文字""

## 出力形式（JSON配列）
- fileName: ファイル名
- workType: 工種（マスタから選択）
- variety: 種別（マスタから選択）
- detail: 細別（マスタから選択）
- remarks: 備考（マスタから選択、または数値のみ）
- station: 測点（黒板から読み取れた場合）
- description: 写真の説明
- reasoning: 分類理由

出力はJSON配列のみ。説明不要。
`.trim();
}

async function executeStep2(
  rawData: RawImageData[],
  hierarchy: Record<string, unknown>,
  onLog?: LogFunction
): Promise<Partial<AnalysisResult>[]> {
  const prompt = buildStep2Prompt(rawData, hierarchy);
  const response = runClaudeCode(prompt, undefined, onLog);
  return parseJsonResponse<Partial<AnalysisResult>>(response, rawData.length, onLog);
}

// ============================================
// JSON パース
// ============================================

function parseJsonResponse<T>(text: string, expectedCount: number, onLog?: LogFunction): T[] {
  onLog?.(`Raw response (${text.length} chars): ${text.substring(0, 500)}...`, 'info');

  // JSONブロックを抽出
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    onLog?.('Found JSON code block', 'info');
    const parsed = JSON.parse(jsonMatch[1]);
    return Array.isArray(parsed) ? parsed : [parsed];
  }

  // 配列を直接抽出
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    onLog?.('Found JSON array', 'info');
    return JSON.parse(arrayMatch[0]);
  }

  // オブジェクトを抽出
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    onLog?.('Found JSON object', 'info');
    const parsed = JSON.parse(objectMatch[0]);
    return Array.isArray(parsed) ? parsed : [parsed];
  }

  // そのままパース
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    onLog?.(`JSON parse failed: ${e}`, 'error');
    onLog?.(`Full response: ${text}`, 'error');
    throw new Error("Invalid JSON response from Claude");
  }
}

// ============================================
// 結果マージ
// ============================================

function mergeResults(
  rawData: RawImageData[],
  classified: Partial<AnalysisResult>[]
): AnalysisResult[] {
  return rawData.map((raw, index) => {
    const cls = classified.find(c => c.fileName === raw.fileName) || classified[index] || {};

    return {
      fileName: raw.fileName,
      workType: cls.workType || '',
      variety: cls.variety || '',
      detail: cls.detail || '',
      station: cls.station || '',
      remarks: cls.remarks || '',
      remarksCategory: cls.remarks || '',
      remarksValue: '',
      description: cls.description || raw.sceneDescription,
      measurements: raw.measurements,
      hasBoard: raw.hasBoard,
      detectedText: raw.detectedText,
      reasoning: cls.reasoning || '',
    };
  });
}

// ============================================
// 一時ファイル管理
// ============================================

async function saveToTempFile(photo: PhotoInput): Promise<string> {
  // プロジェクト内のtemp-imagesフォルダを使用（Claude CLIがアクセスできる）
  const projectRoot = process.cwd();
  const tempDir = path.join(projectRoot, 'temp-images');
  await fs.mkdir(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, `gaspm_${Date.now()}_${photo.fileName}`);

  let base64Data = photo.base64;
  if (base64Data.includes(',')) {
    base64Data = base64Data.split(',')[1];
  }

  await fs.writeFile(tempPath, Buffer.from(base64Data, 'base64'));
  return tempPath;
}

async function cleanupTempFiles(paths: string[]): Promise<void> {
  for (const p of paths) {
    try {
      await fs.unlink(p);
    } catch {
      // ignore
    }
  }
}

// ============================================
// メイン解析関数
// ============================================

export async function analyzePhotos(
  photos: PhotoInput[],
  options: AnalyzeOptions
): Promise<AnalysisResult[]> {
  const {
    mode = 'construction',
    batchSize = 5,
    parallelBatches = 3,  // Step1を並列実行する数
    onLog,
    onProgress,
    onMetrics,
    shouldAbort,
    hierarchy,
  } = options;

  const analysisStart = Date.now();

  // メトリクス収集用
  const batchMetrics: BatchMetrics[] = [];
  const imageMetrics: ImageMetrics[] = [];
  const rawResponses: AnalysisMetrics['rawResponses'] = [];

  onLog?.(`解析開始: ${photos.length}枚 (${parallelBatches}並列Step1 + 統合Step2)`, 'info');
  onMetrics?.({ type: 'analysis_start', totalImages: photos.length, mode });

  // 並列数に応じてバッチに分割（parallelBatches個のバッチを作成）
  const batches: PhotoInput[][] = [];
  const numBatches = Math.min(parallelBatches, photos.length);
  const baseSize = Math.floor(photos.length / numBatches);
  const remainder = photos.length % numBatches;

  let offset = 0;
  for (let i = 0; i < numBatches; i++) {
    // 余りを前のバッチに1つずつ分配
    const size = baseSize + (i < remainder ? 1 : 0);
    batches.push(photos.slice(offset, offset + size));
    offset += size;
  }

  // ============================================
  // Step1: 並列で画像認識
  // ============================================
  onLog?.(`Step1開始: ${batches.length}バッチを${parallelBatches}並列で実行`, 'info');
  const step1Start = Date.now();

  // バッチごとの一時ファイルパスを保持
  const allTempPaths: string[][] = [];

  // 並列実行用のタスク作成
  const step1Tasks = batches.map(async (batch, batchIndex) => {
    checkAbort(shouldAbort, `Step1 バッチ ${batchIndex + 1}`);

    const batchStart = Date.now();
    const imageNames = batch.map(p => p.fileName);

    onLog?.(`Step1 バッチ${batchIndex + 1}/${batches.length} 開始 (${batch.length}枚)`, 'info');
    onMetrics?.({
      type: 'batch_start',
      batchIndex,
      totalBatches: batches.length,
      imageCount: batch.length,
      images: imageNames
    });

    // ファイルパス準備
    const tempPaths: string[] = [];
    for (const photo of batch) {
      if (photo.filePath) {
        tempPaths.push(photo.filePath);
      } else {
        const tempPath = await saveToTempFile(photo);
        tempPaths.push(tempPath);
        photo.filePath = tempPath;
      }
    }
    allTempPaths[batchIndex] = tempPaths;

    // Step1実行
    onMetrics?.({ type: 'step_start', step: 1, batchIndex });
    const rawData = await executeStep1WithMetrics(batch, batchIndex, rawResponses, onLog, onMetrics);
    const duration = Date.now() - batchStart;

    onLog?.(`Step1 バッチ${batchIndex + 1} 完了: ${formatDuration(duration)}`, 'info');
    onMetrics?.({ type: 'step_complete', step: 1, batchIndex, duration });

    return { batchIndex, rawData, duration, imageNames, batch };
  });

  // 全バッチを並列実行（バッチ数 = parallelBatches以下）
  const step1Results = await Promise.all(step1Tasks);
  // batchIndex順にソート
  step1Results.sort((a, b) => a.batchIndex - b.batchIndex);

  const step1TotalTime = Date.now() - step1Start;
  onLog?.(`Step1全完了: ${formatDuration(step1TotalTime)} (${batches.length}バッチ)`, 'success');

  // ============================================
  // Step2: 全結果をまとめて1回で照合
  // ============================================
  let allResults: AnalysisResult[] = [];
  let step2TotalTime = 0;

  // 全rawDataをマージ
  const allRawData: RawImageData[] = step1Results.flatMap(r => r.rawData);

  if (mode === 'construction' && hierarchy) {
    onLog?.(`Step2開始: ${allRawData.length}件を一括照合`, 'info');
    onMetrics?.({ type: 'step_start', step: 2, batchIndex: 0 });

    const step2Start = Date.now();
    const classified = await executeStep2WithMetrics(allRawData, hierarchy, 0, rawResponses, onLog, onMetrics);
    step2TotalTime = Date.now() - step2Start;

    onLog?.(`Step2完了: ${formatDuration(step2TotalTime)}`, 'success');
    onMetrics?.({ type: 'step_complete', step: 2, batchIndex: 0, duration: step2TotalTime });

    allResults = mergeResults(allRawData, classified);
  } else {
    // generalモードまたはマスタなし
    allResults = allRawData.map(raw => ({
      fileName: raw.fileName,
      workType: '',
      variety: '',
      detail: '',
      station: '',
      remarks: raw.photoCategoryGuess,
      remarksCategory: raw.photoCategoryGuess,
      remarksValue: '',
      description: raw.sceneDescription,
      measurements: raw.measurements,
      hasBoard: raw.hasBoard,
      detectedText: raw.detectedText,
      reasoning: '',
    }));
  }

  // ============================================
  // メトリクス集計
  // ============================================
  const analysisEnd = Date.now();
  const totalTime = analysisEnd - analysisStart;

  // バッチメトリクス
  for (const r of step1Results) {
    const step2PerBatch = step2TotalTime / step1Results.length;
    batchMetrics.push({
      index: r.batchIndex,
      imageCount: r.batch.length,
      startTime: analysisStart,
      endTime: analysisEnd,
      step1Duration: r.duration,
      step2Duration: step2PerBatch,
      images: r.imageNames
    });

    // 画像別メトリクス
    const perImageStep1 = r.duration / r.batch.length;
    const perImageStep2 = step2PerBatch / r.batch.length;
    for (const photo of r.batch) {
      const result = allResults.find(res => res.fileName === photo.fileName);
      imageMetrics.push({
        fileName: photo.fileName,
        step1Time: perImageStep1,
        step2Time: perImageStep2,
        totalTime: perImageStep1 + perImageStep2,
        status: 'success'
      });
      if (result) {
        onMetrics?.({ type: 'image_complete', fileName: photo.fileName, result });
        onProgress?.(imageMetrics.length, photos.length, photo.fileName, result);
      }
    }

    onMetrics?.({
      type: 'batch_complete',
      batchIndex: r.batchIndex,
      duration: r.duration + step2PerBatch,
      step1Duration: r.duration,
      step2Duration: step2PerBatch
    });
  }

  // 一時ファイル削除
  for (let i = 0; i < allTempPaths.length; i++) {
    const tempPaths = allTempPaths[i];
    const batch = batches[i];
    const toCleanup = tempPaths.filter((p, j) => {
      const original = batch[j];
      return p !== original.filePath || p.includes('gaspm_');
    });
    await cleanupTempFiles(toCleanup);
  }

  // 最終メトリクス
  const metrics: AnalysisMetrics = {
    mode,
    totalImages: photos.length,
    timestamps: { analysisStart, analysisEnd },
    batches: batchMetrics,
    perImage: imageMetrics,
    summary: {
      totalTime,
      avgTimePerImage: totalTime / photos.length,
      imagesPerSecond: photos.length / (totalTime / 1000),
      successCount: imageMetrics.filter(m => m.status === 'success').length,
      errorCount: imageMetrics.filter(m => m.status === 'error').length,
      step1TotalTime,
      step2TotalTime
    },
    rawResponses
  };

  onLog?.(`解析完了: ${allResults.length}枚, 合計=${formatDuration(totalTime)} (Step1=${formatDuration(step1TotalTime)}, Step2=${formatDuration(step2TotalTime)})`, 'success');
  onMetrics?.({ type: 'analysis_complete', metrics });

  return allResults;
}

// Step1 with metrics
async function executeStep1WithMetrics(
  photos: PhotoInput[],
  batchIndex: number,
  rawResponses: AnalysisMetrics['rawResponses'],
  onLog?: LogFunction,
  onMetrics?: MetricsCallback
): Promise<RawImageData[]> {
  const imagePaths = photos.map(p => p.filePath).filter(Boolean) as string[];
  const prompt = buildStep1Prompt(photos);

  const start = Date.now();
  const response = runClaudeCode(prompt, imagePaths, onLog);
  const duration = Date.now() - start;

  let parseSuccess = true;
  let result: RawImageData[];
  try {
    result = parseJsonResponse<RawImageData>(response, photos.length, onLog);
  } catch {
    parseSuccess = false;
    throw new Error('Step1 JSON parse failed');
  }

  rawResponses.push({ step: 'step1', batchIndex, response, parseSuccess, duration });
  onMetrics?.({ type: 'raw_response', step: 1, batchIndex, response, duration });

  return result;
}

// Step2 with metrics
async function executeStep2WithMetrics(
  rawData: RawImageData[],
  hierarchy: Record<string, unknown>,
  batchIndex: number,
  rawResponses: AnalysisMetrics['rawResponses'],
  onLog?: LogFunction,
  onMetrics?: MetricsCallback
): Promise<Partial<AnalysisResult>[]> {
  const prompt = buildStep2Prompt(rawData, hierarchy);

  const start = Date.now();
  const response = runClaudeCode(prompt, undefined, onLog);
  const duration = Date.now() - start;

  let parseSuccess = true;
  let result: Partial<AnalysisResult>[];
  try {
    result = parseJsonResponse<Partial<AnalysisResult>>(response, rawData.length, onLog);
  } catch {
    parseSuccess = false;
    throw new Error('Step2 JSON parse failed');
  }

  rawResponses.push({ step: 'step2', batchIndex, response, parseSuccess, duration });
  onMetrics?.({ type: 'raw_response', step: 2, batchIndex, response, duration });

  return result;
}

export async function analyzePhoto(
  photo: PhotoInput,
  options: AnalyzeOptions
): Promise<AnalysisResult> {
  const results = await analyzePhotos([photo], { ...options, batchSize: 1 });
  return results[0];
}
