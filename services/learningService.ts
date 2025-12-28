/**
 * 学習サービス
 *
 * ユーザーの手動修正を検出し、自動的にルール化してGitHubに同期する
 */

import { AIAnalysisResult, LearnedRule, LearnedAlias, LearnedSettings } from '../types';
import {
  hasGitHubToken,
  getGitHubToken,
  pushLearnedSettings,
  fetchLearnedSettings,
  createEmptySettings
} from './githubSync';

// IndexedDB設定
const DB_NAME = 'ConstructionPhotoManagerDB';
const STORE_LEARNED = 'learnedRules';

// メモリ内キャッシュ
let cachedSettings: LearnedSettings | null = null;
let pendingChanges = false;
let autoPushTimer: ReturnType<typeof setTimeout> | null = null;

// 自動プッシュの遅延（ミリ秒）
const AUTO_PUSH_DELAY = 30000; // 30秒

/**
 * IndexedDBを開く
 */
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 9); // Version 9: Sync with storage.ts

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_LEARNED)) {
        db.createObjectStore(STORE_LEARNED, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
};

/**
 * 学習設定をローカルに保存
 */
const saveSettingsLocally = async (settings: LearnedSettings): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_LEARNED, 'readwrite');
    const store = transaction.objectStore(STORE_LEARNED);
    const request = store.put({ id: 'settings', ...settings });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * 学習設定をローカルから読み込み
 */
const loadSettingsLocally = async (): Promise<LearnedSettings | null> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_LEARNED, 'readonly');
      const store = transaction.objectStore(STORE_LEARNED);
      const request = store.get('settings');
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id, ...settings } = result;
          resolve(settings as LearnedSettings);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.warn('Failed to load settings locally:', e);
    return null;
  }
};

/**
 * 学習設定を取得（キャッシュ優先）
 */
export const getLearnedSettings = async (): Promise<LearnedSettings> => {
  if (cachedSettings) {
    return cachedSettings;
  }

  // ローカルから読み込み
  let settings = await loadSettingsLocally();

  // GitHubから読み込み（トークンがある場合）
  if (hasGitHubToken()) {
    const token = getGitHubToken()!;
    const remoteSettings = await fetchLearnedSettings(token);

    if (remoteSettings) {
      // リモートが新しければ使用
      if (!settings || remoteSettings.version > settings.version) {
        settings = remoteSettings;
        await saveSettingsLocally(settings);
      }
    }
  }

  cachedSettings = settings || createEmptySettings();
  return cachedSettings;
};

/**
 * 手動修正からルールを生成
 */
export const createRuleFromEdit = (
  original: AIAnalysisResult,
  field: keyof AIAnalysisResult,
  oldValue: string,
  newValue: string
): LearnedRule => {
  const now = new Date().toISOString();

  return {
    id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    description: `${field}: "${oldValue}" → "${newValue}"`,
    condition: {
      workType: original.workType || undefined,
      variety: original.variety || undefined,
      detail: original.detail || undefined,
      remarks: field === 'remarks' ? oldValue : (original.remarks || undefined)
    },
    correction: {
      [field]: newValue
    },
    createdAt: now,
    source: 'manual'
  };
};

/**
 * エイリアスを生成（remarksの修正から）
 */
