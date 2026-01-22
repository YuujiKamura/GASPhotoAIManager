/**
 * Gemini API - Prompt Builder Module
 *
 * プロンプト構築ロジックを共通化
 * - 一般解析 (analysis.ts)
 * - 対話型解析 (interactiveAnalysis.ts)
 * 両方で使用する共通モジュール
 */

import { AppMode } from "../../types";
import { ChainRecord, loadMasterCsv, toChainRecordsJson, getWorkTypesFromMaster } from "../../utils/masterCsvParser";
import { RuleSettings } from "../../utils/analysisRules";
import { getRelevantExamples, getActiveSession, getActiveExampleHistoryId, getAnalysisHistoryEntry } from "../../utils/storage";
import { getLearnedSettings, rulesToPromptText as learnedRulesToPromptText } from "../learningService";
import { getSystemInstruction } from "./systemPrompts";
import { formatExamplesForPrompt, LogFunction } from "./helpers";

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

    // 3. お手本取得
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
