/**
 * CLI: フォルダ内の写真を解析してログを出力
 * Usage: npx tsx scripts/analyze-folder.ts <folder_path>
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { validateAgainstMaster, getMergedHierarchy } from '../utils/constructionMaster.js';

// ESM compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file if exists
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

// APIキーは環境変数または--key引数から取得
let API_KEY = process.env.GEMINI_API_KEY || '';
const keyArgIndex = process.argv.indexOf('--key');
if (keyArgIndex !== -1 && process.argv[keyArgIndex + 1]) {
  API_KEY = process.argv[keyArgIndex + 1];
}
const MODEL = 'gemini-2.0-flash-exp';

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
}

async function loadImage(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
}

async function analyzePhoto(genAI: GoogleGenAI, base64: string, fileName: string): Promise<AnalysisResult> {
  const hierarchy = getMergedHierarchy();

  const systemInstruction = `
You are a Japanese construction site supervisor creating a formal photo ledger (工事写真帳).
The hierarchy provided is a STRICT SUBSET of the MLIT standards.

**CRITICAL CONSTRAINT**:
You MUST NOT use any Work Types, Varieties, or Details that are not explicitly defined in the provided MASTER DATA JSON.

--- MASTER DATA HIERARCHY ---
${JSON.stringify(hierarchy, null, 2)}

--- HIERARCHY MAPPING RULES ---
*   **Level 1 (Root)**: Work Type (工種) -> Output to **'workType'**.
*   **Level 2**: Variety (種別) -> Output to **'variety'**.
*   **Level 3**: Detail (細別) -> Output to **'detail'**.
*   **Level 4 (Leaf)**: Remarks (備考) -> Output to **'remarks'**.

**OUTPUT FORMAT**: JSON only.
keys: workType, variety, detail, station, remarks, description, hasBoard, detectedText.
  `.trim();

  const schema = {
    type: Type.OBJECT,
    properties: {
      workType: { type: Type.STRING },
      variety: { type: Type.STRING },
      detail: { type: Type.STRING },
      station: { type: Type.STRING },
      remarks: { type: Type.STRING },
      description: { type: Type.STRING },
      hasBoard: { type: Type.BOOLEAN },
      detectedText: { type: Type.STRING }
    },
    required: ['workType', 'station', 'description']
  };

  const result = await genAI.models.generateContent({
    model: MODEL,
    contents: [{
      role: 'user',
      parts: [
        { text: `Analyze this construction photo: ${fileName}` },
        { inlineData: { mimeType: 'image/jpeg', data: base64 } }
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

  return {
    fileName,
    workType: parsed.workType || '',
    variety: parsed.variety || '',
    detail: parsed.detail || '',
    station: parsed.station || '',
    remarks: parsed.remarks || '',
    description: parsed.description || '',
    hasBoard: !!parsed.hasBoard,
    detectedText: parsed.detectedText || ''
  };
}

async function main() {
  const folderPath = process.argv[2];

  if (!folderPath) {
    console.error('Usage: npx tsx scripts/analyze-folder.ts <folder_path>');
    process.exit(1);
  }

  if (!API_KEY) {
    console.error('GEMINI_API_KEY environment variable is required');
    process.exit(1);
  }

  console.log(`\n=== Photo Analysis CLI ===`);
  console.log(`Folder: ${folderPath}`);
  console.log(`Model: ${MODEL}`);
  console.log(`API Key: ${API_KEY.slice(0, 8)}...`);
  console.log('');

  const genAI = new GoogleGenAI({ apiKey: API_KEY });

  // Get image files
  const files = fs.readdirSync(folderPath)
    .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
    .sort();

  console.log(`Found ${files.length} images\n`);

  const results: AnalysisResult[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(folderPath, file);

    console.log(`[${i + 1}/${files.length}] Analyzing: ${file}`);

    try {
      const base64 = await loadImage(filePath);
      const result = await analyzePhoto(genAI, base64, file);

      // Validate against master
      const { validatedWorkType, validatedVariety, validatedDetail, warnings: valWarnings } =
        validateAgainstMaster(result.workType, result.variety, result.detail, result.remarks);

      if (valWarnings.length > 0) {
        warnings.push(`${file}: ${valWarnings.join(', ')}`);
        console.log(`  ⚠️ MASTER警告: ${valWarnings.join(', ')}`);
      }

      // Apply validation
      result.workType = validatedWorkType;
      result.variety = validatedVariety;
      result.detail = validatedDetail;

      results.push(result);

      console.log(`  工種: ${result.workType || '(空白)'}`);
      console.log(`  種別: ${result.variety || '(空白)'}`);
      console.log(`  細別: ${result.detail || '(空白)'}`);
      console.log(`  備考: ${result.remarks}`);
      console.log(`  測点: ${result.station || '(なし)'}`);
      console.log(`  黒板: ${result.hasBoard ? 'あり' : 'なし'}`);
      console.log('');

      // Rate limit
      await new Promise(r => setTimeout(r, 500));
    } catch (err: any) {
      console.error(`  ❌ Error: ${err.message}`);
    }
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Total: ${files.length}, Analyzed: ${results.length}`);

  if (warnings.length > 0) {
    console.log(`\n⚠️ Master Warnings (${warnings.length}):`);
    warnings.forEach(w => console.log(`  - ${w}`));
  }

  // Group by workType
  const byWorkType: Record<string, number> = {};
  results.forEach(r => {
    const key = r.workType || '(空白)';
    byWorkType[key] = (byWorkType[key] || 0) + 1;
  });

  console.log('\n工種別集計:');
  Object.entries(byWorkType).forEach(([k, v]) => {
    console.log(`  ${k}: ${v}枚`);
  });

  // Export to JSON
  const outputPath = path.join(folderPath, 'analysis_result.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\nResults saved to: ${outputPath}`);
}

main().catch(console.error);
