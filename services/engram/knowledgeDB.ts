/**
 * 知識DB管理モジュール
 *
 * Engram Level 3: 知識を完全にDB化
 * - マスタ階層（工種→種別→細別→摘要）
 * - お手本（解析結果サンプル）
 * - 学習ルール（修正履歴から生成）
 *
 * すべてをIndexedDBで一元管理し、ハッシュベース検索を実現
 */

import { openDB, STORE_KNOWLEDGE_DB } from '../../utils/storage/dbCore';
import { ChainRecord } from '../../utils/masterCsvParser';
import { AnalysisExample, LearnedRule, LearnedAlias } from '../../types';

// ============================================
// 型定義
// ============================================

// 知識エントリの種類
export type KnowledgeType = 'master' | 'example' | 'rule' | 'alias';

// 統合知識エントリ
export interface KnowledgeEntry {
  id: string;
  type: KnowledgeType;
  workType?: string;
  variety?: string;      // 種別
  detail?: string;       // 細別
  remarks?: string;      // 摘要
  content: string;       // 検索用テキスト（正規化済み）
  contentHash: string;   // コンテンツハッシュ（重複検出用）
  data: any;             // 元データ
  weight: number;        // 重み（優先度）
  createdAt: number;
  updatedAt: number;
}

// 検索オプション
export interface KnowledgeSearchOptions {
  types?: KnowledgeType[];
  workTypes?: string[];
  limit?: number;
  minWeight?: number;
}

// 検索結果
export interface KnowledgeSearchResult {
  entry: KnowledgeEntry;
  score: number;         // マッチスコア
}

// ============================================
// ハッシュ計算
// ============================================

/**
 * コンテンツハッシュを計算（簡易版）
 */
export const computeContentHash = (content: string): string => {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
};

/**
 * テキストを正規化
 */
export const normalizeText = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
};

// ============================================
// CRUD操作
// ============================================

/**
 * 知識エントリを保存
 */
export const saveKnowledgeEntry = async (entry: Omit<KnowledgeEntry, 'createdAt' | 'updatedAt'>): Promise<KnowledgeEntry> => {
  const db = await openDB();
  const now = Date.now();

  const fullEntry: KnowledgeEntry = {
    ...entry,
    createdAt: now,
    updatedAt: now
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_KNOWLEDGE_DB, 'readwrite');
    const store = transaction.objectStore(STORE_KNOWLEDGE_DB);
    const request = store.put(fullEntry);
    request.onsuccess = () => resolve(fullEntry);
    request.onerror = () => reject(request.error);
  });
};

/**
 * 知識エントリを取得
 */
export const getKnowledgeEntry = async (id: string): Promise<KnowledgeEntry | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_KNOWLEDGE_DB, 'readonly');
    const store = transaction.objectStore(STORE_KNOWLEDGE_DB);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

/**
 * 全知識エントリを取得
 */
export const getAllKnowledgeEntries = async (): Promise<KnowledgeEntry[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_KNOWLEDGE_DB, 'readonly');
    const store = transaction.objectStore(STORE_KNOWLEDGE_DB);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

/**
 * タイプで知識エントリを取得
 */
export const getKnowledgeByType = async (type: KnowledgeType): Promise<KnowledgeEntry[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_KNOWLEDGE_DB, 'readonly');
    const store = transaction.objectStore(STORE_KNOWLEDGE_DB);
    const index = store.index('type');
    const request = index.getAll(type);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

/**
 * 工種で知識エントリを取得
 */
export const getKnowledgeByWorkType = async (workType: string): Promise<KnowledgeEntry[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_KNOWLEDGE_DB, 'readonly');
    const store = transaction.objectStore(STORE_KNOWLEDGE_DB);
    const index = store.index('workType');
    const request = index.getAll(workType);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

/**
 * 知識エントリを削除
 */
export const deleteKnowledgeEntry = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_KNOWLEDGE_DB, 'readwrite');
    const store = transaction.objectStore(STORE_KNOWLEDGE_DB);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * 全知識エントリをクリア
 */
export const clearKnowledgeDB = async (): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_KNOWLEDGE_DB, 'readwrite');
    const store = transaction.objectStore(STORE_KNOWLEDGE_DB);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// ============================================
// データ変換・インポート
// ============================================

/**
 * マスタレコードを知識エントリに変換
 */
