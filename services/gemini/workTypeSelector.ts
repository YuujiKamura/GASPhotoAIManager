/**
 * Gemini API - Work Type Selector Module
 *
 * セレクターエージェント: 画像群から工種を判定
 * 軽量モデルで高速に工種を特定し、本解析で使う階層サブセットを決定
 */

import { GoogleGenAI } from "@google/genai";
import { PhotoRecord } from "../../types";
import { extractBase64Data } from "../../utils/imageUtils";
import { formatHierarchyForPrompt, getSelectorPrompt, getHierarchySubset, getWorkTypes } from "../../utils/constructionMaster";
import { trackUsage } from "../usageTracker";
import { isAutoApiEnabled } from './apiKey';
import { SELECTOR_MODEL } from './models';
import { formatDuration, LogFunction } from './helpers';

/**
 * セレクターエージェント: 画像群から工種を判定
 *
 * NOTE: autoSelectWorkTypes が false の場合、API呼び出しをスキップして全工種を返す
 */
export const selectWorkTypes = async (
  records: PhotoRecord[],
  apiKey: string,
  onLog?: LogFunction
): Promise<string[]> => {
  const availableWorkTypes = getWorkTypes();

  // 自動工種選択が無効の場合、API呼び出しをスキップ
  if (!isAutoApiEnabled('autoSelectWorkTypes')) {
    onLog?.('[SELECTOR] 自動工種選択がOFF - API呼び出しをスキップ（全工種を使用）', 'info');
    return availableWorkTypes;
  }

  const startTime = performance.now();
  const genAI = new GoogleGenAI({ apiKey });

  // サンプル画像を選択（最初と最後、中間から数枚）
  const sampleCount = Math.min(3, records.length);
  const sampleIndices: number[] = [];
  if (records.length <= 3) {
    sampleIndices.push(...records.map((_, i) => i));
  } else {
    sampleIndices.push(0); // 最初
    sampleIndices.push(Math.floor(records.length / 2)); // 中間
    sampleIndices.push(records.length - 1); // 最後
  }

  const samples = sampleIndices.map(i => records[i]);
  const inputs = samples.map(r => ({
    inlineData: {
      data: extractBase64Data(r.base64),
      mimeType: r.mimeType
    }
  }));

  const selectorPrompt = getSelectorPrompt();

  const prompt = `
あなたは建設現場の写真を分類する専門家です。
以下の${samples.length}枚のサンプル画像を見て、このバッチに含まれる工種を判定してください。

**利用可能な工種と代表的な備考:**
${selectorPrompt}

**タスク:**
1. 各画像を観察し、どの工種に該当するか判断
2. このバッチ全体で使われている工種のリストを返す

**重要:**
- 複数の工種が混在している場合は全て含める
- 判断できない場合は最も近い工種を選択
- 利用可能な工種: ${availableWorkTypes.join(', ')}

**出力形式 (JSON):**
{ "workTypes": ["舗装工", ...] }
`;

  try {
    const result = await genAI.models.generateContent({
      model: SELECTOR_MODEL,
      contents: [{ role: 'user', parts: [...inputs, { text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1
      }
    });

    const text = result.text || "{}";
    trackUsage(SELECTOR_MODEL, prompt, text, samples.length, 'selectWorkTypes');
    const json = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
    const selectedTypes = (json.workTypes || []).filter((t: string) => availableWorkTypes.includes(t));

    const elapsed = performance.now() - startTime;
    onLog?.(`[SELECTOR] ${formatDuration(elapsed)}: Selected ${selectedTypes.length} work types: ${selectedTypes.join(', ')}`, 'info');

    // 何も選択されなかった場合はフォールバック
    if (selectedTypes.length === 0) {
      onLog?.('[SELECTOR] No work types selected, using all types', 'info');
      return availableWorkTypes;
    }

    return selectedTypes;
  } catch (e: any) {
    onLog?.(`[SELECTOR] Error: ${e.message}, falling back to all types`, 'error');
    return availableWorkTypes;
  }
};

/**
 * 工種に基づいた階層サブセットを取得
 */
export const getFilteredHierarchy = (workTypes: string[]): object => {
  if (workTypes.length === 0 || workTypes.length === getWorkTypes().length) {
    return formatHierarchyForPrompt();
  }
  return getHierarchySubset(workTypes);
};
