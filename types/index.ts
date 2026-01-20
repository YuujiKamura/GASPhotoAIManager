/**
 * 型定義のメインエントリポイント
 * 後方互換性のためすべての型を再エクスポート
 */

// Photo types
export type {
  PhotoMetadata,
  AppMode,
  PhotoCategory,
  FieldChange,
  ChangeStage,
  AIAnalysisResult,
  PhotoRecord,
  ProcessingStats,
  LogEntry,
  SortPolicy,
} from './photo';

export { SORT_POLICIES } from './photo';

// Analysis types
export type {
  AnalysisIssue,
  IssueType,
  IssueStatus,
  AnalysisExample,
  AnalysisSession,
  AnalysisHistoryEntry,
} from './analysis';

// Learning types
export type {
  LearnedRule,
  LearnedAlias,
  LearnedExample,
  LearnedSettings,
} from './learning';

// Usage types
export type {
  UsageRecord,
  UsageSummary,
  CostEstimate,
} from './usage';

// Template types
export type {
  TemplateLayout,
  BuiltInTemplateId,
  CaptionPosition,
  BlockLayoutMode,
} from './template';

export {
  getBlockLayoutMode,
  isCaptionFirst,
} from './template';
