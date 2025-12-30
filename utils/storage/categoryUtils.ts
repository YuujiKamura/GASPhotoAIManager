// Category detection utilities (循環依存回避のため分離)

import { AIAnalysisResult, PhotoCategory } from "../../types";

/**
 * Detect photo category from analysis result
 */
export const detectPhotoCategory = (analysis: AIAnalysisResult): PhotoCategory => {
  const remarks = analysis.remarks?.toLowerCase() || '';

  if (remarks.includes('着手前') || remarks.includes('竣工') || remarks.includes('完成')) {
    return '着手前及び完成写真';
  }
  if (remarks.includes('状況') && !remarks.includes('出来形')) {
    return '施工状況写真';
  }
  if (remarks.includes('出来形') || analysis.measurements) {
    return '出来形管理写真';
  }
  if (remarks.includes('安全') || remarks.includes('朝礼') || remarks.includes('KY')) {
    return '安全管理写真';
  }
  if (remarks.includes('材料')) {
    return '使用材料写真';
  }
  if (remarks.includes('品質')) {
    return '品質管理写真';
  }

  return 'その他';
};
