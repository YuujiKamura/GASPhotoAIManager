/**
 * analyze コマンド
 *
 * 写真フォルダを解析してJSON出力
 *
 * ## 変更履歴
 * - 2026-01-17: 工種マスタ対応追加
 * - 2026-01-17: Gemini API → Claude API に移行
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { scanFolder, processImages } from '../adapters/imageAdapter';
import { getApiKey } from '../adapters/apiKeyAdapter';
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
  apiKey?: string;
  recursive: boolean;
  model: string;
}

export async function analyzeCommand(
  folder: string,
  options: AnalyzeOptions
): Promise<void> {
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

  // APIキー確認
  const apiKey = await getApiKey(options.apiKey);
  if (!apiKey) {
    console.error(chalk.red('エラー: APIキーが設定されていません'));
    console.log(chalk.yellow('以下のいずれかの方法でAPIキーを設定してください:'));
    console.log('  1. gaspm config set-key <your-api-key>');
    console.log('  2. 環境変数 ANTHROPIC_API_KEY を設定');
    console.log('  3. --api-key オプションで指定');
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

  // 画像処理
  const processSpinner = ora('画像を処理中...').start();
  let photoInputs: PhotoInput[];
  try {
    const imageInfos = await processImages(imagePaths, {}, (current, total, fileName) => {
      processSpinner.text = `画像を処理中... ${current}/${total} - ${fileName}`;
    });

    photoInputs = imageInfos.map(info => ({
      fileName: info.fileName,
      base64: info.base64,
      mimeType: info.mimeType,
      date: info.date,
    }));
    processSpinner.succeed(`${photoInputs.length}枚の画像を処理完了`);
  } catch (error) {
    processSpinner.fail('画像の処理に失敗');
    console.error(chalk.red(error));
    process.exit(1);
  }

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
  console.log(chalk.gray(`\nモデル: ${options.model}`));
  console.log(chalk.gray(`モード: ${options.mode}`));
  if (options.instruction) {
    console.log(chalk.gray(`指示: ${options.instruction}`));
  }
  console.log('');

  const analyzeSpinner = ora('AI解析中...').start();
  let results: AnalysisResult[];

  try {
    results = await analyzePhotos(photoInputs, {
      apiKey,
      mode: options.mode as AppMode,
      instruction: options.instruction,
      batchSize: parseInt(options.batchSize, 10),
      model: options.model,
      hierarchy,  // 工種マスタを渡す
      onLog: (msg, type) => {
        if (type === 'error') {
          analyzeSpinner.warn(msg);
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

  // 結果をマージ
  const outputData = photoInputs.map((photo, index) => {
    const analysis = results.find(r => r.fileName === photo.fileName) || results[index];
    return {
      fileName: photo.fileName,
      mimeType: photo.mimeType,
      date: photo.date,
      base64: photo.base64,
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
    };
  });

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
