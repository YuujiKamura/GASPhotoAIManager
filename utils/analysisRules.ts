/**
 * 解析ルール/制約の一元管理
 *
 * 「ブレーキを先に作る」思想に基づき、
 * すべての制約を解析前に可視化・設定可能にする
 */

export type RuleCategory =
  | 'photoCategory'      // 写真区分ルール
  | 'hierarchy'          // 階層構造制約
  | 'temperature'        // 温度写真ルール
  | 'masterProtection';  // マスタ保護

export interface AnalysisRule {
  id: string;
  category: RuleCategory;
  label: string;
  description: string;
  isFixed: boolean;      // 🔒 ユーザーが変更不可
  defaultEnabled: boolean;
}

export interface RuleCategoryInfo {
  id: RuleCategory;
  label: string;
  icon: string;
  description: string;
}

// カテゴリ情報
export const RULE_CATEGORIES: RuleCategoryInfo[] = [
  {
    id: 'photoCategory',
    label: '写真区分ルール',
    icon: '📷',
    description: '土木工事の写真管理基準に基づく9区分で分類'
  },
  {
    id: 'hierarchy',
    label: '階層構造制約',
    icon: '🏗️',
    description: '工種→種別→細別→備考の5階層構造ルール'
  },
  {
    id: 'temperature',
    label: '温度写真ルール',
    icon: '🌡️',
    description: '温度管理写真の分類・備考ルール'
  },
  {
    id: 'masterProtection',
    label: 'マスタ保護',
    icon: '🛡️',
    description: 'AIによるマスタデータ書き換え防止'
  }
];

// 全ルール定義
export const ANALYSIS_RULES: AnalysisRule[] = [
  // === 写真区分ルール（土木工事の写真管理基準準拠・9区分） ===
  {
    id: 'pc_nine_categories',
    category: 'photoCategory',
    label: '9区分分類（写真管理基準準拠）',
    description: '着手前及び完成・施工状況・安全管理・使用材料・品質管理・出来形管理・災害・事故・その他',
    isFixed: true,
    defaultEnabled: true
  },
  {
    id: 'pc_safety_management',
    category: 'photoCategory',
    label: '安全管理写真判定',
    description: '朝礼・KYミーティング・新規入場者教育・安全巡視・保安施設設置等を安全管理写真に分類',
    isFixed: true,
    defaultEnabled: true
  },
  {
    id: 'pc_quality_thermometer',
    category: 'photoCategory',
    label: '品質管理=計測器',
    description: '温度計・密度計が写っていれば品質管理写真',
    isFixed: true,
    defaultEnabled: true
  },
  {
    id: 'pc_dekigata_measurement',
    category: 'photoCategory',
    label: '出来形=寸法測定',
    description: 'スケール・巻尺での寸法測定は出来形管理写真',
    isFixed: true,
    defaultEnabled: true
  },
  {
    id: 'pc_before_after_pair',
    category: 'photoCategory',
    label: '着手前/完了ペア',
    description: '同一測点の着手前と完了写真をペアで管理',
    isFixed: true,
    defaultEnabled: true
  },
  {
    id: 'pc_progress_default',
    category: 'photoCategory',
    label: '施工状況デフォルト',
    description: '他の区分に該当しない作業中写真は施工状況',
    isFixed: true,
    defaultEnabled: true
  },
  {
    id: 'pc_disaster_accident',
    category: 'photoCategory',
    label: '災害・事故写真判定',
    description: '災害発生時・事故発生時の写真を適切に分類',
    isFixed: true,
    defaultEnabled: true
  },

  // === 階層構造制約 ===
  {
    id: 'hr_five_levels',
    category: 'hierarchy',
    label: '5階層構造',
    description: '写真区分→工種→種別→細別→備考の5階層',
    isFixed: true,
    defaultEnabled: true
  },
  {
    id: 'hr_kou_suffix',
    category: 'hierarchy',
    label: '「工」は細別まで',
    description: '「〜工」を付けるのは細別レベルまで、備考には付けない',
    isFixed: true,
    defaultEnabled: true
  },
  {
    id: 'hr_no_invention',
    category: 'hierarchy',
    label: '創作禁止',
    description: 'マスタにない工種・種別・細別を創作しない',
    isFixed: true,
    defaultEnabled: true
  },
  {
    id: 'hr_remarks_specific',
    category: 'hierarchy',
    label: '備考は具体的に',
    description: '備考には具体的な測定・確認項目を記載',
    isFixed: true,
    defaultEnabled: true
  },

  // === 温度写真ルール ===
  {
    id: 'tp_four_types',
    category: 'temperature',
    label: '4種類の温度',
    description: '到着・敷均し・初期締固め前・開放の4種類',
    isFixed: true,
    defaultEnabled: true
  },
  {
    id: 'tp_value_required',
    category: 'temperature',
    label: '実測値必須',
    description: '温度写真の備考には必ず実測値（例: 161.1℃）を含める',
    isFixed: true,
    defaultEnabled: true
  },
  {
    id: 'tp_no_generic',
    category: 'temperature',
    label: '汎用表現禁止',
    description: '「温度測定」「アスファルト混合物温度測定」単独使用禁止',
    isFixed: true,
    defaultEnabled: true
  },
  {
    id: 'tp_cycle_3x3',
    category: 'temperature',
    label: '3×3サイクル',
    description: '1台につき3温度×3枚=9枚のパターン',
    isFixed: false,  // 変更可能
    defaultEnabled: true
  },

  // === マスタ保護 ===
  {
    id: 'mp_no_auto_add',
    category: 'masterProtection',
    label: '自動追加禁止',
    description: 'AIがマスタに新規エントリを自動追加しない',
    isFixed: true,
    defaultEnabled: true
  },
  {
    id: 'mp_user_approval',
    category: 'masterProtection',
    label: 'ユーザー承認必須',
    description: 'マスタへの追加・変更はユーザー承認後のみ',
    isFixed: true,
    defaultEnabled: true
  },
  {
    id: 'mp_alias_match',
    category: 'masterProtection',
    label: 'エイリアス照合',
    description: '類似表現はエイリアステーブルで既存エントリにマッチ',
    isFixed: false,  // 変更可能
    defaultEnabled: true
  }
];

