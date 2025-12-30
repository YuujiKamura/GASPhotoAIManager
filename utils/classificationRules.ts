/**
 * 写真分類ルール - Single Source of Truth
 *
 * すべての分類基準をここで一元管理
 * systemPrompts.ts と AIFrameworkDashboard.tsx から参照
 */

// ============================================
// 写真カテゴリ定義
// ============================================

export interface PhotoCategoryDefinition {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  conditions: DefiniteCondition[];
  workTypeRule: 'required' | 'empty' | 'optional';  // 安全管理写真は空
}

export interface DefiniteCondition {
  id: string;
  label: string;
  description: string;
  visualCues: string[];
  timeCondition?: TimeCondition;
  remarksCategory?: string[];  // この条件で使用される備考カテゴリ
}

export interface TimeCondition {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  label: string;
}

// ============================================
// 6区分の写真カテゴリ（並列・条件ベース）
// ============================================

export const PHOTO_CATEGORIES: PhotoCategoryDefinition[] = [
  {
    id: 'before_completion',
    name: '着手前及び完成写真',
    nameEn: 'Before & Completion',
    description: '工事前後の静的な状況写真',
    workTypeRule: 'required',
    conditions: [
      {
        id: 'before',
        label: '着手前',
        description: '工事開始前の現場状況',
        visualCues: [
          '古いアスファルト、ひび割れ、雑草',
          '作業員が作業していない',
          '重機が稼働していない',
          '現場が未着手の状態',
        ],
        remarksCategory: ['着手前'],
      },
      {
        id: 'completion',
        label: '完成/竣工',
        description: '工事完了後の現場状況',
        visualCues: [
          '新しい黒いアスファルト、きれいなライン',
          '作業員が作業していない',
          '重機が稼働していない',
          '現場が完成した状態',
        ],
        remarksCategory: ['完了', '竣工', '施工完了'],
      },
    ],
  },
  {
    id: 'construction_status',
    name: '施工状況写真',
    nameEn: 'Construction Status',
    description: '作業中の状況を記録した写真',
    workTypeRule: 'required',
    conditions: [
      {
        id: 'active_work',
        label: '作業中',
        description: '重機や作業員が作業している状況',
        visualCues: [
          '重機（バックホウ、ローラー）が稼働中',
          'ダンプトラックが材料を投入中',
          '作業員がスコップ・レーキで作業中',
          '掘削中の穴、瓦礫の山',
        ],
        remarksCategory: [
          '転圧状況', '敷均し状況', '舗設状況', '掘削状況',
          '乳剤散布状況', '養生砂散布状況', '取壊し状況',
        ],
      },
    ],
  },
  {
    id: 'safety_management',
    name: '安全管理写真',
    nameEn: 'Safety Management',
    description: '安全活動・安全管理の記録',
    workTypeRule: 'empty',  // 工種・種別・細別は空
    conditions: [
      {
        id: 'morning_assembly',
        label: '朝礼状況',
        description: '朝礼・ミーティングの様子',
        visualCues: [
          '5名以上の作業員が一箇所に集合',
          'ヘルメット・安全ベスト着用',
          '重機が稼働していない',
          '1名がクリップボード/書類を持って説明',
        ],
        timeCondition: {
          startHour: 8,
          startMinute: 0,
          endHour: 9,
          endMinute: 0,
          label: '8:00-9:00（朝礼時間帯）',
        },
        remarksCategory: ['朝礼状況'],
      },
      {
        id: 'ky_activity',
        label: 'KY活動状況',
        description: '危険予知活動の様子',
        visualCues: [
          '作業員がホワイトボード/KYボード周りに集合',
          'KYボードに書き込み中/指差し中',
        ],
        remarksCategory: ['KY活動状況'],
      },
      {
        id: 'safety_patrol',
        label: '安全巡視状況',
        description: '安全巡視の様子',
        visualCues: [
          '1-2名（監督者）が現場を歩いて点検',
          '点検用クリップボードを持っている',
          '作業はしていない',
        ],
        remarksCategory: ['安全巡視状況'],
      },
    ],
  },
  {
    id: 'materials',
    name: '使用材料写真',
    nameEn: 'Materials',
    description: '使用材料の確認写真',
    workTypeRule: 'required',
    conditions: [
      {
        id: 'material_check',
        label: '材料確認',
        description: '材料のラベル・仕様確認',
        visualCues: [
          'アスファルト袋、骨材の山、配管などの材料',
          'ラベル・仕様が見える',
        ],
        remarksCategory: ['使用材料'],
      },
    ],
  },
  {
    id: 'quality_control',
    name: '品質管理写真',
    nameEn: 'Quality Control',
    description: '品質測定（温度・密度）の記録',
    workTypeRule: 'required',
    conditions: [
      {
        id: 'temperature_measurement',
        label: '温度測定',
        description: 'アスファルト温度の測定',
        visualCues: [
          '温度計（デジタル/棒状）が写っている',
          '黒板に温度値が記載',
        ],
        remarksCategory: ['到着温度', '敷均し温度', '初期締固め前温度', '開放温度'],
      },
      {
        id: 'density_measurement',
        label: '密度測定',
        description: '現場密度の測定',
        visualCues: [
          'RI計器、砂置換法の器具が写っている',
        ],
        remarksCategory: ['現場密度測定'],
      },
    ],
  },
  {
    id: 'finished_form',
    name: '出来形管理写真',
    nameEn: 'Finished Dimension',
    description: '完成寸法の測定記録',
    workTypeRule: 'required',
    conditions: [
      {
        id: 'dimension_measurement',
        label: '寸法測定',
        description: '完成面の寸法測定',
        visualCues: [
          '完成面にスケール・巻尺が設置',
          '黒板に設計値/実測値/差が記載',
          '作業は行われていない（測定のみ）',
        ],
        remarksCategory: ['不陸整正出来形', '路盤厚出来形', '表層厚出来形', '幅員出来形'],
      },
    ],
  },
];

