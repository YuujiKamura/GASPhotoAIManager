
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { PhotoRecord, AIAnalysisResult, AppMode, LogEntry } from "../types";
import { extractBase64Data } from "../utils/imageUtils";
import { CONSTRUCTION_HIERARCHY } from "../utils/constructionMaster";

// Configuration
// QUALITY FIRST: Using high-performance models for accuracy
const PRIMARY_MODEL = "gemini-3-pro-preview";
const COMPLEX_MODEL = "gemini-3-pro-preview";
const FALLBACK_MODEL = "gemini-2.5-flash";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// Sleep helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getSystemInstruction = (appMode: AppMode, customInstruction?: string) => {
  if (appMode === 'general') {
    return `
You are a professional photo archivist. Analyze the image and provide structured metadata.
1. Category: Main subject (e.g., Landscape, Family, Work).
2. Sub-category: Specifics (e.g., Mountain, Birthday, Office).
3. Location: Inferred or read from text.
4. Description: A concise caption explaining the photo.
${customInstruction ? `\nUSER OVERRIDE INSTRUCTION: ${customInstruction}` : ""}
    `.trim();
  }

  // Construction Mode
  return `
You are a Japanese construction site supervisor creating a formal photo ledger (工事写真帳).
The hierarchy provided is a STRICT SUBSET of the MLIT (Ministry of Land, Infrastructure, Transport and Tourism) standards.

**CRITICAL CONSTRAINT**: 
You MUST NOT use any Work Types, Varieties, or Details that are not explicitly defined in the provided MASTER DATA JSON. 
Even if you recognize a standard MLIT term, if it is not in the JSON, do not use it. Map to the closest existing node.

--- MASTER DATA HIERARCHY ---
${JSON.stringify(CONSTRUCTION_HIERARCHY, null, 2)}

--- HIERARCHY MAPPING RULES (STRICT) ---
The hierarchy is defined by depth levels. You must traverse from the Root to the Leaf and map the keys to the specific columns below.

**Hierarchy Structure**:
*   **Level 1 (Root)**: Cost Item (費目) - e.g., "直接工事費".
*   **Level 2**: Photo Category (写真区分) - **BRANCHING POINT**.
*   **Level 3**: Work Type (工種) -> Output to **'workType'**.
*   **Level 4**: Variety (種別) -> Output to **'variety'**.
*   **Level 5**: Detail (細別) -> Output to **'detail'**.

**STEP 1: Select Level 2 (Photo Category) - PRIORITIZATION RULE**
You must FIRST check if the photo is a static "Before" or "Completion" scene (Landscape/Scenery).
Only classify as "Construction Status" if there is clear evidence of **ACTIVE WORK**.

1.  **"着手前及び完成写真"** (Before & Completion) [PRIORITY 1 - DEFAULT]:
    *   **Definition**: Static photos of the site condition.
    *   **Pre-Construction (着手前)**: Old asphalt, cracked pavement, raw earth, grass/weeds. The site is untouched before work begins.
    *   **Completion (完成/竣工)**: Brand new black asphalt, fresh concrete, clean white lines, swept/clean surface.
    *   **Key Feature**: NO active heavy machinery operating, NO workers performing tasks. 
    *   **Note**: The presence of a measuring pole/ribbon ALONE does NOT make it "Status". If nobody is holding it or working, it is likely "Before" or "Completion".

2.  **"施工状況写真"** (Construction Status) [PRIORITY 2 - REQUIRES ACTION]:
    *   **Definition**: Photos of the work in progress.
    *   **Visuals**: Heavy machinery (Excavators, Rollers) IN MOTION, dump trucks dumping, workers with shovels/rakes/tools actually working.
    *   **Midway States**: Piles of rubble, half-dug holes, measuring dimensions *during* the process (e.g., checking depth while digging).

3.  **"安全管理写真"**: Signs, cones, morning assembly.
4.  **"使用材料写真"**: Material checks.
5.  **"品質管理写真"**: Thermometers, density meters.
6.  **"出来形管理写真"**: Ribbons/Rulers measuring finished dimensions.

**STEP 2: Traverse & Map Columns**
Once Level 2 is selected, drill down strictly:
*   **workType**: The key at Level 3 (e.g., "舗装工").
*   **variety**: The key at Level 4 (e.g., "舗装打換え工").
*   **detail**: The key at Level 5 (e.g., "表層工").
    *   *Note*: If Level 5 is a Leaf (empty object) and looks like a status (e.g., "掘削状況"), leave 'detail' EMPTY and move that text to Remarks. 'Detail' is for structural components only.

**STEP 3: Remarks (備考) Logic**
*   **If Category is "着手前及び完成写真"**:
    *   **remarks** MUST be either "着手前" (Before) or "竣工" (Completion/Finished).
    *   Do NOT put "着手前" in the 'detail' or 'variety' columns.
*   **If Category is "施工状況写真"**:
    *   Use the Leaf Node Key (e.g., "転圧状況") as the remarks.
    *   Normalize text: "転圧中" -> "転圧状況".

**STEP 4: Description (記事)**
*   If the description would just repeat the remarks or work type, return an empty string "".
*   Only add text if it provides *unique* visual information (e.g., specific machinery names, weather conditions if relevant to quality).

**STEP 5: Station (測点)**
*   Extract "No.X+XX" exactly from the blackboard.

**OUTPUT FORMAT**:
JSON only.
keys: workType, variety, detail, station, remarks, description, hasBoard, detectedText.

${customInstruction ? `\nUSER OVERRIDE INSTRUCTION: ${customInstruction}` : ""}
  `.trim();
};

