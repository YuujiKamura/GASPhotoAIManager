import { CONSTRUCTION_HIERARCHY } from './constructionMaster';

// カスタマイズデータの型
export interface CustomizationData {
  deletedPaths: string[]; // 削除されたパス（例: "舗装工/舗装打換え工/表層工"）
  renamedPaths: { [path: string]: string }; // パス → 新しい名前
  addedEntries: { parentPath: string; name: string }[]; // 追加されたエントリー
}

export interface WorkTypeData {
  name: string;
  categories: Map<string, any>;
}

const ENABLED_WORK_TYPES_KEY = 'construction_enabled_work_types';
const CUSTOMIZATION_KEY = 'construction_customization';

// マスタから全工種とその階層データを収集
export function collectAllWorkTypes(): Map<string, WorkTypeData> {
  const workTypeMap = new Map<string, WorkTypeData>();
  const root = CONSTRUCTION_HIERARCHY["直接工事費"] as any;

  for (const categoryKey in root) {
    const category = root[categoryKey];
    for (const workTypeKey in category) {
      if (workTypeKey && workTypeKey.trim() !== '') {
        if (!workTypeMap.has(workTypeKey)) {
          workTypeMap.set(workTypeKey, {
            name: workTypeKey,
            categories: new Map()
          });
        }
        workTypeMap.get(workTypeKey)!.categories.set(categoryKey, category[workTypeKey]);
      }
    }
  }

  return workTypeMap;
}

// 有効な工種をlocalStorageから取得
export const loadEnabledWorkTypes = (): string[] => {
  try {
    const saved = localStorage.getItem(ENABLED_WORK_TYPES_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
    return Array.from(collectAllWorkTypes().keys());
  } catch {
    return Array.from(collectAllWorkTypes().keys());
  }
};

// 有効な工種をlocalStorageに保存
export const saveEnabledWorkTypes = (types: string[]) => {
  localStorage.setItem(ENABLED_WORK_TYPES_KEY, JSON.stringify(types));
};

// カスタマイズデータを読み込み
export const loadCustomization = (): CustomizationData => {
  try {
    const saved = localStorage.getItem(CUSTOMIZATION_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // ignore
  }
  return { deletedPaths: [], renamedPaths: {}, addedEntries: [] };
};

// カスタマイズデータを保存
export const saveCustomization = (data: CustomizationData) => {
  localStorage.setItem(CUSTOMIZATION_KEY, JSON.stringify(data));
};

// 有効な工種のみ含むマスタを取得（カスタマイズ適用済み）
export const getFilteredMaster = (): any => {
  const enabledTypes = loadEnabledWorkTypes();
  const customization = loadCustomization();
  const root = JSON.parse(JSON.stringify(CONSTRUCTION_HIERARCHY["直接工事費"]));

  // 無効な工種を削除
  for (const categoryKey in root) {
    const category = root[categoryKey];
    for (const workTypeKey in category) {
      if (!enabledTypes.includes(workTypeKey)) {
        delete category[workTypeKey];
      }
    }
  }

  // カスタマイズを適用（削除されたパス）
  for (const deletedPath of customization.deletedPaths) {
    const parts = deletedPath.split('/');
    for (const categoryKey in root) {
      let current = root[categoryKey];
      let found = true;
      for (let i = 0; i < parts.length - 1; i++) {
        if (current && current[parts[i]]) {
          current = current[parts[i]];
        } else {
          found = false;
          break;
        }
      }
      if (found && current && current[parts[parts.length - 1]]) {
        delete current[parts[parts.length - 1]];
      }
    }
  }

  // リネームを適用
  for (const [path, newName] of Object.entries(customization.renamedPaths)) {
    const parts = path.split('/');
    const oldName = parts[parts.length - 1];
    for (const categoryKey in root) {
      let current = root[categoryKey];
      let found = true;
      for (let i = 0; i < parts.length - 1; i++) {
        if (current && current[parts[i]]) {
          current = current[parts[i]];
        } else {
          found = false;
          break;
        }
      }
      if (found && current && current[oldName]) {
        current[newName] = current[oldName];
        delete current[oldName];
      }
    }
  }

  // 追加エントリーを適用
  for (const { parentPath, name } of customization.addedEntries) {
    const parts = parentPath.split('/');
    for (const categoryKey in root) {
      let current = root[categoryKey];
      let found = true;
      for (let i = 0; i < parts.length; i++) {
        if (current && current[parts[i]]) {
          current = current[parts[i]];
        } else {
          found = false;
          break;
        }
      }
      if (found && current && typeof current === 'object') {
        current[name] = {};  // 空オブジェクトとして追加
      }
    }
  }

  return { "直接工事費": root };
};

// 工種をカテゴリ別に並べ替えるための定数
export const UNCATEGORIZED_ORDER = 100;
export const WORK_TYPE_CATEGORY_ORDER: Record<string, number> = {
  // 舗装系
  '舗装工': 1,
  '区画線工': 2,
  // 構造物系
  '道路土工': 10,
  '排水構造物工': 11,
  '構造物撤去工': 12,
  // 上下水道系
  '人孔改良工': 20,
  // その他
  '仮設工': 30,
};

export const CATEGORY_SHORT_NAMES: Record<string, string> = {
  '着手前及び完成写真': '着工/完成',
  '施工状況写真': '施工状況',
  '安全管理写真': '安全',
  '使用材料写真': '材料',
  '品質管理写真': '品質',
  '出来形管理写真': '出来形',
};
