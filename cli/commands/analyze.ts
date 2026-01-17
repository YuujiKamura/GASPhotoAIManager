/**
 * analyze コマンド
 *
 * 写真フォルダを解析してJSON出力
 *
 * ## 変更履歴
 * - 2026-01-17: Step1キャッシュオプション追加（--cache, --use-cache）
 * - 2026-01-17: 工種マスタ対応追加
 * - 2026-01-17: Gemini API → Claude API に移行
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { scanFolder, processImage, createPhotoInputs } from '../adapters/imageAdapter';
import { getMergedHierarchy } from '../adapters/masterAdapter';
import {
  analyzePhotos,
  type PhotoInput,
  type AnalysisResult,
  type AppMode
} from '../../shared/core/claudeAnalysis';

interface AnalyzeOptions {
  output: string;
  instruction?: string;
  mode: string;
  batchSize: string;
  recursive: boolean;
  yolo: boolean;
  yoloConf: string;
  server: boolean;
  cache?: string;       // Step1キャッシュファイルパス
  useCache: boolean;    // キャッシュを使用するか
}

export async function analyzeCommand(
  folder: string,
  options: AnalyzeOptions
): Promise<void> {
  // サーバーモード: 常駐サーバーに解析を依頼
  if (options.server) {
    await analyzeViaServer(folder, options);
    return;
  }

  console.log(chalk.blue('\n📸 GASPhotoAIManager CLI - 写真解析\n'));

  // フォルダ存在確認
  const folderPath = path.resolve(folder);
  try {
    const stat = await fs.stat(folderPath);
    if (!stat.isDirectory()) {
      console.error(chalk.red(`エラー: ${folderPath} はディレクトリではありません`));
      process.exit(1);
    }
  } catch {
    console.error(chalk.red(`エラー: フォルダが見つかりません: ${folderPath}`));
    process.exit(1);
  }

  // 写真スキャン
  const scanSpinner = ora('写真をスキャン中...').start();
  let imagePaths: string[];
  try {
    imagePaths = await scanFolder(folderPath, { recursive: options.recursive });
    scanSpinner.succeed(`${imagePaths.length}枚の写真を検出`);
  } catch (error) {
    scanSpinner.fail('写真のスキャンに失敗');
    console.error(chalk.red(error));
    process.exit(1);
  }

  if (imagePaths.length === 0) {
    console.log(chalk.yellow('解析する写真が見つかりませんでした'));
    process.exit(0);
  }

  // PhotoInput作成（ファイルパスのみ、base64は後で）
  const photoInputs = createPhotoInputs(imagePaths);

  // 工種マスタ読み込み（constructionモードの場合）
  let hierarchy: Record<string, unknown> | undefined;
  if (options.mode === 'construction') {
    try {
      hierarchy = await getMergedHierarchy();
      console.log(chalk.gray('工種マスタを読み込みました'));
    } catch {
      console.log(chalk.yellow('工種マスタの読み込みに失敗（デフォルト動作で続行）'));
    }
  }

  // AI解析
  const yoloEnabled = options.yolo === true;
  const yoloConfThreshold = parseFloat(options.yoloConf || '0.5');
  const step1CachePath = options.cache || path.join(path.dirname(path.resolve(options.output)), '.step1-cache.json');
  const useStep1Cache = options.useCache === true;

  console.log(chalk.gray(`\nモード: ${options.mode} (Claude Code CLI使用)`));
  if (yoloEnabled) {
    console.log(chalk.gray(`YOLO前処理: 有効 (閾値=${yoloConfThreshold})`));
  }
  if (useStep1Cache) {
    console.log(chalk.gray(`Step1キャッシュ: ${step1CachePath}`));
  }
  if (options.instruction) {
    console.log(chalk.gray(`指示: ${options.instruction}`));
  }
  console.log('');

  let analyzeSpinner = ora('AI解析中...').start();
  let results: AnalysisResult[];

  try {
    results = await analyzePhotos(photoInputs, {
      mode: options.mode as AppMode,
      instruction: options.instruction,
      batchSize: parseInt(options.batchSize, 10),
      hierarchy,
      useYolo: yoloEnabled,
      yoloConfThreshold,
      step1CachePath,
      useStep1Cache,
      onLog: (msg, type) => {
        if (type === 'error') {
          analyzeSpinner.warn(msg);
        } else if (type === 'success') {
          analyzeSpinner.succeed(msg);
          analyzeSpinner = ora('AI解析中...').start();
        } else if (msg.startsWith('DEBUG')) {
          // デバッグログは詳細表示
          analyzeSpinner.info(msg);
        } else if (msg.includes('キャッシュ')) {
          analyzeSpinner.info(msg);
        }
      },
      onProgress: (current, total, fileName) => {
        analyzeSpinner.text = `AI解析中... ${current}/${total} - ${fileName}`;
      },
    });
    analyzeSpinner.succeed(`${results.length}枚の写真を解析完了`);
  } catch (error) {
    analyzeSpinner.fail('AI解析に失敗');
    console.error(chalk.red(error));
    process.exit(1);
  }

  // 結果をマージ（base64は出力時に生成）
  const outputSpinner = ora('出力データを準備中...').start();
  const outputData: {
    fileName: string;
    mimeType: string;
    date?: number;
    base64: string;
    analysis?: object;
  }[] = [];

  for (let i = 0; i < photoInputs.length; i++) {
    const photo = photoInputs[i];
    const analysis = results.find(r => r.fileName === photo.fileName) || results[i];
    outputSpinner.text = `出力データを準備中... ${i + 1}/${photoInputs.length}`;

    // base64を生成（出力用）
    let base64 = '';
    let date: number | undefined;
    if (photo.filePath) {
      try {
        const imageInfo = await processImage(photo.filePath);
        base64 = imageInfo.base64;
        date = imageInfo.date;
      } catch {
        // 失敗時は空のまま
      }
    }

    outputData.push({
      fileName: photo.fileName,
      mimeType: photo.mimeType,
      date,
      base64,
      analysis: analysis ? {
        workType: analysis.workType,
        variety: analysis.variety,
        detail: analysis.detail,
        station: analysis.station,
        remarks: analysis.remarks,
        measurements: analysis.measurements,
        description: analysis.description,
        hasBoard: analysis.hasBoard,
        detectedText: analysis.detectedText,
        reasoning: analysis.reasoning,
      } : undefined,
    });
  }
  outputSpinner.succeed('出力データ準備完了');

  // JSON出力
  const outputPath = path.resolve(options.output);
  const saveSpinner = ora('結果を保存中...').start();
  try {
    await fs.writeFile(outputPath, JSON.stringify(outputData, null, 2));
    saveSpinner.succeed(`結果を保存: ${outputPath}`);
  } catch (error) {
    saveSpinner.fail('結果の保存に失敗');
    console.error(chalk.red(error));
    process.exit(1);
  }

  // サマリー表示
  console.log(chalk.green('\n✅ 解析完了\n'));
  console.log(chalk.gray('サマリー:'));

  const workTypes = new Map<string, number>();
  for (const item of outputData) {
    const wt = item.analysis?.workType || '(未分類)';
    workTypes.set(wt, (workTypes.get(wt) || 0) + 1);
  }

  for (const [wt, count] of workTypes.entries()) {
    console.log(`  ${wt}: ${count}枚`);
  }

  console.log(chalk.gray(`\n出力ファイル: ${outputPath}`));
  console.log(chalk.gray(`次のステップ: gaspm export ${options.output} -f both\n`));
}

/**
 * 常駐サーバー経由で解析を実行
 */
