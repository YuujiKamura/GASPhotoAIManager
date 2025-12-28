/**
 * Gemini API Module Index
 *
 * 解析・正規化関連の関数を再エクスポート
 */

// ============================================
// Analysis Module (解析関連)
// ============================================
export {
  // Main Analysis Functions
  analyzePhotoBatch,
  analyzePhotoInteractive,
  identifyTargetPhotos,
  selectWorkTypes,
  getFilteredHierarchy,
  getSystemInstruction,

  // Types
  type InteractiveMessage,
  type InteractiveAnalysisResult,
} from './analysis';

// ============================================
// Normalization Module (正規化関連)
// ============================================
export {
  // Normalization Functions
  getNormalizationProposals,
  applyNormalizationCorrections,
  normalizeDataConsistency,

  // Scene Assignment Functions
  assignSceneIds,
  refinePairContext,
  sortPhotosByScene,

  // Types
  type NormalizationCorrection,
  type NormalizationResult,
} from './normalization';
