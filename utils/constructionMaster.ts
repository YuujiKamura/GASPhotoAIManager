import { CONSTRUCTION_HIERARCHY } from './constructionHierarchyData';

// ============================================
// カスタムマスタ管理
// ============================================

const CUSTOM_MASTER_KEY = 'construction_custom_master';

const loadCustomMaster = (): Record<string, unknown> => {
  try {
    const saved = localStorage.getItem(CUSTOM_MASTER_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
};

const deepMerge = (target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> => {
  for (const key in source) {
    const val = source[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key] as Record<string, unknown>, val as Record<string, unknown>);
    } else {
      target[key] = val;
    }
  }
  return target;
};

export const getMergedHierarchy = (): Record<string, unknown> => {
  return deepMerge(JSON.parse(JSON.stringify(CONSTRUCTION_HIERARCHY)), loadCustomMaster());
};

// ============================================
// 写真区分
// ============================================

export const PHOTO_CATEGORIES = [
  "着手前及び完成写真", "施工状況写真", "安全管理写真", "使用材料写真",
  "品質管理写真", "出来形管理写真", "災害写真", "事故写真", "その他"
] as const;

export type PhotoCategoryType = typeof PHOTO_CATEGORIES[number];

// ============================================
// 階層トラバース共通関数
// ============================================

type TraverseCallback = (
  catKey: string, workTypeKey: string, varietyKey: string, detailKey: string, detail: Record<string, unknown>
) => void;

const traverseHierarchy = (callback: TraverseCallback): void => {
  const root = getMergedHierarchy()["直接工事費"] as Record<string, unknown>;
  for (const catKey in root) {
    const category = root[catKey] as Record<string, unknown>;
    for (const workTypeKey in category) {
      const workType = category[workTypeKey] as Record<string, unknown>;
      for (const varietyKey in workType) {
        const variety = workType[varietyKey] as Record<string, unknown>;
        for (const detailKey in variety) {
          callback(catKey, workTypeKey, varietyKey, detailKey, variety[detailKey] as Record<string, unknown>);
        }
      }
    }
  }
};

// ============================================
// 工種取得・サブセット取得
// ============================================

export const getWorkTypes = (): string[] => {
  const types = new Set<string>();
  const root = getMergedHierarchy()["直接工事費"] as Record<string, unknown>;
  for (const catKey in root) {
    Object.keys(root[catKey] as Record<string, unknown>).forEach(k => types.add(k));
  }
  return Array.from(types);
};

export const formatHierarchyForPrompt = () => getMergedHierarchy();
export const getSelectorPrompt = () => getWorkTypes().join(", ");

export const getHierarchySubset = (selectedTypes: string[]): Record<string, unknown> => {
  const root = getMergedHierarchy()["直接工事費"] as Record<string, unknown>;
  const subset: Record<string, Record<string, unknown>> = { "直接工事費": {} };

  for (const catKey in root) {
    const cat = root[catKey] as Record<string, unknown>;
    const newCat: Record<string, unknown> = {};
    for (const typeKey in cat) {
      if (selectedTypes.includes(typeKey)) newCat[typeKey] = cat[typeKey];
    }
    if (Object.keys(newCat).length) subset["直接工事費"][catKey] = newCat;
  }
  return subset;
};

// ============================================
// マスタ値抽出・バリデーション
// ============================================

export function extractAllValidValues(): {
  workTypes: Set<string>; varieties: Set<string>; details: Set<string>; remarks: Set<string>;
} {
  const workTypes = new Set<string>(), varieties = new Set<string>(), details = new Set<string>(), remarks = new Set<string>();

  traverseHierarchy((_, workTypeKey, varietyKey, detailKey, detail) => {
    if (workTypeKey) workTypes.add(workTypeKey);
    if (varietyKey) varieties.add(varietyKey);
    if (detailKey && detailKey !== 'aliases') {
      details.add(detailKey);
      const aliases = detail?.aliases as string[] | undefined;
      if (aliases) aliases.forEach(a => remarks.add(a));
      for (const remarkKey in detail) {
        if (remarkKey !== 'aliases' && remarkKey) remarks.add(remarkKey);
      }
    }
  });

  return { workTypes, varieties, details, remarks };
}

export function validateAgainstMaster(
  workType: string, variety: string, detail: string, _remarks: string
): { validatedWorkType: string; validatedVariety: string; validatedDetail: string; warnings: string[] } {
  const { workTypes, varieties, details } = extractAllValidValues();
  const warnings: string[] = [];

  const check = (val: string, set: Set<string>, label: string): string => {
    if (val && !set.has(val)) {
      warnings.push(`${label}「${val}」はマスタにありません`);
      return "";
    }
    return val;
  };

  return {
    validatedWorkType: check(workType, workTypes, "工種"),
    validatedVariety: check(variety, varieties, "種別"),
    validatedDetail: check(detail, details, "細別"),
    warnings
  };
}

export function detectUnknownTerms(workType: string, variety: string, detail: string, remarks: string): string[] {
  const { workTypes, varieties, details, remarks: validRemarks } = extractAllValidValues();
  const warnings: string[] = [];

  const checkMaster = (val: string, set: Set<string>, label: string) => {
    if (val && !set.has(val)) warnings.push(`⚠️ ${label}「${val}」はマスタにありません（AI創作の可能性）`);
  };

  checkMaster(workType, workTypes, "工種");
  checkMaster(variety, varieties, "種別");
  checkMaster(detail, details, "細別");

  if (remarks) {
    if (remarks.match(/[^着手完]工/) && !remarks.includes('施工')) {
      warnings.push(`⚠️ 備考「${remarks}」に「〜工」が含まれています（備考レベルに「工」は不要）`);
    }
    const isMeasurement = remarks.match(/[0-9０-９]+|℃|mm|cm|m|%/);
    const isKnownStatus = remarks.match(/状況|完了|確認|着手前|竣工|出来形/);
    if (!validRemarks.has(remarks) && !isMeasurement && !isKnownStatus) {
      const partialMatch = Array.from(validRemarks).some(r => remarks.includes(r) || r.includes(remarks));
      if (!partialMatch) warnings.push(`⚠️ 備考「${remarks}」はマスタにありません（AI創作の可能性）`);
    }
  }

  return warnings;
}

// ============================================
// 温度管理バリデーション
// ============================================

export interface TemperatureValidationResult {
  isValid: boolean;
  correctedCategory?: string;
  correctedValue?: string;
  warnings: string[];
}

const VALID_TEMPERATURE_CATEGORIES = ["到着温度", "敷均し温度", "初期締固め前温度", "開放温度", "アスファルト混合物温度測定"];
const VALID_DENSITY_CATEGORIES = ["現場密度測定"];
const VALID_QUALITY_CATEGORIES = [...VALID_TEMPERATURE_CATEGORIES, ...VALID_DENSITY_CATEGORIES];

export function validateTemperatureRemarks(remarksCategory: string, remarksValue: string): TemperatureValidationResult {
  const warnings: string[] = [];
  let correctedCategory = remarksCategory, correctedValue = remarksValue, isValid = true;

  if (remarksCategory.match(/[^着手完]工/) && !remarksCategory.includes('施工')) {
    warnings.push(`⚠️ カテゴリ「${remarksCategory}」に「〜工」が含まれています（不正）`);
    isValid = false;
    correctedCategory = remarksCategory.includes('温度') ? "アスファルト混合物温度測定" : remarksCategory.includes('密度') ? "現場密度測定" : correctedCategory;
  }

  if (VALID_TEMPERATURE_CATEGORIES.some(cat => remarksCategory.includes(cat.replace('温度', '')) || cat.includes(remarksCategory))) {
    if (remarksValue && !remarksValue.match(/[0-9０-９]+\.?[0-9０-９]*\s*℃/)) {
      warnings.push(`⚠️ 温度値「${remarksValue}」のフォーマットが不正（例: 161.1℃）`);
      const numMatch = remarksValue.match(/([0-9０-９]+\.?[0-9０-９]*)/);
      if (numMatch) correctedValue = `${numMatch[1]}℃`;
    }
  }

  if (remarksCategory === "温度測定" || remarksCategory === "温度管理") {
    warnings.push(`⚠️ カテゴリ「${remarksCategory}」は曖昧です。具体的なカテゴリを使用してください`);
    isValid = false;
    correctedCategory = remarksValue.includes('到着') || remarksValue.includes('出荷') ? "到着温度" :
      remarksValue.includes('敷均') ? "敷均し温度" :
      remarksValue.includes('初期') || remarksValue.includes('締固') ? "初期締固め前温度" :
      remarksValue.includes('開放') ? "開放温度" : "アスファルト混合物温度測定";
  }

  return {
    isValid,
    correctedCategory: correctedCategory !== remarksCategory ? correctedCategory : undefined,
    correctedValue: correctedValue !== remarksValue ? correctedValue : undefined,
    warnings
  };
}

export function isQualityManagementPhoto(remarksCategory: string): boolean {
  return VALID_QUALITY_CATEGORIES.some(cat => remarksCategory.includes(cat) || cat.includes(remarksCategory)) ||
    remarksCategory.includes('温度') || remarksCategory.includes('密度');
}

function inferPhotoCategory(remarkText: string): PhotoCategoryType {
  if (remarkText.includes("着手前") || remarkText.includes("完成") || remarkText.includes("竣工")) return "着手前及び完成写真";
  if (remarkText.includes("品質") || remarkText.includes("温度") || remarkText.includes("密度")) return "品質管理写真";
  if (remarkText.includes("出来形") || remarkText.includes("測定")) return "出来形管理写真";
  if (remarkText.includes("材料") || remarkText.includes("検収") || remarkText.includes("搬入")) return "使用材料写真";
  if (remarkText.includes("安全") || remarkText.includes("朝礼") || remarkText.includes("KY")) return "安全管理写真";
  return "施工状況写真";
}

// ============================================
// 順序マップ生成（共通化）
// ============================================

type OrderTarget = 'variety' | 'detail';

const createOrderMap = (target: OrderTarget): Map<string, number> => {
  const orderMap = new Map<string, number>();
  let order = 0;

  traverseHierarchy((_, __, varietyKey, detailKey) => {
    const key = target === 'variety' ? varietyKey : detailKey;
    if (key && key !== 'aliases' && !orderMap.has(key)) orderMap.set(key, order++);
  });

  return orderMap;
};

export const getDetailOrderMap = (): Map<string, number> => createOrderMap('detail');
export const getVarietyOrderMap = (): Map<string, number> => createOrderMap('variety');

// ============================================
// 階層的な値取得（絞り込み用）
// ============================================

/**
 * 指定された工種に属する種別一覧を取得
 */
export function getVarietiesByWorkType(workType: string): string[] {
  const varieties = new Set<string>();
  const root = getMergedHierarchy()["直接工事費"] as Record<string, unknown>;

  for (const catKey in root) {
    const category = root[catKey] as Record<string, unknown>;
    if (category[workType]) {
      const wt = category[workType] as Record<string, unknown>;
      for (const varietyKey in wt) {
        if (varietyKey) varieties.add(varietyKey);
      }
    }
  }

  return Array.from(varieties).sort();
}

/**
 * 指定された工種・種別に属する細別一覧を取得
 */
export function getDetailsByVariety(workType: string, variety: string): string[] {
  const details = new Set<string>();
  const root = getMergedHierarchy()["直接工事費"] as Record<string, unknown>;

  for (const catKey in root) {
    const category = root[catKey] as Record<string, unknown>;
    if (category[workType]) {
      const wt = category[workType] as Record<string, unknown>;
      if (wt[variety]) {
        const varObj = wt[variety] as Record<string, unknown>;
        for (const detailKey in varObj) {
          if (detailKey) details.add(detailKey);
        }
      }
    }
  }

  return Array.from(details).sort((a, b) => {
    const orderMap = getDetailOrderMap();
    const aOrder = orderMap.get(a);
    const bOrder = orderMap.get(b);
    if (aOrder === undefined && bOrder === undefined) return a.localeCompare(b);
    if (aOrder === undefined) return 1;
    if (bOrder === undefined) return -1;
    return aOrder - bOrder;
  });
}

/**
 * 指定された工種・種別・細別に属する備考一覧を取得
 */
export function getRemarksByDetail(workType: string, variety: string, detail: string): string[] {
  const remarks = new Set<string>();
  const root = getMergedHierarchy()["直接工事費"] as Record<string, unknown>;

  for (const catKey in root) {
    const category = root[catKey] as Record<string, unknown>;
    if (category[workType]) {
      const wt = category[workType] as Record<string, unknown>;
      if (wt[variety]) {
        const v = wt[variety] as Record<string, unknown>;
        if (v[detail]) {
          const d = v[detail] as Record<string, unknown>;
          if (d.aliases && Array.isArray(d.aliases)) {
            (d.aliases as string[]).forEach(a => remarks.add(a));
          }
          for (const remarkKey in d) {
            if (remarkKey && remarkKey !== 'aliases') {
              remarks.add(remarkKey);
            }
          }
        }
      }
    }
  }

  return Array.from(remarks).sort();
}

// ============================================
// 備考・カテゴリ推定
// ============================================

export function inferPhotoAttributes(remarks: string): {
  category: PhotoCategoryType;
  suggestedWorkType?: string;
  suggestedVariety?: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  const category = inferPhotoCategory(remarks);

  // キーワード推定（単純マッチ）
  let suggestedWorkType: string | undefined;
  let suggestedVariety: string | undefined;

  traverseHierarchy((_, workTypeKey, varietyKey, detailKey) => {
    if (!suggestedWorkType && remarks.includes(workTypeKey)) suggestedWorkType = workTypeKey;
    if (!suggestedVariety && remarks.includes(varietyKey)) suggestedVariety = varietyKey;
    if (remarks.includes(detailKey)) warnings.push(`ℹ️ 備考に細別「${detailKey}」が含まれています。カテゴリ推定結果を確認してください`);
  });

  return { category, suggestedWorkType, suggestedVariety, warnings };
}

// ============================================
// カスタムマスタ保存
// ============================================

export function saveCustomMaster(json: string): { success: boolean; error?: string } {
  try {
    const parsed = JSON.parse(json);
    localStorage.setItem(CUSTOM_MASTER_KEY, JSON.stringify(parsed));
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'unknown error' };
  }
}

export function resetCustomMaster(): void {
  localStorage.removeItem(CUSTOM_MASTER_KEY);
}

export { CONSTRUCTION_HIERARCHY };
