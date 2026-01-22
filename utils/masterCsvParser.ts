/**
 * マスタCSVパーサー
 *
 * photo-ai-rust形式のCSVマスタを読み込み、各種ユーティリティを提供
 */

// ============================================
// 型定義
// ============================================

export interface MasterRow {
  photoDivision: string;   // 写真区分（直接工事費）
  photoType: string;       // 写真種別（施工状況写真、品質管理写真等）
  workType: string;        // 工種
  variety: string;         // 種別
  detail: string;          // 細別
  remarks: string;         // 備考（最下層）
  photoCategory: string;   // 写真区分（level5：施工状況写真／安全管理写真 等）
  searchPatterns: string;  // 検索パターン（OCRマッチング用）
}

export interface ChainRecord {
  photoType: string;
  workType: string;
  variety: string;
  subphase: string;  // detail
  remarks: string;
  photoCategory: string;
  patterns: string;
}

// ============================================
// CSVパース
// ============================================

const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
};

const parseCSV = (csvText: string): MasterRow[] => {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  // Skip header line
  const dataLines = lines.slice(1);

  return dataLines.map(line => {
    const fields = parseCSVLine(line);
    return {
      photoDivision: fields[0] || '',
      photoType: fields[1] || '',
      workType: fields[2] || '',
      variety: fields[3] || '',
      detail: fields[4] || '',
      remarks: fields[5] || '',
      photoCategory: fields[6] || fields[1] || '',
      searchPatterns: fields[7] || '',
    };
  }).filter(row => row.workType); // workTypeが空の行は除外
};

// ============================================
// キャッシュ管理
// ============================================

let cachedRows: MasterRow[] | null = null;
let cachePromise: Promise<MasterRow[]> | null = null;

/**
 * マスタCSVを読み込む（キャッシュあり）
 */
export const loadMasterCsv = async (): Promise<MasterRow[]> => {
  if (cachedRows) return cachedRows;
  if (cachePromise) return cachePromise;

  cachePromise = (async () => {
    try {
      const baseUrl = import.meta.env.BASE_URL || '/';
      const masterUrl = new URL('master/construction_hierarchy.csv', `${window.location.origin}${baseUrl}`).toString();
      const response = await fetch(masterUrl);
      if (!response.ok) {
        throw new Error(`Failed to load master CSV: ${response.status}`);
      }
      const csvText = await response.text();
      cachedRows = parseCSV(csvText);
      return cachedRows;
    } catch (error) {
      console.error('Failed to load master CSV:', error);
      cachedRows = [];
      return cachedRows;
    } finally {
      cachePromise = null;
    }
  })();

  return cachePromise;
};

/**
 * キャッシュをクリア
 */
export const clearMasterCache = (): void => {
  cachedRows = null;
  cachePromise = null;
};

/**
 * 同期的にキャッシュを取得（事前にloadMasterCsvを呼んでおく必要あり）
 */
export const getMasterRowsSync = (): MasterRow[] => {
  return cachedRows || [];
};

// ============================================
// ユーティリティ関数
// ============================================

/**
 * 工種一覧を取得
 */
export const getWorkTypesFromMaster = (rows: MasterRow[]): string[] => {
  const types = new Set<string>();
  rows.forEach(row => {
    if (row.workType) types.add(row.workType);
  });
  return Array.from(types).sort();
};

/**
 * 指定工種に対応する種別一覧を取得
 */
export const getVarietiesFromMaster = (rows: MasterRow[], workType: string): string[] => {
  const varieties = new Set<string>();
  rows.forEach(row => {
    if (row.workType === workType && row.variety) {
      varieties.add(row.variety);
    }
  });
  return Array.from(varieties).sort();
};

/**
 * 指定工種・種別に対応する細別一覧を取得
 */
export const getDetailsFromMaster = (rows: MasterRow[], workType: string, variety: string): string[] => {
  const details = new Set<string>();
  rows.forEach(row => {
    if (row.workType === workType && row.variety === variety && row.detail) {
      details.add(row.detail);
    }
  });
  return Array.from(details).sort();
};

/**
 * 指定工種・種別・細別に対応する備考一覧を取得
 */
export const getRemarksFromMaster = (
  rows: MasterRow[],
  workType: string,
  variety: string,
  detail: string
): string[] => {
  const remarks = new Set<string>();
  rows.forEach(row => {
    if (row.workType === workType &&
        row.variety === variety &&
        row.detail === detail &&
        row.remarks) {
      remarks.add(row.remarks);
    }
  });
  return Array.from(remarks).sort();
};

/**
 * 写真種別一覧を取得
 */
export const getPhotoTypesFromMaster = (rows: MasterRow[]): string[] => {
  const types = new Set<string>();
  rows.forEach(row => {
    if (row.photoType) types.add(row.photoType);
  });
  return Array.from(types).sort();
};

// ============================================
// AI向けフォーマット
// ============================================

/**
 * AIに渡すチェーンレコード形式に変換
 * photo-ai-rustの to_chain_records_json() 相当
 */
