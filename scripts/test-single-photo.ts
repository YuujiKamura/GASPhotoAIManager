/**
 * 単一写真解析テスト
 * Usage: GEMINI_API_KEY="your-key" npx tsx scripts/test-single-photo.ts <image_path>
 */

import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import { getSystemInstruction } from '../services/geminiService.js';
import { getMergedHierarchy } from '../utils/constructionMaster.js';

const API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL = 'gemini-2.0-flash';

async function analyzePhoto(imagePath: string) {
  if (!API_KEY) {
    console.error('❌ GEMINI_API_KEY が設定されていません');
    process.exit(1);
  }

  if (!fs.existsSync(imagePath)) {
    console.error(`❌ ファイルが見つかりません: ${imagePath}`);
    process.exit(1);
  }

  console.log('\n=== 単一写真解析テスト ===');
  console.log(`画像: ${imagePath}`);
  console.log(`モデル: ${MODEL}`);
  console.log('');

  const genAI = new GoogleGenAI({ apiKey: API_KEY });
  const hierarchy = getMergedHierarchy();
  const systemInstruction = getSystemInstruction('construction', undefined, hierarchy);

  // 画像読み込み
  const buffer = fs.readFileSync(imagePath);
  const base64 = buffer.toString('base64');
  const mimeType = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

  const schema = {
    type: Type.OBJECT,
    properties: {
      workType: { type: Type.STRING },
      variety: { type: Type.STRING },
      detail: { type: Type.STRING },
      station: { type: Type.STRING },
      remarksCategory: { type: Type.STRING },
      measurements: { type: Type.STRING },
      description: { type: Type.STRING },
      hasBoard: { type: Type.BOOLEAN },
      detectedText: { type: Type.STRING },
      reasoning: { type: Type.STRING }
    },
    required: ['workType', 'remarksCategory', 'description', 'reasoning']
  };

  try {
    console.log('🔍 解析中...\n');

    const result = await genAI.models.generateContent({
      model: MODEL,
      contents: [{
        role: 'user',
        parts: [
          { text: `Analyze this construction photo and provide your classification reasoning.` },
          { inlineData: { mimeType, data: base64 } }
        ]
      }],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: schema as any,
        temperature: 0.2
      }
    });

    const text = result.text || '{}';
    const parsed = JSON.parse(text);

    console.log('=== 解析結果 ===');
    console.log(`📁 工種: ${parsed.workType || '(空白)'}`);
    console.log(`📂 種別: ${parsed.variety || '(空白)'}`);
    console.log(`📄 細別: ${parsed.detail || '(空白)'}`);
    console.log(`📍 測点: ${parsed.station || '(なし)'}`);
    console.log(`📝 備考: ${parsed.remarksCategory || '(空白)'}`);
    console.log(`📊 測定値: ${parsed.measurements || '(なし)'}`);
    console.log(`📋 記事: ${parsed.description || '(空白)'}`);
    console.log(`🪧 黒板: ${parsed.hasBoard ? 'あり' : 'なし'}`);
    console.log('');
    console.log('=== 判断根拠 ===');
    console.log(parsed.reasoning || '(なし)');
    console.log('');
    console.log('=== OCR検出テキスト ===');
    console.log(parsed.detectedText || '(なし)');

    // 安全管理写真判定チェック
    const isSafetyPhoto =
      parsed.remarksCategory?.includes('朝礼') ||
      parsed.remarksCategory?.includes('KY') ||
      parsed.remarksCategory?.includes('安全') ||
      parsed.description?.includes('朝礼') ||
      parsed.description?.includes('ミーティング');

    console.log('\n=== 判定結果 ===');
    if (isSafetyPhoto) {
      console.log('✅ 安全管理写真として認識されました');
    } else {
      console.log('⚠️ 安全管理写真として認識されませんでした');
    }

    return parsed;
  } catch (err: any) {
    console.error(`❌ エラー: ${err.message}`);
    throw err;
  }
}

const imagePath = process.argv[2];
if (!imagePath) {
  console.error('Usage: GEMINI_API_KEY="your-key" npx tsx scripts/test-single-photo.ts <image_path>');
  process.exit(1);
}

analyzePhoto(imagePath).catch(console.error);
