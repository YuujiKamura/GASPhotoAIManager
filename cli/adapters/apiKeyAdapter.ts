/**
 * CLI API Key Adapter
 * APIキーの取得・保存を管理
 *
 * 優先順位:
 * 1. コマンドオプション（--api-key）
 * 2. 環境変数（GEMINI_API_KEY）
 * 3. 設定ファイル（~/.gaspm/config.json）
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import dotenv from 'dotenv';

// .envファイルを読み込み
dotenv.config();

const CONFIG_DIR = path.join(os.homedir(), '.gaspm');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

interface Config {
  apiKey?: string;
  defaultModel?: string;
  defaultPhotosPerPage?: 2 | 3;
}

/**
 * 設定ファイルを読み込み
 */
async function loadConfig(): Promise<Config> {
  try {
    const content = await fs.readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * 設定ファイルを保存
 */
async function saveConfig(config: Config): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * APIキーを取得（優先順位に従う）
 */
export async function getApiKey(optionKey?: string): Promise<string | null> {
  // 1. コマンドオプション
  if (optionKey) {
    return optionKey;
  }

  // 2. 環境変数
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey) {
    return envKey;
  }

  // 3. 設定ファイル
  const config = await loadConfig();
  return config.apiKey || null;
}

/**
 * APIキーを設定ファイルに保存
 */
export async function setApiKey(apiKey: string): Promise<void> {
  const config = await loadConfig();
  config.apiKey = apiKey;
  await saveConfig(config);
}

/**
 * APIキーが設定されているか確認
 */
export async function hasApiKey(optionKey?: string): Promise<boolean> {
  const key = await getApiKey(optionKey);
  return !!key;
}

/**
 * 設定を取得
 */
export async function getConfig(): Promise<Config> {
  return loadConfig();
}

/**
 * 設定を更新
 */
export async function updateConfig(updates: Partial<Config>): Promise<void> {
  const config = await loadConfig();
  Object.assign(config, updates);
  await saveConfig(config);
}

/**
 * 設定ファイルのパスを取得
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * APIキーをマスク表示用に変換
 */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return '****';
  }
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}
