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
    description: '写真を5つの区分に分類するルール'
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
  // === 写真区分ルール ===
  {
    id: 'pc_five_categories',
    category: 'photoCategory',
    label: '5区分分類',
    description: '着手前・施工状況・品質管理・出来形管理・完了の5区分で分類',
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

// カテゴリ別にルールをグループ化
export const getRulesByCategory = (category: RuleCategory): AnalysisRule[] => {
  return ANALYSIS_RULES.filter(rule => rule.category === category);
};

// 有効なルールのみ取得
export const getEnabledRules = (settings: RuleSettings): AnalysisRule[] => {
  return ANALYSIS_RULES.filter(rule => settings[rule.id]);
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
