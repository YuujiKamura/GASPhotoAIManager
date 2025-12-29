// ============================================
// 共通パーツビルダー
// ============================================

// 空オブジェクトのショートハンド
const _ = () => ({});

// 表層工の共通プロパティ（プライムコート系）
const createSurfaceLayerCommon = () => ({
  "プライムコート乳剤散布状況": _(),
  "プライムコート養生砂散布状況": _(),
  "プライムコート養生砂清掃状況": _(),
  "端部乳剤塗布状況": _()
});

// 完全な表層工（舗設あり）
const createFullSurfaceLayer = () => ({
  ...createSurfaceLayerCommon(),
  "舗設状況": _(),
  "初期転圧状況": _(),
  "2次転圧状況": _(),
  "施工完了": _()
});

// 簡易表層工（施工完了のみ）
const createSimpleSurfaceLayer = () => ({
  ...createSurfaceLayerCommon(),
  "施工完了": _()
});

// 上層路盤工の共通プロパティ
const createUpperRoadbedCommon = () => ({
  "補足材搬入状況 M-40": _(),
  "補足材搬入状況 RC-40": _(),
  "補足材搬入状況 RM-40": _(),
  "不陸整正状況": _(),
  "転圧状況": _(),
  "路盤完了状況": _()
});

// 人孔蓋撤去の共通定義
const createManholeRemoval = () => ({
  "鉄蓋処分状況": _(),
  "既設人孔撤去状況": _(),
  "完了": _()
});

// 人孔蓋据付の共通定義
const createManholeInstall = () => ({
  "調整ブロック設置状況": _(),
  "据付状況": _(),
  "高さ調整完了": _()
});

// 人孔内部清掃の共通定義
const createManholeClean = () => ({
  "清掃状況": _(),
  "清掃完了": _()
});

// 状況・完了ペア
const createStatusComplete = () => ({ "設置状況": _(), "完了": _() });
const createPlaceComplete = () => ({ "据付状況": _(), "完了": _() });

// ============================================
// メイン階層構造
// ============================================

