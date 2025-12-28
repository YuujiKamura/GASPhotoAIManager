/**
 * 場所・測点関連のユーティリティ関数
 */

/**
 * プロンプトから測点名を抽出
 */
export function extractLocationName(prompt: string): string {
  // パターン1: 「測点は〇〇とする」「測点を〇〇に統一」など
  const sokuten1 = prompt.match(/測点[はを統一等に]?([^とな、。\n]+?)(?:[とに](?:統一|する)|$)/);
  if (sokuten1) {
    return sokuten1[1].trim();
  }

  // パターン2: 「測点：〇〇」「測点:〇〇」
  const sokuten2 = prompt.match(/測点[：:]\s*([^、。\n]+)/);
  if (sokuten2) {
    return sokuten2[1].trim();
  }

  // パターン3: 「〇〇付近」「〇〇地点」などを含む行を探す
  const locationPattern = prompt.match(/([^、。\n]*(?:付近|地点|地区|丁目)[^、。\n]*)/);
  if (locationPattern) {
    const location = locationPattern[1]
      .replace(/^.*(?:測点[はを]|場所[はを]|位置[はを]|一律に)/, '')
      .replace(/(?:[とに](?:統一|する)|です|である).*$/, '')
      .trim();
    if (location) return location;
  }

  // パターン4: 最初の行を取得（フォールバック）
  const lines = prompt.split('\n').filter(line => line.trim().length > 0);
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    const cleanedLine = firstLine.replace(/工事.*$/, '').trim();
    if (cleanedLine) {
      return cleanedLine.substring(0, 30);
    }
  }

  return '現場';
}
