#!/usr/bin/env npx tsx
/**
 * CLI版 写真解析スクリプト
 * 使用法: npx tsx scripts/analyze-cli.ts <フォルダパス>
 * 出力: analysis_results.json + photo_ledger.pdf
 *
 * オプション:
 *   -i, --instruction "指示"  カスタム指示を追加
 *   --history                 実行履歴を表示
 *   --last                    最後に実行したフォルダで再実行
 *   --pdf-only                解析をスキップし、既存JSONからPDFのみ生成
 *   --font-size <数値>        PDFのテキストサイズ (デフォルト: 14)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GoogleGenAI, Type, Schema } from '@google/genai';
import puppeteer from 'puppeteer';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// History file path
const HISTORY_FILE = path.join(os.homedir(), '.analyze-cli-history.json');

interface HistoryEntry {
  folderPath: string;
  timestamp: string;
  imageCount: number;
  instruction?: string;
}

function loadHistory(): HistoryEntry[] {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return [];
}

function saveHistory(entry: HistoryEntry) {
  const history = loadHistory();
  // Remove duplicate paths and add new entry at the beginning
  const filtered = history.filter(h => h.folderPath !== entry.folderPath);
  filtered.unshift(entry);
  // Keep only last 50 entries
  const trimmed = filtered.slice(0, 50);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf-8');
}

function showHistory() {
  const history = loadHistory();
  if (history.length === 0) {
    console.log('履歴がありません');
    return;
  }

  console.log('\n========================================');
  console.log('  実行履歴 (最新50件)');
  console.log('========================================\n');

  history.forEach((entry, idx) => {
    const date = new Date(entry.timestamp).toLocaleString('ja-JP');
    console.log(`[${idx + 1}] ${date}`);
    console.log(`    ${entry.folderPath}`);
    console.log(`    画像数: ${entry.imageCount}枚${entry.instruction ? ` | 指示: "${entry.instruction}"` : ''}`);
    console.log('');
  });
}

function getLastFolder(): string | null {
  const history = loadHistory();
  return history.length > 0 ? history[0].folderPath : null;
}

import {
  formatHierarchyForPrompt,
  getSelectorPrompt,
  getHierarchySubset,
  getWorkTypes
} from '../utils/workHierarchy';
import { generatePDFHTML, PhotoData } from '../utils/pdfTemplate';

// Configuration
const PRIMARY_MODEL = 'gemini-2.5-flash';
const SELECTOR_MODEL = 'gemini-2.5-flash';
const MAGI_ROUNDS = 3; // MAGIシステム: 3回解析して合議

// Types
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
  magiVotes?: string[]; // MAGI投票結果（デバッグ用）
  magiConsensus?: string; // 合議結果
}

// Helper functions
function log(msg: string, type: 'info' | 'success' | 'error' = 'info') {
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : '📋';
  console.log(`${prefix} ${msg}`);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// MAGI System: 多数決で測点を決定
function magiVote(votes: string[]): { result: string; unanimous: boolean } {
  const counts = new Map<string, number>();
  for (const v of votes) {
    counts.set(v, (counts.get(v) || 0) + 1);
  }

  let maxCount = 0;
  let result = votes[0];
  for (const [value, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      result = value;
    }
  }

  return { result, unanimous: maxCount === votes.length };
}

async function loadImagesFromFolder(folderPath: string): Promise<{ fileName: string; base64: string; mimeType: string }[]> {
  const files = fs.readdirSync(folderPath)
    .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
    .sort();

  log(`Found ${files.length} images in ${folderPath}`);

  return files.map(fileName => {
    const filePath = path.join(folderPath, fileName);
    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString('base64');
    const ext = path.extname(fileName).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : 'image/jpeg';

    return { fileName, base64, mimeType };
  });
}

async function selectWorkTypes(
  images: { fileName: string; base64: string; mimeType: string }[],
  genAI: GoogleGenAI
): Promise<string[]> {
  const startTime = performance.now();

  // Sample 3 images
  const sampleIndices: number[] = [];
  if (images.length <= 3) {
    sampleIndices.push(...images.map((_, i) => i));
  } else {
    sampleIndices.push(0);
    sampleIndices.push(Math.floor(images.length / 2));
    sampleIndices.push(images.length - 1);
  }

  const samples = sampleIndices.map(i => images[i]);
  const inputs = samples.map(img => ({
    inlineData: {
      data: img.base64,
      mimeType: img.mimeType
    }
  }));

  const selectorPrompt = getSelectorPrompt();
  const availableWorkTypes = getWorkTypes();

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
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    });

    const text = result.text || '{}';
    const json = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
    const selectedTypes = (json.workTypes || []).filter((t: string) => availableWorkTypes.includes(t));

    const elapsed = performance.now() - startTime;
    log(`[SELECTOR] ${formatDuration(elapsed)}: Selected ${selectedTypes.length} work types: ${selectedTypes.join(', ')}`, 'success');

    if (selectedTypes.length === 0) {
      log('[SELECTOR] No work types selected, using all types', 'info');
      return availableWorkTypes;
    }

    return selectedTypes;
  } catch (e: any) {
    log(`[SELECTOR] Error: ${e.message}, falling back to all types`, 'error');
    return availableWorkTypes;
  }
}

function getSystemInstruction(hierarchy: object): string {
  return `
You are a Japanese construction site supervisor creating a formal photo ledger (工事写真台帳).
The hierarchy provided is a STRICT SUBSET of the MLIT (Ministry of Land, Infrastructure, Transport and Tourism) standards.

**CRITICAL CONSTRAINT**:
You MUST NOT use any Work Types, Varieties, or Details that are not explicitly defined in the provided MASTER DATA JSON.
Even if you recognize a standard MLIT term, if it is not in the JSON, do not use it. Map to the closest existing node.

--- MASTER DATA HIERARCHY ---
${JSON.stringify(hierarchy, null, 2)}

--- HIERARCHY MAPPING RULES (STRICT) ---
**Hierarchy Structure** (Simplified - No Photo Category Branching):
*   **Level 1 (Root)**: Work Type (工種) -> Output to **'workType'**.
*   **Level 2**: Variety (種別) -> Output to **'variety'**.
*   **Level 3**: Detail (細別) -> Output to **'detail'**.
*   **Level 4 (Leaf)**: Remarks (備考) -> Output to **'remarks'**.

Photo categories are determined automatically based on the remarks field.

--- STATION (測点) RULES ---
**測点欄には「地区名」または「横断測点名」を記入する:**
1. 測点欄に入れるのは「長嶺南6丁目」「NO.5」「STA.10+00」などの**地区名または横断測点名**
2. H1, H2, H3, L, CL, R, t などの**管理点記号は測点欄には入れない**（記事欄に書く）
3. 黒板に工事名や地区名が書かれていれば、そこから地区名を読み取る
4. 「全体」「概況」などの曖昧な表現は使わない

--- DESCRIPTION (記事) RULES ---
**記事欄の記入ルール:**
1. 一般的な説明文は不要
2. **単位は最初に1回だけ記載**: 「基準高下がり(単位:mm)」のように最初に単位を明記し、以降は数値のみ
3. **出来形測定（基準高下がり）の接写/ボードアップ写真**:
   - その写真で測定している**1つの管理点の値だけ**を記載
   - 例（H2を測定している写真）: 「基準高下がり(単位:mm)\\nH2:設計50/実測52」
4. **砕石厚測定の接写写真**:
   - 砕石厚の値を記載
   - 例: 「砕石厚(単位:mm)\\n設計30/実測30」
5. **全景写真**:
   - 全体の測定値をまとめて記載
   - 例: 「基準高下がり(単位:mm)\\nH1:設計50/実測50\\nH2:設計50/実測52\\nH3:設計50/実測52」
6. **黒板のみのボードアップ写真**:
   - 黒板に記載された全測定値を記載（全景と同様）
7. **重要**: 接写/測定写真では、その写真に対応する**1つの測定値だけ**を記載すること。複数の測定値を書かない

--- REMARKS (備考) RULES ---
**備考の判定ルール（重要）:**
黒板には「基準高下がり」と「砕石厚」の両方が記載されていることが多いが、**写真で何を測定しているか**で判断する:

1. **上層路盤工出来形測定**（デフォルト）:
   - 水糸（張られた糸）を使って基準高からの下がりを測定している
   - 尺（測定棒）を立てて水糸からの距離を測っている
   - 路盤の表面を測定している

2. **砕石厚測定**:
   - 路盤に穴を掘って、砕石層の厚さを測定している
   - 掘り返した穴の断面が見える
   - 黒板の砕石厚欄に実測値が書き込まれている写真

**判定のコツ**: 水糸が見える→基準高下がり、穴が掘られている→砕石厚

**OUTPUT FORMAT**:
JSON only.
keys: workType, variety, detail, station, remarks, description, hasBoard, detectedText.
`.trim();
}

async function analyzeImages(
  images: { fileName: string; base64: string; mimeType: string }[],
  hierarchy: object,
  genAI: GoogleGenAI,
  customInstruction?: string
): Promise<AnalysisResult[]> {
  const startTime = performance.now();

  const inputs = images.map(img => ({
    inlineData: {
      data: img.base64,
      mimeType: img.mimeType
    }
  }));

  const systemPrompt = getSystemInstruction(hierarchy);

  // Add custom instruction if provided
  const instructionSection = customInstruction
    ? `
--- USER INSTRUCTION (PRIORITY) ---
${customInstruction}

`
    : '';

  const prompt = `${instructionSection}Analyze these ${images.length} photos.
For each photo, output the JSON object matching the schema.
Order must match the input order.

Photo FileNames for reference:
${images.map(img => img.fileName).join(', ')}
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
      required: ['fileName', 'workType', 'station', 'description']
    }
  };

  const result = await genAI.models.generateContent({
    model: PRIMARY_MODEL,
    contents: [{ role: 'user', parts: [...inputs, { text: prompt }] }],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.1
    }
  });

  const text = result.text || '[]';
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\[.*\]/s);
    if (match) {
      parsed = JSON.parse(match[0]);
    } else {
      throw new Error('Invalid JSON response');
    }
  }

  if (!Array.isArray(parsed)) {
    parsed = [parsed];
  }

  const elapsed = performance.now() - startTime;
  log(`[ANALYZER] ${formatDuration(elapsed)}: Analyzed ${parsed.length} photos`, 'success');

  return parsed.map((item: any, idx: number) => ({
    fileName: item.fileName || images[idx].fileName,
    workType: item.workType || '',
    variety: item.variety || '',
    detail: item.detail || '',
    station: item.station || '',
    remarks: item.remarks || '',
    description: item.description || '',
    hasBoard: !!item.hasBoard,
    detectedText: item.detectedText || ''
  }));
}

// 出来形測定写真かどうかを判定（MAGIが必要な備考）
const MAGI_TARGET_REMARKS = ['上層路盤工出来形測定', '砕石厚測定'];

function needsMAGI(remarks: string): boolean {
  return MAGI_TARGET_REMARKS.some(target => remarks.includes(target) || remarks === target);
}

// MAGI System: 出来形測定写真のみを対象に管理点を3回合議で決定
async function magiAnalyzeStations(
  images: { fileName: string; base64: string; mimeType: string }[],
  initialResults: AnalysisResult[],
  hierarchy: object,
  genAI: GoogleGenAI
): Promise<AnalysisResult[]> {
  // 出来形測定写真のみをフィルタ
  const targetIndices: number[] = [];
  for (let idx = 0; idx < initialResults.length; idx++) {
    if (needsMAGI(initialResults[idx].remarks)) {
      targetIndices.push(idx);
    }
  }

  if (targetIndices.length === 0) {
    log(`[MAGI] スキップ: 出来形測定写真なし`, 'info');
    return initialResults;
  }

  log(`[MAGI] ${targetIndices.length}枚の出来形測定写真を合議制で解析中...`, 'info');

  // 対象画像のみを抽出
  const targetImages = targetIndices.map(idx => images[idx]);
  const allInputs = targetImages.map(img => ({
    inlineData: { data: img.base64, mimeType: img.mimeType }
  }));

  const baseSystemInstruction = getSystemInstruction(hierarchy);

  const magiTask = `
--- MAGI TASK (管理点特定) ---
以下の出来形測定写真群を分析し、各写真の種類と管理点を特定してください。

**入力画像** (${targetImages.length}枚、ファイル名順):
${targetImages.map(img => img.fileName).join(', ')}

**写真の種類**:
1. **全景**: 複数の作業員が写っている俯瞰的な写真 → managementPoint: null
2. **ボードアップ（黒板のみ）**: 黒板だけが写っている写真 → managementPoint: null
3. **ボードアップ（測定）**: 黒板と測定棒が近くに写っている写真
   - 水糸が見える → 基準高下がり測定 → managementPoint: H1/H2/H3
   - 穴が見える → 砕石厚測定 → managementPoint: t
4. **接写**: 測定部分のアップ
   - 穴が見える → 砕石厚測定 → managementPoint: t

**管理点の決定ルール**:
- **基準高下がり測定**: ボードアップ写真の撮影順序は **H2 → H1 → H3**
  - 黒板の図でL=H1, CL=H2, R=H3 の対応を確認
- **砕石厚測定**: 管理点は「t」（thickness）
- **全景・黒板のみ**: managementPoint は null

**全景と接写の対応を見分けるコツ**:
- 全景写真でしゃがんでいる作業員の**姿勢・服装・体格**を確認
- 接写写真に写っている作業員や背景と照合して位置を特定

**出力形式 (JSON)**:
{
  "analysis": [
    { "fileName": "RIMG9747.JPG", "photoType": "全景", "managementPoint": null },
    { "fileName": "RIMG9748.JPG", "photoType": "ボードアップ", "managementPoint": "H2", "measureType": "基準高下がり" }
  ]
}
`;

  // 3回独立して解析
  const allVotes: Map<string, string[]> = new Map();
  targetImages.forEach(img => allVotes.set(img.fileName, []));

  const startTime = performance.now();
  const magiNames = ['MELCHIOR', 'BALTHASAR', 'CASPER'];

  for (let round = 0; round < MAGI_ROUNDS; round++) {
    try {
      const result = await genAI.models.generateContent({
        model: PRIMARY_MODEL,
        contents: [{ role: 'user', parts: [...allInputs, { text: magiTask }] }],
        config: {
          systemInstruction: baseSystemInstruction,
          responseMimeType: 'application/json',
          temperature: 0.3 + (round * 0.1)
        }
      });

      const text = result.text || '{}';
      const json = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());

      if (json.analysis && Array.isArray(json.analysis)) {
        for (const item of json.analysis) {
          const votes = allVotes.get(item.fileName);
          if (votes && item.managementPoint) {
            votes.push(item.managementPoint);
            log(`  [${magiNames[round]}] ${item.fileName} -> ${item.managementPoint} (${item.measureType || item.photoType || ''})`, 'info');
          }
        }
      }
    } catch (e: any) {
      log(`  [${magiNames[round]}] Error: ${e.message}`, 'error');
    }
  }

  const elapsed = performance.now() - startTime;

  // 多数決で最終決定
  const results = [...initialResults];
  let consensusCount = 0;
  let splitCount = 0;

  for (const targetIdx of targetIndices) {
    const fileName = images[targetIdx].fileName;
    const votes = allVotes.get(fileName) || [];

    if (votes.length > 0) {
      const { result: managementPoint, unanimous } = magiVote(votes);

      // 記事欄を更新（管理点情報を先頭に追加、ただし重複は避ける）
      const originalDesc = results[targetIdx].description || '';
      let prefix: string;

      if (managementPoint === 't') {
        prefix = '砕石厚測定';
      } else {
        prefix = `${managementPoint}測定`;
      }

      // 既に同じプレフィックスがあれば追加しない
      const newDescription = originalDesc.startsWith(prefix)
        ? originalDesc
        : `${prefix}\n${originalDesc}`.trim();

      results[targetIdx] = {
        ...results[targetIdx],
        description: newDescription,
        magiVotes: votes,
        magiConsensus: unanimous ? '全会一致' : '多数決'
      };

      if (unanimous) {
        consensusCount++;
      } else {
        splitCount++;
      }
    }
  }

  log(`[MAGI] ${formatDuration(elapsed)}: 全会一致=${consensusCount}, 多数決=${splitCount}`, 'success');

  return results;
}

// VALIDATE_DESCRIPTION: 記事欄の測定値が写真に対応しているか確認・修正（出来形測定写真のみ）
async function validateDescriptions(
  images: { fileName: string; base64: string; mimeType: string }[],
  results: AnalysisResult[],
  hierarchy: object,
  genAI: GoogleGenAI
): Promise<AnalysisResult[]> {
  // 出来形測定写真のみをフィルタ
  const targetIndices: number[] = [];
  for (let idx = 0; idx < results.length; idx++) {
    if (needsMAGI(results[idx].remarks)) {
      targetIndices.push(idx);
    }
  }

  if (targetIndices.length === 0) {
    log(`[VALIDATE_DESC] スキップ: 出来形測定写真なし`, 'info');
    return results;
  }

  log(`[VALIDATE_DESC] ${targetIndices.length}枚の出来形測定写真の記事欄をチェック中...`, 'info');

  const startTime = performance.now();
  const baseSystemInstruction = getSystemInstruction(hierarchy);

  // 対象画像のみを抽出
  const targetImages = targetIndices.map(idx => images[idx]);
  const allInputs = targetImages.map(img => ({
    inlineData: { data: img.base64, mimeType: img.mimeType }
  }));

  const currentResults = targetIndices.map(idx => ({
    fileName: results[idx].fileName,
    remarks: results[idx].remarks,
    description: results[idx].description,
    magiVotes: results[idx].magiVotes
  }));

  const verifyTask = `
--- VERIFY TASK (記事欄の検証・修正) ---
以下の解析結果の記事欄(description)を検証し、必要に応じて修正してください。

**現在の解析結果**:
${JSON.stringify(currentResults, null, 2)}

**検証ルール**:
1. **接写/ボードアップ写真**: その写真で測定している**1つの管理点の値だけ**が記載されているか
   - magiVotesが[H2, H2]なら、H2の測定値だけが書かれているべき
   - magiVotesが[t, t]なら、砕石厚の測定値だけが書かれているべき
2. **全景/黒板のみ**: 全測定値がまとめて記載されているか
3. **単位の効率化**: 「基準高下がり(単位:mm)」のように最初に単位を書き、数値にはmmを付けない
4. **重複の削除**: 「H2測定\\nH2測定」のような重複を削除

**黒板から読み取れる測定値**（参考）:
- 基準高下がり: H1=設計50/実測50, H2=設計50/実測52, H3=設計50/実測52
- 砕石厚: 設計30/実測30

**出力形式 (JSON)**:
{
  "verified": [
    { "fileName": "RIMG9747.JPG", "description": "基準高下がり(単位:mm)\\nH1:設計50/実測50\\nH2:設計50/実測52\\nH3:設計50/実測52", "changed": false },
    { "fileName": "RIMG9748.JPG", "description": "基準高下がり(単位:mm)\\nH2:設計50/実測52", "changed": true, "reason": "H2の値のみに修正" },
    ...
  ]
}
`;

  try {
    const result = await genAI.models.generateContent({
      model: PRIMARY_MODEL,
      contents: [{ role: 'user', parts: [...allInputs, { text: verifyTask }] }],
      config: {
        systemInstruction: baseSystemInstruction,
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    });

    const text = result.text || '{}';
    const json = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());

    if (json.verified && Array.isArray(json.verified)) {
      const updatedResults = [...results];
      let changedCount = 0;

      for (const item of json.verified) {
        const idx = results.findIndex(r => r.fileName === item.fileName);
        if (idx !== -1 && item.description) {
          if (item.changed) {
            changedCount++;
            log(`  [VALIDATE_DESC] ${item.fileName}: ${item.reason || '修正'}`, 'info');
          }
          updatedResults[idx] = {
            ...updatedResults[idx],
            description: item.description
          };
        }
      }

      const elapsed = performance.now() - startTime;
      log(`[VALIDATE_DESC] ${formatDuration(elapsed)}: ${changedCount}件修正`, 'success');
      return updatedResults;
    }
  } catch (e: any) {
    log(`[VALIDATE_DESC] Error: ${e.message}`, 'error');
  }

  return results;
}

// VALIDATE_REMARKS: 備考がWORK_HIERARCHYに存在するかチェックし、存在しない場合は修正（全写真対象）
// また、detectedTextの内容と備考が整合しているかもチェック
async function validateRemarks(
  images: { fileName: string; base64: string; mimeType: string }[],
  results: AnalysisResult[],
  hierarchy: object,
  genAI: GoogleGenAI
): Promise<AnalysisResult[]> {
  // WORK_HIERARCHYから備考とエイリアスのマッピングを取得
  const { WORK_HIERARCHY } = await import('../utils/workHierarchy');

  // 無効な備考を持つ結果を特定（階層に存在しない、またはdetectedTextと不整合）
  const invalidResults: { idx: number; fileName: string; remarks: string; workType: string; variety: string; detail: string; detectedText: string; suggestedRemark?: string }[] = [];

  for (let idx = 0; idx < results.length; idx++) {
    const r = results[idx];
    const workNode = (hierarchy as any)[r.workType];
    if (!workNode) continue;

    const varietyNode = workNode[r.variety];
    if (!varietyNode) continue;

    const detailNode = varietyNode[r.detail];
    if (!detailNode) continue;

    // 備考がdetailNodeに存在するかチェック
    const validRemarks = Object.keys(detailNode);
    const isValidRemark = validRemarks.includes(r.remarks);

    // detectedTextに含まれるキーワードから適切な備考を推測
    let suggestedRemark: string | undefined;
    if (r.detectedText) {
      // WORK_HIERARCHYから元の定義を取得してエイリアスをチェック
      const hierarchyDetailNode = WORK_HIERARCHY[r.workType]?.[r.variety]?.[r.detail];
      if (hierarchyDetailNode?.remarks) {
        for (const [remarkName, remarkDef] of Object.entries(hierarchyDetailNode.remarks)) {
          const def = remarkDef as { categories: string[]; aliases?: string[] };
          // エイリアスがdetectedTextに含まれているかチェック
          if (def.aliases?.some(alias => r.detectedText.includes(alias))) {
            suggestedRemark = remarkName;
            break;
          }
        }
      }
    }

    // 備考が無効、または推測された備考と異なる場合
    if (!isValidRemark || (suggestedRemark && suggestedRemark !== r.remarks)) {
      invalidResults.push({
        idx,
        fileName: r.fileName,
        remarks: r.remarks,
        workType: r.workType,
        variety: r.variety,
        detail: r.detail,
        detectedText: r.detectedText || '',
        suggestedRemark
      });
    }
  }

  if (invalidResults.length === 0) {
    log(`[VALIDATE_REMARKS] 備考チェック完了: 全て有効`, 'success');
    return results;
  }

  log(`[VALIDATE_REMARKS] 不整合な備考 ${invalidResults.length}件を修正中...`, 'info');

  const startTime = performance.now();
  const updatedResults = [...results];
  let autoFixedCount = 0;

  // 1. まず、suggestedRemarkがある場合は自動修正（AI不要）
  const needsAI: typeof invalidResults = [];
  for (const ir of invalidResults) {
    if (ir.suggestedRemark) {
      updatedResults[ir.idx] = {
        ...updatedResults[ir.idx],
        remarks: ir.suggestedRemark
      };
      autoFixedCount++;
      log(`  [VALIDATE_REMARKS] ${ir.fileName}: 「${ir.remarks}」→「${ir.suggestedRemark}」(auto: alias match)`, 'info');
    } else {
      needsAI.push(ir);
    }
  }

  // 2. suggestedRemarkがない場合のみAIで判定
  if (needsAI.length === 0) {
    const elapsed = performance.now() - startTime;
    log(`[VALIDATE_REMARKS] ${formatDuration(elapsed)}: ${autoFixedCount}件自動修正`, 'success');
    return updatedResults;
  }

  log(`  [VALIDATE_REMARKS] AIで${needsAI.length}件を判定中...`, 'info');
  const baseSystemInstruction = getSystemInstruction(hierarchy);

  // 無効な備考を持つ画像だけを抽出
  const invalidImages = needsAI.map(ir => images[ir.idx]);
  const allInputs = invalidImages.map(img => ({
    inlineData: { data: img.base64, mimeType: img.mimeType }
  }));

  // 有効な備考リストを生成
  const validRemarksMap: Record<string, string[]> = {};
  for (const ir of needsAI) {
    const key = `${ir.workType}/${ir.variety}/${ir.detail}`;
    if (!validRemarksMap[key]) {
      const detailNode = (hierarchy as any)[ir.workType]?.[ir.variety]?.[ir.detail];
      validRemarksMap[key] = detailNode ? Object.keys(detailNode) : [];
    }
  }

  const validateTask = `
--- VALIDATE TASK (備考の修正) ---
以下の写真の備考(remarks)が不適切です。有効な備考に修正してください。

**修正対象**:
${needsAI.map(ir => `- ${ir.fileName}: 現在の備考「${ir.remarks}」、検出テキスト: "${ir.detectedText.substring(0, 100)}" → 有効な備考: [${validRemarksMap[`${ir.workType}/${ir.variety}/${ir.detail}`].join(', ')}]`).join('\n')}

**ルール**:
- 写真の内容と黒板のテキスト(detectedText)を確認し、最も適切な備考を選択
- 有効な備考リストの中から選ぶこと
- 特に温度に関する写真は「アスファルト合材温度管理」を選択

**出力形式 (JSON)**:
{
  "validated": [
    { "fileName": "RIMG9774.JPG", "remarks": "アスファルト合材温度管理", "reason": "開放温度測定は温度管理の一部" }
  ]
}
`;

  try {
    const result = await genAI.models.generateContent({
      model: PRIMARY_MODEL,
      contents: [{ role: 'user', parts: [...allInputs, { text: validateTask }] }],
      config: {
        systemInstruction: baseSystemInstruction,
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    });

    const text = result.text || '{}';
    const json = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());

    if (json.validated && Array.isArray(json.validated)) {
      let aiFixedCount = 0;

      for (const item of json.validated) {
        const ir = needsAI.find(i => i.fileName === item.fileName);
        if (ir && item.remarks) {
          updatedResults[ir.idx] = {
            ...updatedResults[ir.idx],
            remarks: item.remarks
          };
          aiFixedCount++;
          log(`  [VALIDATE_REMARKS] ${item.fileName}: 「${ir.remarks}」→「${item.remarks}」(AI: ${item.reason || ''})`, 'info');
        }
      }

      const elapsed = performance.now() - startTime;
      log(`[VALIDATE_REMARKS] ${formatDuration(elapsed)}: ${autoFixedCount}件自動修正 + ${aiFixedCount}件AI修正`, 'success');
      return updatedResults;
    }
  } catch (e: any) {
    log(`[VALIDATE_REMARKS] Error: ${e.message}`, 'error');
  }

  const elapsed = performance.now() - startTime;
  log(`[VALIDATE_REMARKS] ${formatDuration(elapsed)}: ${autoFixedCount}件自動修正`, 'success');
  return updatedResults;
}

// NORMALIZE: グルーピング＋最頻値で全体正規化
// 同一フォルダ内の写真は同じ工種・種別・細別・備考になる可能性が高いので、最頻値を適用
function normalizeByMajority(results: AnalysisResult[]): AnalysisResult[] {
  if (results.length === 0) return results;

  // 各フィールドの最頻値を計算
  const countMap = <T extends string>(arr: T[]): T | undefined => {
    const counts = new Map<T, number>();
    for (const v of arr) {
      if (v) counts.set(v, (counts.get(v) || 0) + 1);
    }
    let maxCount = 0;
    let maxValue: T | undefined;
    for (const [value, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        maxValue = value;
      }
    }
    return maxValue;
  };

  const majorityWorkType = countMap(results.map(r => r.workType));
  const majorityVariety = countMap(results.map(r => r.variety));
  const majorityDetail = countMap(results.map(r => r.detail));
  const majorityRemarks = countMap(results.map(r => r.remarks));

  log(`[NORMALIZE] 最頻値: 工種=${majorityWorkType}, 種別=${majorityVariety}, 細別=${majorityDetail}, 備考=${majorityRemarks}`, 'info');

  // 最頻値と異なる値を持つ結果を修正
  const updatedResults = [...results];
  let normalizedCount = 0;

  for (let idx = 0; idx < results.length; idx++) {
    const r = results[idx];
    let changed = false;
    const updates: Partial<AnalysisResult> = {};

    // 工種が最頻値と異なる場合
    if (majorityWorkType && r.workType !== majorityWorkType) {
      updates.workType = majorityWorkType;
      changed = true;
    }
    // 種別が最頻値と異なる場合
    if (majorityVariety && r.variety !== majorityVariety) {
      updates.variety = majorityVariety;
      changed = true;
    }
    // 細別が最頻値と異なる場合
    if (majorityDetail && r.detail !== majorityDetail) {
      updates.detail = majorityDetail;
      changed = true;
    }
    // 備考が最頻値と異なる場合
    if (majorityRemarks && r.remarks !== majorityRemarks) {
      updates.remarks = majorityRemarks;
      changed = true;
    }

    if (changed) {
      updatedResults[idx] = { ...r, ...updates };
      normalizedCount++;
      log(`  [NORMALIZE] ${r.fileName}: 最頻値に正規化`, 'info');
    }
  }

  if (normalizedCount > 0) {
    log(`[NORMALIZE] ${normalizedCount}件を最頻値に正規化`, 'success');
  } else {
    log(`[NORMALIZE] 正規化不要（全て一致）`, 'success');
  }

  return updatedResults;
}

// 温度管理写真の測点補完: detectedTextから日付と台数を抽出して測点欄に設定
// 地区名が入っている場合は上書きする（温度管理では日付+台数が優先）
function fillTemperatureStations(results: AnalysisResult[]): AnalysisResult[] {
  const updatedResults = [...results];

  // 温度管理写真のみフィルタ
  const tempPhotos = results.filter(r => r.remarks === 'アスファルト合材温度管理');
  if (tempPhotos.length === 0) {
    return results;
  }

  log(`[FILL_STATION] 温度管理写真 ${tempPhotos.length}枚の測点を補完中...`, 'info');

  // ボードアップ写真から日付と台数を抽出
  let extractedDate: string | null = null;
  let extractedDaisu: string | null = null;

  for (const r of tempPhotos) {
    if (!r.detectedText) continue;

    // 日付を抽出: "日 付:1/28" または "日付:1/28" → "1月28日"形式に変換
    if (!extractedDate) {
      const dateMatch = r.detectedText.match(/日\s*付[:：]\s*(\d{1,2})\/(\d{1,2})/);
      if (dateMatch) {
        extractedDate = `${dateMatch[1]}月${dateMatch[2]}日`;
      }
    }

    // 台数を抽出: "1台目" など（開放温度以外）
    if (!extractedDaisu && !r.detectedText.includes('開放温度')) {
      const daisuMatch = r.detectedText.match(/(\d+台目)/);
      if (daisuMatch) {
        extractedDaisu = daisuMatch[1];
      }
    }
  }

  if (!extractedDate) {
    log(`  [FILL_STATION] 日付を抽出できませんでした`, 'info');
    return results;
  }

  log(`  [FILL_STATION] 抽出: 日付=${extractedDate}, 台数=${extractedDaisu || 'なし'}`, 'info');

  // 測点欄を設定（温度管理写真は日付+台数で上書き）
  let filledCount = 0;
  for (let idx = 0; idx < results.length; idx++) {
    const r = results[idx];
    if (r.remarks !== 'アスファルト合材温度管理') continue;

    // 開放温度かどうかを判定（descriptionまたはdetectedTextで判定）
    const isKaihou = r.description?.includes('開放温度') || r.detectedText?.includes('開放温度');

    // 測点を設定（日付+台数で上書き）
    const newStation = isKaihou ? extractedDate : `${extractedDate} ${extractedDaisu || ''}`.trim();

    updatedResults[idx] = {
      ...updatedResults[idx],
      station: newStation
    };
    filledCount++;
  }

  log(`[FILL_STATION] ${filledCount}件の測点を設定`, 'success');
  return updatedResults;
}

// ファイル名生成: 工事写真帳_[内容]_[場所].pdf
function generateFilename(folderPath: string, results: AnalysisResult[]): string {
  const absPath = path.resolve(folderPath);
  const pathParts = absPath.split(path.sep);

  // 1. What (内容): 最後のフォルダ名
  const what = pathParts[pathParts.length - 1];

  // 2. Where (場所): 親フォルダ名（"工事写真"の親、または一つ上）
  let whereRaw = '';
  const kojiPhotoIndex = pathParts.findIndex(p => p === '工事写真');
  if (kojiPhotoIndex > 0) {
    whereRaw = pathParts[kojiPhotoIndex - 1];
  } else if (pathParts.length > 1) {
    whereRaw = pathParts[pathParts.length - 2];
  }

  // 日付プレフィックス削除 (例: "20251028長嶺南6丁目" -> "長嶺南6丁目")
  // 8桁の数字で始まる場合のみ削除
  const where = whereRaw.replace(/^\d{8}/, '');

  // ファイル名組み立て
  // サニタイズ: ファイル名に使えない文字を置換
  const safeWhat = what.replace(/[\\/:*?"<>|]/g, '_');
  const safeWhere = where.replace(/[\\/:*?"<>|]/g, '_');

  if (safeWhere) {
    return `工事写真帳_${safeWhat}_${safeWhere}.pdf`;
  } else {
    return `工事写真帳_${safeWhat}.pdf`;
  }
}

// PDF生成: 共通テンプレートを使用してPuppeteerでPDF化
async function generatePDF(
  results: AnalysisResult[],
  images: { fileName: string; base64: string; mimeType: string }[],
  folderPath: string,
  fontSize: number = 14
): Promise<string> {
  const startTime = performance.now();

  const photosPerPage = 3;
  const totalPages = Math.ceil(results.length / photosPerPage);

  // 共通テンプレート用にデータ変換
  const photoDataList: PhotoData[] = results.map(r => {
    const imageData = images.find(img => img.fileName === r.fileName);
    return {
      fileName: r.fileName,
      base64Src: imageData ? `data:${imageData.mimeType};base64,${imageData.base64}` : '',
      workType: r.workType,
      variety: r.variety,
      detail: r.detail,
      station: r.station,
      remarks: r.remarks,
      description: r.description
    };
  });

  // 共通テンプレートでHTML生成（fontSizeオプション付き）
  const html = generatePDFHTML(photoDataList, { photosPerPage, fontSize });

  // Puppeteerでヘッドレスブラウザを起動してPDF生成
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });

    const filename = generateFilename(folderPath, results);
    const pdfPath = path.join(folderPath, filename);
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true
    });

    const elapsed = performance.now() - startTime;
    log(`[PDF] ${formatDuration(elapsed)}: Generated ${totalPages} pages -> ${pdfPath}`, 'success');

    return pdfPath;
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = process.argv.slice(2);

  // Handle --history flag
  if (args.includes('--history')) {
    showHistory();
    process.exit(0);
  }

  // Parse arguments
  let folderPath = '';
  let customInstruction = '';
  let useLast = false;
  let pdfOnly = false;
  let fontSize = 14;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-i' || args[i] === '--instruction') {
      customInstruction = args[i + 1] || '';
      i++;
    } else if (args[i] === '--last') {
      useLast = true;
    } else if (args[i] === '--pdf-only') {
      pdfOnly = true;
    } else if (args[i] === '--font-size') {
      fontSize = parseInt(args[i + 1], 10) || 14;
      i++;
    } else if (!folderPath && !args[i].startsWith('-')) {
      folderPath = args[i];
    }
  }

  // Handle --last flag
  if (useLast) {
    const lastFolder = getLastFolder();
    if (!lastFolder) {
      log('履歴がありません。フォルダパスを指定してください。', 'error');
      process.exit(1);
    }
    folderPath = lastFolder;
    log(`最後に実行したフォルダを使用: ${folderPath}`, 'info');
  }

  if (!folderPath) {
    console.log('Usage: npx tsx scripts/analyze-cli.ts <folder-path> [-i "instruction"]');
    console.log('       npx tsx scripts/analyze-cli.ts --history       # 履歴を表示');
    console.log('       npx tsx scripts/analyze-cli.ts --last          # 最後のフォルダで再実行');
    console.log('       npx tsx scripts/analyze-cli.ts --pdf-only      # PDFのみ再生成（解析スキップ）');
    console.log('       npx tsx scripts/analyze-cli.ts --font-size 12  # テキストサイズ指定');
    console.log('');
    console.log('Example: npx tsx scripts/analyze-cli.ts "H:/マイドライブ/工事写真/路盤出来形"');
    console.log('Example with instruction:');
    console.log('  npx tsx scripts/analyze-cli.ts "path/to/photos" -i "測点の順序はH2,H1,H3"');
    console.log('Example PDF regeneration with smaller font:');
    console.log('  npx tsx scripts/analyze-cli.ts --last --pdf-only --font-size 12');
    process.exit(1);
  }

  if (!fs.existsSync(folderPath)) {
    log(`Folder not found: ${folderPath}`, 'error');
    process.exit(1);
  }

  console.log('\n========================================');
  console.log('  Construction Photo Analyzer (CLI)');
  console.log('========================================\n');

  // Load images
  const images = await loadImagesFromFolder(folderPath);
  if (images.length === 0) {
    log('No images found', 'error');
    process.exit(1);
  }

  let results: AnalysisResult[];

  // --pdf-only mode: JSONから読み込んでPDFのみ生成
  if (pdfOnly) {
    const jsonPath = path.join(folderPath, 'analysis_results.json');
    if (!fs.existsSync(jsonPath)) {
      log(`analysis_results.json not found. Run without --pdf-only first.`, 'error');
      process.exit(1);
    }
    results = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    log(`[PDF-ONLY] Loaded ${results.length} results from JSON`, 'info');
    log(`[PDF-ONLY] Font size: ${fontSize}px`, 'info');
  } else {
    // Full analysis mode
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      log('GEMINI_API_KEY not found in environment', 'error');
      process.exit(1);
    }

    const genAI = new GoogleGenAI({ apiKey });

    // Save to history
    saveHistory({
      folderPath: path.resolve(folderPath),
      timestamp: new Date().toISOString(),
      imageCount: images.length,
      instruction: customInstruction || undefined
    });

    // 2. Select work types (if >= 3 images)
    let hierarchy: object;
    if (images.length >= 3) {
      const selectedWorkTypes = await selectWorkTypes(images, genAI);
      hierarchy = getHierarchySubset(selectedWorkTypes);

      const fullSize = JSON.stringify(formatHierarchyForPrompt()).length;
      const filteredSize = JSON.stringify(hierarchy).length;
      log(`[PROFILER] Hierarchy: ${fullSize} -> ${filteredSize} chars (${((1 - filteredSize / fullSize) * 100).toFixed(1)}% reduction)`, 'info');
    } else {
      hierarchy = formatHierarchyForPrompt();
      log('[PROFILER] Using full hierarchy (batch < 3 images)', 'info');
    }

    // Show custom instruction if provided
    if (customInstruction) {
      log(`[INSTRUCTION] ${customInstruction}`, 'info');
    }

    // 3. Analyze images (initial)
    results = await analyzeImages(images, hierarchy, genAI, customInstruction);

    // 4. VALIDATE_REMARKS: 備考のバリデーション（全写真対象、aliasマッチ）
    results = await validateRemarks(images, results, hierarchy, genAI);

    // 5. NORMALIZE: グルーピング＋最頻値で全体正規化
    results = normalizeByMajority(results);

    // 6. MAGI: 出来形測定写真の管理点を合議制で解析（出来形測定のみ）
    results = await magiAnalyzeStations(images, results, hierarchy, genAI);

    // 7. VALIDATE_DESCRIPTION: 記事欄の整合性チェック・修正（出来形測定のみ）
    results = await validateDescriptions(images, results, hierarchy, genAI);

    // 8. FILL_STATION: 温度管理写真の測点補完
    results = fillTemperatureStations(results);

    // Output results to console
    console.log('\n========================================');
    console.log('  Analysis Results');
    console.log('========================================\n');

    for (const r of results) {
      console.log(`📷 ${r.fileName}`);
      console.log(`   工種: ${r.workType}`);
      console.log(`   種別: ${r.variety}`);
      console.log(`   細別: ${r.detail}`);
      console.log(`   備考: ${r.remarks}`);
      console.log(`   測点: ${r.station}`);
      if (r.magiVotes && r.magiVotes.length > 0) {
        const voteStr = r.magiVotes.join(', ');
        console.log(`   MAGI: [${voteStr}] -> ${r.magiConsensus}`);
      }
      if (r.hasBoard) {
        console.log(`   黒板: あり`);
        if (r.detectedText) console.log(`   検出テキスト: ${r.detectedText.substring(0, 100)}...`);
      }
      console.log('');
    }

    // Save results to JSON
    const outputPath = path.join(folderPath, 'analysis_results.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');
    log(`Results saved to: ${outputPath}`, 'success');
  }

  // Generate PDF (with fontSize option)
  const pdfPath = await generatePDF(results, images, folderPath, fontSize);
  log(`PDF saved to: ${pdfPath}`, 'success');
}

main().catch(e => {
  log(`Error: ${e.message}`, 'error');
  process.exit(1);
});