export const toChainRecordsJson = (rows: MasterRow[]): ChainRecord[] => {
  return rows.map(row => ({
    photoType: row.photoType,
    workType: row.workType,
    variety: row.variety,
    subphase: row.detail,
    remarks: row.remarks,
    photoCategory: row.photoCategory,
    patterns: row.searchPatterns,
  }));
};

/**
 * 指定工種のみのチェーンレコードを取得
 */
export const getChainRecordsForWorkType = (rows: MasterRow[], workType: string): ChainRecord[] => {
  return rows
    .filter(row => row.workType === workType)
    .map(row => ({
      photoType: row.photoType,
      workType: row.workType,
      variety: row.variety,
      subphase: row.detail,
      remarks: row.remarks,
      patterns: row.searchPatterns,
    }));
};

/**
 * 階層構造に変換（既存のformatHierarchyForPrompt互換）
 */
export const toHierarchyObject = (rows: MasterRow[]): Record<string, unknown> => {
  const hierarchy: Record<string, Record<string, Record<string, Record<string, Record<string, Record<string, unknown>>>>>> = {
    "直接工事費": {}
  };

  const root = hierarchy["直接工事費"];

  rows.forEach(row => {
    if (!row.photoType || !row.workType) return;

    // photoType (写真種別) をカテゴリとして使用
    if (!root[row.photoType]) {
      root[row.photoType] = {};
    }
    const category = root[row.photoType];

    // workType (工種)
    if (!category[row.workType]) {
      category[row.workType] = {};
    }
    const workTypeNode = category[row.workType];

    // variety (種別)
    if (row.variety) {
      if (!workTypeNode[row.variety]) {
        workTypeNode[row.variety] = {};
      }
      const varietyNode = workTypeNode[row.variety];

      // detail (細別)
      if (row.detail) {
        if (!varietyNode[row.detail]) {
          varietyNode[row.detail] = {};
        }
        const detailNode = varietyNode[row.detail];

        // remarks (備考)
        if (row.remarks) {
          detailNode[row.remarks] = {};
        }
      }
    }
  });

  return hierarchy;
};

// ============================================
// 全有効値の抽出（UI用）
// ============================================

export interface AllValidValues {
  workTypes: Set<string>;
  varieties: Set<string>;
  details: Set<string>;
  remarks: Set<string>;
}

/**
 * マスタから全ての有効な値を抽出
 * UI のドロップダウン等で使用
 */
export const extractAllValidValuesFromCsv = (rows: MasterRow[]): AllValidValues => {
  const workTypes = new Set<string>();
  const varieties = new Set<string>();
  const details = new Set<string>();
  const remarks = new Set<string>();

  rows.forEach(row => {
    if (row.workType) workTypes.add(row.workType);
    if (row.variety) varieties.add(row.variety);
    if (row.detail) details.add(row.detail);
    if (row.remarks) remarks.add(row.remarks);
  });

  return { workTypes, varieties, details, remarks };
};

/**
 * 同期版: キャッシュから全有効値を取得
 */
export const extractAllValidValuesSync = (): AllValidValues => {
  const rows = getMasterRowsSync();
  return extractAllValidValuesFromCsv(rows);
};

/**
 * 同期版: 工種から種別一覧を取得
 */
export const getVarietiesByWorkTypeSync = (workType: string): string[] => {
  const rows = getMasterRowsSync();
  return getVarietiesFromMaster(rows, workType);
};

/**
 * 同期版: 工種・種別から細別一覧を取得
 */
export const getDetailsByVarietySync = (workType: string, variety: string): string[] => {
  const rows = getMasterRowsSync();
  return getDetailsFromMaster(rows, workType, variety);
};

/**
 * 同期版: 工種・種別・細別から備考一覧を取得
 */
export const getRemarksByDetailSync = (workType: string, variety: string, detail: string): string[] => {
  const rows = getMasterRowsSync();
  return getRemarksFromMaster(rows, workType, variety, detail);
};

// ============================================
// ソート用順序マップ
// ============================================

/**
 * 細別の順序マップを取得（CSV行順）
 */
export const getDetailOrderMapFromRows = (rows: MasterRow[]): Map<string, number> => {
  const orderMap = new Map<string, number>();
  let order = 0;

  rows.forEach(row => {
    if (row.detail && !orderMap.has(row.detail)) {
      orderMap.set(row.detail, order++);
    }
  });

  return orderMap;
};

/**
 * 種別の順序マップを取得（CSV行順）
 */
export const getVarietyOrderMapFromRows = (rows: MasterRow[]): Map<string, number> => {
  const orderMap = new Map<string, number>();
  let order = 0;

  rows.forEach(row => {
    if (row.variety && !orderMap.has(row.variety)) {
      orderMap.set(row.variety, order++);
    }
  });

  return orderMap;
};

/**
 * 同期版: 細別の順序マップを取得
 */
export const getDetailOrderMapSync = (): Map<string, number> => {
  const rows = getMasterRowsSync();
  return getDetailOrderMapFromRows(rows);
};

/**
 * 同期版: 種別の順序マップを取得
 */
