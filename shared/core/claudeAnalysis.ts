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

export interface AnalyzeOptions {
  apiKey?: string;
  mode?: AppMode;
  instruction?: string;
  batchSize?: number;
  model?: string;
  onLog?: LogFunction;
  onProgress?: ProgressCallback;
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
    const imageArgs = imagePaths.map(p => `"${p}"`).join(' ');
    cmd = `claude -p "${escapedPrompt}" --output-format text ${imageArgs}`;
    onLog?.(`Step1: claude [${imagePaths.length} images]`, 'info');
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
  return parseJsonResponse<RawImageData>(response, photos.length);
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
  return parseJsonResponse<Partial<AnalysisResult>>(response, rawData.length);
}

// ============================================
// JSON パース
// ============================================

function parseJsonResponse<T>(text: string, expectedCount: number): T[] {
  // JSONブロックを抽出
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[1]);
    return Array.isArray(parsed) ? parsed : [parsed];
  }

  // 配列を直接抽出
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    return JSON.parse(arrayMatch[0]);
  }

  // そのままパース
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
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
  const tempDir = os.tmpdir();
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
    shouldAbort,
    hierarchy,
  } = options;

  const startTime = Date.now();
  const allResults: AnalysisResult[] = [];

  onLog?.(`解析開始: ${photos.length}枚 (2段階処理)`, 'info');

  // バッチに分割
  const batches: PhotoInput[][] = [];
  for (let i = 0; i < photos.length; i += batchSize) {
    batches.push(photos.slice(i, i + batchSize));
  }

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    checkAbort(shouldAbort, `バッチ ${batchIndex + 1}/${batches.length}`);

    const batch = batches[batchIndex];
    onLog?.(`バッチ ${batchIndex + 1}/${batches.length} (${batch.length}枚)`, 'info');

    // ファイルパス準備
    const tempPaths: string[] = [];
    for (const photo of batch) {
      if (photo.filePath) {
        tempPaths.push(photo.filePath);
      } else {
        const tempPath = await saveToTempFile(photo);
        tempPaths.push(tempPath);
        photo.filePath = tempPath;  // 一時的に設定
      }
    }

    try {
      // Step1: 画像認識
      const step1Start = Date.now();
      const rawData = await executeStep1(batch, onLog);
      onLog?.(`Step1完了: ${formatDuration(Date.now() - step1Start)}`, 'info');

      let batchResults: AnalysisResult[];

      if (mode === 'construction' && hierarchy) {
        // Step2: マスタ照合
        const step2Start = Date.now();
        const classified = await executeStep2(rawData, hierarchy, onLog);
        onLog?.(`Step2完了: ${formatDuration(Date.now() - step2Start)}`, 'info');

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

      // 進捗通知
      for (const result of batchResults) {
        onProgress?.(
          allResults.length + 1,
          photos.length,
          result.fileName,
          result
        );
      }

      allResults.push(...batchResults);

    } finally {
      // 一時ファイルのみ削除
      const toCleanup = tempPaths.filter((p, i) => {
        const original = batch[i];
        return p !== original.filePath || p.includes('gaspm_');
      });
      await cleanupTempFiles(toCleanup);
    }
  }

  const totalTime = Date.now() - startTime;
  onLog?.(
    `解析完了: ${allResults.length}枚, 合計時間=${formatDuration(totalTime)}`,
    'success'
  );

  return allResults;
}

export async function analyzePhoto(
  photo: PhotoInput,
  options: AnalyzeOptions
): Promise<AnalysisResult> {
  const results = await analyzePhotos([photo], { ...options, batchSize: 1 });
  return results[0];
}
