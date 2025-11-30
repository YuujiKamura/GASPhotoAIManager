/**
 * 新構造: 工種階層（写真区分から独立）
 *
 * 設計思想:
 * - 写真区分は備考（remarks）に付与される属性として定義
 * - 工種階層は一本化（施工状況/出来形/品質の重複をなくす）
 * - 備考が複数の写真区分に該当することも可能
 */

import { PhotoCategory } from '../types';

// 備考に対する写真区分の定義
export interface RemarkDefinition {
  categories: PhotoCategory[];
  aliases?: string[];  // 別名（OCR揺れ対応）
}

// 細別（詳細）ノード
export interface DetailNode {
  remarks: { [remarkName: string]: RemarkDefinition };
}

// 種別ノード
export interface VarietyNode {
  [detail: string]: DetailNode;
}

// 工種ノード
export interface WorkTypeNode {
  [variety: string]: VarietyNode;
}

// 工種階層全体
export interface WorkHierarchyType {
  [workType: string]: WorkTypeNode;
}

/**
 * 新構造: 工種階層マスタ
 * 写真区分は備考に対して付与される
 */
export const WORK_HIERARCHY: WorkHierarchyType = {
  "構造物撤去工": {
    "構造物取壊し工": {
      "コンクリート構造物取壊し": {
        remarks: {
          "取壊し状況": { categories: ["施工状況写真"] },
          "コンクリート（有筋）処分前": { categories: ["施工状況写真"] },
          "コンクリート（有筋）処分中": { categories: ["施工状況写真"] },
          "コンクリート（有筋）処分後": { categories: ["施工状況写真"] },
          "処分前": { categories: ["施工状況写真"] },
          "処分中": { categories: ["施工状況写真"] },
          "処分後": { categories: ["施工状況写真"] },
          "積込状況": { categories: ["施工状況写真"] }
        }
      }
    }
  },
  "道路土工": {
    "掘削工": {
      "掘削": {
        remarks: {
          "掘削状況": { categories: ["施工状況写真"] },
          "掘削完了": { categories: ["施工状況写真"] }
        }
      }
    },
    "路床工": {
      "路床": {
        remarks: {
          "路床整正状況": { categories: ["施工状況写真"] },
          "路床転圧状況": { categories: ["施工状況写真"] },
          "路床完了": { categories: ["施工状況写真"] }
        }
      }
    },
    "法面工": {
      "法面": {
        remarks: {
          "法面整形状況": { categories: ["施工状況写真"] },
          "植生工施工状況": { categories: ["施工状況写真"] }
        }
      }
    }
  },
  "舗装工": {
    "舗装打換え工": {
      "舗装版切断": {
        remarks: {
          "As舗装版切断状況": { categories: ["施工状況写真"] },
          "既設舗装版切断状況": { categories: ["施工状況写真"] },
          "完了": { categories: ["施工状況写真"] }
        }
      },
      "舗装版破砕": {
        remarks: {
          "剥取状況": { categories: ["施工状況写真"] },
          "積込状況": { categories: ["施工状況写真"] },
          "既設舗装厚さ確認": { categories: ["施工状況写真"] },
          "完了": { categories: ["施工状況写真"] }
        }
      },
      "上層路盤工": {
        remarks: {
          // 施工状況
          "補足材搬入状況 M-40": { categories: ["施工状況写真"] },
          "補足材搬入状況 RC-40": { categories: ["施工状況写真"] },
          "補足材搬入状況 RM-40": { categories: ["施工状況写真"] },
          "不陸整正状況": { categories: ["施工状況写真"] },
          "転圧状況": { categories: ["施工状況写真"] },
          "路盤完了状況": { categories: ["施工状況写真"] },
          // 出来形管理
          "不陸整正出来形": {
            categories: ["出来形管理写真"],
            aliases: ["路盤出来形", "出来形検測", "路盤", "基準高下がり", "基準高"]
          },
          "不陸整正出来形・管理値": { categories: ["出来形管理写真"] },
          "不陸整正出来形・接写": { categories: ["出来形管理写真"] },
          "砕石厚測定": { categories: ["出来形管理写真"] },
          // 品質管理
          "現場密度測定工": {
            categories: ["品質管理写真"],
            aliases: ["密度測定", "RI計器"]
          }
        }
      },
      "表層工": {
        remarks: {
          // 着手前及び完成
          "着手前": { categories: ["着手前及び完成写真"] },
          "完了": { categories: ["着手前及び完成写真", "施工状況写真"] },
          "竣工": { categories: ["着手前及び完成写真"] },
          // 施工状況
          "プライムコート乳剤散布状況": { categories: ["施工状況写真"] },
          "プライムコート養生砂散布状況": { categories: ["施工状況写真"] },
          "プライムコート養生砂清掃状況": { categories: ["施工状況写真"] },
          "端部乳剤塗布状況": { categories: ["施工状況写真"] },
          "舗設状況": { categories: ["施工状況写真"] },
          "初期転圧状況": { categories: ["施工状況写真"] },
          "2次転圧状況": { categories: ["施工状況写真"] },
          "施工完了": { categories: ["施工状況写真"] },
          // 品質管理
          "温度測定工": {
            categories: ["品質管理写真"],
            aliases: ["温度管理", "出荷時温度", "到着時温度", "舗設時温度"]
          },
          // 使用材料
          "材料検収状況": { categories: ["使用材料写真"] },
          "搬入状況": { categories: ["使用材料写真"] }
        }
      }
    },
    "未舗装部舗装工": {
      "上層路盤工": {
        remarks: {
          "鋤取り状況": { categories: ["施工状況写真"] },
          "補足材搬入状況 M-40": { categories: ["施工状況写真"] },
          "補足材搬入状況 RC-40": { categories: ["施工状況写真"] },
          "補足材搬入状況 RM-40": { categories: ["施工状況写真"] },
          "不陸整正状況": { categories: ["施工状況写真"] },
          "転圧状況": { categories: ["施工状況写真"] },
          "路盤完了状況": { categories: ["施工状況写真"] }
        }
      },
      "表層工": {
        remarks: {
          "着手前": { categories: ["着手前及び完成写真"] },
          "完了": { categories: ["着手前及び完成写真", "施工状況写真"] },
          "竣工": { categories: ["着手前及び完成写真"] },
          "プライムコート乳剤散布状況": { categories: ["施工状況写真"] },
          "プライムコート養生砂散布状況": { categories: ["施工状況写真"] },
          "プライムコート養生砂清掃状況": { categories: ["施工状況写真"] },
          "端部乳剤塗布状況": { categories: ["施工状況写真"] },
          "舗設状況": { categories: ["施工状況写真"] },
          "初期転圧状況": { categories: ["施工状況写真"] },
          "2次転圧状況": { categories: ["施工状況写真"] },
          "施工完了": { categories: ["施工状況写真"] }
        }
      }
    },
    "瀝青安定処理路盤工": {
      "上層路盤工": {
        remarks: {
          "補足材搬入状況 M-40": { categories: ["施工状況写真"] },
          "補足材搬入状況 RC-40": { categories: ["施工状況写真"] },
          "補足材搬入状況 RM-40": { categories: ["施工状況写真"] },
          "不陸整正状況": { categories: ["施工状況写真"] },
          "転圧状況": { categories: ["施工状況写真"] },
          "路盤完了状況": { categories: ["施工状況写真"] }
        }
      },
      "表層工": {
        remarks: {
          "着手前": { categories: ["着手前及び完成写真"] },
          "完了": { categories: ["着手前及び完成写真", "施工状況写真"] },
          "竣工": { categories: ["着手前及び完成写真"] },
          "プライムコート乳剤散布状況": { categories: ["施工状況写真"] },
          "プライムコート養生砂散布状況": { categories: ["施工状況写真"] },
          "プライムコート養生砂清掃状況": { categories: ["施工状況写真"] },
          "端部乳剤塗布状況": { categories: ["施工状況写真"] },
          "施工完了": { categories: ["施工状況写真"] }
        }
      }
    }
  },
  "区画線工": {
    "区画線工": {
      "溶融式区画線": {
        remarks: {
          "清掃状況": { categories: ["施工状況写真"] },
          "プライマー散布状況": { categories: ["施工状況写真"] },
          "区画線設置状況": { categories: ["施工状況写真"] },
          "完了": { categories: ["施工状況写真"] }
        }
      }
    }
  },
  "排水構造物工": {
    "作業土工": {
      "床掘り": {
        remarks: {
          "掘削状況": { categories: ["施工状況写真"] },
          "掘削完了": { categories: ["施工状況写真"] },
          "掘削工出来形測定": { categories: ["出来形管理写真"] }
        }
      },
      "埋戻し": {
        remarks: {
          "土砂埋戻し 転圧状況": { categories: ["施工状況写真"] },
          "敷均し、転圧状況": { categories: ["施工状況写真"] },
          "下層路盤 材料搬入状況 RC-40": { categories: ["施工状況写真"] },
          "下層路盤 転圧状況": { categories: ["施工状況写真"] },
          "上層路盤 敷均し状況": { categories: ["施工状況写真"] },
          "上層路盤M-40 転圧状況": { categories: ["施工状況写真"] },
          "完了": { categories: ["施工状況写真"] },
          "土砂埋戻し出来形測定": { categories: ["出来形管理写真"] },
          "下層路盤出来形測定": { categories: ["出来形管理写真"] },
          "上層路盤出来形測定": { categories: ["出来形管理写真"] },
          "路床出来形測定": { categories: ["出来形管理写真"] }
        }
      },
      "基礎砕石工": {
        remarks: {
          "RC-40 搬入状況": { categories: ["施工状況写真"] },
          "基礎砕石敷均し状況": { categories: ["施工状況写真"] },
          "基礎砕石転圧状況": { categories: ["施工状況写真"] },
          "完了": { categories: ["施工状況写真"] },
          "基礎砕石工出来形測定": { categories: ["出来形管理写真"] }
        }
      },
      "基礎コンクリート工": {
        remarks: {
          "型枠設置完了": { categories: ["施工状況写真"] },
          "打設前": { categories: ["施工状況写真"] },
          "打設完了": { categories: ["施工状況写真"] },
          "打設状況": { categories: ["施工状況写真"] },
          "打設厚さ確認": { categories: ["施工状況写真"] },
          "打設幅確認": { categories: ["施工状況写真"] },
          "基礎コンクリート出来形測定": { categories: ["出来形管理写真"] }
        }
      }
    },
    "集水桝工": {
      "集水枡底版": {
        remarks: {
          "集水桝底版 打設前確認": { categories: ["施工状況写真"] },
          "底版コンクリート 打設前確認": { categories: ["施工状況写真"] },
          "底版コンクリート 打設完了": { categories: ["施工状況写真"] },
          "集水桝底版出来形測定": { categories: ["出来形管理写真"] }
        }
      },
      "プレキャスト集水桝": {
        remarks: {
          "据付状況": { categories: ["施工状況写真"] },
          "完了": { categories: ["施工状況写真"] },
          "プレキャスト集水桝出来形測定": { categories: ["出来形管理写真"] }
        }
      }
    },
    "側溝工": {
      "側溝蓋": {
        remarks: {
          "側溝蓋 打設前確認": { categories: ["施工状況写真"] },
          "側溝蓋 打設完了": { categories: ["施工状況写真"] },
          "天端コンクリート 打設前確認": { categories: ["施工状況写真"] },
          "天端コンクリート 打設完了": { categories: ["施工状況写真"] },
          "天端コンクリート 打設状況": { categories: ["施工状況写真"] },
          "側溝蓋出来形測定": { categories: ["出来形管理写真"] }
        }
      },
      "プレキャストU型側溝": {
        remarks: {
          "側溝300　据付状況": { categories: ["施工状況写真"] },
          "G付側溝300　据付状況": { categories: ["施工状況写真"] },
          "敷モルタル敷均し状況": { categories: ["施工状況写真"] },
          "据付状況": { categories: ["施工状況写真"] },
          "完了": { categories: ["施工状況写真"] },
          "プレキャストU型側溝出来形測定": { categories: ["出来形管理写真"] }
        }
      }
    },
    "集水桝・マンホール工": {
      "人孔蓋撤去": {
        remarks: {
          "鉄蓋処分状況": { categories: ["施工状況写真"] },
          "既設人孔撤去状況": { categories: ["施工状況写真"] },
          "完了": { categories: ["施工状況写真"] }
        }
      },
      "人孔蓋据付": {
        remarks: {
          "調整ブロック設置状況": { categories: ["施工状況写真"] },
          "据付状況": { categories: ["施工状況写真"] },
          "高さ調整完了": { categories: ["施工状況写真"] }
        }
      },
      "人孔内部清掃": {
        remarks: {
          "清掃状況": { categories: ["施工状況写真"] },
          "清掃完了": { categories: ["施工状況写真"] }
        }
      },
      "調整蓋据付": {
        remarks: {
          "据付状況": { categories: ["施工状況写真"] },
          "完了": { categories: ["施工状況写真"] }
        }
      },
      "調整リングブロック設置": {
        remarks: {
          "設置状況": { categories: ["施工状況写真"] },
          "完了": { categories: ["施工状況写真"] }
        }
      },
      "転落防止蓋設置": {
        remarks: {
          "設置状況": { categories: ["施工状況写真"] },
          "完了": { categories: ["施工状況写真"] }
        }
      }
    }
  },
  "仮設工": {
    "交通管理工": {
      "交通誘導員配置": {
        remarks: {
          "誘導員配置状況": { categories: ["施工状況写真", "安全管理写真"] },
          "規制配置状況": { categories: ["施工状況写真", "安全管理写真"] }
        }
      },
      "保安施設設置": {
        remarks: {
          "保安施設設置状況": { categories: ["施工状況写真", "安全管理写真"] },
          "保安施設撤去状況": { categories: ["施工状況写真"] },
          "完了": { categories: ["施工状況写真"] },
          "看板設置状況": { categories: ["安全管理写真"] },
          "バリケード設置状況": { categories: ["安全管理写真"] },
          "点灯状況": { categories: ["安全管理写真"] }
        }
      }
    }
  },
  "安全管理": {
    "安全衛生": {
      "安全活動": {
        remarks: {
          "朝礼状況": { categories: ["安全管理写真"] },
          "KY活動状況": { categories: ["安全管理写真"] },
          "新規入場者教育状況": { categories: ["安全管理写真"] }
        }
      }
    }
  }
};