// ============================================
// 撮影時間ベースのルール
// ============================================

export interface TimeBasedRule {
  id: string;
  label: string;
  timeCondition: TimeCondition;
  additionalConditions: string[];
  resultCategory: string;
  resultRemarks: string;
  certainty: 'definite' | 'likely';
}

export const TIME_BASED_RULES: TimeBasedRule[] = [
  {
    id: 'morning_assembly_time',
    label: '朝礼時間帯 + 集合 = 朝礼',
    timeCondition: {
      startHour: 8,
      startMinute: 0,
      endHour: 9,
      endMinute: 0,
      label: '8:00-9:00',
    },
    additionalConditions: ['5名以上が集合', 'ヘルメット着用', '重機が稼働していない'],
    resultCategory: 'safety_management',
    resultRemarks: '朝礼状況',
    certainty: 'definite',
  },
];

// ============================================
// キー区別ルール（施工状況 vs 安全管理）
// ============================================

export const KEY_DISTINCTIONS = [
  {
    id: 'safety_vs_construction',
    description: '作業員が集合 + 作業していない = 安全管理写真（確定）',
    condition1: '作業員が集合している',
    condition2: '重機が稼働していない & 作業をしていない',
    result: '安全管理写真',
  },
  {
    id: 'construction_vs_safety',
    description: '重機稼働 or 作業中 = 施工状況写真（確定）',
    condition1: '重機が稼働している',
    condition2: '作業員が工具を使って作業中',
    result: '施工状況写真',
  },
];

// ============================================
// プロンプト生成用ヘルパー
// ============================================

/**
 * カテゴリ定義をプロンプトテキストに変換
 */
export function categoriesToPromptText(): string {
  const lines: string[] = [];

  lines.push('**STEP 1: Select Photo Category - CONDITION-BASED CLASSIFICATION**');
  lines.push('All categories have EQUAL priority. Use the DEFINITE CONDITIONS below to classify.');
  lines.push('Do NOT guess. Match the conditions exactly.\n');

  PHOTO_CATEGORIES.forEach((cat, index) => {
    lines.push(`${index + 1}.  **"${cat.name}"** (${cat.nameEn}) [CONDITION-BASED]:`);

    if (cat.workTypeRule === 'empty') {
      lines.push(`    *   **CRITICAL**: For ${cat.name}, set workType="", variety="", detail="".`);
      lines.push('');
      lines.push('    **=== DEFINITE RULES (100% certainty) ===**');
    }

    cat.conditions.forEach(cond => {
      lines.push('');
      lines.push(`    **${cond.label} - DEFINITE if:**`);
      cond.visualCues.forEach(cue => {
        lines.push(`    - ${cue}`);
      });
      if (cond.timeCondition) {
        lines.push(`    - Shooting time ${cond.timeCondition.label} (if available) → CONFIRMS`);
      }
      if (cond.remarksCategory) {
        lines.push(`    → remarksCategory = "${cond.remarksCategory[0]}" (DEFINITE)`);
      }
    });
    lines.push('');
  });

  // キー区別ルール
  lines.push('**=== KEY DISTINCTION ===**');
  KEY_DISTINCTIONS.forEach(dist => {
    lines.push(`- ${dist.description}`);
  });

  return lines.join('\n');
}

/**
 * 撮影時間ルールをプロンプトテキストに変換
 */
export function timeRulesToPromptText(): string {
  const lines: string[] = [];

  lines.push('**SHOOTING TIME INFO**: Use the shooting time to help determine photo category.');
  TIME_BASED_RULES.forEach(rule => {
    lines.push(`- Photos taken ${rule.timeCondition.label} ${rule.additionalConditions.join(' + ')} = ${rule.resultRemarks} (${rule.certainty.toUpperCase()})`);
  });

  return lines.join('\n');
}

/**
 * 全備考カテゴリを取得
 */
export function getAllRemarksCategories(): string[] {
  const categories = new Set<string>();

  PHOTO_CATEGORIES.forEach(cat => {
    cat.conditions.forEach(cond => {
      cond.remarksCategory?.forEach(rc => categories.add(rc));
    });
  });

  return Array.from(categories);
}

/**
 * 安全管理写真の条件一覧を取得
 */
export function getSafetyManagementConditions(): DefiniteCondition[] {
  const safetyCat = PHOTO_CATEGORIES.find(c => c.id === 'safety_management');
  return safetyCat?.conditions || [];
}
