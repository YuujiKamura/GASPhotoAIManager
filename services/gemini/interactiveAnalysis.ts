/**
 * Gemini API - Interactive Analysis Module
 *
 * 対話型写真解析: 1枚の写真に対してAIと対話しながら解析結果を調整する
 * 通常解析と同じシステムプロンプト（階層マスタ、ルール設定、学習済みルール）を使用
 */

import { GoogleGenAI } from "@google/genai";
import { PhotoRecord, AIAnalysisResult } from "../../types";
import { extractBase64Data } from "../../utils/imageUtils";
import { sanitizeErrorMessage } from './apiKey';
import { getSelectedModel } from './models';
import { buildSystemPrompt } from './promptBuilder';

// ============================================
// 型定義
// ============================================

export interface InteractiveMessage {
  role: 'ai' | 'user' | 'system';
  content: string;
}

export interface InteractiveAnalysisResult {
  response: string;
  rawResponse: string;
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

【指示】
1. 黒板に書いてある文字を全て読み取ること（省略禁止）
2. 工種・種別・細別を階層マスタから正確に選択
3. 測点、備考、寸法も完全に転記
4. 解析結果をJSON形式で出力`,
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
    // === 共通モジュールでシステムプロンプトを構築 ===
    // 対話モード固有の追加ルール
    const interactiveRules = `
## 対話モード追加ルール
- 敬語は使わず、フランクに話す（「～だね」「～しよう」）
- 写真を解析したら所見を述べ、結果確認を促す
- **解析の透明性ルール**:
  - 「黒板から読み取った内容」と「写真から解釈した内容」を分けて述べる
  - 食い違いがある場合は明示し、どちらを採用したか理由を述べる

## 出力形式（JSON必須）
{
  "response": "ユーザーへの返答（所見を含む）",
  "analysis": {
    "fileName": "ファイル名",
    "workType": "工種（階層マスタから選択）",
    "variety": "種別（階層マスタから選択）",
    "detail": "細別（階層マスタから選択）",
    "station": "測点（黒板から読み取り。例: NO.5+10.00）",
    "remarks": "摘要/備考カテゴリ（黒板から完全転記）",
    "measurements": "寸法・規格（黒板から完全転記）",
    "description": "写真の説明（何が写っているか詳細に）",
    "hasBoard": true/false,
    "detectedText": "黒板から読み取った全テキスト（省略禁止）",
    "reasoning": "この判定を行った理由"
  }
}`;

    // 共通モジュールでシステムプロンプトを構築（工種フィルタ適用）
    const { systemPrompt: systemInstruction } = await buildSystemPrompt({
      appMode: 'construction',
      workType: photo.analysis?.workType,  // 既存解析結果から工種を取得してフィルタ
      additionalPrompt: interactiveRules,
    });

    const result = await genAI.models.generateContentStream({
      model: modelToUse,
      contents,
      config: {
        systemInstruction,
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
      // 配列の場合は最初の要素を使用
      if (Array.isArray(parsed)) {
        console.log('[InteractiveAnalysis] Response is array, using first element');
        parsed = parsed[0] || {};
      }
      // analysisがネストされてない場合（workTypeが直接ある場合）、analysisとしてラップ
      if (parsed.workType && !parsed.analysis) {
        console.log('[InteractiveAnalysis] Flat response format, wrapping as analysis');
        parsed = { analysis: parsed, response: '' };
      }
    } catch {
      // JSONパース失敗: テキストからJSON部分を抽出して再試行
      const jsonMatch = fullText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          // それでも失敗したら生レスポンスを返す
          return {
            response: fullText || '解析を実行中...',
            rawResponse: fullText || '',
            analysis: null,
          };
        }
      } else {
        return {
          response: fullText || '解析を実行中...',
          rawResponse: fullText || '',
          analysis: null,
        };
      }
    }

    const analysis: AIAnalysisResult | null = parsed.analysis
      ? {
          fileName: parsed.analysis.fileName || photo.fileName,
          workType: parsed.analysis.workType || '',
          variety: parsed.analysis.variety || '',
          detail: parsed.analysis.detail || '',
          station: parsed.analysis.station || '',
        photoCategory: parsed.analysis.photoCategory || parsed.analysis.remarksCategory || '',
        remarks: parsed.analysis.remarks || parsed.analysis.remarksCategory || '',
        remarksCategory: parsed.analysis.remarksCategory || parsed.analysis.remarks || '',
          description: parsed.analysis.description || '',
          measurements: parsed.analysis.measurements || '',
          hasBoard: !!parsed.analysis.hasBoard,
          detectedText: parsed.analysis.detectedText || '',
          reasoning: parsed.analysis.reasoning || '',
          changeLog: [],
        }
      : null;

    // responseが空の場合はデフォルトメッセージを生成
    let responseText = parsed.response || '';
    if (!responseText && analysis) {
      // 解析成功時: 結果を簡潔に表示
      responseText = `工種: ${analysis.workType}${analysis.variety ? ` > ${analysis.variety}` : ''}${analysis.detail ? ` > ${analysis.detail}` : ''}\n測点: ${analysis.station || '-'}\n\n内容を確認して、OKなら確定を押してね。`;
    } else if (!responseText) {
      // 何も返ってこなかった場合: 返ってきた内容をそのまま表示
      console.warn('[InteractiveAnalysis] Unexpected response structure:', JSON.stringify(parsed, null, 2));
      const keys = Object.keys(parsed);
      if (keys.length > 0) {
        responseText = `予期しないレスポンス形式です。\nキー: ${keys.join(', ')}\n\n生データは左パネルの「Gemini回答（生）」を確認してください。`;
      } else {
        responseText = '空のレスポンスが返されました。APIキーの設定を確認してください。';
      }
    }

    return {
      response: responseText,
      rawResponse: fullText,
      analysis,
    };
  } catch (error: any) {
    if (error.message?.includes('中断')) {
      throw error;
    }
    throw new Error(`対話型解析エラー: ${sanitizeErrorMessage(error.message || '', apiKey)}`);
  }
};
