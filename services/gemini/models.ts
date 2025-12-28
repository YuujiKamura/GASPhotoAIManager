/**
 * モデル選択・検証モジュール
 * - 利用可能なモデルの定義
 * - モデル選択・検証
 * - モデル設定
 */

import { GoogleGenAI } from "@google/genai";
import { sanitizeErrorMessage } from './apiKey';

// ============================================
// モデル定義
// ============================================

export type ModelType = 'gemini-3.0-flash' | 'gemini-3.0-pro' | 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-2.0-flash';

const MODEL_STORAGE_KEY = 'construction_album_model';

export const AVAILABLE_MODELS: { id: ModelType; name: string; description: string }[] = [
  { id: 'gemini-3.0-flash', name: 'Gemini 3.0 Flash', description: '最新・高性能（推奨）' },
  { id: 'gemini-3.0-pro', name: 'Gemini 3.0 Pro', description: '最新・最高精度' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: '高速・低コスト' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: '高精度・高コスト' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: '最速・最低コスト' },
];

// ============================================
// モデル選択
// ============================================

export const getSelectedModel = (): ModelType => {
  const saved = localStorage.getItem(MODEL_STORAGE_KEY);
  if (saved && AVAILABLE_MODELS.some(m => m.id === saved)) {
    return saved as ModelType;
  }
  return 'gemini-3.0-flash'; // デフォルト
};

export const setSelectedModel = (model: ModelType): void => {
  localStorage.setItem(MODEL_STORAGE_KEY, model);
};

// ============================================
// モデル検証
// ============================================

export const validateApiKey = async (apiKey: string, model?: ModelType): Promise<{ valid: boolean; error?: string }> => {
  const testModel = model || 'gemini-2.0-flash';
  try {
    const ai = new GoogleGenAI({ apiKey });
    await ai.models.generateContent({
      model: testModel,
      contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
    });
    return { valid: true };
  } catch (e: any) {
    // Sanitize error message to prevent API key leakage
    const safeMessage = sanitizeErrorMessage(e.message || '', apiKey);
    console.error(`API Key validation failed for ${testModel}:`, safeMessage);
    if (e.message?.includes('API_KEY_INVALID') || e.message?.includes('401')) {
      return { valid: false, error: 'APIキーが無効です' };
    }
    if (e.message?.includes('quota') || e.message?.includes('429')) {
      return { valid: false, error: '利用制限に達しました' };
    }
    if (e.message?.includes('not found') || e.message?.includes('404')) {
      return { valid: false, error: 'モデルが利用不可' };
    }
    return { valid: false, error: safeMessage || '接続エラー' };
  }
};

// ============================================
// モデル可用性チェック
// ============================================

export type ModelStatus = 'available' | 'quota_exceeded' | 'unavailable' | 'checking' | 'unknown';

export interface ModelAvailability {
  id: ModelType;
  name: string;
  description: string;
  status: ModelStatus;
  error?: string;
}

// Validate all models and return their availability
export const validateAllModels = async (
  apiKey: string,
  onProgress?: (modelId: ModelType, status: ModelStatus, error?: string) => void
): Promise<ModelAvailability[]> => {
  const results: ModelAvailability[] = AVAILABLE_MODELS.map(m => ({
    ...m,
    status: 'checking' as ModelStatus
  }));

  // Test models in parallel
  const checks = AVAILABLE_MODELS.map(async (model, index) => {
    onProgress?.(model.id, 'checking');
    const result = await validateApiKey(apiKey, model.id);

    let status: ModelStatus;
    if (result.valid) {
      status = 'available';
    } else if (result.error?.includes('制限')) {
      status = 'quota_exceeded';
    } else if (result.error?.includes('不可') || result.error?.includes('無効')) {
      status = 'unavailable';
    } else {
      status = 'unknown';
    }

    results[index] = {
      ...model,
      status,
      error: result.error
    };

    onProgress?.(model.id, status, result.error);
    return results[index];
  });

  await Promise.all(checks);
  return results;
};

// Get the best available model (first available in priority order)
export const getBestAvailableModel = (availabilities: ModelAvailability[]): ModelType | null => {
  // Priority: 3.0 Flash > 3.0 Pro > 2.5 Flash > 2.5 Pro > 2.0 Flash
  const priority: ModelType[] = ['gemini-3.0-flash', 'gemini-3.0-pro', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'];

  for (const modelId of priority) {
    const model = availabilities.find(m => m.id === modelId);
    if (model?.status === 'available') {
      return modelId;
    }
  }
  return null;
};

// ============================================
// モデル設定定数
// ============================================

export const getPrimaryModel = () => getSelectedModel();
export const PRIMARY_MODEL: ModelType = 'gemini-3.0-flash';
export const COMPLEX_MODEL: ModelType = 'gemini-3.0-flash';
export const FALLBACK_MODEL: ModelType = 'gemini-2.5-flash';
export const SELECTOR_MODEL: ModelType = 'gemini-2.5-flash';