/**
 * 新構造から写真区分を取得
 */
export function getPhotoCategoryFromHierarchy(
  workType: string,
  variety: string,
  detail: string,
  remarkText: string
): PhotoCategory | null {
  const workNode = WORK_HIERARCHY[workType];
  if (!workNode) return null;

  const varietyNode = workNode[variety];
  if (!varietyNode) return null;

  const detailNode = varietyNode[detail];
  if (!detailNode) return null;

  // 完全一致を探す
  const remarkDef = detailNode.remarks[remarkText];
  if (remarkDef) {
    return remarkDef.categories[0];
  }

  // エイリアスで探す
  for (const [, def] of Object.entries(detailNode.remarks)) {
    if (def.aliases?.some(alias => remarkText.includes(alias))) {
      return def.categories[0];
    }
  }

  return null;
}

/**
 * 備考一覧を取得（特定の工種/種別/細別から）
 */
export function getRemarksList(workType: string, variety: string, detail: string): string[] {
  const detailNode = WORK_HIERARCHY[workType]?.[variety]?.[detail];
  if (!detailNode) return [];
  return Object.keys(detailNode.remarks);
}

/**
 * 工種一覧を取得
 */
export function getWorkTypes(): string[] {
  return Object.keys(WORK_HIERARCHY);
}

