/**
 * Gemini API - Prompt Builder Module
 *
 * プロンプト構築ロジックを共通化
 * - 一般解析 (analysis.ts)
 * - 対話型解析 (interactiveAnalysis.ts)
 * 両方で使用する共通モジュール
 */

import { AppMode, AnalysisExample } from "../../types";
import { ChainRecord, loadMasterCsv, toChainRecordsJson, getWorkTypesFromMaster } from "../../utils/masterCsvParser";
import { RuleSettings } from "../../utils/analysisRules";
import { getRelevantExamples, getActiveSession, getActiveExampleHistoryId, getAnalysisHistoryEntry, getExamples } from "../../utils/storage";
import { getLearnedSettings, rulesToPromptText as learnedRulesToPromptText } from "../learningService";
import { getSystemInstruction } from "./systemPrompts";
import { formatExamplesForPrompt, LogFunction } from "./helpers";
// Engram Level 2: 類似画像検索
import { selectOptimalExamples, SimilaritySearchOptions } from "../engram/similaritySearch";
import { getHashIndexStats } from "../engram/hashIndex";

// ============================================
// 型定義
// ============================================

export interface PromptBuildOptions {
  appMode: AppMode;
  workType?: string;           // 工種フィルタ（指定時のみフィルタ）
  instruction?: string;        // カスタム指示
  ruleSettings?: RuleSettings; // ルール設定
  includeExamples?: boolean;   // お手本を含めるか（default: true）
  includeLearned?: boolean;    // 学習ルールを含めるか（default: true）
  additionalPrompt?: string;   // 追加プロンプト（対話モード用）
}

export interface PromptBuildResult {
  systemPrompt: string;        // 結合済みシステムプロンプト
  chainRecords: ChainRecord[]; // フィルタ済みマスタ
  workTypes: string[];         // 利用可能な工種一覧
  examplesCount: number;       // 適用されたお手本数
  learnedRulesCount: number;   // 適用された学習ルール数
}

// ============================================
// メイン関数
// ============================================

/**
 * システムプロンプトを構築する共通関数
 *
 * 一般解析と対話型解析の両方で使用
 * - マスタCSV読み込み
 * - 工種フィルタリング
 * - お手本取得
 * - 学習ルール取得
 * - システムプロンプト結合
 */
export async function buildSystemPrompt(
  options: PromptBuildOptions,
  onLog?: LogFunction
): Promise<PromptBuildResult> {
  const {
    appMode,
    workType,
    instruction,
    ruleSettings,
    includeExamples = true,
    includeLearned = true,
    additionalPrompt,
  } = options;

  let chainRecords: ChainRecord[] = [];
  let workTypes: string[] = [];
  let examplesPrompt = "";
  let learnedRulesPrompt = "";
  let examplesCount = 0;
  let learnedRulesCount = 0;

  if (appMode === 'construction') {
    // 1. マスタCSV読み込み
    try {
      const masterRows = await loadMasterCsv();
      if (masterRows.length > 0) {
        const allChainRecords = toChainRecordsJson(masterRows);
        workTypes = getWorkTypesFromMaster(masterRows);

        // 2. 工種フィルタリング
        if (workType) {
          chainRecords = allChainRecords.filter(r => r.workType === workType);
          workTypes = [workType];
          onLog?.(`[PROMPT] マスタフィルタ: ${allChainRecords.length}件 → ${chainRecords.length}件 (工種: ${workType})`, "info");
        } else {
          chainRecords = allChainRecords;
          onLog?.(`[PROMPT] マスタ読込: ${chainRecords.length}件`, "info");
        }
      }
    } catch (e) {
      console.warn('Failed to load master CSV:', e);
    }

    // 3. お手本取得
    if (includeExamples) {
      try {
        // セッションベースのお手本をチェック
        const activeSession = await getActiveSession();
        if (activeSession) {
          onLog?.(`[PROMPT] お手本セッション適用中: "${activeSession.name}" (${activeSession.photoCount}枚)`, "info");
        }

        // 履歴ベースのお手本をチェック
        const activeHistoryId = getActiveExampleHistoryId();
        if (activeHistoryId && !activeSession) {
          const historyEntry = await getAnalysisHistoryEntry(activeHistoryId);
          if (historyEntry && historyEntry.isExampleSession) {
            onLog?.(`[PROMPT] 履歴お手本適用中: "${historyEntry.name}" (${historyEntry.photoCount}枚)`, "info");
          }
        }

        const examples = await getRelevantExamples(undefined, undefined, 5);
        if (examples.length > 0) {
          examplesPrompt = formatExamplesForPrompt(examples);
          examplesCount = examples.length;
          onLog?.(`[PROMPT] お手本: ${examplesCount}件適用`, "success");
        }
      } catch (e) {
        console.warn('Failed to load examples:', e);
      }
    }

    // 4. 学習ルール取得
    if (includeLearned) {
      try {
        const learnedSettings = await getLearnedSettings();
        if (learnedSettings.rules.length > 0 || learnedSettings.aliases.length > 0) {
          learnedRulesPrompt = learnedRulesToPromptText(learnedSettings);
          learnedRulesCount = learnedSettings.rules.length + learnedSettings.aliases.length;
          onLog?.(`[PROMPT] 学習ルール: ${learnedRulesCount}件適用`, "success");
        }
      } catch (e) {
        console.warn('Failed to load learned settings:', e);
      }
    }
  }

  // 5. システムプロンプト結合
  const baseSystemPrompt = getSystemInstruction(appMode, instruction, ruleSettings, chainRecords);
  const systemPrompt = [baseSystemPrompt, examplesPrompt, learnedRulesPrompt, additionalPrompt]
    .filter(Boolean)
    .join('\n\n');

  return {
    systemPrompt,
    chainRecords,
    workTypes,
    examplesCount,
    learnedRulesCount,
  };
}

