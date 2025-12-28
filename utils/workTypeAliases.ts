/**
 * 工種・種別名のエイリアス（別名）管理
 *
 * 舗装工系の工事で、書類上の名称を変換するために使用
 * 例: 「舗装工」→「舗装補修工」、「舗装打換え工」→「アスファルト舗装補修工」
 */

const ALIAS_STORAGE_KEY = 'worktype_aliases';

// デフォルトのエイリアスプリセット
export const PRESET_ALIASES = {
  '舗装補修': {
    name: '舗装補修工プリセット',
    description: '舗装工→舗装補修工、舗装打換え工→アスファルト舗装補修工',
    mappings: {
      workType: { '舗装工': '舗装補修工' },
      variety: { '舗装打換え工': 'アスファルト舗装補修工' }
    }
  }
} as const;

export type PresetKey = keyof typeof PRESET_ALIASES;

export interface AliasMapping {
  workType: Record<string, string>;  // 工種のエイリアス
  variety: Record<string, string>;   // 種別のエイリアス
  detail: Record<string, string>;    // 細別のエイリアス（必要に応じて）
}

export interface AliasSettings {
  enabled: boolean;
  mappings: AliasMapping;
  activePreset?: PresetKey;
}

const DEFAULT_SETTINGS: AliasSettings = {
  enabled: false,
  mappings: {
    workType: {},
    variety: {},
    detail: {}
  }
};

/**
 * エイリアス設定を読み込み
 */
export function loadAliasSettings(): AliasSettings {
  try {
    const saved = localStorage.getItem(ALIAS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // マイグレーション: 古い形式から新しい形式へ
      if (!parsed.mappings) {
        return DEFAULT_SETTINGS;
      }
      return {
        ...DEFAULT_SETTINGS,
        ...parsed
      };
    }
  } catch (e) {
    console.warn('Failed to load alias settings:', e);
  }
  return DEFAULT_SETTINGS;
}

/**
 * エイリアス設定を保存
 */
