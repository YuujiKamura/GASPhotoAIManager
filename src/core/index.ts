/**
 * Core モジュール - 共通ロジックのエントリーポイント
 * 
 * GUI（Webアプリ）とCLI（Node.jsスクリプト）の両方で使用可能な
 * 環境非依存のコアロジックを提供します。
 */

// EXIF取得
export {
  isNodeEnvironment,
  isBrowserEnvironment,
  getExifDateFromPath,
  getExifDateFromFile,
  formatExifDate,
  getMostFrequentExifDate
} from './exif';

// プロンプト生成
export type { AppMode } from './prompt';
export {
  getSystemInstruction,
  getSystemInstructionLegacy,
  getGeneralModePrompt,
  getConstructionModePrompt,
  getPhotoCategoryHint
} from './prompt';

// 測点ルール
export {
  normalizeJapaneseAddress,
  extractStationNumber,
  normalizeStation,
  isEmptyStation,
  getMostFrequentStation
} from './rules/station';

// 温度管理ルール
export type { TemperaturePhotoResult } from './rules/temperature';
export {
  isTemperaturePhoto,
  extractDaisu,
  isKaihouTemperature,
  generateTemperatureStation,
  fillTemperatureStations
} from './rules/temperature';

