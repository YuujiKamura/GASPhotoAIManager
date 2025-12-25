
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { getWorkHierarchy, formatHierarchyForPrompt } from '../utils/workHierarchy';
import { extractBase64Data } from '../utils/imageUtils';
import { getSystemInstruction as getSystemInstructionCommon } from '../utils/promptBuilder';
import { generatePDF } from '../scripts/analyze-cli'; 
import { PhotoRecord } from '../types';

// CLI用のAnalysisResult型（analyze-cli.tsと同じ）
interface AnalysisResult {
  fileName: string;
  workType: string;
  variety: string;
  detail: string;
  station: string;
  remarks: string;
  description: string;
  hasBoard: boolean;
  detectedText: string;
  magiVotes?: string[];
  magiConsensus?: string;
  widthVotes?: string[];
  widthConsensus?: string;
}

// .envの読み込み
dotenv.config();

async function main() {
  const folderPath = process.argv[2];
  if (!folderPath) {
    console.error("Usage: npx tsx scripts/partial-reanalyze.ts <folderPath>");
    process.exit(1);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY is not set.");
    process.exit(1);
  }

  console.log(`\n========================================`);
  console.log(`  Partial Re-analysis (Smart Update)`);
  console.log(`========================================\n`);

  // 1. 既存結果の読み込み
  const jsonPath = path.join(folderPath, 'analysis_results.json');
  if (!fs.existsSync(jsonPath)) {
    console.error("Error: analysis_results.json not found.");
    process.exit(1);
  }
  const currentResults: AnalysisResult[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log(`📋 Loaded ${currentResults.length} existing results.`);

  // 2. 再解析対象の特定（地先境界ブロックを含むもの）
  const targetFiles = currentResults
    .filter(r => r.detectedText && r.detectedText.includes('地先境界ブロック'))
    .map(r => r.fileName);

  if (targetFiles.length === 0) {
    console.log("✅ No files found containing '地先境界ブロック'. Nothing to do.");
    return;
  }

  console.log(`🎯 Found ${targetFiles.length} target files for re-analysis:`);
  targetFiles.forEach(f => console.log(`   - ${f}`));

  // 3. 画像データのロード（対象ファイルのみ）
  const imagesToAnalyze = targetFiles.map(fileName => {
    const filePath = path.join(folderPath, fileName);
    const stats = fs.statSync(filePath);
    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString('base64');
    const ext = path.extname(fileName).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
    return {
        fileName,
        base64: `data:${mimeType};base64,${base64}`,
        mimeType,
        fileSize: stats.size,
        lastModified: stats.mtimeMs
    };
  });

  // PhotoRecord形式に変換
  const photoRecords: PhotoRecord[] = imagesToAnalyze.map(img => ({
    fileName: img.fileName,
    base64: img.base64,
    mimeType: img.mimeType,
    fileSize: img.fileSize,
    lastModified: img.lastModified,
    status: 'pending',
    date: Date.now()
  }));

  // 4. AI解析の実行（対象のみ、カスタムロジック）
  console.log("🚀 Starting AI analysis for target files (Strict Unit-Price Mode)...");
  
  // 単価契約の階層を明示的にロード
  const hierarchy = await getWorkHierarchy('unit-price');
  const hierarchyPromptStr = JSON.stringify(formatHierarchyForPrompt(hierarchy), null, 2);
  console.log(`📋 Hierarchy loaded: ${hierarchyPromptStr.length} chars`);
  
  const genAI = new GoogleGenAI({ apiKey });
  
  // プロンプト構築
  const systemInstruction = getSystemInstructionCommon('construction', undefined, hierarchy, undefined);
  
  const inputs = photoRecords.map(r => ({
    inlineData: {
      data: extractBase64Data(r.base64),
      mimeType: r.mimeType
    }
  }));

  const prompt = `
    Analyze these ${photoRecords.length} photos.
    For each photo, output the JSON object matching the schema.
    Order must match the input order.
    
    Photo FileNames for reference:
    ${photoRecords.map(r => r.fileName).join(", ")}
  `;

  const schema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        fileName: { type: Type.STRING },
        workType: { type: Type.STRING },
        variety: { type: Type.STRING },
        detail: { type: Type.STRING },
        station: { type: Type.STRING },
        remarks: { type: Type.STRING },
        description: { type: Type.STRING },
        hasBoard: { type: Type.BOOLEAN },
        detectedText: { type: Type.STRING }
      },
      required: ["fileName", "workType", "station", "description"]
    }
  };

  const result = await genAI.models.generateContent({
    model: "gemini-2.5-flash", // Use fast model
    contents: [
      { role: 'user', parts: [...inputs, { text: prompt }] }
    ],
    config: {
      systemInstruction: systemInstruction,
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.1
    }
  });

  const newResultsPart: AnalysisResult[] = JSON.parse(result.text || "[]");
  
  console.log(`✅ Re-analysis complete. Received ${newResultsPart.length} results.`);

  // 5. 結果のマージ
  const newResultsMap = new Map(newResultsPart.map(r => [r.fileName, r]));
  
  const mergedResults = currentResults.map(oldResult => {
    if (newResultsMap.has(oldResult.fileName)) {
      const newResult = newResultsMap.get(oldResult.fileName)!;
      console.log(`   Updated: ${oldResult.fileName} -> ${newResult.workType} / ${newResult.variety} / ${newResult.detail} / ${newResult.remarks}`);
      return newResult;
    }
    return oldResult;
  });

  // 6. 保存
  fs.writeFileSync(jsonPath, JSON.stringify(mergedResults, null, 2), 'utf-8');
  console.log(`💾 Saved merged results to ${jsonPath}`);

  // 7. PDF生成
  console.log("📄 Regenerating PDF...");
  const allFiles = fs.readdirSync(folderPath).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
  const allImages = allFiles.map(fileName => {
      const filePath = path.join(folderPath, fileName);
      const buffer = fs.readFileSync(filePath);
      return {
          fileName,
          base64: buffer.toString('base64'), 
          mimeType: path.extname(fileName) === '.png' ? 'image/png' : 'image/jpeg'
      };
  });

  await generatePDF(mergedResults, allImages, folderPath, 14, 3);
  console.log("✅ PDF generation complete.");
}

main().catch(console.error);
