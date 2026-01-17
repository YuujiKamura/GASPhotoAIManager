/**
 * Claude Code CLI - Core Analysis Module
 *
 * Claude Code CLIをサブプロセスとして呼び出して画像解析
 * APIキー不要（Claude Codeの認証を使用）
 *
 * ## 変更履歴
 * - 2026-01-17: Claude Code CLI経由の実行に変更
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
  filePath?: string;  // 元ファイルパス（あれば）
  date?: number;
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
  apiKey?: string;  // 未使用（Claude Code CLI使用）
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

export const REMARKS_CATEGORIES = [
  "到着温度", "敷均し温度", "初期締固め前温度", "開放温度",
  "アスファルト混合物温度測定",
  "現場密度測定",
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
// プロンプト生成
// ============================================

const buildPrompt = (
  photos: PhotoInput[],
  mode: AppMode,
  instruction?: string,
  hierarchy?: Record<string, unknown>
): string => {
  let systemPart = '';

  if (mode === 'general') {
    systemPart = `
You are a professional photo archivist. Analyze the image and provide structured metadata.
${instruction ? `USER INSTRUCTION: ${instruction}` : ""}
    `.trim();
  } else {
    let workTypesList = '';
    if (hierarchy && hierarchy['直接工事費']) {
      const root = hierarchy['直接工事費'] as Record<string, unknown>;
      const types = new Set<string>();
      for (const catKey in root) {
        Object.keys(root[catKey] as Record<string, unknown>).forEach(k => types.add(k));
      }
      workTypesList = Array.from(types).join(', ');
    }

    systemPart = `
You are a Japanese construction site supervisor creating a formal photo ledger (工事写真帳).

${workTypesList ? `AVAILABLE WORK TYPES: ${workTypesList}\nYou MUST select workType from this list.\n` : ''}
OUTPUT FORMAT:
- workType: 工種 (e.g., 舗装工, 道路土工)
- variety: 種別 (e.g., 舗装打換え工)
- detail: 細別 (e.g., 表層工)
- station: 測点 format "地名 No.整数" (e.g., "小峯2丁目 No.4")
- remarksCategory: Select from [${REMARKS_CATEGORIES.slice(0, 10).join(', ')}...]
- measurements: All numerical values with units
- description: Important info from blackboard or scene
- hasBoard: true if blackboard is visible
- detectedText: OCR text from blackboard

For safety photos, set workType="", variety="", detail="".
${instruction ? `USER INSTRUCTION: ${instruction}` : ""}
    `.trim();
  }

  const photoInfoList = photos.map(p => {
    const timeInfo = p.date ? formatShootingTime(p.date) : 'unknown';
    return `- ${p.fileName} (撮影時間: ${timeInfo})`;
  });

  return `
${systemPart}

Analyze these ${photos.length} photo(s).
Output a JSON array with objects containing: fileName, workType, variety, detail, station, remarksCategory, measurements, description, hasBoard, detectedText, reasoning.

Photo Info:
${photoInfoList.join("\n")}

Output ONLY valid JSON array. No markdown, no explanation.
  `.trim();
};

// ============================================
// Claude Code CLI実行
// ============================================

async function runClaudeCode(
  imagePaths: string[],
  prompt: string,
  onLog?: LogFunction
): Promise<string> {
  // プロンプトをエスケープ（シェル用）
  const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, ' ');

  // コマンド構築
  const imageArgs = imagePaths.map(p => `"${p}"`).join(' ');
  const cmd = `claude -p "${escapedPrompt}" --output-format text ${imageArgs}`;

  onLog?.(`実行: claude -p "..." [${imagePaths.length} images]`, 'info');

  try {
    const result = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 120000,  // 2分タイムアウト
      maxBuffer: 10 * 1024 * 1024,  // 10MB
    });
    return result;
  } catch (error: unknown) {
    const err = error as Error & { stderr?: string; status?: number };
    throw new Error(`claude failed (code ${err.status}): ${err.stderr || err.message}`);
  }
}

// ============================================
// AIレスポンス処理
// ============================================

const parseAIResponse = (text: string): unknown[] => {
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
};

const mapToAnalysisResults = (parsed: unknown[]): AnalysisResult[] => {
  return parsed.map((item: unknown) => {
    const obj = item as Record<string, unknown>;
    const remarksCategory = (obj.remarksCategory as string) || "";
    return {
      fileName: (obj.fileName as string) || "unknown",
      workType: (obj.workType as string) || "",
      variety: (obj.variety as string) || "",
      detail: (obj.detail as string) || "",
      station: (obj.station as string) || "",
      remarks: remarksCategory,
      remarksCategory: remarksCategory,
      remarksValue: "",
      description: (obj.description as string) || "",
      measurements: (obj.measurements as string) || "",
      hasBoard: !!obj.hasBoard,
      detectedText: (obj.detectedText as string) || "",
      reasoning: (obj.reasoning as string) || "",
    };
  });
};

// ============================================
// 一時ファイル管理
// ============================================

async function saveToTempFile(photo: PhotoInput): Promise<string> {
  const tempDir = os.tmpdir();
  const ext = photo.mimeType.split('/')[1] || 'jpg';
  const tempPath = path.join(tempDir, `gaspm_${Date.now()}_${photo.fileName}`);

  // base64からバイナリに変換して保存
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
    instruction,
    batchSize = 5,
    onLog,
    onProgress,
    shouldAbort,
    hierarchy,
  } = options;

  const startTime = Date.now();
  const allResults: AnalysisResult[] = [];

  onLog?.(`解析開始: ${photos.length}枚 (Claude Code CLI)`, 'info');

  // バッチに分割して処理
  const batches: PhotoInput[][] = [];
  for (let i = 0; i < photos.length; i += batchSize) {
    batches.push(photos.slice(i, i + batchSize));
  }

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    checkAbort(shouldAbort, `バッチ ${batchIndex + 1}/${batches.length}`);

    const batch = batches[batchIndex];
    onLog?.(`バッチ ${batchIndex + 1}/${batches.length} (${batch.length}枚)`, 'info');

    // 一時ファイルに保存
    const tempPaths: string[] = [];
    for (const photo of batch) {
      if (photo.filePath) {
        tempPaths.push(photo.filePath);
      } else {
        const tempPath = await saveToTempFile(photo);
        tempPaths.push(tempPath);
      }
    }

    try {
      const prompt = buildPrompt(batch, mode, instruction, hierarchy);
      const apiStartTime = Date.now();

      let attempt = 0;
      let response = '';

      while (attempt < MAX_RETRIES) {
        try {
          response = await runClaudeCode(tempPaths, prompt, onLog);
          break;
        } catch (err) {
          attempt++;
          onLog?.(`エラー - 試行 ${attempt}/${MAX_RETRIES}: ${(err as Error).message}`, 'error');
          if (attempt >= MAX_RETRIES) throw err;
          await sleep(RETRY_DELAY_MS);
        }
      }

      const apiTime = Date.now() - apiStartTime;
      onLog?.(`応答: ${formatDuration(apiTime)}, ${response.length}文字`, 'info');

      const parsed = parseAIResponse(response);
      const batchResults = mapToAnalysisResults(parsed);

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
      // filePath由来でない一時ファイルのみ削除
      const toCleanup = tempPaths.filter((p, i) => !batch[i].filePath);
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