async function analyzeViaServer(folder: string, options: AnalyzeOptions): Promise<void> {
  const SERVER_URL = 'http://localhost:3001';
  const folderPath = path.resolve(folder);

  console.log(chalk.blue('\n📸 GASPhotoAIManager CLI - サーバー経由解析\n'));

  // サーバー稼働確認
  try {
    const healthRes = await fetch(`${SERVER_URL}/api/health`);
    if (!healthRes.ok) {
      throw new Error('Server not responding');
    }
  } catch {
    console.error(chalk.red('エラー: サーバーが起動していません'));
    console.error(chalk.yellow('先に `gaspm server start` を実行してください\n'));
    process.exit(1);
  }

  // 解析リクエスト送信
  const spinner = ora('サーバーに解析リクエストを送信中...').start();

  try {
    const res = await fetch(`${SERVER_URL}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folderPath,
        options: {
          mode: options.mode,
          output: options.output,
          useYolo: options.yolo,
          yoloConfThreshold: parseFloat(options.yoloConf || '0.5'),
        },
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'リクエスト失敗');
    }

    spinner.succeed('解析開始');
    console.log(chalk.green('\n✅ 解析がサーバーで開始されました'));
    console.log(chalk.gray(`   フォルダ: ${folderPath}`));
    console.log(chalk.gray(`   ダッシュボードで進捗を確認: http://localhost:3001/web-analyzer.html\n`));

  } catch (error) {
    spinner.fail('解析リクエスト失敗');
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(chalk.red(`エラー: ${errMsg}\n`));
    process.exit(1);
  }
}