export const CONSTRUCTION_HIERARCHY = {
  "直接工事費": {
    "着手前及び完成写真": {
      "舗装工": {
        "舗装打換え工": { "表層工": { aliases: ["着手前", "完了", "竣工"] } },
        "未舗装部舗装工": { "表層工": { aliases: ["着手前", "完了", "竣工"] } },
        "瀝青安定処理路盤工": { "表層工": { aliases: ["着手前", "完了", "竣工"] } }
      }
    },
    "施工状況写真": {
      "構造物撤去工": {
        "構造物取壊し工": {
          "コンクリート構造物取壊し": {
            "取壊し状況": _(), "コンクリート（有筋）処分前": _(), "コンクリート（有筋）処分中": _(),
            "コンクリート（有筋）処分後": _(), "処分前": _(), "処分中": _(), "処分後": _(), "積込状況": _()
          }
        }
      },
      "道路土工": {
        "掘削工": { "掘削状況": _(), "掘削完了": _() },
        "路床工": { "路床整正状況": _(), "路床転圧状況": _(), "路床完了": _() },
        "法面工": { "法面整形状況": _(), "植生工施工状況": _() }
      },
      "舗装工": {
        "舗装打換え工": {
          "舗装版切断": { "As舗装版切断状況": _(), "既設舗装版切断状況": _(), "完了": _() },
          "舗装版破砕": { "剥取状況": _(), "積込状況": _(), "既設舗装厚さ確認": _(), "完了": _() },
          "上層路盤工": createUpperRoadbedCommon(),
          "表層工": createFullSurfaceLayer()
        },
        "未舗装部舗装工": {
          "上層路盤工": { "鋤取り状況": _(), ...createUpperRoadbedCommon() },
          "表層工": createFullSurfaceLayer()
        },
        "瀝青安定処理路盤工": {
          "上層路盤工": createUpperRoadbedCommon(),
          "表層工": createSimpleSurfaceLayer()
        }
      },
      "区画線工": {
        "区画線工": {
          "溶融式区画線": { "清掃状況": _(), "プライマー散布状況": _(), "区画線設置状況": _(), "完了": _() }
        }
      },
      "排水構造物工": {
        "作業土工": {
          "床掘り": { "掘削状況": _(), "掘削完了": _() },
          "埋戻し": {
            "土砂埋戻し 転圧状況": _(), "敷均し、転圧状況": _(), "下層路盤 材料搬入状況 RC-40": _(),
            "下層路盤 転圧状況": _(), "上層路盤 敷均し状況": _(), "上層路盤M-40 転圧状況": _(), "完了": _()
          },
          "基礎砕石工": { "RC-40 搬入状況": _(), "基礎砕石敷均し状況": _(), "基礎砕石転圧状況": _(), "完了": _() },
          "基礎コンクリート工": {
            "型枠設置完了": _(), "打設前": _(), "打設完了": _(), "打設状況": _(), "打設厚さ確認": _(), "打設幅確認": _()
          }
        },
        "集水桝工": {
          "集水枡底版": { "集水桝底版 打設前確認": _(), "底版コンクリート 打設前確認": _(), "底版コンクリート 打設完了": _() },
          "プレキャスト集水桝": createPlaceComplete()
        },
        "側溝工": {
          "側溝蓋": {
            "側溝蓋 打設前確認": _(), "側溝蓋 打設完了": _(),
            "天端コンクリート 打設前確認": _(), "天端コンクリート 打設完了": _(), "天端コンクリート 打設状況": _()
          },
          "プレキャストU型側溝": {
            "側溝300　据付状況": _(), "G付側溝300　据付状況": _(),
            "敷モルタル敷均し状況": _(), "据付状況": _(), "完了": _()
          }
        },
        "集水桝・マンホール工": {
          "人孔蓋撤去": createManholeRemoval(),
          "人孔蓋据付": createManholeInstall(),
          "人孔内部清掃": createManholeClean(),
          "調整蓋据付": createPlaceComplete(),
          "調整リングブロック設置": createStatusComplete(),
          "転落防止蓋設置": createStatusComplete()
        }
      },
      "人孔改良工": {
        "集水桝・マンホール工": {
          "人孔蓋撤去": createManholeRemoval(),
          "人孔蓋据付": createManholeInstall(),
          "人孔内部清掃": createManholeClean(),
          "調整ブロック設置": { "調整ブロック設置状況": _(), "完了": _() },
          "調整部撤去": { "調整部撤去状況": _(), "完了": _() },
          "無収縮モルタル充填": { "無収縮モルタル充填状況": _(), "完了": _() }
        },
        "舗装打換え工": {
          "舗装板切断": { "舗装板切断状況": _(), "完了": _() },
          "舗装板破砕": { "舗装板破砕状況": _(), "完了": _() },
          "既設舗装版撤去": { "既設舗装版撤去状況": _(), "完了": _() },
          "上層路盤": { "上層路盤施工状況": _(), "完了": _() },
          "表層（プライムコート）": { "プライムコート施工状況": _(), "完了": _() },
          "表層（温度管理）": { "温度管理状況": _() },
          "表層（舗設）": { "舗設状況": _(), "施工完了": _() }
        },
        "人孔蓋据付撤去工": {
          "既設人孔蓋撤去": { "既設人孔撤去状況": _(), "撤去完了": _() },
          "既設受枠撤去": { "既設受枠撤去状況": _(), "撤去完了": _() },
          "鉄蓋処分": { "鉄蓋処分状況": _(), "処分完了": _() },
          "人孔蓋転落防止設置": { "人孔蓋転落防止設置状況": _(), "設置完了": _() },
          "調整ブロック設置": { "調整ブロック設置状況": _(), "設置完了": _() },
          "調整金具取付": { "調整金具パッキン取付状況": _(), "調整金具パッキン使用": _(), "固定用ボルト設置状況": _(), "取付完了": _() },
          "人孔高さ調整": { "人孔(上部)高さ調整完了": _(), "高さ調整状況": _() },
          "人孔内部清掃": { "人孔内清掃前状況": _(), "人孔内清掃完了": _(), "人孔内コンクリート撤去清掃状況": _() },
          "舗装版切断": { "舗装版切断状況": _(), "完了": _() },
          "舗装版破砕積込": { "舗装版破砕積込状況": _(), "積込完了": _() },
          "コンクリートはつり工": { "はつり工状況": _(), "はつり工完了": _() },
          "汚泥吸排車": { "汚泥吸排状況": _(), "汚泥吸排完了": _() },
          "表層工": { "表層工施工状況": _(), "表層工完了": _() }
        }
      },
      "仮設工": {
        "交通管理工": {
          "交通誘導員配置": { "誘導員配置状況": _(), "規制配置状況": _() },
          "保安施設設置": { "保安施設設置状況": _(), "保安施設撤去状況": _(), "完了": _() }
        }
      }
    },
    "安全管理写真": {
      "": { "": { "朝礼状況": _(), "KY活動状況": _(), "新規入場者教育状況": _(), "保安施設設置状況": _(), "点灯確認状況": _(), "安全巡視状況": _() } }
    },
    "使用材料写真": {
      "舗装工": { "舗装打換え工": { "表層工": { "材料検収状況": _(), "搬入状況": _() } } }
    },
    "品質管理写真": {
      "舗装工": {
        "舗装打換え工": {
          "上層路盤工": { "現場密度測定": { aliases: ["密度測定", "RI計器", "砂置換法"] } },
          "表層工": { "アスファルト混合物温度測定": { aliases: ["温度管理", "合材温度", "出荷温度", "到着温度", "敷均し温度", "初期転圧温度"] } }
        }
      }
    },
    "出来形管理写真": {
      "舗装工": {
        "舗装打換え工": {
          "上層路盤工": {
            "不陸整正出来形": { aliases: ["路盤出来形", "出来形検測", "路盤", "基準高下がり", "基準高"] },
            "不陸整正出来形・管理値": _(), "不陸整正出来形・接写": _(), "砕石厚測定": _()
          }
        }
      },
      "排水構造物工": {
        "作業土工": {
          "床掘り": { "掘削工出来形測定": _() },
          "埋戻し": { "土砂埋戻し出来形測定": _(), "下層路盤出来形測定": _(), "上層路盤出来形測定": _(), "路床出来形測定": _() },
          "基礎砕石工": { "基礎砕石工出来形測定": _() },
          "基礎コンクリート工": { "基礎コンクリート出来形測定": _() }
        },
        "集水桝工": {
          "集水枡底版": { "集水桝底版出来形測定": _() },
          "プレキャスト集水桝": { "プレキャスト集水桝出来形測定": _() }
        },
        "側溝工": {
          "側溝蓋": { "側溝蓋出来形測定": _() },
          "プレキャストU型側溝": { "プレキャストU型側溝出来形測定": _() }
        }
      }
    }
  }
};

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

export function inferPhotoCategory(remarkText: string): PhotoCategoryType {
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
