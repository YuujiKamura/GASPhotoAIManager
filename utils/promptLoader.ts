/**
 * Prompt Loader - YAMLプロンプトの読み込みと変数展開
 *
 * 機能:
 * - YAMLファイルの読み込みとパース（js-yaml不要の簡易実装）
 * - 変数展開 {variableName} 形式
 * - Viteでの静的インポート対応（import.meta.glob使用）
 * - キャッシュ機能（TTL付き）
 * - フォールバック対応
 */

// YAML形式の型定義
export interface PromptMeta {
  id: string;
  version: string;
  description: string;
  created?: string;
}

export interface PromptVariable {
  name: string;
  required: boolean;
  default?: string;
}

export interface PromptFile {
  meta: PromptMeta;
  variables: PromptVariable[];
  sections: Record<string, string>;
  template?: string;
}

export interface PromptConfig {
  active: {
    construction: string;
    general: string;
    interactive: string;
  };
  fallback: {
    enabled: boolean;
    useHardcoded: boolean;
  };
  cache: {
    enabled: boolean;
    ttlSeconds: number;
  };
  debug?: {
    logPromptSize?: boolean;
    logVariables?: boolean;
  };
}

// デフォルト設定
const DEFAULT_CONFIG: PromptConfig = {
  active: {
    construction: 'v1_baseline',
    general: 'v1_baseline',
    interactive: 'v1_baseline',
  },
  fallback: {
    enabled: true,
    useHardcoded: true,
  },
  cache: {
    enabled: true,
    ttlSeconds: 300, // 5分
  },
};

// キャッシュ
const promptCache = new Map<string, { data: PromptFile; timestamp: number }>();
let configCache: { data: PromptConfig; timestamp: number } | null = null;

// Vite環境でのYAMLファイル読み込み（静的インポート）
// import.meta.glob は Vite ビルド時に静的に解決される
type GlobModule = { default: string };
type GlobModules = Record<string, () => Promise<GlobModule>>;

// Viteの静的インポート（存在する場合のみ）
let yamlModules: GlobModules | null = null;

// Vite環境かどうかを判定
function isViteEnv(): boolean {
  return typeof import.meta !== 'undefined' && 'glob' in import.meta;
}

// YAMLモジュールの遅延初期化
async function initYamlModules(): Promise<GlobModules | null> {
  if (yamlModules !== null) {
    return yamlModules;
  }

  if (isViteEnv()) {
    try {
      // Viteの静的グロブインポート
      // @ts-expect-error - Vite specific
      yamlModules = import.meta.glob('/prompts/**/*.yaml', {
        query: '?raw',
        import: 'default',
      }) as GlobModules;
      return yamlModules;
    } catch {
      // Vite以外の環境では利用不可
      yamlModules = {};
      return yamlModules;
    }
  }

  yamlModules = {};
  return yamlModules;
}

/**
 * 簡易YAMLパーサー（js-yaml不要）
 * sections内の複数行文字列（|）に対応
 */
