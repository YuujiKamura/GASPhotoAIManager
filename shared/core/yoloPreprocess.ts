/**
 * YOLO Preprocessing Module
 *
 * YOLOモデルを使用して画像から物体検出を行い、
 * Claude解析のヒントとして使用する。
 *
 * ## 変更履歴
 * - 2026-01-17: 新規作成
 */

import { execSync } from 'child_process';
import * as path from 'path';
import { existsSync } from 'fs';

// ============================================
// 型定義
// ============================================

export interface YoloDetection {
  class_id: number;
  class_name: string;
  confidence: number;
  bbox: [number, number, number, number];  // [x1, y1, x2, y2]
}

export interface YoloResult {
  image: string;
  model: string;
  detections: YoloDetection[];
  count: number;
  error?: string;
}

export interface YoloOptions {
  confThreshold?: number;  // 信頼度閾値 (default: 0.25)
  modelPath?: string;      // モデルパス (default: models/yolo-construction.pt)
  device?: 'cpu' | 'cuda'; // 使用デバイス (default: cpu)
}

// ============================================
// デフォルト値
// ============================================

const DEFAULT_CONF_THRESHOLD = 0.25;
const DEFAULT_DEVICE = 'cpu';

function getDefaultModelPath(): string {
  // プロジェクトルートの models/yolo-construction.pt を使用
  const projectRoot = process.cwd();
  return path.join(projectRoot, 'models', 'yolo-construction.pt');
}

function getScriptPath(): string {
  const projectRoot = process.cwd();
  return path.join(projectRoot, 'models', 'yolo_detect.py');
}

// ============================================
// YOLO検出実行
// ============================================

/**
 * 単一画像に対してYOLO検出を実行
 */
export function runYoloSingle(imagePath: string, options: YoloOptions = {}): YoloResult {
  const {
    confThreshold = DEFAULT_CONF_THRESHOLD,
    modelPath = getDefaultModelPath(),
    device = DEFAULT_DEVICE,
  } = options;

  const scriptPath = getScriptPath();

  // スクリプト存在確認
  if (!existsSync(scriptPath)) {
    return {
      image: imagePath,
      model: modelPath,
      detections: [],
      count: 0,
      error: `YOLO script not found: ${scriptPath}`,
    };
  }

  // モデル存在確認
  if (!existsSync(modelPath)) {
    return {
      image: imagePath,
      model: modelPath,
      detections: [],
      count: 0,
      error: `YOLO model not found: ${modelPath}. Copy from: ~/Sanyuu2Kouku/cursor_tools/summarygenerator/runs/train/db_training/weights/best.pt`,
    };
  }

  // 画像存在確認
  if (!existsSync(imagePath)) {
    return {
      image: imagePath,
      model: modelPath,
      detections: [],
      count: 0,
      error: `Image not found: ${imagePath}`,
    };
  }

  try {
    // Python スクリプト実行
    const cmd = `python "${scriptPath}" "${imagePath}" --model "${modelPath}" --conf ${confThreshold} --device ${device}`;
    const stdout = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 60000,  // 1分タイムアウト
      maxBuffer: 10 * 1024 * 1024,
    });

    const result = JSON.parse(stdout.trim()) as YoloResult;
    return result;
  } catch (error: unknown) {
    const err = error as Error & { stderr?: string };
    return {
      image: imagePath,
      model: modelPath,
      detections: [],
      count: 0,
      error: `YOLO execution failed: ${err.message || err.stderr}`,
    };
  }
}

/**
 * 複数画像に対してYOLO検出を実行
 *
 * @param imagePaths 画像パスの配列
 * @param options YOLO実行オプション
 * @returns Map<ファイルパス, 検出結果>
 */
export async function runYoloDetection(
  imagePaths: string[],
  options: YoloOptions = {}
): Promise<Map<string, YoloDetection[]>> {
  const results = new Map<string, YoloDetection[]>();

  // 順次処理（モデルロードは毎回行われる）
  // 将来的にはバッチ処理やモデル常駐化で最適化可能
  for (const imagePath of imagePaths) {
    const result = runYoloSingle(imagePath, options);

    if (result.error) {
      // エラー時は空の検出結果
      console.warn(`[YOLO] ${result.error}`);
      results.set(imagePath, []);
    } else {
      results.set(imagePath, result.detections);
    }
  }

  return results;
}

/**
 * YOLO検出結果をプロンプト用ヒント文字列に変換
 */
export function formatYoloHint(detections: YoloDetection[], minConfidence: number = 0.5): string {
  if (!detections || detections.length === 0) {
    return '';
  }

  const hints = detections
    .filter(d => d.confidence >= minConfidence)
    .map(d => `${d.class_name}(${(d.confidence * 100).toFixed(0)}%)`)
    .join(', ');

  return hints ? ` [検出: ${hints}]` : '';
}

/**
 * YOLOモデルが利用可能かチェック
 */
export function isYoloAvailable(modelPath?: string): boolean {
  const model = modelPath || getDefaultModelPath();
  const script = getScriptPath();
  return existsSync(model) && existsSync(script);
}
