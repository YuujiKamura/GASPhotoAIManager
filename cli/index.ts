#!/usr/bin/env node
/**
 * GASPhotoAIManager CLI
 *
 * 工事写真管理ツールのコマンドラインインターフェース
 */

import { Command } from 'commander';
import { analyzeCommand } from './commands/analyze';
import { exportCommand } from './commands/export';
import { configCommand } from './commands/config';

const program = new Command();

program
  .name('gaspm')
  .description('GASPhotoAIManager CLI - 工事写真AI解析ツール')
  .version('1.0.0');

// analyze コマンド
program
  .command('analyze')
  .description('写真フォルダを解析')
  .argument('<folder>', '解析する写真フォルダのパス')
  .option('-o, --output <file>', '出力ファイルパス (JSON)', 'result.json')
  .option('-i, --instruction <text>', 'AI解析への追加指示')
  .option('-m, --mode <mode>', 'アプリモード (construction/general)', 'construction')
  .option('-b, --batch-size <number>', 'バッチサイズ', '5')
  .option('-r, --recursive', 'サブフォルダも含める', false)
  .action(analyzeCommand);

// export コマンド
program
  .command('export')
  .description('解析結果をExcel/PDFに出力')
  .argument('<input>', '入力JSONファイルパス')
  .option('-f, --format <format>', '出力形式 (excel/pdf/both)', 'both')
  .option('-o, --output <dir>', '出力ディレクトリ', '.')
  .option('-p, --photos-per-page <number>', 'ページあたりの写真数 (2/3)', '3')
  .option('-t, --title <title>', 'ドキュメントタイトル', '工事写真帳')
  .option('--font <path>', '日本語フォントファイルパス')
  .action(exportCommand);

// config コマンド
program
  .command('config')
  .description('設定管理')
  .argument('[action]', 'アクション (set-key/show/path)')
  .argument('[value]', '設定値')
  .action(configCommand);

program.parse();
