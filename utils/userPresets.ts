/**
 * ユーザー定義の正規化プリセット
 *
 * AIに読ませて解釈させるのではなく、
 * ユーザーが直接定義したマッピングをそのまま適用する
 */

export interface NormalizationMapping {
  id: string;
  input: string;      // 入力パターン（完全一致または正規表現）
  output: string;     // 出力文字列
  isRegex: boolean;   // 正規表現として扱うか
  enabled: boolean;
  createdAt: number;
}

export interface UserPresets {
  normalizations: NormalizationMapping[];
  version: number;
}

const STORAGE_KEY = 'userPresets';
const CURRENT_VERSION = 1;

/**
 * デフォルトのプリセット（空）
 */
export const getDefaultPresets = (): UserPresets => ({
  normalizations: [],
  version: CURRENT_VERSION
});

/**
 * プリセットを保存
 */
export const saveUserPresets = (presets: UserPresets): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch (e) {
    console.warn('Failed to save user presets:', e);
  }
};

/**
 * プリセットを読み込み
 */
export const loadUserPresets = (): UserPresets => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...getDefaultPresets(), ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load user presets:', e);
  }
  return getDefaultPresets();
};

/**
 * 新しいマッピングを追加
 */
export const addNormalization = (
  presets: UserPresets,
  input: string,
  output: string,
  isRegex: boolean = false
): UserPresets => {
  const newMapping: NormalizationMapping = {
    id: `norm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    input,
    output,
    isRegex,
    enabled: true,
    createdAt: Date.now()
  };
  return {
    ...presets,
    normalizations: [...presets.normalizations, newMapping]
  };
};

/**
 * マッピングを削除
 */
export const removeNormalization = (
  presets: UserPresets,
  id: string
): UserPresets => ({
  ...presets,
  normalizations: presets.normalizations.filter(n => n.id !== id)
});

/**
 * マッピングの有効/無効を切り替え
 */
export const toggleNormalization = (
  presets: UserPresets,
  id: string
): UserPresets => ({
  ...presets,
  normalizations: presets.normalizations.map(n =>
    n.id === id ? { ...n, enabled: !n.enabled } : n
  )
});

/**
 * 文字列に正規化マッピングを適用
 * AIの解釈なし、ルールをそのまま適用
 */
export const applyNormalizations = (
  text: string,
  presets: UserPresets
): string => {
  let result = text;

  for (const mapping of presets.normalizations) {
    if (!mapping.enabled) continue;

    if (mapping.isRegex) {
      try {
        const regex = new RegExp(mapping.input, 'g');
        result = result.replace(regex, mapping.output);
      } catch {
        // 不正な正規表現は無視
      }
    } else {
      // 完全一致置換
      result = result.split(mapping.input).join(mapping.output);
    }
  }

  return result;
};

/**
 * プリセットをエクスポート（JSON）
 */
export const exportPresets = (presets: UserPresets): string => {
  return JSON.stringify(presets, null, 2);
};

/**
 * プリセットをインポート（JSON）
 */
export const importPresets = (json: string): UserPresets | null => {
  try {
    const parsed = JSON.parse(json);
    if (parsed.normalizations && Array.isArray(parsed.normalizations)) {
      return {
        ...getDefaultPresets(),
        ...parsed,
        version: CURRENT_VERSION
      };
    }
  } catch {
    // パースエラー
  }
  return null;
};
