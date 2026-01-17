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

const STEP1_PROMPT = `
あなたは工事写真の解析専門家です。画像から以下の情報を抽出してください。

出力形式（JSON配列）:
- fileName: ファイル名
- hasBoard: 黒板が写っているか (true/false)
- detectedText: 黒板や看板から読み取れる全てのテキスト
- measurements: 数値データ（温度、寸法、密度等）をそのまま記載（例: "160.4℃", "厚さ50mm"）
- sceneDescription: 写真に写っているものの客観的な説明
- photoCategoryGuess: 以下から1つ選択
  - "品質管理" (温度測定、密度測定など)
  - "施工状況" (作業中の様子)
  - "出来形" (完成した構造物の測定)
  - "安全管理" (朝礼、KY活動など)
  - "着手前完成" (工事前後の状態)
  - "使用材料" (材料の搬入・検収)

注意:
- 黒板のテキストは可能な限り正確にOCRしてください
- 数値は単位も含めて正確に記載
- 推測せず、見えるものだけを記載

出力はJSON配列のみ。説明不要。
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
    onLog,
    onProgress,
    onMetrics,
    shouldAbort,
    hierarchy,
  } = options;

  const analysisStart = Date.now();
  const allResults: AnalysisResult[] = [];

  // メトリクス収集用
  const batchMetrics: BatchMetrics[] = [];
  const imageMetrics: ImageMetrics[] = [];
  const rawResponses: AnalysisMetrics['rawResponses'] = [];
  let step1TotalTime = 0;
  let step2TotalTime = 0;

  onLog?.(`解析開始: ${photos.length}枚 (2段階処理)`, 'info');
  onMetrics?.({ type: 'analysis_start', totalImages: photos.length, mode });

  // バッチに分割
  const batches: PhotoInput[][] = [];
  for (let i = 0; i < photos.length; i += batchSize) {
    batches.push(photos.slice(i, i + batchSize));
  }

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    checkAbort(shouldAbort, `バッチ ${batchIndex + 1}/${batches.length}`);

    const batch = batches[batchIndex];
    const batchStart = Date.now();
    const imageNames = batch.map(p => p.fileName);

    onLog?.(`バッチ ${batchIndex + 1}/${batches.length} (${batch.length}枚)`, 'info');
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

    let step1Duration = 0;
    let step2Duration = 0;

    try {
      // Step1: 画像認識
      onMetrics?.({ type: 'step_start', step: 1, batchIndex });
      const step1Start = Date.now();
      const rawData = await executeStep1WithMetrics(batch, batchIndex, rawResponses, onLog, onMetrics);
      step1Duration = Date.now() - step1Start;
      step1TotalTime += step1Duration;
      onLog?.(`Step1完了: ${formatDuration(step1Duration)}`, 'info');
      onMetrics?.({ type: 'step_complete', step: 1, batchIndex, duration: step1Duration });

      let batchResults: AnalysisResult[];

      if (mode === 'construction' && hierarchy) {
        // Step2: マスタ照合
        onMetrics?.({ type: 'step_start', step: 2, batchIndex });
        const step2Start = Date.now();
        const classified = await executeStep2WithMetrics(rawData, hierarchy, batchIndex, rawResponses, onLog, onMetrics);
        step2Duration = Date.now() - step2Start;
        step2TotalTime += step2Duration;
        onLog?.(`Step2完了: ${formatDuration(step2Duration)}`, 'info');
        onMetrics?.({ type: 'step_complete', step: 2, batchIndex, duration: step2Duration });

        batchResults = mergeResults(rawData, classified);
      } else {
        // generalモードまたはマスタなし: Step1結果のみ使用
        batchResults = rawData.map(raw => ({
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

      // 画像別メトリクス & 進捗通知
      const perImageTime = (step1Duration + step2Duration) / batch.length;
      for (const result of batchResults) {
        imageMetrics.push({
          fileName: result.fileName,
          step1Time: step1Duration / batch.length,
          step2Time: step2Duration / batch.length,
          totalTime: perImageTime,
          status: 'success'
        });
        onMetrics?.({ type: 'image_complete', fileName: result.fileName, result });
        onProgress?.(allResults.length + 1, photos.length, result.fileName, result);
      }

      allResults.push(...batchResults);

      // バッチメトリクス
      const batchEnd = Date.now();
      batchMetrics.push({
        index: batchIndex,
        imageCount: batch.length,
        startTime: batchStart,
        endTime: batchEnd,
        step1Duration,
        step2Duration,
        images: imageNames
      });
      onMetrics?.({
        type: 'batch_complete',
        batchIndex,
        duration: batchEnd - batchStart,
        step1Duration,
        step2Duration
      });

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      onMetrics?.({ type: 'error', message: errMsg, batchIndex });
      for (const photo of batch) {
        imageMetrics.push({
          fileName: photo.fileName,
          step1Time: 0,
          step2Time: 0,
          totalTime: 0,
          status: 'error',
          error: errMsg
        });
      }
      throw error;
    } finally {
      const toCleanup = tempPaths.filter((p, i) => {
        const original = batch[i];
        return p !== original.filePath || p.includes('gaspm_');
      });
      await cleanupTempFiles(toCleanup);
    }
  }

  const analysisEnd = Date.now();
  const totalTime = analysisEnd - analysisStart;

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

  onLog?.(`解析完了: ${allResults.length}枚, 合計時間=${formatDuration(totalTime)}`, 'success');
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
