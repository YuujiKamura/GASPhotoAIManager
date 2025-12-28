/**
 * 写真ソート関連のユーティリティ関数
 */
import { PhotoRecord, SortPolicy } from '../types';
import { getDetailOrderMap, getVarietyOrderMap } from './constructionMaster';
import { getLearnedOrderValue } from './learnedSortOrder';

/**
 * 測点名を正規化
 */
export function normalizeStationName(raw: string | undefined): string {
  if (!raw) return "";
  let s = raw.trim();
  if (!s) return "";
  // Normalize full-width characters to half-width
  s = s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(char) {
    return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
  });
  s = s.replace(/\s+/g, "");
  // Remove "No." "NO" prefixes to match just the number if possible, or normalize valid prefixes
  if (/^(no|number|nu|nm)[^a-z]/i.test(s)) {
    s = s.replace(/^(no|number|nu|nm)\.?/i, "No.");
  }
  return s.toUpperCase();
}

/**
 * 写真のフェーズ（着手前/施工中/完了）スコアを取得
 */
export function getPhaseScore(r: PhotoRecord): number {
  // Use AI determined phase if available
  if (r.analysis?.phase === 'before') return 0;
  if (r.analysis?.phase === 'status') return 1;
  if (r.analysis?.phase === 'after') return 2;

  // Fallback to text heuristics
  const text = ((r.analysis?.remarks || "") + (r.analysis?.variety || "") + (r.analysis?.workType || "")).toLowerCase();
  if (text.includes("着手前") || text.includes("before") || text.includes("pre") || text.includes("施工前")) return 0;
  if (text.includes("完了") || text.includes("竣工") || text.includes("after") || text.includes("done")) return 2;
  return 1;
}

/**
 * 安全管理写真かどうかを判定
 */
export function isSafetyPhoto(r: PhotoRecord): boolean {
  const workType = r.analysis?.workType || '';
  const remarks = r.analysis?.remarks || '';
  const safetyKeywords = ['朝礼', 'KY', '安全', '新規入場', '点灯', '巡視', '保安'];
  return workType.includes('安全管理') || workType.includes('安全') ||
         safetyKeywords.some(kw => remarks.includes(kw));
}

/**
 * 時系列ソート（基本）
 */
function chronologicalSort(a: PhotoRecord, b: PhotoRecord): number {
  const dateA = a.date || 0;
  const dateB = b.date || 0;
  const TIME_WINDOW = 5 * 60 * 1000;
  const timeDiff = Math.abs(dateA - dateB);

  if (timeDiff <= TIME_WINDOW) {
    const stationA = normalizeStationName(a.analysis?.station) || "ZZZ";
    const stationB = normalizeStationName(b.analysis?.station) || "ZZZ";
    if (stationA !== stationB) return stationA.localeCompare(stationB);

    const scoreA = getPhaseScore(a);
    const scoreB = getPhaseScore(b);
    if (scoreA !== scoreB) return scoreA - scoreB;
  }
  return dateA - dateB;
}

/**
 * ソートポリシーに基づいて写真をソート
 */
export function sortPhotosLogical(records: PhotoRecord[], policy: SortPolicy = 'by_detail_safety_first'): PhotoRecord[] {
  switch (policy) {
    case 'chronological':
      return [...records].sort(chronologicalSort);

    case 'chronological_safety_first': {
      const safety = records.filter(isSafetyPhoto).sort(chronologicalSort);
      const others = records.filter(r => !isSafetyPhoto(r)).sort(chronologicalSort);
      return [...safety, ...others];
    }

    case 'chronological_safety_last': {
      const safety = records.filter(isSafetyPhoto).sort(chronologicalSort);
      const others = records.filter(r => !isSafetyPhoto(r)).sort(chronologicalSort);
      return [...others, ...safety];
    }

    case 'by_detail': {
      const detailOrder = getDetailOrderMap();
      const groups: { [key: string]: PhotoRecord[] } = {};
      records.forEach(r => {
        const key = r.analysis?.detail || r.analysis?.variety || '未分類';
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
      });
      // マスタ順でソート、マッチしない場合は学習済み順序を使用
      const sortedKeys = Object.keys(groups).sort((a, b) => {
        const masterOrderA = detailOrder.get(a);
        const masterOrderB = detailOrder.get(b);
        const orderA = masterOrderA ?? (5000 + getLearnedOrderValue(a));
        const orderB = masterOrderB ?? (5000 + getLearnedOrderValue(b));
        return orderA - orderB;
      });
      return sortedKeys.flatMap(key => groups[key].sort(chronologicalSort));
    }

    case 'by_detail_safety_first': {
      const detailOrderSF = getDetailOrderMap();
      const safety = records.filter(isSafetyPhoto).sort(chronologicalSort);
      const others = records.filter(r => !isSafetyPhoto(r));
      const groups: { [key: string]: PhotoRecord[] } = {};
      others.forEach(r => {
        const key = r.analysis?.detail || r.analysis?.variety || '未分類';
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
      });
      const sortedKeys = Object.keys(groups).sort((a, b) => {
        const masterOrderA = detailOrderSF.get(a);
        const masterOrderB = detailOrderSF.get(b);
        const orderA = masterOrderA ?? (5000 + getLearnedOrderValue(a));
        const orderB = masterOrderB ?? (5000 + getLearnedOrderValue(b));
        return orderA - orderB;
      });
      const sortedOthers = sortedKeys.flatMap(key => groups[key].sort(chronologicalSort));
      return [...safety, ...sortedOthers];
    }

    case 'by_detail_safety_last': {
      const detailOrderSL = getDetailOrderMap();
      const safety = records.filter(isSafetyPhoto).sort(chronologicalSort);
      const others = records.filter(r => !isSafetyPhoto(r));
      const groups: { [key: string]: PhotoRecord[] } = {};
      others.forEach(r => {
        const key = r.analysis?.detail || r.analysis?.variety || '未分類';
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
      });
      const sortedKeys = Object.keys(groups).sort((a, b) => {
        const masterOrderA = detailOrderSL.get(a);
        const masterOrderB = detailOrderSL.get(b);
        const orderA = masterOrderA ?? (5000 + getLearnedOrderValue(a));
        const orderB = masterOrderB ?? (5000 + getLearnedOrderValue(b));
        return orderA - orderB;
      });
      const sortedOthers = sortedKeys.flatMap(key => groups[key].sort(chronologicalSort));
      return [...sortedOthers, ...safety];
    }

    case 'by_worktype': {
      const varietyOrder = getVarietyOrderMap();
      const groups: { [key: string]: PhotoRecord[] } = {};
      records.forEach(r => {
        const key = r.analysis?.workType || '未分類';
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
      });
      const sortedKeys = Object.keys(groups).sort((a, b) => {
        const orderA = varietyOrder.get(a) ?? 9999;
        const orderB = varietyOrder.get(b) ?? 9999;
        return orderA - orderB;
      });
      return sortedKeys.flatMap(key => groups[key].sort(chronologicalSort));
    }

    default:
      return [...records].sort(chronologicalSort);
  }
}

