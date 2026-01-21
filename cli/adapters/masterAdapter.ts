/**
 * CLI用 工種マスタアダプター
 *
 * Web版のlocalStorage依存を排除し、
 * ファイルベースのカスタムマスタをサポート
 *
 * ## 変更履歴
 * - 2026-01-17: 新規作成（layoutConfig共通化に伴い追加）
 * - 2026-01-21: CSVベースに移行
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

// ESM compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// CSV読み込み（CLI用）
// ============================================

interface MasterRow {
  photoDivision: string;
  photoType: string;
  workType: string;
  variety: string;
  detail: string;
  remarks: string;
  searchPatterns: string;
}

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
  }).filter(row => row.workType);
};

// CSVファイルのパス
const CSV_PATH = path.join(__dirname, '../../public/master/construction_hierarchy.csv');

let cachedRows: MasterRow[] | null = null;

const loadMasterCsv = async (): Promise<MasterRow[]> => {
  if (cachedRows) return cachedRows;
  try {
    const csvText = await fs.readFile(CSV_PATH, 'utf-8');
    cachedRows = parseCSV(csvText);
    return cachedRows;
  } catch (e) {
    console.error('Failed to load master CSV:', e);
    return [];
  }
};

const loadMasterCsvSync = (): MasterRow[] => {
  if (cachedRows) return cachedRows;
  try {
    const csvText = fsSync.readFileSync(CSV_PATH, 'utf-8');
    cachedRows = parseCSV(csvText);
    return cachedRows;
  } catch (e) {
    console.error('Failed to load master CSV:', e);
    return [];
  }
};

// CSVから階層オブジェクトを構築
const toHierarchyObject = (rows: MasterRow[]): Record<string, unknown> => {
  const hierarchy: Record<string, Record<string, Record<string, Record<string, Record<string, Record<string, unknown>>>>>> = {
    "直接工事費": {}
  };
  const root = hierarchy["直接工事費"];

  rows.forEach(row => {
    if (!row.photoType || !row.workType) return;
    if (!root[row.photoType]) root[row.photoType] = {};
    const category = root[row.photoType];
    if (!category[row.workType]) category[row.workType] = {};
    const workTypeNode = category[row.workType];
    if (row.variety) {
      if (!workTypeNode[row.variety]) workTypeNode[row.variety] = {};
      const varietyNode = workTypeNode[row.variety];
      if (row.detail) {
        if (!varietyNode[row.detail]) varietyNode[row.detail] = {};
        const detailNode = varietyNode[row.detail];
        if (row.remarks) detailNode[row.remarks] = {};
      }
    }
  });

  return hierarchy;
};

// 後方互換用のCONSTRUCTION_HIERARCHY
export const CONSTRUCTION_HIERARCHY = (() => {
  const rows = loadMasterCsvSync();
  return toHierarchyObject(rows);
})();

// ============================================
// カスタムマスタ管理（ファイルベース）
// ============================================

const CONFIG_DIR = path.join(os.homedir(), '.gaspm');
const CUSTOM_MASTER_FILE = path.join(CONFIG_DIR, 'master.json');

/**
 * カスタムマスタをファイルから読み込み
 */