/**
 * 複数工種でフィルタリングするバリアント
 * analysis.ts の selectWorkTypes 結果（複数工種）に対応
 *
 * Engram Level 1: 工種フィルタをお手本・学習ルールにも連動
 */
export async function buildSystemPromptWithMultipleWorkTypes(
  options: Omit<PromptBuildOptions, 'workType'> & { selectedWorkTypes?: string[] },
  onLog?: LogFunction
): Promise<PromptBuildResult> {
  const {
    appMode,
    selectedWorkTypes,
    instruction,
    ruleSettings,
    includeExamples = true,
    includeLearned = true,
    additionalPrompt,
  } = options;

  let chainRecords: ChainRecord[] = [];
  let workTypes: string[] = [];
  let examplesPrompt = "";
  let learnedRulesPrompt = "";
  let examplesCount = 0;
  let learnedRulesCount = 0;

  if (appMode === 'construction') {
    // 1. マスタCSV読み込み
    try {
      const masterRows = await loadMasterCsv();
      if (masterRows.length > 0) {
        const allChainRecords = toChainRecordsJson(masterRows);
        workTypes = getWorkTypesFromMaster(masterRows);

        // 2. 工種でフィルタリング（指定がある場合）
        if (selectedWorkTypes && selectedWorkTypes.length > 0) {
          chainRecords = allChainRecords.filter(r => selectedWorkTypes.includes(r.workType));
          workTypes = selectedWorkTypes;
          onLog?.(`[PROMPT] マスタフィルタ: ${allChainRecords.length}件 → ${chainRecords.length}件 (工種: ${selectedWorkTypes.join(', ')})`, "info");
        } else {
          chainRecords = allChainRecords;
          onLog?.(`[PROMPT] マスタ読込: ${chainRecords.length}件`, "info");
        }
      }
    } catch (e) {
      console.warn('Failed to load master CSV:', e);
    }

    // 3. お手本取得 (Engram Level 1: 工種フィルタ連動)
    if (includeExamples) {
      try {
        const activeSession = await getActiveSession();
        if (activeSession) {
          onLog?.(`[PROMPT] お手本セッション適用中: "${activeSession.name}" (${activeSession.photoCount}枚)`, "info");
        }

        const activeHistoryId = getActiveExampleHistoryId();
        if (activeHistoryId && !activeSession) {
          const historyEntry = await getAnalysisHistoryEntry(activeHistoryId);
          if (historyEntry && historyEntry.isExampleSession) {
            onLog?.(`[PROMPT] 履歴お手本適用中: "${historyEntry.name}" (${historyEntry.photoCount}枚)`, "info");
          }
        }

        // Engram Level 1: 工種フィルタをお手本にも連動
        const examples = await getRelevantExamples(undefined, undefined, 5, selectedWorkTypes);
        if (examples.length > 0) {
          examplesPrompt = formatExamplesForPrompt(examples);
          examplesCount = examples.length;
          onLog?.(`[PROMPT] お手本: ${examplesCount}件適用${selectedWorkTypes?.length ? ` (工種フィルタ: ${selectedWorkTypes.join(', ')})` : ''}`, "success");
        }
      } catch (e) {
        console.warn('Failed to load examples:', e);
      }
    }

    // 4. 学習ルール取得 (Engram Level 1: 工種フィルタ連動)
    if (includeLearned) {
      try {
        const learnedSettings = await getLearnedSettings();
        if (learnedSettings.rules.length > 0 || learnedSettings.aliases.length > 0) {
          // Engram Level 1: 工種フィルタを学習ルールにも連動
          learnedRulesPrompt = learnedRulesToPromptText(learnedSettings, selectedWorkTypes);
          learnedRulesCount = learnedSettings.rules.length + learnedSettings.aliases.length;
          onLog?.(`[PROMPT] 学習ルール: ${learnedRulesCount}件適用${selectedWorkTypes?.length ? ` (工種フィルタ適用)` : ''}`, "success");
        }
      } catch (e) {
        console.warn('Failed to load learned settings:', e);
      }
    }
  }

  // 5. システムプロンプト結合
  const baseSystemPrompt = getSystemInstruction(appMode, instruction, ruleSettings, chainRecords);
  const systemPrompt = [baseSystemPrompt, examplesPrompt, learnedRulesPrompt, additionalPrompt]
    .filter(Boolean)
    .join('\n\n');

  return {
    systemPrompt,
    chainRecords,
    workTypes,
    examplesCount,
    learnedRulesCount,
  };
}

