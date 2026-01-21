/**
 * Gemini API - Explain Service
 *
 * 解析結果の理由を問い合わせる機能
 * 再解析せずにAIに「なぜこの結果になったか」を聞く
 */

import { GoogleGenAI } from "@google/genai";
import { PhotoRecord, AIAnalysisResult } from "../../types";
import { extractBase64Data } from "../../utils/imageUtils";
import { trackUsage } from "../usageTracker";
import { getSelectedModel, PRIMARY_MODEL } from './models';
import { hasApiKey, getApiKey } from './apiKey';

/**
 * AIに解析結果の理由を問い合わせる
 * 再解析は行わず、現在の結果がなぜそうなったかを説明させる
 */
export const askWhyResult = async (
  photo: PhotoRecord,
  question?: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error' | 'json', details?: unknown) => void
): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey || !hasApiKey()) {
    throw new Error('APIキーが設定されていません');
  }

  const genAI = new GoogleGenAI({ apiKey });
  const model = getSelectedModel() || PRIMARY_MODEL;

  const analysis = photo.analysis;
  if (!analysis) {
    return "この写真はまだ解析されていません。";
  }

  const currentResult = `
現在の解析結果:
- 工種 (workType): ${analysis.workType || '(空)'}
- 種別 (variety): ${analysis.variety || '(空)'}
- 細別 (detail): ${analysis.detail || '(空)'}
- 測点 (station): ${analysis.station || '(空)'}
- 備考 (remarks): ${analysis.remarks || '(空)'}
- 記事 (description): ${analysis.description || '(空)'}
- 測定値 (measurements): ${analysis.measurements || '(空)'}
- 黒板有無 (hasBoard): ${analysis.hasBoard ? 'あり' : 'なし'}
- 検出テキスト (detectedText): ${analysis.detectedText || '(空)'}
`;

  const userQuestion = question?.trim() || 'この写真がなぜこの解析結果になったのか、理由を説明してください。';

  const prompt = `
あなたは工事写真の解析結果を説明するアシスタントです。

以下の写真と現在の解析結果について、ユーザーの質問に答えてください。
「なぜこの結果になったのか」を、写真から読み取れる情報に基づいて説明してください。

${currentResult}

## ユーザーの質問
${userQuestion}

## 回答のルール
- 簡潔に、要点を絞って回答する（3-5文程度）
- 写真から実際に見える情報を根拠にする
- もし結果に誤りがありそうなら、正しい可能性も提示する
- 「〜すべき」「〜が正しい」という断定的な表現は避け、「〜と思われる」「〜の可能性がある」など柔らかく表現する
`;

  try {
    onLog?.(`[EXPLAIN] ${photo.fileName} の理由を問い合わせ中...`, 'info');

    const result = await genAI.models.generateContent({
      model,
      contents: [{
        role: 'user',
        parts: [
          {
            inlineData: {
              data: extractBase64Data(photo.base64),
              mimeType: photo.mimeType
            }
          },
          { text: prompt }
        ]
      }],
      config: {
        temperature: 0.3
      }
    });

    const text = result.text || '';
    trackUsage(model, prompt, text, 1, 'askWhyResult');
    onLog?.(`[EXPLAIN] 回答を取得しました`, 'success');

    return text;
  } catch (error: unknown) {
    const err = error as Error;
    onLog?.(`[EXPLAIN] エラー: ${err.message}`, 'error');
    throw error;
  }
};

/**
 * 複数写真について一括で理由を問い合わせる
 */
export const askWhyResultsBatch = async (
  photos: PhotoRecord[],
  question?: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error' | 'json', details?: unknown) => void
): Promise<Map<string, string>> => {
  const results = new Map<string, string>();

  for (const photo of photos) {
    try {
      const explanation = await askWhyResult(photo, question, onLog);
      results.set(photo.fileName, explanation);
    } catch {
      results.set(photo.fileName, 'エラーが発生しました');
    }
  }

  return results;
};
