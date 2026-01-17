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
import { runAnalyzeWeb } from './commands/analyzeWeb';
import { serverCommand } from './commands/server';

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
  .option('--yolo', 'YOLO前処理を有効化（29%高速化）', false)
  .option('--yolo-conf <threshold>', 'YOLO信頼度閾値', '0.5')
  .option('--server', '常駐サーバー経由で解析', false)
  .option('--cache <file>', 'Step1キャッシュファイルパス')
  .option('--use-cache', 'Step1キャッシュを使用', false)
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
  .option('-q, --pdf-quality <quality>', 'PDF画質 (high=印刷用/medium=デジタル提出用/low=ドラフト用)', 'high')
  .action(exportCommand);

// config コマンド
program
  .command('config')
  .description('設定管理')
  .argument('[action]', 'アクション (set-key/show/path)')
  .argument('[value]', '設定値')
  .action(configCommand);

// analyze:web コマンド（ブラウザUIで解析）
program
  .command('analyze:web')
  .description('ブラウザUIで写真解析（自動起動・自動終了）')
  .argument('<folder>', '解析する写真フォルダのパス')
  .option('-o, --output <file>', '出力ファイルパス (JSON)')
  .option('-m, --mode <mode>', 'アプリモード (construction/general)', 'construction')
  .option('--yolo', 'YOLO前処理を有効化（29%高速化）', false)
  .option('--yolo-conf <threshold>', 'YOLO信頼度閾値', '0.5')
  .action((folder, options) => {
    runAnalyzeWeb(folder, {
      mode: options.mode,
      output: options.output,
      useYolo: options.yolo,
      yoloConfThreshold: parseFloat(options.yoloConf || '0.5'),
    });
  });

// server コマンド（常駐ダッシュボードサーバー）
program
  .command('server')
  .description('常駐ダッシュボードサーバー管理')
  .argument('[action]', 'start/stop/status', 'status')
  .action(serverCommand);

program.parse();