const loadCustomMaster = async (): Promise<Record<string, unknown>> => {
  try {
    const content = await fs.readFile(CUSTOM_MASTER_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
};

/**
 * オブジェクトの深いマージ
 */
const deepMerge = (
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> => {
  for (const key in source) {
    const val = source[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      if (!target[key]) target[key] = {};
      deepMerge(
        target[key] as Record<string, unknown>,
        val as Record<string, unknown>
      );
    } else {
      target[key] = val;
    }
  }
  return target;
};

/**
 * マージされた階層を取得
 */
export const getMergedHierarchy = async (): Promise<Record<string, unknown>> => {
  const customMaster = await loadCustomMaster();
  return deepMerge(
    JSON.parse(JSON.stringify(CONSTRUCTION_HIERARCHY)),
    customMaster
  );
};

/**
 * 階層データをGeminiプロンプト用にフォーマット
 */
export const formatHierarchyForPrompt = async (): Promise<Record<string, unknown>> => {
  return getMergedHierarchy();
};

/**
 * 工種一覧を取得
 */
export const getWorkTypes = async (): Promise<string[]> => {
  const types = new Set<string>();
  const hierarchy = await getMergedHierarchy();
  const root = hierarchy['直接工事費'] as Record<string, unknown>;

  for (const catKey in root) {
    Object.keys(root[catKey] as Record<string, unknown>).forEach(k =>
      types.add(k)
    );
  }
  return Array.from(types);
};

/**
 * セレクタ用プロンプトを取得
 */
export const getSelectorPrompt = async (): Promise<string> => {
  const types = await getWorkTypes();
  return types.join(', ');
};

/**
 * 階層のサブセットを取得（選択された工種のみ）
 */
export const getHierarchySubset = async (
  selectedTypes: string[]
): Promise<Record<string, unknown>> => {
  const hierarchy = await getMergedHierarchy();
  const root = hierarchy['直接工事費'] as Record<string, unknown>;
  const subset: Record<string, Record<string, unknown>> = { '直接工事費': {} };

  for (const catKey in root) {
    const cat = root[catKey] as Record<string, unknown>;
    const newCat: Record<string, unknown> = {};
    for (const typeKey in cat) {
      if (selectedTypes.includes(typeKey)) {
        newCat[typeKey] = cat[typeKey];
      }
    }
    if (Object.keys(newCat).length) {
      subset['直接工事費'][catKey] = newCat;
    }
  }
  return subset;
};

// ============================================
// マスタ値抽出・バリデーション
// ============================================

type TraverseCallback = (
  catKey: string,
  workTypeKey: string,
  varietyKey: string,
  detailKey: string,
  detail: Record<string, unknown>
) => void;

const traverseHierarchy = async (callback: TraverseCallback): Promise<void> => {
  const hierarchy = await getMergedHierarchy();
  const root = hierarchy['直接工事費'] as Record<string, unknown>;

  for (const catKey in root) {
    const category = root[catKey] as Record<string, unknown>;
    for (const workTypeKey in category) {
      const workType = category[workTypeKey] as Record<string, unknown>;
      for (const varietyKey in workType) {
        const variety = workType[varietyKey] as Record<string, unknown>;
        for (const detailKey in variety) {
          callback(
            catKey,
            workTypeKey,
            varietyKey,
            detailKey,
            variety[detailKey] as Record<string, unknown>
          );
        }
      }
    }
  }
};

/**
 * マスタから全ての有効な値を抽出
 */
export async function extractAllValidValues(): Promise<{
  workTypes: Set<string>;
  varieties: Set<string>;
  details: Set<string>;
  remarks: Set<string>;
}> {
  const workTypes = new Set<string>();
  const varieties = new Set<string>();
  const details = new Set<string>();
  const remarks = new Set<string>();

  await traverseHierarchy((_, workTypeKey, varietyKey, detailKey, detail) => {
    if (workTypeKey) workTypes.add(workTypeKey);
    if (varietyKey) varieties.add(varietyKey);
    if (detailKey && detailKey !== 'matchPatterns') {
      details.add(detailKey);
      const matchPatterns = detail?.matchPatterns as string[] | undefined;
      if (matchPatterns) matchPatterns.forEach(a => remarks.add(a));
      for (const remarkKey in detail) {
        if (remarkKey !== 'matchPatterns' && remarkKey) remarks.add(remarkKey);
      }
    }
  });

  return { workTypes, varieties, details, remarks };
}

/**
 * AI解析結果をマスタで検証
 */
export async function validateAgainstMaster(
  workType: string,
  variety: string,
  detail: string,
  _remarks: string
): Promise<{
  validatedWorkType: string;
  validatedVariety: string;
  validatedDetail: string;
  warnings: string[];
}> {
  const { workTypes, varieties, details } = await extractAllValidValues();
  const warnings: string[] = [];

  const check = (val: string, set: Set<string>, label: string): string => {
    if (val && !set.has(val)) {
      warnings.push(`${label}「${val}」はマスタにありません`);
      return '';
    }
    return val;
  };

  return {
    validatedWorkType: check(workType, workTypes, '工種'),
    validatedVariety: check(variety, varieties, '種別'),
    validatedDetail: check(detail, details, '細別'),
    warnings,
  };
}

/**
 * 未知の用語を検出
 */
export async function detectUnknownTerms(
  workType: string,
  variety: string,
  detail: string,
  remarks: string
): Promise<string[]> {
  const {
    workTypes,
    varieties,
    details,
    remarks: validRemarks,
  } = await extractAllValidValues();
  const warnings: string[] = [];

  const checkMaster = (val: string, set: Set<string>, label: string) => {
    if (val && !set.has(val)) {
      warnings.push(`⚠️ ${label}「${val}」はマスタにありません（AI創作の可能性）`);
    }
  };

  checkMaster(workType, workTypes, '工種');
  checkMaster(variety, varieties, '種別');
  checkMaster(detail, details, '細別');

  if (remarks) {
    if (remarks.match(/[^着手完]工/) && !remarks.includes('施工')) {
      warnings.push(
        `⚠️ 備考「${remarks}」に「〜工」が含まれています（備考レベルに「工」は不要）`
      );
    }
    const isMeasurement = remarks.match(/[0-9０-９]+|℃|mm|cm|m|%/);
    const isKnownStatus = remarks.match(/状況|完了|確認|着手前|竣工|出来形/);
    if (!validRemarks.has(remarks) && !isMeasurement && !isKnownStatus) {
      const partialMatch = Array.from(validRemarks).some(
        r => remarks.includes(r) || r.includes(remarks)
      );
      if (!partialMatch) {
        warnings.push(`⚠️ 備考「${remarks}」はマスタにありません（AI創作の可能性）`);
      }
    }
  }

  return warnings;
}

// ============================================
// カスタムマスタ保存（CLI用）
// ============================================

/**
 * カスタムマスタを保存
 */
export async function saveCustomMaster(
  json: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = JSON.parse(json);
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.writeFile(CUSTOM_MASTER_FILE, JSON.stringify(parsed, null, 2));
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'unknown error',
    };
  }
}

/**
 * カスタムマスタをリセット
 */
export async function resetCustomMaster(): Promise<void> {
  try {
    await fs.unlink(CUSTOM_MASTER_FILE);
  } catch {
    // ファイルが存在しない場合は無視
  }
}

// デフォルト階層もエクスポート
export { CONSTRUCTION_HIERARCHY };