// ============================================
// Engram Level 2: 類似画像ベースのお手本選択
// ============================================

export interface SimilarityPromptOptions extends Omit<PromptBuildOptions, 'workType'> {
  selectedWorkTypes?: string[];
  images?: Array<{ fileName: string; base64: string }>;  // 解析対象画像
  useSimilaritySearch?: boolean;  // 類似検索を使用するか（default: auto）
  maxSimilarExamples?: number;    // 類似検索で選択するお手本数（default: 3）
}

export interface SimilarityPromptResult extends PromptBuildResult {
  similarityUsed: boolean;        // 類似検索が使用されたか
  similarityCoverage?: number;    // カバレッジ（0-1）
}

/**
 * 類似画像検索を使用したプロンプト構築
 *
 * Engram Level 2: pHashで類似画像を検索し、最適なお手本1-3件のみ注入
 * - ハッシュインデックスがある場合は類似検索を使用
 * - ない場合は Level 1 にフォールバック
 */
export async function buildSystemPromptWithSimilarity(
  options: SimilarityPromptOptions,
  onLog?: LogFunction
): Promise<SimilarityPromptResult> {
  const {
    appMode,
    selectedWorkTypes,
    instruction,
    ruleSettings,
    includeExamples = true,
    includeLearned = true,
    additionalPrompt,
    images,
    useSimilaritySearch,
    maxSimilarExamples = 3,
  } = options;

  let chainRecords: ChainRecord[] = [];
  let workTypes: string[] = [];
  let examplesPrompt = "";
  let learnedRulesPrompt = "";
  let examplesCount = 0;
  let learnedRulesCount = 0;
  let similarityUsed = false;
  let similarityCoverage: number | undefined;

  if (appMode === 'construction') {
    // 1. マスタCSV読み込み
    try {
      const masterRows = await loadMasterCsv();
      if (masterRows.length > 0) {
        const allChainRecords = toChainRecordsJson(masterRows);
        workTypes = getWorkTypesFromMaster(masterRows);

        if (selectedWorkTypes && selectedWorkTypes.length > 0) {
          chainRecords = allChainRecords.filter(r => selectedWorkTypes.includes(r.workType));
          workTypes = selectedWorkTypes;
          onLog?.(`[PROMPT] マスタフィルタ: ${allChainRecords.length}件 → ${chainRecords.length}件`, "info");
        } else {
          chainRecords = allChainRecords;
        }
      }
    } catch (e) {
      console.warn('Failed to load master CSV:', e);
    }

    // 2. お手本取得（Level 2: 類似検索 or Level 1: 工種フィルタ）
    if (includeExamples) {
      try {
        // ハッシュインデックスの状態を確認
        const hashStats = await getHashIndexStats();
        const shouldUseSimilarity = useSimilaritySearch ?? (
          hashStats.totalEntries > 0 && images && images.length > 0
        );

        if (shouldUseSimilarity && images && images.length > 0) {
          // Engram Level 2: 類似検索
          onLog?.(`[ENGRAM L2] 類似検索開始: ${images.length}画像, ${hashStats.totalEntries}エントリ`, "info");

          const allExamples = await getExamples();
          const searchOptions: SimilaritySearchOptions = {
            workTypes: selectedWorkTypes,
            limit: 2,
            minSimilarity: 0.75
          };

          const { examples: similarExamples, coverage } = await selectOptimalExamples(
            images,
            allExamples,
            maxSimilarExamples,
            searchOptions
          );

          if (similarExamples.length > 0) {
            examplesPrompt = formatExamplesForPrompt(similarExamples);
            examplesCount = similarExamples.length;
            similarityUsed = true;
            similarityCoverage = coverage;
            onLog?.(`[ENGRAM L2] 類似お手本: ${examplesCount}件選択 (カバレッジ: ${(coverage * 100).toFixed(1)}%)`, "success");
          } else {
            onLog?.(`[ENGRAM L2] 類似お手本なし → Level 1にフォールバック`, "info");
          }
        }

        // フォールバック: Level 1（工種フィルタ）
        if (!similarityUsed) {
          const examples = await getRelevantExamples(undefined, undefined, 5, selectedWorkTypes);
          if (examples.length > 0) {
            examplesPrompt = formatExamplesForPrompt(examples);
            examplesCount = examples.length;
            onLog?.(`[PROMPT] お手本: ${examplesCount}件適用 (Level 1)`, "success");
          }
        }
      } catch (e) {
        console.warn('Failed to load examples with similarity:', e);
        // エラー時はLevel 1にフォールバック
        try {
          const examples = await getRelevantExamples(undefined, undefined, 5, selectedWorkTypes);
          if (examples.length > 0) {
            examplesPrompt = formatExamplesForPrompt(examples);
            examplesCount = examples.length;
          }
        } catch (e2) {
          console.warn('Fallback also failed:', e2);
        }
      }
    }

    // 3. 学習ルール取得
    if (includeLearned) {
      try {
        const learnedSettings = await getLearnedSettings();
        if (learnedSettings.rules.length > 0 || learnedSettings.aliases.length > 0) {
          learnedRulesPrompt = learnedRulesToPromptText(learnedSettings, selectedWorkTypes);
          learnedRulesCount = learnedSettings.rules.length + learnedSettings.aliases.length;
          onLog?.(`[PROMPT] 学習ルール: ${learnedRulesCount}件適用`, "success");
        }
      } catch (e) {
        console.warn('Failed to load learned settings:', e);
      }
    }
  }

  // 4. システムプロンプト結合
  const baseSystemPrompt = getSystemInstruction(appMode, instruction, ruleSettings, chainRecords);
  const systemPrompt = [baseSystemPrompt, examplesPrompt, learnedRulesPrompt, additionalPrompt]
    .filter(Boolean)
    .join('\n\n');

  return {
    systemPrompt,
    chainRecords,
    workTypes,
    examplesCount,
    learnedRulesCount,
    similarityUsed,
    similarityCoverage,
  };
}