export const createAliasFromEdit = (
  original: AIAnalysisResult,
  oldValue: string,
  newValue: string
): LearnedAlias => {
  return {
    id: `alias_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    from: oldValue,
    to: newValue,
    context: original.workType || undefined,
    createdAt: new Date().toISOString()
  };
};

/**
 * 手動修正を記録
 */
export const recordManualEdit = async (
  original: AIAnalysisResult,
  field: keyof AIAnalysisResult,
  oldValue: string,
  newValue: string
): Promise<void> => {
  if (oldValue === newValue) return;

  const settings = await getLearnedSettings();

  // ルールを追加
  const rule = createRuleFromEdit(original, field, oldValue, newValue);
  settings.rules.push(rule);

  // remarksの修正ならエイリアスも追加
  if (field === 'remarks' && oldValue && newValue) {
    const alias = createAliasFromEdit(original, oldValue, newValue);
    // 既存のエイリアスと重複チェック
    const exists = settings.aliases.some(a => a.from === alias.from && a.to === alias.to);
    if (!exists) {
      settings.aliases.push(alias);
    }
  }

  // 設定を更新
  settings.version++;
  settings.updatedAt = new Date().toISOString();

  // キャッシュとローカルを更新
  cachedSettings = settings;
  await saveSettingsLocally(settings);

  // 自動プッシュをスケジュール
  pendingChanges = true;
  scheduleAutoPush();

  console.log(`[Learning] Recorded edit: ${field} "${oldValue}" → "${newValue}"`);
};

/**
 * 自動プッシュをスケジュール
 */
const scheduleAutoPush = (): void => {
  if (autoPushTimer) {
    clearTimeout(autoPushTimer);
  }

  autoPushTimer = setTimeout(async () => {
    if (pendingChanges && hasGitHubToken()) {
      await pushToGitHub();
    }
  }, AUTO_PUSH_DELAY);
};

/**
 * GitHubにプッシュ
 */
export const pushToGitHub = async (): Promise<{ success: boolean; error?: string }> => {
  if (!hasGitHubToken()) {
    return { success: false, error: 'GitHubトークンが設定されていません' };
  }

  const settings = await getLearnedSettings();
  const token = getGitHubToken()!;

  const result = await pushLearnedSettings(token, settings);

  if (result.success) {
    pendingChanges = false;
    console.log('[Learning] Auto-pushed to GitHub:', result.commitUrl);
  }

  return result;
};

/**
 * 学習ルールをプロンプトに変換
 */
export const rulesToPromptText = (settings: LearnedSettings): string => {
  if (settings.rules.length === 0 && settings.aliases.length === 0) {
    return '';
  }

  const lines: string[] = ['\n--- LEARNED CORRECTIONS (学習済み修正) ---'];

  // ルール
  if (settings.rules.length > 0) {
    lines.push('\n**Correction Rules:**');
    // 最新の10件のみ
    const recentRules = settings.rules.slice(-10);
    recentRules.forEach(rule => {
      const conditions = Object.entries(rule.condition)
        .filter(([_, v]) => v)
        .map(([k, v]) => `${k}="${v}"`)
        .join(', ');
      const corrections = Object.entries(rule.correction)
        .filter(([_, v]) => v)
        .map(([k, v]) => `${k}="${v}"`)
        .join(', ');
      lines.push(`- When ${conditions}: Use ${corrections}`);
    });
  }

  // エイリアス
  if (settings.aliases.length > 0) {
    lines.push('\n**Term Mappings (Do NOT use left side, use right side):**');
    // 最新の20件のみ
    const recentAliases = settings.aliases.slice(-20);
    recentAliases.forEach(alias => {
      const context = alias.context ? ` (in ${alias.context})` : '';
      lines.push(`- "${alias.from}" → "${alias.to}"${context}`);
    });
  }

  lines.push('\n--- END LEARNED CORRECTIONS ---');

  return lines.join('\n');
};

/**
 * 同期状態を取得
 */
export const getSyncState = (): {
  hasPendingChanges: boolean;
  rulesCount: number;
  aliasesCount: number;
} => {
  return {
    hasPendingChanges: pendingChanges,
    rulesCount: cachedSettings?.rules.length || 0,
    aliasesCount: cachedSettings?.aliases.length || 0
  };
};

/**
 * 即座に同期を強制
 */
export const forcePush = async (): Promise<{ success: boolean; error?: string }> => {
  if (autoPushTimer) {
    clearTimeout(autoPushTimer);
    autoPushTimer = null;
  }
  return pushToGitHub();
};

/**
 * 初期化（アプリ起動時に呼ぶ）
 */
export const initLearningService = async (): Promise<void> => {
  try {
    await getLearnedSettings();
    console.log('[Learning] Service initialized');
  } catch (e) {
    console.warn('[Learning] Failed to initialize:', e);
  }
};

/**
 * AIにルールの最適化を提案させる
 * 蓄積された修正パターンを分析し、より汎用的なルールを生成
 */
export const suggestOptimizedRules = async (
  apiKey: string,
  onLog?: (msg: string) => void
): Promise<{ suggestedRules: LearnedRule[]; suggestedAliases: LearnedAlias[] }> => {
  const { GoogleGenAI } = await import("@google/genai");
  const settings = await getLearnedSettings();

  if (settings.rules.length < 3 && settings.aliases.length < 3) {
    onLog?.('[AI提案] 十分なデータがありません（最低3件必要）');
    return { suggestedRules: [], suggestedAliases: [] };
  }

  const genAI = new GoogleGenAI({ apiKey });

  const prompt = `
あなたは工事写真管理システムの学習データを最適化するエキスパートです。

以下は、ユーザーが手動で修正した履歴です。これらのパターンを分析し、
より汎用的で効果的なルールを提案してください。

## 現在のルール（${settings.rules.length}件）:
${JSON.stringify(settings.rules, null, 2)}

## 現在のエイリアス（${settings.aliases.length}件）:
${JSON.stringify(settings.aliases, null, 2)}

## タスク:
1. 重複や類似のルールを統合してください
2. より汎用的なパターンを抽出してください
3. 不要なルール（一回限りの修正など）を除外してください
4. 新しいエイリアスを提案してください（よくある表記揺れ）

## 出力形式（JSON）:
{
  "optimizedRules": [
    {
      "description": "ルールの説明",
      "condition": { "workType": "...", "remarks": "..." },
      "correction": { "remarks": "..." },
      "reason": "このルールが必要な理由"
    }
  ],
  "optimizedAliases": [
    {
      "from": "誤った表現",
      "to": "正しい表現",
      "context": "適用コンテキスト（省略可）",
      "reason": "この変換が必要な理由"
    }
  ],
  "removedRules": ["削除を推奨するルールID"],
  "summary": "最適化の概要"
}
`;

  try {
    onLog?.('[AI提案] ルール最適化を分析中...');

    const result = await genAI.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = result.text || '{}';
    const json = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());

    const now = new Date().toISOString();

    // 提案されたルールを変換
    const suggestedRules: LearnedRule[] = (json.optimizedRules || []).map((r: any, i: number) => ({
      id: `ai_rule_${Date.now()}_${i}`,
      description: r.description || r.reason || '',
      condition: r.condition || {},
      correction: r.correction || {},
      createdAt: now,
      source: 'manual' as const // AIが提案したものも'manual'として記録
    }));

    const suggestedAliases: LearnedAlias[] = (json.optimizedAliases || []).map((a: any, i: number) => ({
      id: `ai_alias_${Date.now()}_${i}`,
      from: a.from,
      to: a.to,
      context: a.context,
      createdAt: now
    }));

    onLog?.(`[AI提案] ${suggestedRules.length}件のルール、${suggestedAliases.length}件のエイリアスを提案`);
    if (json.summary) {
      onLog?.(`[AI提案] ${json.summary}`);
    }

    return { suggestedRules, suggestedAliases };

  } catch (e: any) {
    onLog?.(`[AI提案] エラー: ${e.message}`);
    return { suggestedRules: [], suggestedAliases: [] };
  }
};

/**
 * 提案されたルールを適用
 */
export const applyOptimizedRules = async (
  rules: LearnedRule[],
  aliases: LearnedAlias[],
  replaceExisting: boolean = false
): Promise<void> => {
  const settings = await getLearnedSettings();

  if (replaceExisting) {
    // 既存のルールを置き換え
    settings.rules = rules;
    settings.aliases = aliases;
  } else {
    // 既存に追加
    settings.rules = [...settings.rules, ...rules];
    settings.aliases = [...settings.aliases, ...aliases];
  }

  settings.version++;
  settings.updatedAt = new Date().toISOString();

  cachedSettings = settings;
  await saveSettingsLocally(settings);
  pendingChanges = true;
  scheduleAutoPush();
};
