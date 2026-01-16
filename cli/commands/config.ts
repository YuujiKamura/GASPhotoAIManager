/**
 * config コマンド
 *
 * APIキーや設定の管理
 */

import chalk from 'chalk';
import {
  setApiKey,
  getApiKey,
  getConfig,
  getConfigPath,
  maskApiKey
} from '../adapters/apiKeyAdapter';

export async function configCommand(
  action?: string,
  value?: string
): Promise<void> {
  if (!action) {
    // デフォルト: show
    action = 'show';
  }

  switch (action) {
    case 'set-key':
      await handleSetKey(value);
      break;

    case 'show':
      await handleShow();
      break;

    case 'path':
      handlePath();
      break;

    default:
      console.log(chalk.yellow(`不明なアクション: ${action}`));
      console.log('');
      console.log('使用可能なアクション:');
      console.log('  set-key <apiKey>  APIキーを設定');
      console.log('  show              現在の設定を表示');
      console.log('  path              設定ファイルのパスを表示');
      process.exit(1);
  }
}

async function handleSetKey(apiKey?: string): Promise<void> {
  if (!apiKey) {
    console.error(chalk.red('エラー: APIキーを指定してください'));
    console.log('使用方法: gaspm config set-key <your-api-key>');
    process.exit(1);
  }

  // 簡易バリデーション
  if (!apiKey.startsWith('AIza') || apiKey.length < 30) {
    console.error(chalk.yellow('警告: APIキーの形式が正しくない可能性があります'));
    console.log('Gemini APIキーは通常 "AIza" で始まる39文字の文字列です');
  }

  try {
    await setApiKey(apiKey);
    console.log(chalk.green('✅ APIキーを保存しました'));
    console.log(chalk.gray(`キー: ${maskApiKey(apiKey)}`));
    console.log(chalk.gray(`場所: ${getConfigPath()}`));
  } catch (error) {
    console.error(chalk.red('エラー: APIキーの保存に失敗しました'));
    console.error(error);
    process.exit(1);
  }
}

async function handleShow(): Promise<void> {
  console.log(chalk.blue('\n⚙️  GASPhotoAIManager CLI 設定\n'));

  // APIキーの取得元を表示
  const envKey = process.env.GEMINI_API_KEY;
  const config = await getConfig();
  const effectiveKey = await getApiKey();

  console.log(chalk.gray('APIキー:'));

  if (envKey) {
    console.log(`  環境変数 (GEMINI_API_KEY): ${chalk.green(maskApiKey(envKey))}`);
  } else {
    console.log(`  環境変数 (GEMINI_API_KEY): ${chalk.gray('未設定')}`);
  }

  if (config.apiKey) {
    console.log(`  設定ファイル: ${chalk.green(maskApiKey(config.apiKey))}`);
  } else {
    console.log(`  設定ファイル: ${chalk.gray('未設定')}`);
  }

  console.log('');

  if (effectiveKey) {
    console.log(`  ${chalk.green('✓')} 有効なAPIキー: ${maskApiKey(effectiveKey)}`);
  } else {
    console.log(`  ${chalk.red('✗')} APIキーが設定されていません`);
    console.log('');
    console.log(chalk.yellow('APIキーの設定方法:'));
    console.log('  1. gaspm config set-key <your-api-key>');
    console.log('  2. 環境変数 GEMINI_API_KEY を設定');
  }

  console.log('');
  console.log(chalk.gray(`設定ファイル: ${getConfigPath()}`));
  console.log('');
}

function handlePath(): void {
  console.log(getConfigPath());
}