export const identifyTargetPhotos = async (
  photos: PhotoRecord[],
  instruction: string,
  apiKey: string
): Promise<string[]> => {
  const genAI = new GoogleGenAI({ apiKey });

  const photoSummaries = photos.map(p => ({
    fileName: p.fileName,
    currentAnalysis: p.analysis ? {
      workType: p.analysis.workType,
      remarks: p.analysis.remarks,
      description: p.analysis.description
    } : "Not analyzed"
  }));

  const prompt = `
    User Instruction: "${instruction}"
    
    Given the following list of photos and their current analysis, identify which fileNames should be re-analyzed to satisfy the instruction.
    Return a JSON object with a key "targetFiles" containing an array of strings (fileNames).
    
    Photos:
    ${JSON.stringify(photoSummaries, null, 2)}
  `;

  try {
    const result = await genAI.models.generateContent({
      model: PRIMARY_MODEL, // Use Pro for better logic interpretation
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json"
      }
    });

    const json = JSON.parse(result.text || "{}");
    return json.targetFiles || [];
  } catch (e) {
    console.error("Identify targets failed", e);
    return [];
  }
};

export const normalizeDataConsistency = async (
  records: PhotoRecord[],
  apiKey: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error' | 'json', details?: any) => void
): Promise<PhotoRecord[]> => {
  const completedRecords = records.filter(r => r.status === 'done' && r.analysis);
  if (completedRecords.length === 0) return records;

  const genAI = new GoogleGenAI({ apiKey });

  const dataSnapshot = completedRecords.map(r => ({
    fileName: r.fileName,
    workType: r.analysis!.workType,
    variety: r.analysis!.variety,
    detail: r.analysis!.detail,
    station: r.analysis!.station,
    remarks: r.analysis!.remarks
  }));

  onLog?.("Running consistency normalization pass with Gemini 3 Pro...", "info");

  const prompt = `
    You are a data consistency expert for construction photos.
    Review the following list of records.
    
    TASKS:
    1. **Normalize Station Names (測点)**: 
       - Fix OCR errors (e.g., "No.0+00" vs "No.0.00" -> unify to "No.X+XX").
       
    2. **Fix Hierarchy Errors**:
       - Ensure "Detail" (細別) is NOT a status verb (e.g. "完了", "状況", "確認", "掘削", "転圧").
       - If "Detail" looks like a status, move it to "Remarks" and clear "Detail".
       - Example: Detail="掘削状況" -> Change Detail="", Remarks="掘削状況".

    3. **Normalize Remarks**:
       - Ensure consistent terminology.
    
    INPUT DATA:
    ${JSON.stringify(dataSnapshot, null, 2)}
    
    OUTPUT:
    Return JSON: { "corrections": [ { "fileName": "...", "workType": "...", "variety": "...", "detail": "...", "station": "...", "remarks": "..." } ] }
    Only include records that need changing.
  `;

  let modelToUse = COMPLEX_MODEL;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      const result = await genAI.models.generateContent({
        model: modelToUse,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json"
        }
      });

      const text = result.text;
      if (!text) throw new Error("No text response");

      const json = JSON.parse(text);
      onLog?.("Normalization Result Received", "json", json);

      const corrections = json.corrections as { fileName: string, workType?: string, variety?: string, detail?: string, station: string, remarks: string }[];

      if (!corrections || corrections.length === 0) {
        onLog?.("No consistency corrections needed.", "success");
        return records;
      }

      // Apply corrections
      const updatedRecords = records.map(r => {
        const fix = corrections.find(c => c.fileName === r.fileName);
        if (fix && r.analysis) {
          return {
            ...r,
            analysis: {
              ...r.analysis,
              workType: fix.workType !== undefined ? fix.workType : r.analysis.workType,
              variety: fix.variety !== undefined ? fix.variety : r.analysis.variety,
              detail: fix.detail !== undefined ? fix.detail : r.analysis.detail,
              station: fix.station,
              remarks: fix.remarks
            }
          };
        }
        return r;
      });

      onLog?.(`Applied consistency corrections to ${corrections.length} records.`, "success");
      return updatedRecords;

    } catch (e: any) {
      attempt++;
      onLog?.(`Normalization Error (${modelToUse}) - ${attempt}/${MAX_RETRIES}`, "error", e.message);

      if (attempt < MAX_RETRIES) {
        modelToUse = PRIMARY_MODEL;
        await sleep(RETRY_DELAY_MS);
      } else {
        onLog?.("Normalization failed (Non-fatal)", "error");
        return records;
      }
    }
  }
  return records;
};