export function saveAliasSettings(settings: AliasSettings): void {
  try {
    localStorage.setItem(ALIAS_STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save alias settings:', e);
  }
}

/**
 * プリセットを適用
 */
export function applyPreset(presetKey: PresetKey): AliasSettings {
  const preset = PRESET_ALIASES[presetKey];
  const settings: AliasSettings = {
    enabled: true,
    mappings: {
      workType: { ...preset.mappings.workType },
      variety: { ...preset.mappings.variety },
      detail: {}
    },
    activePreset: presetKey
  };
  saveAliasSettings(settings);
  return settings;
}

/**
 * エイリアス設定をクリア
 */
export function clearAliasSettings(): AliasSettings {
  const settings = DEFAULT_SETTINGS;
  saveAliasSettings(settings);
  return settings;
}

/**
 * 工種名をエイリアスに変換
 */
export function applyWorkTypeAlias(workType: string, settings?: AliasSettings): string {
  const s = settings || loadAliasSettings();
  if (!s.enabled) return workType;
  return s.mappings.workType[workType] || workType;
}

/**
 * 種別名をエイリアスに変換
 */
export function applyVarietyAlias(variety: string, settings?: AliasSettings): string {
  const s = settings || loadAliasSettings();
  if (!s.enabled) return variety;
  return s.mappings.variety[variety] || variety;
}

/**
 * 細別名をエイリアスに変換
 */
export function applyDetailAlias(detail: string, settings?: AliasSettings): string {
  const s = settings || loadAliasSettings();
  if (!s.enabled) return detail;
  return s.mappings.detail[detail] || detail;
}

/**
 * 解析結果全体にエイリアスを適用
 */
export function applyAliases(
  workType: string,
  variety: string,
  detail: string,
  settings?: AliasSettings
): { workType: string; variety: string; detail: string } {
  const s = settings || loadAliasSettings();
  if (!s.enabled) {
    return { workType, variety, detail };
  }
  return {
    workType: s.mappings.workType[workType] || workType,
    variety: s.mappings.variety[variety] || variety,
    detail: s.mappings.detail[detail] || detail
  };
}

/**
 * カスタムエイリアスを追加
 */
export function addCustomAlias(
  type: 'workType' | 'variety' | 'detail',
  original: string,
  alias: string
): AliasSettings {
  const settings = loadAliasSettings();
  settings.mappings[type][original] = alias;
  settings.activePreset = undefined; // カスタム変更でプリセット解除
  saveAliasSettings(settings);
  return settings;
}

/**
 * カスタムエイリアスを削除
 */
export function removeCustomAlias(
  type: 'workType' | 'variety' | 'detail',
  original: string
): AliasSettings {
  const settings = loadAliasSettings();
  delete settings.mappings[type][original];
  saveAliasSettings(settings);
  return settings;
}

/**
 * エイリアスの有効/無効を切り替え
 */
export function toggleAliasEnabled(enabled: boolean): AliasSettings {
  const settings = loadAliasSettings();
  settings.enabled = enabled;
  saveAliasSettings(settings);
  return settings;
}

/**
 * エイリアスが設定されているかチェック
 */
export function hasAliases(settings?: AliasSettings): boolean {
  const s = settings || loadAliasSettings();
  return (
    Object.keys(s.mappings.workType).length > 0 ||
    Object.keys(s.mappings.variety).length > 0 ||
    Object.keys(s.mappings.detail).length > 0
  );
}

/**
 * エイリアスの逆変換（エイリアス→元の名前）
 */
export function reverseAlias(
  aliasName: string,
  type: 'workType' | 'variety' | 'detail',
  settings?: AliasSettings
): string {
  const s = settings || loadAliasSettings();
  const mapping = s.mappings[type];
  for (const [original, alias] of Object.entries(mapping)) {
    if (alias === aliasName) {
      return original;
    }
  }
  return aliasName;
}

/**
 * PhotoRecordの配列に対してエイリアスを一括適用
 * 元のデータを変更するため、呼び出し後はデータが置換済みになる
 */
export function applyAliasesToRecords<T extends { analysis?: { workType: string; variety?: string; detail?: string } }>(
  records: T[],
  settings?: AliasSettings
): { modifiedCount: number; records: T[] } {
  const s = settings || loadAliasSettings();
  if (!s.enabled || !hasAliases(s)) {
    return { modifiedCount: 0, records };
  }

  let modifiedCount = 0;

  const updatedRecords = records.map(record => {
    if (!record.analysis) return record;

    const original = {
      workType: record.analysis.workType,
      variety: record.analysis.variety || '',
      detail: record.analysis.detail || ''
    };

    const aliased = applyAliases(original.workType, original.variety, original.detail, s);

    const wasModified =
      aliased.workType !== original.workType ||
      aliased.variety !== original.variety ||
      aliased.detail !== original.detail;

    if (wasModified) {
      modifiedCount++;
      return {
        ...record,
        analysis: {
          ...record.analysis,
          workType: aliased.workType,
          variety: aliased.variety,
          detail: aliased.detail
        }
      };
    }

    return record;
  });

  return { modifiedCount, records: updatedRecords };
}

/**
 * 文字列置換を一括実行（直接指定）
 */
export function batchReplaceInRecords<T extends { analysis?: { workType: string; variety?: string; detail?: string } }>(
  records: T[],
  replacements: { from: string; to: string; field: 'workType' | 'variety' | 'detail' }[]
): { modifiedCount: number; records: T[] } {
  if (replacements.length === 0) {
    return { modifiedCount: 0, records };
  }

  let modifiedCount = 0;

  const updatedRecords = records.map(record => {
    if (!record.analysis) return record;

    let modified = false;
    let newWorkType = record.analysis.workType;
    let newVariety = record.analysis.variety || '';
    let newDetail = record.analysis.detail || '';

    for (const { from, to, field } of replacements) {
      if (field === 'workType' && newWorkType === from) {
        newWorkType = to;
        modified = true;
      }
      if (field === 'variety' && newVariety === from) {
        newVariety = to;
        modified = true;
      }
      if (field === 'detail' && newDetail === from) {
        newDetail = to;
        modified = true;
      }
    }

    if (modified) {
      modifiedCount++;
      return {
        ...record,
        analysis: {
          ...record.analysis,
          workType: newWorkType,
          variety: newVariety,
          detail: newDetail
        }
      };
    }

    return record;
  });

  return { modifiedCount, records: updatedRecords };
}
