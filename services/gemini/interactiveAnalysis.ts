/**
 * Gemini API - Interactive Analysis Module
 *
 * 対話型写真解析: 1枚の写真に対してAIと対話しながら解析結果を調整する
 */

import { GoogleGenAI } from "@google/genai";
import { PhotoRecord, AIAnalysisResult } from "../../types";
import { extractBase64Data } from "../../utils/imageUtils";
import { sanitizeErrorMessage } from './apiKey';
import { getSelectedModel } from './models';
import { INTERACTIVE_SYSTEM_PROMPT } from './systemPrompts';

// ============================================
// 型定義
// ============================================

export interface InteractiveMessage {
  role: 'ai' | 'user' | 'system';
  content: string;
}

export interface InteractiveAnalysisResult {
  response: string;
  analysis: AIAnalysisResult | null;
}

// ============================================
// 対話型写真解析
// ============================================

/**
 * 対話型写真解析
 * 1枚の写真に対してAIと対話しながら解析結果を調整する
 */
export const analyzePhotoInteractive = async (
  photo: PhotoRecord,
  conversationHistory: InteractiveMessage[],
  apiKey: string,
  onStream?: (text: string) => void,
  shouldAbort?: () => boolean
): Promise<InteractiveAnalysisResult> => {
  const genAI = new GoogleGenAI({ apiKey });
  const modelToUse = getSelectedModel();

  // 写真データを準備
  const base64Data = extractBase64Data(photo.base64);
  const imagePart = {
    inlineData: {
      mimeType: photo.mimeType,
      data: base64Data,
    },
  };

  // 会話履歴を構築
  const contents: any[] = [];

  // 最初の写真とリクエスト
  if (conversationHistory.length === 0) {
    // 初回解析
    contents.push({
      role: 'user',
      parts: [
        imagePart,
        {
          text: `この工事写真を解析してください。
ファイル名: ${photo.fileName}
${photo.analysis ? `現在の解析結果:\n工種: ${photo.analysis.workType}\n種別: ${photo.analysis.variety || ''}\n細別: ${photo.analysis.detail || ''}\n測点: ${photo.analysis.station}\n備考: ${photo.analysis.remarks}` : ''}

写真の内容を確認して、所見を述べてください。`,
        },
      ],
    });
  } else {
    // 継続対話
    contents.push({
      role: 'user',
      parts: [
        imagePart,
        { text: `ファイル名: ${photo.fileName}\n写真を解析してください。` },
      ],
    });

    // 会話履歴を追加
    for (const msg of conversationHistory) {
      const role = msg.role === 'ai' ? 'model' : 'user';
      contents.push({
        role,
        parts: [{ text: msg.content }],
      });
    }
  }

  try {
    const result = await genAI.models.generateContentStream({
      model: modelToUse,
      contents,
      config: {
        systemInstruction: INTERACTIVE_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    let fullText = '';
    for await (const chunk of result) {
      if (shouldAbort?.()) {
        throw new Error('処理が中断されました');
      }
      const chunkText = chunk.text;
      fullText += chunkText;
      onStream?.(fullText);
    }

    // JSONをパース
    let parsed: any;
    try {
      parsed = JSON.parse(fullText);
    } catch {
      // JSONが見つからない場合、テキストのみ返す
      return {
        response: fullText,
        analysis: null,
      };
    }

    const analysis: AIAnalysisResult | null = parsed.analysis
      ? {
          fileName: parsed.analysis.fileName || photo.fileName,
          workType: parsed.analysis.workType || '',
          variety: parsed.analysis.variety || '',
          detail: parsed.analysis.detail || '',
          station: parsed.analysis.station || '',
          remarks: parsed.analysis.remarks || '',
          remarksCategory: parsed.analysis.remarks || '',
          description: parsed.analysis.description || '',
          measurements: parsed.analysis.measurements || '',
          hasBoard: !!parsed.analysis.hasBoard,
          detectedText: parsed.analysis.detectedText || '',
          reasoning: parsed.analysis.reasoning || '',
          changeLog: [],
        }
      : null;

    return {
      response: parsed.response || '',
      analysis,
    };
  } catch (error: any) {
    if (error.message?.includes('中断')) {
      throw error;
    }
    throw new Error(`対話型解析エラー: ${sanitizeErrorMessage(error.message || '', apiKey)}`);
  }
};
