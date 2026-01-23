/**
 * Engram モジュール - 知識フィルタリングロジック
 * 工種に基づいてお手本・ルール・エイリアスをフィルタリング
 */

import { KnowledgeFilterOptions, FilteredKnowledge } from './types';
import { AnalysisExample, LearnedRule, LearnedAlias } from '../../types';

/**
 * 工種でお手本をフィルタリング
 */
export const filterExamplesByWorkTypes = (
  examples: AnalysisExample[],
  workTypes: string[],
  limit?: number
): AnalysisExample[] => {
  if (!workTypes || workTypes.length === 0) {
    return limit ? examples.slice(0, limit) : examples;
  }

  const filtered = examples.filter(ex =>
    workTypes.some(wt => ex.analysis.workType?.includes(wt))
  );

  return limit ? filtered.slice(0, limit) : filtered;
};

/**
 * 工種でルールをフィルタリング
 */
export const filterRulesByWorkTypes = (
  rules: LearnedRule[],
  workTypes: string[]
): LearnedRule[] => {
  if (!workTypes || workTypes.length === 0) {
    return rules;
  }

  return rules.filter(rule => {
    // workType条件がないルールは全工種適用
    if (!rule.condition.workType) return true;
    // 指定工種にマッチするルールのみ
    return workTypes.some(wt => rule.condition.workType?.includes(wt));
  });
};

/**
 * 工種でエイリアスをフィルタリング
 */
export const filterAliasesByWorkTypes = (
  aliases: LearnedAlias[],
  workTypes: string[]
): LearnedAlias[] => {
  if (!workTypes || workTypes.length === 0) {
    return aliases;
  }

  return aliases.filter(alias => {
    // context がないエイリアスは全工種適用
    if (!alias.context) return true;
    // 指定工種にマッチするエイリアスのみ
    return workTypes.some(wt => alias.context?.includes(wt));
  });
};

/**
 * 統合フィルタ: お手本・ルール・エイリアスを一括フィルタリング
 */
export const filterKnowledge = (
  examples: AnalysisExample[],
  rules: LearnedRule[],
  aliases: LearnedAlias[],
  options: KnowledgeFilterOptions
): FilteredKnowledge => {
  const { workTypes = [], limit } = options;

  const originalCount = {
    examples: examples.length,
    rules: rules.length,
    aliases: aliases.length
  };

  const filteredExamples = filterExamplesByWorkTypes(examples, workTypes, limit);
  const filteredRules = filterRulesByWorkTypes(rules, workTypes);
  const filteredAliases = filterAliasesByWorkTypes(aliases, workTypes);

  const filteredCount = {
    examples: filteredExamples.length,
    rules: filteredRules.length,
    aliases: filteredAliases.length
  };

  const totalOriginal = originalCount.examples + originalCount.rules + originalCount.aliases;
  const totalFiltered = filteredCount.examples + filteredCount.rules + filteredCount.aliases;
  const reductionRate = totalOriginal > 0 ? 1 - (totalFiltered / totalOriginal) : 0;

  return {
    examples: filteredExamples,
    rules: filteredRules,
    aliases: filteredAliases,
    stats: {
      originalCount,
      filteredCount,
      reductionRate
    }
  };
};