function parseYaml(content: string): any {
  const result: any = {};
  const lines = content.split('\n');
  let currentKey: string | null = null;
  let currentIndent = 0;
  let multilineMode = false;
  let multilineContent: string[] = [];
  let parentKey: string | null = null;
  let currentObject: any = result;
  const objectStack: { obj: any; indent: number; key: string | null }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // コメント行とblank行をスキップ
    if (trimmed.startsWith('#') || trimmed === '') {
      if (multilineMode) {
        // 複数行モード中の空行は保持
        multilineContent.push('');
      }
      continue;
    }

    // インデント計算
    const indent = line.search(/\S/);

    // 複数行文字列の処理
    if (multilineMode) {
      if (indent > currentIndent) {
        // インデントが深い行は複数行の続き
        multilineContent.push(line.substring(currentIndent + 2));
        continue;
      } else {
        // 複数行終了
        if (currentKey && parentKey) {
          if (!currentObject[parentKey]) {
            currentObject[parentKey] = {};
          }
          currentObject[parentKey][currentKey] = multilineContent.join('\n').trim();
        }
        multilineMode = false;
        multilineContent = [];
      }
    }

    // キー: 値 のパース
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();

      // インデントに基づいてオブジェクト階層を管理
      while (objectStack.length > 0 && objectStack[objectStack.length - 1].indent >= indent) {
        objectStack.pop();
      }

      if (objectStack.length > 0) {
        currentObject = objectStack[objectStack.length - 1].obj;
        parentKey = objectStack[objectStack.length - 1].key;
      } else {
        currentObject = result;
        parentKey = null;
      }

      if (value === '' || value === '|') {
        // ネストされたオブジェクトまたは複数行文字列の開始
        if (value === '|') {
          multilineMode = true;
          multilineContent = [];
          currentKey = key;
          currentIndent = indent;
          // 親オブジェクトを設定
          if (parentKey) {
            if (!currentObject[parentKey]) {
              currentObject[parentKey] = {};
            }
          }
        } else {
          // ネストされたオブジェクト
          if (!currentObject[key]) {
            currentObject[key] = {};
          }
          objectStack.push({ obj: currentObject, indent, key });
          currentObject = currentObject[key];
          parentKey = key;
        }
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // 配列（インライン）
        const arrayContent = value.slice(1, -1);
        const items = arrayContent.split(',').map((item) => item.trim().replace(/^["']|["']$/g, ''));
        if (parentKey && currentObject[parentKey] === undefined) {
          currentObject[parentKey] = {};
        }
        if (parentKey) {
          currentObject[parentKey][key] = items;
        } else {
          currentObject[key] = items;
        }
      } else {
        // 通常の値
        let parsedValue: any = value;

        // クォートを除去
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          parsedValue = value.slice(1, -1);
        } else if (value === 'true') {
          parsedValue = true;
        } else if (value === 'false') {
          parsedValue = false;
        } else if (!isNaN(Number(value)) && value !== '') {
          parsedValue = Number(value);
        }

        if (parentKey) {
          if (!currentObject[parentKey]) {
            currentObject[parentKey] = {};
          }
          if (typeof currentObject[parentKey] === 'object') {
            currentObject[parentKey][key] = parsedValue;
          }
        } else {
          currentObject[key] = parsedValue;
        }
      }
    } else if (trimmed.startsWith('- ')) {
      // 配列要素
      const item = trimmed.substring(2).trim();
      const lastKey = objectStack.length > 0 ? objectStack[objectStack.length - 1].key : null;

      // 配列要素がオブジェクトの場合
      if (item.includes(':')) {
        const itemColonIndex = item.indexOf(':');
        const itemKey = item.substring(0, itemColonIndex).trim();
        const itemValue = item.substring(itemColonIndex + 1).trim();

        if (lastKey && currentObject[lastKey]) {
          if (!Array.isArray(currentObject[lastKey])) {
            currentObject[lastKey] = [];
          }
          const obj: any = {};
          obj[itemKey] = itemValue.replace(/^["']|["']$/g, '');
          currentObject[lastKey].push(obj);
        }
      } else {
        // 単純な配列要素
        if (lastKey && currentObject[lastKey]) {
          if (!Array.isArray(currentObject[lastKey])) {
            currentObject[lastKey] = [];
          }
          currentObject[lastKey].push(item.replace(/^["']|["']$/g, ''));
        }
      }
    }
  }

  // 最後の複数行を処理
  if (multilineMode && currentKey && parentKey) {
    if (!currentObject[parentKey]) {
      currentObject[parentKey] = {};
    }
    currentObject[parentKey][currentKey] = multilineContent.join('\n').trim();
  }

  return result;
}

/**
 * キャッシュが有効かどうかをチェック
 */
function isCacheValid(timestamp: number, ttlSeconds: number): boolean {
  return Date.now() - timestamp < ttlSeconds * 1000;
}

/**
 * fetchでYAMLファイルを読み込み
 */
async function fetchYamlFile(path: string): Promise<string | null> {
  try {
    // Vite開発環境とビルド後の両方に対応
    const basePath = import.meta.env?.BASE_URL || '/GASPhotoAIManager/';
    const fullPath = `${basePath}${path}`.replace(/\/+/g, '/');

    const response = await fetch(fullPath);
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * YAMLファイルの読み込み（Vite glob または fetch）
 */
async function loadYamlContent(relativePath: string): Promise<string | null> {
  // Viteの静的インポートを試行
  const modules = await initYamlModules();
  if (modules) {
    const key = `/prompts/${relativePath}`;
    if (modules[key]) {
      try {
        const module = await modules[key]();
        return typeof module === 'string' ? module : module.default;
      } catch {
        // フォールバックへ
      }
    }
  }

  // fetchでの読み込み
  return fetchYamlFile(`prompts/${relativePath}`);
}

/**
 * config.yaml読み込み
 */
export async function loadPromptConfig(): Promise<PromptConfig> {
  // キャッシュチェック
  if (configCache && isCacheValid(configCache.timestamp, DEFAULT_CONFIG.cache.ttlSeconds)) {
    return configCache.data;
  }

  try {
    const content = await loadYamlContent('config.yaml');
    if (!content) {
      return DEFAULT_CONFIG;
    }

    const parsed = parseYaml(content);

    const config: PromptConfig = {
      active: {
        construction: parsed.active?.construction || DEFAULT_CONFIG.active.construction,
        general: parsed.active?.general || DEFAULT_CONFIG.active.general,
        interactive: parsed.active?.interactive || DEFAULT_CONFIG.active.interactive,
      },
      fallback: {
        enabled: parsed.fallback?.enabled ?? DEFAULT_CONFIG.fallback.enabled,
        useHardcoded: parsed.fallback?.useHardcoded ?? DEFAULT_CONFIG.fallback.useHardcoded,
      },
      cache: {
        enabled: parsed.cache?.enabled ?? DEFAULT_CONFIG.cache.enabled,
        ttlSeconds: parsed.cache?.ttlSeconds ?? DEFAULT_CONFIG.cache.ttlSeconds,
      },
      debug: parsed.debug,
    };

    // キャッシュに保存
    configCache = { data: config, timestamp: Date.now() };

    return config;
  } catch (error) {
    console.warn('[PromptLoader] Failed to load config.yaml, using defaults:', error);
    return DEFAULT_CONFIG;
  }
}

/**
 * プロンプトファイル読み込み
 */
export async function loadPromptFile(
  mode: 'construction' | 'general' | 'interactive',
  version?: string
): Promise<PromptFile | null> {
  const config = await loadPromptConfig();
  const targetVersion = version || config.active[mode];
  const cacheKey = `${mode}/${targetVersion}`;

  // キャッシュチェック
  if (config.cache.enabled) {
    const cached = promptCache.get(cacheKey);
    if (cached && isCacheValid(cached.timestamp, config.cache.ttlSeconds)) {
      return cached.data;
    }
  }

  // ファイルパスのパターンを試行
  const paths = [
    `${mode}/${targetVersion}.yaml`,
    `${mode}/${targetVersion}/prompt.yaml`,
    `${mode}/${targetVersion}/main.yaml`,
  ];

  for (const path of paths) {
    try {
      const content = await loadYamlContent(path);
      if (!content) continue;

      const parsed = parseYaml(content);

      // PromptFile形式に変換
      const promptFile: PromptFile = {
        meta: {
          id: parsed.meta?.id || `${mode}_${targetVersion}`,
          version: parsed.meta?.version || targetVersion,
          description: parsed.meta?.description || '',
          created: parsed.meta?.created,
        },
        variables: parseVariables(parsed.variables),
        sections: parsed.sections || {},
        template: parsed.template,
      };

      // キャッシュに保存
      if (config.cache.enabled) {
        promptCache.set(cacheKey, { data: promptFile, timestamp: Date.now() });
      }

      // デバッグログ
      if (config.debug?.logPromptSize) {
        const size = JSON.stringify(promptFile).length;
        console.log(`[PromptLoader] Loaded ${cacheKey}: ${size} bytes`);
      }

      return promptFile;
    } catch (error) {
      // 次のパスを試行
      continue;
    }
  }

  // フォールバック
  if (config.fallback.enabled && config.fallback.useHardcoded) {
    return getHardcodedPrompt(mode);
  }

  return null;
}

/**
 * variables配列をパース
 */
function parseVariables(variables: any): PromptVariable[] {
  if (!variables || !Array.isArray(variables)) {
    return [];
  }

  return variables.map((v: any) => ({
    name: v.name || '',
    required: v.required ?? false,
    default: v.default,
  }));
}

/**
 * ハードコードされたフォールバックプロンプト
 */
function getHardcodedPrompt(mode: 'construction' | 'general' | 'interactive'): PromptFile {
  const fallbacks: Record<string, PromptFile> = {
    construction: {
      meta: {
        id: 'construction_fallback',
        version: 'fallback',
        description: 'Construction photo analysis (fallback)',
      },
      variables: [
        { name: 'photoCount', required: true },
        { name: 'masterData', required: false },
      ],
      sections: {
        role: 'あなたは工事写真を分析する専門家です。',
        task: '提供された写真を分析し、工種・種別・細別を特定してください。',
        output: 'JSON形式で結果を返してください。',
      },
    },
    general: {
      meta: {
        id: 'general_fallback',
        version: 'fallback',
        description: 'General photo analysis (fallback)',
      },
      variables: [{ name: 'photoCount', required: true }],
      sections: {
        role: 'あなたは写真を分析するアシスタントです。',
        task: '提供された写真を分析し、内容を説明してください。',
      },
    },
    interactive: {
      meta: {
        id: 'interactive_fallback',
        version: 'fallback',
        description: 'Interactive analysis (fallback)',
      },
      variables: [
        { name: 'userQuery', required: true },
        { name: 'context', required: false },
      ],
      sections: {
        role: 'あなたは対話型の分析アシスタントです。',
        task: 'ユーザーの質問に答え、追加の分析を行ってください。',
      },
    },
  };

  return fallbacks[mode];
}

/**
 * 変数展開
 */
export function expandVariables(prompt: PromptFile, variables: Record<string, string>): string {
  // テンプレートがあればそれを使用、なければsectionsを結合
  let result = prompt.template || Object.values(prompt.sections).join('\n\n');

  // 変数のデフォルト値を適用
  const varsWithDefaults: Record<string, string> = { ...variables };
  for (const v of prompt.variables) {
    if (varsWithDefaults[v.name] === undefined && v.default !== undefined) {
      varsWithDefaults[v.name] = v.default;
    }
  }

  // {variableName} を置換
  for (const [key, value] of Object.entries(varsWithDefaults)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
  }

  // 未使用の変数プレースホルダーを削除（オプショナル変数対応）
  result = result.replace(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g, '');

  return result.trim();
}

/**
 * 必須変数のバリデーション
 */
export function validateVariables(
  prompt: PromptFile,
  variables: Record<string, string>
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const v of prompt.variables) {
    if (v.required && (variables[v.name] === undefined || variables[v.name] === '')) {
      missing.push(v.name);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * アクティブプロンプト取得
 */
export async function getActivePrompt(
  mode: 'construction' | 'general' | 'interactive'
): Promise<PromptFile | null> {
  const config = await loadPromptConfig();
  const version = config.active[mode];
  return loadPromptFile(mode, version);
}

/**
 * 指定されたプロンプトを取得して変数展開
 */
export async function getExpandedPrompt(
  mode: 'construction' | 'general' | 'interactive',
  variables: Record<string, string>,
  version?: string
): Promise<string | null> {
  const prompt = await loadPromptFile(mode, version);
  if (!prompt) {
    return null;
  }

  // バリデーション
  const validation = validateVariables(prompt, variables);
  if (!validation.valid) {
    console.warn(`[PromptLoader] Missing required variables: ${validation.missing.join(', ')}`);
  }

  return expandVariables(prompt, variables);
}

/**
 * キャッシュをクリア
 */
export function clearPromptCache(): void {
  promptCache.clear();
  configCache = null;
}

/**
 * 利用可能なプロンプトバージョン一覧を取得
 */
export async function listAvailablePrompts(
  mode: 'construction' | 'general' | 'interactive'
): Promise<string[]> {
  const modules = await initYamlModules();
  if (!modules) {
    return [];
  }

  const prefix = `/prompts/${mode}/`;
  const versions = new Set<string>();

  for (const key of Object.keys(modules)) {
    if (key.startsWith(prefix)) {
      const relativePath = key.substring(prefix.length);
      // v1_baseline.yaml または v1_baseline/prompt.yaml の形式をサポート
      const match = relativePath.match(/^([^/]+)(?:\.yaml|\/)/);
      if (match) {
        versions.add(match[1]);
      }
    }
  }

  return Array.from(versions).sort();
}