export const getVarietyOrderMapSync = (): Map<string, number> => {
  const rows = getMasterRowsSync();
  return getVarietyOrderMapFromRows(rows);
};

// ============================================
// バリデーション
// ============================================

/**
 * 工種がマスタに存在するか確認
 */
export const isValidWorkType = (rows: MasterRow[], workType: string): boolean => {
  return rows.some(row => row.workType === workType);
};

/**
 * 工種・種別の組み合わせがマスタに存在するか確認
 */
export const isValidVariety = (rows: MasterRow[], workType: string, variety: string): boolean => {
  return rows.some(row => row.workType === workType && row.variety === variety);
};

/**
 * 工種・種別・細別の組み合わせがマスタに存在するか確認
 */
export const isValidDetail = (
  rows: MasterRow[],
  workType: string,
  variety: string,
  detail: string
): boolean => {
  return rows.some(row =>
    row.workType === workType &&
    row.variety === variety &&
    row.detail === detail
  );
};

/**
 * 完全な組み合わせ（工種・種別・細別・備考）がマスタに存在するか確認
 */
export const isValidCombination = (
  rows: MasterRow[],
  workType: string,
  variety: string,
  detail: string,
  remarks: string
): boolean => {
  return rows.some(row =>
    row.workType === workType &&
    row.variety === variety &&
    row.detail === detail &&
    row.remarks === remarks
  );
};

// ============================================
// AI結果バリデーション（警告出力用）
// ============================================

/**
 * マスタに存在しない値を検出して警告を返す
 */
export const detectUnknownTerms = (
  workType: string,
  variety: string,
  detail: string,
  remarks: string
): string[] => {
  const { workTypes, varieties, details, remarks: validRemarks } = extractAllValidValuesSync();
  const warnings: string[] = [];

  const checkMaster = (val: string, set: Set<string>, label: string) => {
    if (val && !set.has(val)) {
      warnings.push(`⚠️ ${label}「${val}」はマスタにありません（AI創作の可能性）`);
    }
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
      if (!partialMatch) {
        warnings.push(`⚠️ 備考「${remarks}」はマスタにありません（AI創作の可能性）`);
      }
    }
  }

  return warnings;
};

/**
 * マスタ値のバリデーション（警告付き）
 */
export const validateAgainstMaster = (
  workType: string,
  variety: string,
  detail: string,
  _remarks: string
): { validatedWorkType: string; validatedVariety: string; validatedDetail: string; warnings: string[] } => {
  const { workTypes, varieties, details } = extractAllValidValuesSync();
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
};

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

export const validateTemperatureRemarks = (
  remarksCategory: string,
  remarksValue: string
): TemperatureValidationResult => {
  const warnings: string[] = [];
  let correctedCategory = remarksCategory;
  let correctedValue = remarksValue;
  let isValid = true;

  if (remarksCategory.match(/[^着手完]工/) && !remarksCategory.includes('施工')) {
    warnings.push(`⚠️ カテゴリ「${remarksCategory}」に「〜工」が含まれています（不正）`);
    isValid = false;
    correctedCategory = remarksCategory.includes('温度')
      ? "アスファルト混合物温度測定"
      : remarksCategory.includes('密度')
        ? "現場密度測定"
        : correctedCategory;
  }

  if (VALID_TEMPERATURE_CATEGORIES.some(cat =>
    remarksCategory.includes(cat.replace('温度', '')) || cat.includes(remarksCategory)
  )) {
    if (remarksValue && !remarksValue.match(/[0-9０-９]+\.?[0-9０-９]*\s*℃/)) {
      warnings.push(`⚠️ 温度値「${remarksValue}」のフォーマットが不正（例: 161.1℃）`);
      const numMatch = remarksValue.match(/([0-9０-９]+\.?[0-9０-９]*)/);
      if (numMatch) correctedValue = `${numMatch[1]}℃`;
    }
  }

  if (remarksCategory === "温度測定" || remarksCategory === "温度管理") {
    warnings.push(`⚠️ カテゴリ「${remarksCategory}」は曖昧です。具体的なカテゴリを使用してください`);
    isValid = false;
    correctedCategory = remarksValue.includes('到着') || remarksValue.includes('出荷')
      ? "到着温度"
      : remarksValue.includes('敷均')
        ? "敷均し温度"
        : remarksValue.includes('初期') || remarksValue.includes('締固')
          ? "初期締固め前温度"
          : remarksValue.includes('開放')
            ? "開放温度"
            : "アスファルト混合物温度測定";
  }

  return {
    isValid,
    correctedCategory: correctedCategory !== remarksCategory ? correctedCategory : undefined,
    correctedValue: correctedValue !== remarksValue ? correctedValue : undefined,
    warnings
  };
};

export const isQualityManagementPhoto = (remarksCategory: string): boolean => {
  return VALID_QUALITY_CATEGORIES.some(cat =>
    remarksCategory.includes(cat) || cat.includes(remarksCategory)
  ) || remarksCategory.includes('温度') || remarksCategory.includes('密度');
};