// ルール設定の状態管理用
export interface RuleSettings {
  [ruleId: string]: boolean;
}

// デフォルト設定を生成
export const getDefaultRuleSettings = (): RuleSettings => {
  const settings: RuleSettings = {};
  ANALYSIS_RULES.forEach(rule => {
    settings[rule.id] = rule.defaultEnabled;
  });
  return settings;
};

// ============================================
// localStorage永続化
// ============================================
const STORAGE_KEY = 'analysisRuleSettings';

export const saveRuleSettings = (settings: RuleSettings): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save rule settings:', e);
  }
};

export const loadRuleSettings = (): RuleSettings => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return { ...getDefaultRuleSettings(), ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Failed to load rule settings:', e);
  }
  return getDefaultRuleSettings();
};

// カテゴリ別にルールをグループ化
export const getRulesByCategory = (category: RuleCategory): AnalysisRule[] => {
  return ANALYSIS_RULES.filter(rule => rule.category === category);
};

// 有効なルールのみ取得
export const getEnabledRules = (settings: RuleSettings): AnalysisRule[] => {
  return ANALYSIS_RULES.filter(rule => settings[rule.id]);
};

// ============================================
// ルール違反チェック
// ============================================

export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * AIの解析結果をルールに照らしてチェック
 * @param result 解析結果
 * @param settings 有効なルール設定
 * @returns 違反リスト
 */
const checkRuleViolations = (
  result: { photoCategory?: string; remarksCategory?: string; remarksValue?: string; detail?: string },
  settings: RuleSettings
): RuleViolation[] => {
  const violations: RuleViolation[] = [];

  // tp_value_required: 温度写真には実測値が必須
  if (settings['tp_value_required']) {
    const tempCategories = ['到着温度', '敷均し温度', '初期締固め前温度', '開放温度'];
    if (tempCategories.includes(result.remarksCategory || '')) {
      if (!result.remarksValue || !result.remarksValue.includes('℃')) {
        violations.push({
          ruleId: 'tp_value_required',
          ruleName: '実測値必須',
          message: `温度写真(${result.remarksCategory})に実測値がありません`,
          severity: 'error'
        });
      }
    }
  }

  // tp_no_generic: 汎用表現禁止
  if (settings['tp_no_generic']) {
    const genericTerms = ['温度測定', 'アスファルト混合物温度測定'];
    if (genericTerms.includes(result.remarksCategory || '')) {
      violations.push({
        ruleId: 'tp_no_generic',
        ruleName: '汎用表現禁止',
        message: `「${result.remarksCategory}」は禁止。具体的な温度種別（到着温度等）を使用してください`,
        severity: 'error'
      });
    }
  }

  // hr_kou_suffix: 「工」は細別まで - 備考に「工」が付いていたら警告
  if (settings['hr_kou_suffix']) {
    if (result.remarksCategory && result.remarksCategory.endsWith('工')) {
      violations.push({
        ruleId: 'hr_kou_suffix',
        ruleName: '「工」は細別まで',
        message: `備考に「${result.remarksCategory}」: 備考には「工」を付けないでください`,
        severity: 'warning'
      });
    }
  }

  return violations;
};

// ルール設定をプロンプト用テキストに変換
export const rulesToPromptText = (settings: RuleSettings): string => {
  const enabledRules = getEnabledRules(settings);
  const lines: string[] = ['## Active Analysis Rules\n'];

  RULE_CATEGORIES.forEach(cat => {
    const catRules = enabledRules.filter(r => r.category === cat.id);
    if (catRules.length > 0) {
      lines.push(`### ${cat.icon} ${cat.label}`);
      catRules.forEach(rule => {
        lines.push(`- ${rule.label}: ${rule.description}`);
      });
      lines.push('');
    }
  });

  return lines.join('\n');
};
