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
  searchPatterns: string;  // 検索パターン（OCRマッチング用）
}

export interface ChainRecord {
  photoType: string;
  workType: string;
  variety: string;
  subphase: string;  // detail
  remarks: string;
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
      searchPatterns: fields[6] || '',
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
      const response = await fetch('/master/construction_hierarchy.csv');
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