/**
 * NEW: Visual Anchoring & Clustering
 * Instead of opaque IDs, we generate specific descriptions of background anchors.
 */
/**
 * NEW: Visual Anchoring & Clustering
 * Optimized to use cache for visual feature extraction.
 */
export const assignSceneIds = async (
  records: PhotoRecord[],
  apiKey: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error' | 'json', details?: any) => void
): Promise<{ fileName: string, sceneId: string, phase: 'before' | 'after' | 'status', visualAnchors: string }[]> => {

  const genAI = new GoogleGenAI({ apiKey });

  // Step 1: Feature Extraction (Visual Anchors)
  // Only run for photos that don't have visualAnchors yet.
  const needsExtraction = records.filter(r => !r.analysis?.visualAnchors);
  const cachedFeatures = records.filter(r => r.analysis?.visualAnchors).map(r => ({
    fileName: r.fileName,
    visualAnchors: r.analysis!.visualAnchors!,
    phase: r.analysis!.phase || 'status'
  }));

  let newFeatures: { fileName: string, visualAnchors: string, phase: 'before' | 'after' | 'status' }[] = [];

  if (needsExtraction.length > 0) {
    onLog?.(`Extracting visual features for ${needsExtraction.length} new photos...`, 'info');

    // Process in batches of 5 to avoid payload limits
    const BATCH_SIZE = 5;
    for (let i = 0; i < needsExtraction.length; i += BATCH_SIZE) {
      const batch = needsExtraction.slice(i, i + BATCH_SIZE);

      const inputs = batch.map(r => ({
        fileName: r.fileName,
        image: {
          inlineData: {
            data: extractBase64Data(r.base64),
            mimeType: r.mimeType
          }
        }
      }));

      const promptParts: any[] = [];
      promptParts.push({
        text: `
        各写真の「背景の特徴(visualAnchors)」と「工事段階(phase)」を抽出してください。
        
        **タスク1: 背景の特徴 (visualAnchors)**
        - 場所を特定するための恒久的な特徴を記述（建物、電柱、山、道路形状など）。
        - 可変要素（車、人、天気）は除外。
        - 簡潔に（例：「左に白い家、奥に赤い看板」）。

        **タスク2: 工事段階 (phase)**
        - "before": 着手前（未舗装、古い舗装、雑草）
        - "after": 完了後（新しいアスファルト、きれいな白線）
        - "status": 施工中（重機、作業員、掘削中）

        **出力形式**:
        {
          "features": [
            { "fileName": "...", "visualAnchors": "...", "phase": "..." }
          ]
        }
      `});

      inputs.forEach(input => {
        promptParts.push(input.image);
        promptParts.push({ text: `[${input.fileName}]\n` });
      });

      try {
        const result = await genAI.models.generateContent({
          model: COMPLEX_MODEL,
          contents: [{ role: 'user', parts: promptParts }],
          config: { responseMimeType: "application/json" }
        });

        const text = result.text || "{}";
        const json = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
        if (json.features) {
          newFeatures = [...newFeatures, ...json.features];
        }
      } catch (e: any) {
        onLog?.(`Feature extraction failed for batch ${i}`, 'error', e.message);
      }
    }
  } else {
    onLog?.("Using cached visual features for all photos.", 'success');
  }

  const allFeatures = [...cachedFeatures, ...newFeatures];

  // Step 2: Clustering (Text-only)
  // Group photos based on visualAnchors descriptions.
  if (allFeatures.length === 0) return [];

  onLog?.(`Clustering ${allFeatures.length} photos based on visual anchors...`, 'info');

  const clusteringPrompt = `
    以下の写真リストを、背景の特徴(visualAnchors)に基づいて撮影場所ごとにグループ化してください。
    
    **ルール**:
    - 特徴が似ている写真は同じ場所(sceneId)とする。
    - sceneIdは "S1", "S2" のように連番を振る。
    - phase (before/after/status) は入力値をそのまま保持する。

    **入力データ**:
    ${JSON.stringify(allFeatures, null, 2)}

    **出力形式**:
    {
      "assignments": [
        { "fileName": "...", "sceneId": "...", "phase": "...", "visualAnchors": "..." }
      ]
    }
  `;

  try {
    const result = await genAI.models.generateContent({
      model: PRIMARY_MODEL, // Text-only is fast and cheap
      contents: [{ role: 'user', parts: [{ text: clusteringPrompt }] }],
      config: { responseMimeType: "application/json" }
    });

    const text = result.text || "{}";
    const json = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
    return json.assignments || [];

  } catch (e: any) {
    onLog?.("Clustering failed.", 'error', e.message);
    // Fallback: Return features as is with unique IDs
    return allFeatures.map((f, i) => ({
      fileName: f.fileName,
      visualAnchors: f.visualAnchors,
      phase: (f.phase === 'unknown' ? 'status' : f.phase) as 'before' | 'after' | 'status',
      sceneId: `S${i}`
    }));
  }
};