/**
 * 種別一覧を取得
 */
export function getVarieties(workType: string): string[] {
  const workNode = WORK_HIERARCHY[workType];
  if (!workNode) return [];
  return Object.keys(workNode);
}

/**
 * 細別一覧を取得
 */
export function getDetails(workType: string, variety: string): string[] {
  const varietyNode = WORK_HIERARCHY[workType]?.[variety];
  if (!varietyNode) return [];
  return Object.keys(varietyNode);
}


/**
 * AIプロンプト用にWORK_HIERARCHYをシンプルな階層構造に変換
 * 旧CONSTRUCTION_HIERARCHYと同等のフォーマット（写真区分なし）
 */
export function formatHierarchyForPrompt(): object {
  const result: Record<string, Record<string, Record<string, Record<string, object>>>> = {};

  for (const [workType, workNode] of Object.entries(WORK_HIERARCHY)) {
    result[workType] = {};
    for (const [variety, varietyNode] of Object.entries(workNode)) {
      result[workType][variety] = {};
      for (const [detail, detailNode] of Object.entries(varietyNode)) {
        result[workType][variety][detail] = {};
        for (const remarkName of Object.keys(detailNode.remarks)) {
          result[workType][variety][detail][remarkName] = {};
        }
      }
    }
  }

  return result;
}

/**
 * 備考から写真区分を推定（エイリアス対応）
 * 工種/種別/細別がわからなくても備考テキストから推定
 */
export function inferPhotoCategoryFromRemarks(remarkText: string): PhotoCategory | null {
  for (const [, workNode] of Object.entries(WORK_HIERARCHY)) {
    for (const [, varietyNode] of Object.entries(workNode)) {
      for (const [, detailNode] of Object.entries(varietyNode)) {
        // 完全一致
        const remarkDef = detailNode.remarks[remarkText];
        if (remarkDef) {
          return remarkDef.categories[0];
        }
        // エイリアス検索
        for (const [, def] of Object.entries(detailNode.remarks)) {
          if (def.aliases?.includes(remarkText)) {
            return def.categories[0];
          }
        }
      }
    }
  }
  return null;
}