export const chainRecordToKnowledge = (record: ChainRecord, index: number): KnowledgeEntry => {
  const content = normalizeText([
    record.workType,
    record.variety,
    record.detail,
    record.remarks
  ].filter(Boolean).join(' '));

  return {
    id: `master_${record.workType}_${index}`,
    type: 'master',
    workType: record.workType,
    variety: record.variety,
    detail: record.detail,
    remarks: record.remarks,
    content,
    contentHash: computeContentHash(content),
    data: record,
    weight: 1.0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
};

/**
 * お手本を知識エントリに変換
 */
export const exampleToKnowledge = (example: AnalysisExample): KnowledgeEntry => {
  const content = normalizeText([
    example.analysis.workType,
    example.analysis.variety,
    example.analysis.detail,
    example.analysis.remarks,
    example.analysis.description
  ].filter(Boolean).join(' '));

  return {
    id: `example_${example.id}`,
    type: 'example',
    workType: example.analysis.workType,
    variety: example.analysis.variety,
    detail: example.analysis.detail,
    remarks: example.analysis.remarks,
    content,
    contentHash: computeContentHash(content),
    data: example,
    weight: 2.0, // お手本は高い重み
    createdAt: example.createdAt,
    updatedAt: example.updatedAt
  };
};

/**
 * 学習ルールを知識エントリに変換
 */
export const ruleToKnowledge = (rule: LearnedRule): KnowledgeEntry => {
  const content = normalizeText([
    rule.condition.workType,
    rule.condition.variety,
    rule.condition.detail,
    rule.condition.remarks,
    rule.description
  ].filter(Boolean).join(' '));

  return {
    id: `rule_${rule.id}`,
    type: 'rule',
    workType: rule.condition.workType,
    variety: rule.condition.variety,
    detail: rule.condition.detail,
    remarks: rule.condition.remarks,
    content,
    contentHash: computeContentHash(content),
    data: rule,
    weight: 3.0, // 学習ルールは最高の重み
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
};

/**
 * エイリアスを知識エントリに変換
 */
export const aliasToKnowledge = (alias: LearnedAlias): KnowledgeEntry => {
  const content = normalizeText(`${alias.from} ${alias.to} ${alias.context || ''}`);

  return {
    id: `alias_${alias.id}`,
    type: 'alias',
    workType: alias.context,
    content,
    contentHash: computeContentHash(content),
    data: alias,
    weight: 2.5,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
};

/**
 * 全知識をインポート
 */
export const importAllKnowledge = async (
  chainRecords: ChainRecord[],
  examples: AnalysisExample[],
  rules: LearnedRule[],
  aliases: LearnedAlias[],
  onProgress?: (current: number, total: number, type: string) => void
): Promise<{ imported: number; skipped: number }> => {
  let imported = 0;
  let skipped = 0;
  const existingHashes = new Set<string>();

  // 既存のハッシュを収集
  const existing = await getAllKnowledgeEntries();
  existing.forEach(e => existingHashes.add(e.contentHash));

  const total = chainRecords.length + examples.length + rules.length + aliases.length;
  let current = 0;

  // マスタレコード
  for (let i = 0; i < chainRecords.length; i++) {
    const entry = chainRecordToKnowledge(chainRecords[i], i);
    if (!existingHashes.has(entry.contentHash)) {
      await saveKnowledgeEntry(entry);
      existingHashes.add(entry.contentHash);
      imported++;
    } else {
      skipped++;
    }
    current++;
    onProgress?.(current, total, 'master');
  }

  // お手本
  for (const example of examples) {
    const entry = exampleToKnowledge(example);
    if (!existingHashes.has(entry.contentHash)) {
      await saveKnowledgeEntry(entry);
      existingHashes.add(entry.contentHash);
      imported++;
    } else {
      skipped++;
    }
    current++;
    onProgress?.(current, total, 'example');
  }

  // ルール
  for (const rule of rules) {
    const entry = ruleToKnowledge(rule);
    if (!existingHashes.has(entry.contentHash)) {
      await saveKnowledgeEntry(entry);
      existingHashes.add(entry.contentHash);
      imported++;
    } else {
      skipped++;
    }
    current++;
    onProgress?.(current, total, 'rule');
  }

  // エイリアス
  for (const alias of aliases) {
    const entry = aliasToKnowledge(alias);
    if (!existingHashes.has(entry.contentHash)) {
      await saveKnowledgeEntry(entry);
      existingHashes.add(entry.contentHash);
      imported++;
    } else {
      skipped++;
    }
    current++;
    onProgress?.(current, total, 'alias');
  }

  return { imported, skipped };
};

/**
 * 知識DB統計を取得
 */
export const getKnowledgeStats = async (): Promise<{
  total: number;
  byType: Record<KnowledgeType, number>;
  byWorkType: Record<string, number>;
}> => {
  const entries = await getAllKnowledgeEntries();

  const byType: Record<KnowledgeType, number> = {
    master: 0,
    example: 0,
    rule: 0,
    alias: 0
  };
  const byWorkType: Record<string, number> = {};

  for (const entry of entries) {
    byType[entry.type]++;
    if (entry.workType) {
      byWorkType[entry.workType] = (byWorkType[entry.workType] || 0) + 1;
    }
  }

  return {
    total: entries.length,
    byType,
    byWorkType
  };
};
