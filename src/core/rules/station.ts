/**
 * 測点（Station）のルール
 * 
 * 日本の道路工事における測点の命名規則:
 * 1. 地名ベース: "小山町1359", "長嶺南6丁目123" など
 * 2. 横断測点ベース: "No.0+50", "No.1+23.5" など
 * 3. 組み合わせ: "小山4丁目6 No.0+11"
 * 
 * 住所のルール:
 * - 町名+丁目 + 番 まで残す
 * - 号（建物番号）と枝番は除外
 * - 例: "小山4丁目6-62-1" → "小山4丁目6"
 */

/**
 * 日本の住所から号・枝番を除外し、番まで残す
 * 
 * 住所構造: 町名+丁目 + 番 + 号 + 枝番
 * 例: "小山4丁目6-62-1" = 小山4丁目 + 6番 + 62号 + 1枝番
 * 
 * @param address 元の住所
 * @returns 番まで残した住所
 */
export function normalizeJapaneseAddress(address: string): string {
  // パターン1: "小山4丁目6-62-1" → "小山4丁目6"
  // 丁目の後の最初の数字だけを残す
  const choomeMatch = address.match(/^(.+丁目)(\d+)(?:-\d+)*$/);
  if (choomeMatch) {
    return `${choomeMatch[1]}${choomeMatch[2]}`;
  }

  // パターン2: "小山町1359-5" → "小山町1359"
  // 町名の後の最初の数字だけを残す（ハイフン以降を除去）
  const machiMatch = address.match(/^(.+町)(\d+)(?:-\d+)*$/);
  if (machiMatch) {
    return `${machiMatch[1]}${machiMatch[2]}`;
  }

  // パターン3: 数字-数字形式（丁目・町がない場合）
  // 例: "1359-5" → "1359"
  const simpleMatch = address.match(/^(\d+)(?:-\d+)+$/);
  if (simpleMatch) {
    return simpleMatch[1];
  }

  // マッチしない場合はそのまま返す
  return address;
}

/**
 * 横断測点番号を抽出
 * 例: "No.0+50", "No.1+23.5" など
 */
export function extractStationNumber(text: string): string | null {
  const match = text.match(/No\.\d+\+[\d.]+/i);
  return match ? match[0] : null;
}

/**
 * 測点文字列を正規化
 * - 住所の号・枝番を除外
 * - 横断測点番号があれば組み合わせ
 * 
 * @param station 元の測点文字列
 * @returns 正規化された測点文字列
 */
export function normalizeStation(station: string): string {
  if (!station) return '';

  // 横断測点番号を抽出
  const stationNumber = extractStationNumber(station);
  
  // 横断測点番号を除いた部分を取得
  let addressPart = station;
  if (stationNumber) {
    addressPart = station.replace(stationNumber, '').trim();
  }

  // 住所を正規化
  const normalizedAddress = addressPart ? normalizeJapaneseAddress(addressPart) : '';

  // 組み合わせ
  if (normalizedAddress && stationNumber) {
    return `${normalizedAddress} ${stationNumber}`;
  } else if (stationNumber) {
    return stationNumber;
  } else {
    return normalizedAddress;
  }
}

/**
 * 測点が空または無効かどうかを判定
 */
export function isEmptyStation(station: string | undefined | null): boolean {
  if (!station) return true;
  const trimmed = station.trim().toLowerCase();
  return trimmed === '' || trimmed === 'null' || trimmed === '不明' || trimmed === 'unknown';
}

/**
 * 測点の最頻値を取得
 * 
 * @param stations 測点の配列
 * @returns 最頻値の測点（空の測点は除外）
 */
export function getMostFrequentStation(stations: (string | undefined)[]): string | null {
  const countMap = new Map<string, number>();
  
  for (const station of stations) {
    if (isEmptyStation(station)) continue;
    const normalized = normalizeStation(station!);
    if (normalized) {
      countMap.set(normalized, (countMap.get(normalized) || 0) + 1);
    }
  }

  let mostFrequent: string | null = null;
  let maxCount = 0;
  for (const [station, count] of countMap) {
    if (count > maxCount) {
      maxCount = count;
      mostFrequent = station;
    }
  }

  return mostFrequent;
}




