/**
 * export コマンド
 *
 * 解析結果をExcel/PDFに出力
 *
 * ## 変更履歴
 * - 2026-01-17: エイリアス適用オプション追加（--alias, --preset）
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { generateExcelBuffer, type PhotoData as ExcelPhotoData } from '../../shared/generators/excelCore';
import { generatePdfBuffer, type PhotoData as PdfPhotoData, type PdfQuality } from '../../shared/generators/pdfCore';
import { optimizeImageForPdf } from '../adapters/imageAdapter';
import { loadAliasConfig, applyAliasesToData, getPresetConfig, PRESET_ALIASES } from '../adapters/aliasAdapter';

interface ExportOptions {
  format: string;
  output: string;
  photosPerPage: string;
  title: string;
  font?: string;
  pdfQuality?: string;
  alias?: string;    // エイリアス設定ファイルパス
  preset?: string;   // プリセット名
}

interface InputData {
  fileName: string;
  mimeType: string;
  date?: number;
  base64: string;
  analysis?: {
    workType?: string;
    variety?: string;
    detail?: string;
    station?: string;
    remarks?: string;
    measurements?: string;
    description?: string;
  };
}

export async function exportCommand(
  input: string,
  options: ExportOptions
): Promise<void> {
  console.log(chalk.blue('\n📄 GASPhotoAIManager CLI - エクスポート\n'));

  // 入力ファイル確認
  const inputPath = path.resolve(input);
  let inputData: InputData[];

  try {
    const content = await fs.readFile(inputPath, 'utf-8');
    inputData = JSON.parse(content);

    if (!Array.isArray(inputData)) {
      throw new Error('入力ファイルは配列である必要があります');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(chalk.red(`エラー: ファイルが見つかりません: ${inputPath}`));
    } else {
      console.error(chalk.red(`エラー: ファイルの読み込みに失敗: ${error}`));
    }
    process.exit(1);
  }

  const pdfQuality = (options.pdfQuality || 'high') as PdfQuality;
  const qualityLabels: Record<PdfQuality, string> = {
    high: '印刷用 (1400px, 85%)',
    medium: 'デジタル提出用 (800px, 75%)',
    low: 'ドラフト用 (500px, 60%)',
  };

  // エイリアス設定の読み込み
  let aliasConfig = await loadAliasConfig(options.alias);
  if (options.preset && options.preset in PRESET_ALIASES) {
    aliasConfig = getPresetConfig(options.preset as keyof typeof PRESET_ALIASES);
  }

  // エイリアスの適用
  if (aliasConfig.enabled) {
    const { data: aliasedData, modifiedCount } = applyAliasesToData(inputData, aliasConfig);
    inputData = aliasedData;
    if (modifiedCount > 0) {
      console.log(chalk.cyan(`エイリアス適用: ${modifiedCount}件を変換`));
    }
  }

  console.log(chalk.gray(`入力: ${inputPath}`));
  console.log(chalk.gray(`写真数: ${inputData.length}枚`));
  console.log(chalk.gray(`形式: ${options.format}`));
  console.log(chalk.gray(`ページあたり: ${options.photosPerPage}枚`));
  if (options.format === 'pdf' || options.format === 'both') {
    console.log(chalk.gray(`PDF画質: ${pdfQuality} - ${qualityLabels[pdfQuality]}`));
  }
  if (aliasConfig.enabled) {
    const presetName = aliasConfig.activePreset || 'カスタム';
    console.log(chalk.gray(`エイリアス: ${presetName}`));
  }
  console.log('');

  // 出力ディレクトリ確認
  const outputDir = path.resolve(options.output);
  try {
    await fs.mkdir(outputDir, { recursive: true });
  } catch {
    // ディレクトリが既に存在する場合は無視
  }

  const photosPerPage = parseInt(options.photosPerPage, 10) as 2 | 3;
  const dateStr = new Date().toISOString().slice(0, 10);
  const baseFileName = path.basename(inputPath, '.json');

  // フォーマットに応じて出力
  const formats = options.format === 'both'
    ? ['excel', 'pdf']
    : [options.format];

  for (const format of formats) {
    if (format === 'excel') {
      await exportExcel(inputData, outputDir, baseFileName, dateStr, photosPerPage, options.title);
    } else if (format === 'pdf') {
      await exportPdf(inputData, outputDir, baseFileName, dateStr, photosPerPage, options.title, options.font, pdfQuality);
    } else {
      console.error(chalk.yellow(`警告: 不明な形式: ${format}`));
    }
  }

  console.log(chalk.green('\n✅ エクスポート完了\n'));
}

async function exportExcel(
  data: InputData[],
  outputDir: string,
  baseName: string,
  dateStr: string,
  photosPerPage: 2 | 3,
  title: string
): Promise<void> {
  const spinner = ora('Excelファイルを生成中...').start();

  try {
    const photoData: ExcelPhotoData[] = data.map(item => ({
      fileName: item.fileName,
      base64: item.base64,
      mimeType: item.mimeType,
      date: item.date,
      analysis: item.analysis,
    }));

    const buffer = await generateExcelBuffer(photoData, {
      photosPerPage,
      title,
    });

    const outputPath = path.join(outputDir, `${baseName}_${dateStr}.xlsx`);
    await fs.writeFile(outputPath, buffer);

    spinner.succeed(`Excel出力: ${outputPath}`);
  } catch (error) {
    spinner.fail('Excel生成に失敗');
    console.error(chalk.red(error));
  }
}

async function exportPdf(
  data: InputData[],
  outputDir: string,
  baseName: string,
  dateStr: string,
  photosPerPage: 2 | 3,
  title: string,
  fontPath?: string,
  pdfQuality: PdfQuality = 'high'
): Promise<void> {
  const spinner = ora('PDFファイルを生成中...').start();

  try {
    const photoData: PdfPhotoData[] = data.map(item => ({
      fileName: item.fileName,
      base64: item.base64,
      mimeType: item.mimeType,
      date: item.date,
      analysis: item.analysis,
    }));

    const buffer = await generatePdfBuffer(photoData, {
      photosPerPage,
      title,
      fontPath,
      pdfQuality,
      imageOptimizer: optimizeImageForPdf,
    });

    const outputPath = path.join(outputDir, `${baseName}_${dateStr}.pdf`);
    await fs.writeFile(outputPath, buffer);

    spinner.succeed(`PDF出力: ${outputPath}`);
  } catch (error) {
    spinner.fail('PDF生成に失敗');
    console.error(chalk.red(error));
  }
}