/**
 * 着手前-完了ペアを作成
 */
export function arrangePairsStrictly(records: PhotoRecord[]): { sorted: PhotoRecord[], pairCount: number, omittedCount: number } {
  const groups: { [key: string]: PhotoRecord[] } = {};
  let omittedCount = 0;

  // 1. Grouping by scene or station
  records.forEach(r => {
    let key = r.analysis?.sceneId;
    if (!key) {
      const station = normalizeStationName(r.analysis?.station);
      if (station && station !== "UNKNOWN") {
        key = "STATION_" + station;
      }
    }

    if (key) {
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    } else {
      omittedCount++;
    }
  });

  const pairs: PhotoRecord[][] = [];
  const groupKeys = Object.keys(groups);
  groupKeys.sort();

  groupKeys.forEach(key => {
    const group = groups[key];

    if (group.length < 2) {
      omittedCount += group.length;
      return;
    }

    // Sort by date within each group
    group.sort((a, b) => {
      if (a.date && b.date) return a.date - b.date;
      return (a.fileName || "").localeCompare(b.fileName || "");
    });

    // Identify before and after photos
    let beforePhoto: PhotoRecord | null = null;
    let afterPhoto: PhotoRecord | null = null;

    group.forEach(photo => {
      const remarks = photo.analysis?.remarks || "";
      const phase = photo.analysis?.phase;

      if (!beforePhoto && (phase === 'before' || remarks.includes("着手前") || remarks.includes("施工前"))) {
        beforePhoto = photo;
        if (photo.analysis) photo.analysis.phase = 'before';
      } else if (!afterPhoto && (phase === 'after' || remarks.includes("完了") || remarks.includes("完成") || remarks.includes("竣工"))) {
        afterPhoto = photo;
        if (photo.analysis) photo.analysis.phase = 'after';
      }
    });

    // Use first and last if not found explicitly
    if (!beforePhoto) {
      beforePhoto = group[0];
      if (beforePhoto.analysis) beforePhoto.analysis.phase = 'before';
    }
    if (!afterPhoto && group.length > 1) {
      afterPhoto = group[group.length - 1];
      if (afterPhoto.analysis) afterPhoto.analysis.phase = 'after';
    }

    if (beforePhoto && afterPhoto && beforePhoto !== afterPhoto) {
      pairs.push([beforePhoto, afterPhoto]);
      const usedPhotos = new Set([beforePhoto.fileName, afterPhoto.fileName]);
      group.forEach(photo => {
        if (!usedPhotos.has(photo.fileName)) {
          omittedCount++;
        }
      });
    } else {
      omittedCount += group.length;
    }
  });

  // Sort pairs by the date of the after photo
  pairs.sort((a, b) => {
    const dateA = a[1].date || 0;
    const dateB = b[1].date || 0;
    return dateA - dateB;
  });

  // Flatten pairs into alternating before-after sequence
  const sorted: PhotoRecord[] = [];
  pairs.forEach(pair => {
    sorted.push(pair[0]); // before
    sorted.push(pair[1]); // after
  });

  return { sorted, pairCount: pairs.length, omittedCount };
}