// Deprecated old sorting function, kept as stub if needed or removed
export const sortPhotosByScene = async () => [];

export const refinePairContext = async (
  sortedRecords: PhotoRecord[],
  apiKey: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error' | 'json', details?: any) => void
): Promise<PhotoRecord[]> => {
  // Logic remains similar but now relies on Scene IDs if available
  // For now, we trust the "Phase" from assignSceneIds more.
  return sortedRecords;
};

export const analyzePhotoBatch = async (
  records: PhotoRecord[],
  instruction: string,
  batchSize: number,
  appMode: AppMode,
  apiKey: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error' | 'json', details?: any) => void
): Promise<AIAnalysisResult[]> => {
  const genAI = new GoogleGenAI({ apiKey });

  const inputs = records.map(r => ({
    inlineData: {
      data: extractBase64Data(r.base64),
      mimeType: r.mimeType
    }
  }));

  const systemPrompt = getSystemInstruction(appMode, instruction);

  const prompt = `
    Analyze these ${records.length} photos.
    For each photo, output the JSON object matching the schema.
    Order must match the input order.
    
    Photo FileNames for reference:
    ${records.map(r => r.fileName).join(", ")}
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

  let attempt = 0;
  let modelToUse = PRIMARY_MODEL;

  while (attempt < MAX_RETRIES) {
    try {
      const result = await genAI.models.generateContent({
        model: modelToUse,
        contents: [
          { role: 'user', parts: [...inputs, { text: prompt }] }
        ],
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.1
        }
      });

      const responseText = result.text;
      if (!responseText) throw new Error("Empty response");

      onLog?.(`API Success with ${modelToUse}`, "info");
      const parsed = JSON.parse(responseText) as AIAnalysisResult[];

      const finalResults = parsed.map((res, idx) => {
        const targetRecord = records[idx];
        return { ...res, fileName: targetRecord.fileName };
      });

      return finalResults;

    } catch (error: any) {
      attempt++;
      const isQuotaError = error.message?.includes("429") || error.status === 429 || error.status === 503;

      onLog?.(`API Error (${modelToUse}) - Attempt ${attempt}/${MAX_RETRIES}`, "error", { message: error.message });

      if (attempt >= MAX_RETRIES) {
        throw error;
      }

      if (isQuotaError) {
        if (modelToUse === PRIMARY_MODEL) {
          modelToUse = FALLBACK_MODEL;
          onLog?.(`Rate Limit hit. Switching to Fallback Model: ${FALLBACK_MODEL}`, "info");
          await sleep(RETRY_DELAY_MS);
        } else {
          await sleep(RETRY_DELAY_MS * 2);
        }
      } else {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw new Error("Max retries exceeded");
};
