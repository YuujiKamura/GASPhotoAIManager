/**
 * 温度管理写真のルール
 * 
 * 温度管理写真の測点は「日付 + 台数」で設定する
 * - 日付: EXIFから撮影日を取得（最頻値を採用）
 * - 台数: 黒板のdetectedTextから抽出（"1台目" など）
 */

import { getExifDateFromPath, getMostFrequentExifDate } from '../exif';

export interface TemperaturePhotoResult {
  fileName: string;
  remarks?: string;
  description?: string;
  detectedText?: string;
  station?: string;
}

/**
 * 温度管理写真かどうかを判定
 */
export function isTemperaturePhoto(remarks: string | undefined): boolean {
  if (!remarks) return false;
  return remarks.includes('温度') || remarks.includes('アスファルト');
}

/**
 * 黒板から台数を抽出（"1台目" など）
 */
export function extractDaisu(detectedText: string | undefined): string | null {
  if (!detectedText) return null;
  // 開放温度の場合は台数なし
  if (detectedText.includes('開放温度')) return null;
  
  const match = detectedText.match(/(\d+台目)/);
  return match ? match[1] : null;
}

/**
 * 開放温度かどうかを判定
 */
export function isKaihouTemperature(result: TemperaturePhotoResult): boolean {
  return (
    result.description?.includes('開放温度') || 
    result.detectedText?.includes('開放温度') ||
    false
  );
}

/**
 * 温度管理写真の測点を生成
 * 
 * @param date 撮影日（"11/27" 形式）
 * @param daisu 台数（"1台目" など、開放温度の場合はnull）
 * @param isKaihou 開放温度かどうか
 */
export function generateTemperatureStation(
  date: string,
  daisu: string | null,
  isKaihou: boolean
): string {
  if (isKaihou) {
    return date; // 開放温度は日付のみ
  }
  return daisu ? `${date} ${daisu}` : date;
}

/**
 * 温度管理写真の測点を補完（Node.js用）
 * 
 * @param results 解析結果の配列
 * @param folderPath フォルダパス（EXIFの読み取りに使用）
 * @param onLog ログ出力コールバック
 */
export async function fillTemperatureStations<T extends TemperaturePhotoResult>(
  results: T[],
  folderPath: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error') => void
): Promise<T[]> {
  const path = await import('path');
  const updatedResults = [...results];

  // 温度管理写真のインデックスを収集
  const tempIndices: number[] = [];
  for (let idx = 0; idx < results.length; idx++) {
    if (isTemperaturePhoto(results[idx].remarks)) {
      tempIndices.push(idx);
    }
  }

  if (tempIndices.length === 0) {
    return results;
  }

  onLog?.(`[FILL_STATION] 温度管理写真 ${tempIndices.length}枚の測点を補完中...`, 'info');

  // EXIFから撮影日を取得（最頻値）
  const filePaths = tempIndices.map(idx => path.join(folderPath, results[idx].fileName));
  const extractedDate = await getMostFrequentExifDate(filePaths, 'M/D');

  // 台数を抽出
  let extractedDaisu: string | null = null;
  for (const idx of tempIndices) {
    const daisu = extractDaisu(results[idx].detectedText);
    if (daisu) {
      extractedDaisu = daisu;
      break;
    }
  }

  if (!extractedDate) {
    onLog?.(`  [FILL_STATION] EXIFから日付を取得できませんでした`, 'info');
    return results;
  }

  onLog?.(`  [FILL_STATION] EXIF撮影日: ${extractedDate}, 台数: ${extractedDaisu || 'なし'}`, 'info');

  // 測点を設定
  let filledCount = 0;
  for (const idx of tempIndices) {
    const r = results[idx];
    const isKaihou = isKaihouTemperature(r);
    const newStation = generateTemperatureStation(extractedDate, extractedDaisu, isKaihou);

    updatedResults[idx] = {
      ...updatedResults[idx],
      station: newStation
    };
    filledCount++;
  }

  onLog?.(`[FILL_STATION] ${filledCount}件の測点を設定`, 'success');
  return updatedResults;
}




