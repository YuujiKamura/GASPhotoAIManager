/**
 * CLI用エイリアスアダプター
 *
 * JSONファイルからエイリアス設定を読み込み、解析結果に適用
 *
 * ## 変更履歴
 * - 2026-01-17: 初版作成
 */

import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';

// Web版と互換性のある型定義
export interface AliasMapping {
  workType: Record<string, string>;
  variety: Record<string, string>;
  detail: Record<string, string>;
}

export interface AliasConfig {
  enabled: boolean;
  mappings: AliasMapping;
  activePreset?: string;
}

const DEFAULT_CONFIG: AliasConfig = {
  enabled: false,
  mappings: {
    workType: {},
    variety: {},
    detail: {}
  }
};

// デフォルトのエイリアスプリセット（Web版と同じ）
export const PRESET_ALIASES = {
  '舗装補修': {
    name: '舗装補修工プリセット',
    description: '舗装工→舗装補修工、舗装打換え工→アスファルト舗装補修工',
    mappings: {
      workType: { '舗装工': '舗装補修工' },
      variety: { '舗装打換え工': 'アスファルト舗装補修工' },
      detail: {}
    }
  }
} as const;

/**
 * エイリアス設定ファイルを読み込み
 */
export async function loadAliasConfig(configPath?: string): Promise<AliasConfig> {
  // 指定されたパス、または現在のディレクトリの.alias-config.jsonを試す
  const paths = configPath
    ? [configPath]
    : [
        path.join(process.cwd(), '.alias-config.json'),
        path.join(process.cwd(), 'alias-config.json'),
      ];

  for (const p of paths) {
    if (existsSync(p)) {
      try {
        const content = await fs.readFile(p, 'utf-8');
        const config = JSON.parse(content) as AliasConfig;
        return {
          ...DEFAULT_CONFIG,
          ...config,
          mappings: {
            ...DEFAULT_CONFIG.mappings,
            ...config.mappings
          }
        };
      } catch (e) {
        console.warn(`エイリアス設定の読み込みに失敗: ${p}`, e);
      }
    }
  }

  return DEFAULT_CONFIG;
}

/**
 * プリセットを適用したエイリアス設定を取得
 */
export function getPresetConfig(presetKey: keyof typeof PRESET_ALIASES): AliasConfig {
  const preset = PRESET_ALIASES[presetKey];
  return {
    enabled: true,
    mappings: preset.mappings,
    activePreset: presetKey
  };
}

/**
 * 解析結果にエイリアスを適用
 */
export function applyAliasToAnalysis(
  analysis: {
    workType?: string;
    variety?: string;
    detail?: string;
    [key: string]: unknown;
  },
  config: AliasConfig
): typeof analysis {
  if (!config.enabled) return analysis;

  return {
    ...analysis,
    workType: config.mappings.workType[analysis.workType || ''] || analysis.workType,
    variety: config.mappings.variety[analysis.variety || ''] || analysis.variety,
    detail: config.mappings.detail[analysis.detail || ''] || analysis.detail,
  };
}

/**
 * データ配列にエイリアスを一括適用
 */
export function applyAliasesToData<T extends { analysis?: { workType?: string; variety?: string; detail?: string; [key: string]: unknown } }>(
  data: T[],
  config: AliasConfig
): { data: T[]; modifiedCount: number } {
  if (!config.enabled) {
    return { data, modifiedCount: 0 };
  }

  let modifiedCount = 0;

  const result = data.map(item => {
    if (!item.analysis) return item;

    const original = {
      workType: item.analysis.workType,
      variety: item.analysis.variety,
      detail: item.analysis.detail
    };

    const aliased = applyAliasToAnalysis(item.analysis, config);

    const wasModified =
      aliased.workType !== original.workType ||
      aliased.variety !== original.variety ||
      aliased.detail !== original.detail;

    if (wasModified) {
      modifiedCount++;
      return { ...item, analysis: aliased };
    }

    return item;
  });

  return { data: result, modifiedCount };
}

/**
 * サンプルのエイリアス設定ファイルを生成
 */
export async function generateSampleConfig(outputPath: string): Promise<void> {
  const sample: AliasConfig = {
    enabled: true,
    mappings: {
      workType: {
        '舗装工': '舗装補修工',
        '道路工': '道路維持工'
      },
      variety: {
        '舗装打換え工': 'アスファルト舗装補修工'
      },
      detail: {}
    }
  };

  await fs.writeFile(outputPath, JSON.stringify(sample, null, 2), 'utf-8');
}
