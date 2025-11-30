
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

// Profiler helper
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

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
You are a Japanese construction site supervisor creating a formal photo ledger (蟾･莠句・逵溷ｸｳ).
The hierarchy provided is a STRICT SUBSET of the MLIT (Ministry of Land, Infrastructure, Transport and Tourism) standards.

**CRITICAL CONSTRAINT**: 
You MUST NOT use any Work Types, Varieties, or Details that are not explicitly defined in the provided MASTER DATA JSON. 
Even if you recognize a standard MLIT term, if it is not in the JSON, do not use it. Map to the closest existing node.

--- MASTER DATA HIERARCHY ---
${JSON.stringify(CONSTRUCTION_HIERARCHY, null, 2)}

--- HIERARCHY MAPPING RULES (STRICT) ---
The hierarchy is defined by depth levels. You must traverse from the Root to the Leaf and map the keys to the specific columns below.

**Hierarchy Structure**:
*   **Level 1 (Root)**: Cost Item (雋ｻ逶ｮ) - e.g., "逶ｴ謗･蟾･莠玖ｲｻ".
*   **Level 2**: Photo Category (蜀咏悄蛹ｺ蛻・ - **BRANCHING POINT**.
*   **Level 3**: Work Type (蟾･遞ｮ) -> Output to **'workType'**.
*   **Level 4**: Variety (遞ｮ蛻･) -> Output to **'variety'**.
*   **Level 5**: Detail (邏ｰ蛻･) -> Output to **'detail'**.

**STEP 1: Select Level 2 (Photo Category) - PRIORITIZATION RULE**
You must FIRST check if the photo is a static "Before" or "Completion" scene (Landscape/Scenery).
Only classify as "Construction Status" if there is clear evidence of **ACTIVE WORK**.

1.  **"逹謇句燕蜿翫・螳梧・蜀咏悄"** (Before & Completion) [PRIORITY 1 - DEFAULT]:
    *   **Definition**: Static photos of the site condition.
    *   **Pre-Construction (逹謇句燕)**: Old asphalt, cracked pavement, raw earth, grass/weeds. The site is untouched before work begins.
    *   **Completion (螳梧・/遶｣蟾･)**: Brand new black asphalt, fresh concrete, clean white lines, swept/clean surface.
    *   **Key Feature**: NO active heavy machinery operating, NO workers performing tasks. 
    *   **Note**: The presence of a measuring pole/ribbon ALONE does NOT make it "Status". If nobody is holding it or working, it is likely "Before" or "Completion".

2.  **"譁ｽ蟾･迥ｶ豕∝・逵・** (Construction Status) [PRIORITY 2 - REQUIRES ACTION]:
    *   **Definition**: Photos of the work in progress.
    *   **Visuals**: Heavy machinery (Excavators, Rollers) IN MOTION, dump trucks dumping, workers with shovels/rakes/tools actually working.
    *   **Midway States**: Piles of rubble, half-dug holes, measuring dimensions *during* the process (e.g., checking depth while digging).
    *   **CRITICAL DISTINCTION - SPRAYING**:
        *   **Emulsion Spraying (荵ｳ蜑､謨｣蟶・**: Worker holding a **THIN NOZZLE/HOSE** connected to a tank/truck. Liquid spray.
        *   **Curing Sand Spraying (鬢顔函遐よ淵蟶・**: Worker using a **SHOVEL** or **BROAD SPREADER**. Sand cannot be sprayed from a thin nozzle.
        *   *Note*: Do NOT rely solely on surface color (black vs gray) as both can look similar. Look at the **EQUIPMENT**.

3.  **"螳牙・邂｡逅・・逵・**: Signs, cones, morning assembly.
4.  **"菴ｿ逕ｨ譚先侭蜀咏悄"**: Material checks.
5.  **"蜩∬ｳｪ邂｡逅・・逵・**: Thermometers, density meters.
6.  **"蜃ｺ譚･蠖｢邂｡逅・・逵・**: Ribbons/Rulers measuring finished dimensions.

**STEP 2: Traverse & Map Columns**
Once Level 2 is selected, drill down strictly:
*   **workType**: The key at Level 3 (e.g., "闊苓｣・ｷ･").
*   **variety**: The key at Level 4 (e.g., "闊苓｣・遠謠帙∴蟾･").
*   **detail**: The key at Level 5 (e.g., "陦ｨ螻､蟾･").
    *   *Note*: If Level 5 is a Leaf (empty object) and looks like a status (e.g., "謗伜炎迥ｶ豕・), leave 'detail' EMPTY and move that text to Remarks. 'Detail' is for structural components only.

**STEP 3: Remarks (蛯呵・ Logic**
*   **If Category is "逹謇句燕蜿翫・螳梧・蜀咏悄"**:
    *   **remarks** MUST be either "逹謇句燕" (Before) or "遶｣蟾･" (Completion/Finished).
    *   Do NOT put "逹謇句燕" in the 'detail' or 'variety' columns.
*   **If Category is "譁ｽ蟾･迥ｶ豕∝・逵・**:
    *   Use the Leaf Node Key (e.g., "霆｢蝨ｧ迥ｶ豕・) as the remarks.
    *   Normalize text: "霆｢蝨ｧ荳ｭ" -> "霆｢蝨ｧ迥ｶ豕・.

**STEP 4: Description (險倅ｺ・**
*   If the description would just repeat the remarks or work type, return an empty string "".
*   Only add text if it provides *unique* visual information (e.g., specific machinery names, weather conditions if relevant to quality).

**STEP 5: Station (貂ｬ轤ｹ)**
*   There are two types of station formats:
    1. **Location-based (preferred)**: Location names such as "蟆丞ｱｱ逕ｺ1359莉倩ｿ・, "縲・・ｺ､蟾ｮ轤ｹ莉倩ｿ・, etc.
    2. **Route-based**: Pinpoint markers like "No.0+50", "No.1+23.5", etc.
*   If a location name is visible or can be inferred from the blackboard/surroundings, use that as the station.
*   If only the "No.X+XX" format is visible, extract it exactly.
*   If the station cannot be determined, return an empty string "" (NOT "null", "荳肴・", "unknown", etc.).

**OUTPUT FORMAT**:
JSON only.
keys: workType, variety, detail, station, remarks, description, hasBoard, detectedText.

${customInstruction ? `\nUSER OVERRIDE INSTRUCTION: ${customInstruction}` : ""}
  `.trim();
};

export const identifyTargetPhotos = async (
  photos: PhotoRecord[],
  instruction: string,
  apiKey: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error' | 'json', details?: any) => void
): Promise<string[]> => {
  const startTime = performance.now();
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
    const totalTime = performance.now() - startTime;
    onLog?.(`[PROFILER] identifyTargetPhotos: Total=${formatDuration(totalTime)}, Found ${json.targetFiles?.length || 0} targets`, "info");
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
    1. **Normalize Station Names (貂ｬ轤ｹ)**: 
       - Fix OCR errors (e.g., "No.0+00" vs "No.0.00" -> unify to "No.X+XX").
       
    2. **Fix Hierarchy Errors**:
       - Ensure "Detail" (邏ｰ蛻･) is NOT a status verb (e.g. "螳御ｺ・, "迥ｶ豕・, "遒ｺ隱・, "謗伜炎", "霆｢蝨ｧ").
       - If "Detail" looks like a status, move it to "Remarks" and clear "Detail".
       - Example: Detail="謗伜炎迥ｶ豕・ -> Change Detail="", Remarks="謗伜炎迥ｶ豕・.

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
        蜷・・逵溘・縲瑚レ譎ｯ縺ｮ迚ｹ蠕ｴ(visualAnchors)縲阪→縲悟ｷ･莠区ｮｵ髫・phase)縲阪ｒ謚ｽ蜃ｺ縺励※縺上□縺輔＞縲・        
        **繧ｿ繧ｹ繧ｯ1: 閭梧勹縺ｮ迚ｹ蠕ｴ (visualAnchors)**
        - 蝣ｴ謇繧堤音螳壹☆繧九◆繧√・諱剃ｹ・噪縺ｪ迚ｹ蠕ｴ繧定ｨ倩ｿｰ・亥ｻｺ迚ｩ縲・崕譟ｱ縲∝ｱｱ縲・％霍ｯ蠖｢迥ｶ縺ｪ縺ｩ・峨・        - 蜿ｯ螟芽ｦ∫ｴ・郁ｻ翫∽ｺｺ縲∝､ｩ豌暦ｼ峨・髯､螟悶・        - 邁｡貎斐↓・井ｾ具ｼ壹悟ｷｦ縺ｫ逋ｽ縺・ｮｶ縲∝･･縺ｫ襍､縺・恚譚ｿ縲搾ｼ峨・
        **繧ｿ繧ｹ繧ｯ2: 蟾･莠区ｮｵ髫・(phase)**
        - "before": 逹謇句燕・域悴闊苓｣・∝商縺・・陬・・尅闕会ｼ・        - "after": 螳御ｺ・ｾ鯉ｼ域眠縺励＞繧｢繧ｹ繝輔ぃ繝ｫ繝医√″繧後＞縺ｪ逋ｽ邱夲ｼ・        - "status": 譁ｽ蟾･荳ｭ・磯㍾讖溘∽ｽ懈･ｭ蜩｡縲∵侍蜑贋ｸｭ・・
        **蜃ｺ蜉帛ｽ｢蠑・*:
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
    莉･荳九・蜀咏悄繝ｪ繧ｹ繝医ｒ縲∬レ譎ｯ縺ｮ迚ｹ蠕ｴ(visualAnchors)縺ｫ蝓ｺ縺･縺・※謦ｮ蠖ｱ蝣ｴ謇縺斐→縺ｫ繧ｰ繝ｫ繝ｼ繝怜喧縺励※縺上□縺輔＞縲・    
    **繝ｫ繝ｼ繝ｫ**:
    - 迚ｹ蠕ｴ縺御ｼｼ縺ｦ縺・ｋ蜀咏悄縺ｯ蜷後§蝣ｴ謇(sceneId)縺ｨ縺吶ｋ縲・    - sceneId縺ｯ "S1", "S2" 縺ｮ繧医≧縺ｫ騾｣逡ｪ繧呈険繧九・    - phase (before/after/status) 縺ｯ蜈･蜉帛､繧偵◎縺ｮ縺ｾ縺ｾ菫晄戟縺吶ｋ縲・
    **蜈･蜉帙ョ繝ｼ繧ｿ**:
    ${JSON.stringify(allFeatures, null, 2)}

    **蜃ｺ蜉帛ｽ｢蠑・*:
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
  onLog?: (msg: string, type: 'info' | 'success' | 'error' | 'json', details?: any) => void,
  onIndividualResult?: (fileName: string, result: AIAnalysisResult) => void,
  shouldAbort?: () => boolean,
  onReasoningStream?: (text: string) => void
): Promise<AIAnalysisResult[]> => {
  const batchStartTime = performance.now();
  const genAI = new GoogleGenAI({ apiKey });

  onLog?.(`[PROFILER] Batch start: ${records.length} photos, model=${PRIMARY_MODEL}`, "info");

  const prepStartTime = performance.now();
  const inputs = records.map(r => ({
    inlineData: {
      data: extractBase64Data(r.base64),
      mimeType: r.mimeType
    }
  }));
  const prepTime = performance.now() - prepStartTime;
  onLog?.(`[PROFILER] Image prep: ${formatDuration(prepTime)}`, "info");

  const systemPrompt = getSystemInstruction(appMode, instruction);

  // Context relay: Build context hint from previously analyzed photos in this batch
  let contextHint = "";
  const previousResults: AIAnalysisResult[] = [];

  // We'll update this as we process, for now initialize empty

  const prompt = `
    Analyze these ${records.length} photos.
    For each photo, output the JSON object matching the schema.
    Order must match the input order.
    
    **CONTEXT RELAY**: If you cannot clearly determine the station (貂ｬ轤ｹ) or variety (遞ｮ蛻･) from a photo, 
    but the previous photo had these values and the current photo appears to be from the same location/work type,
    you may inherit those values. However, always prioritize explicit information visible in the current photo.
    
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
    // Check if analysis should be aborted
    if (shouldAbort?.()) {
      onLog?.("Analysis aborted by user", "info");
      throw new Error("Analysis aborted by user");
    }

    try {
      // Use streaming to capture "reasoning" or partial output if possible
      // But for JSON mode, standard generation is safer. 
      // However, to get "reasoning", we need to ask for it in the prompt and parse it.
      // We will switch to generateContentStream to capture text as it comes in.

      const apiStartTime = performance.now();
      let firstChunkTime: number | null = null;

      const result = await genAI.models.generateContentStream({
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

      let fullText = "";
      let chunkCount = 0;
      for await (const chunk of result) {
        if (firstChunkTime === null) {
          firstChunkTime = performance.now() - apiStartTime;
          onLog?.(`[PROFILER] Time to first chunk: ${formatDuration(firstChunkTime)}`, "info");
        }
        chunkCount++;
        const chunkText = chunk.text;
        fullText += chunkText;

        // Try to extract "reasoning" from the partial JSON if it exists
        if (onReasoningStream) {
          // Look for "reasoning": "..." pattern
          const match = fullText.match(/"reasoning"\s*:\s*"([^"]*)/);
          if (match && match[1]) {
            onReasoningStream(match[1]);
          }
        }
      }

      const apiTime = performance.now() - apiStartTime;
      onLog?.(`[PROFILER] API stream complete: ${formatDuration(apiTime)} (${chunkCount} chunks, ${fullText.length} chars)`, "info");

      const text = fullText;

      onLog?.("Gemini Raw Response", 'json', text);

      const parseStartTime = performance.now();
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        // Fallback: try to find JSON array in text
        const match = text.match(/\[.*\]/s);
        if (match) {
          parsed = JSON.parse(match[0]);
        } else {
          throw new Error("Invalid JSON response from AI");
        }
      }

      const parseTime = performance.now() - parseStartTime;

      if (!Array.isArray(parsed)) {
        // If single object, wrap in array
        parsed = [parsed];
      }

      // Validate against schema-ish
      const validResults: AIAnalysisResult[] = parsed.map((item: any) => ({
        fileName: item.fileName || "unknown",
        workType: item.workType || "",
        variety: item.variety || "",
        detail: item.detail || "",
        station: item.station || "",
        remarks: item.remarks || "",
        description: item.description || "",
        hasBoard: !!item.hasBoard,
        detectedText: item.detectedText || "",
        reasoning: item.reasoning || "" // Capture reasoning
      }));

      // Log individual results
      validResults.forEach(res => {
        onIndividualResult?.(res.fileName, res);
      });

      // Apply context relay: inherit station, variety, and workType from previous photos
      // This ensures continuity across sequential photos (e.g., 譛ｪ闊苓｣・Κ闊苓｣・ｷ･ persists)
      let lastKnownStation = "";
      let lastKnownVariety = "";
      let lastKnownWorkType = "";
      const finalResults = validResults.map((res, idx) => {
        const targetRecord = records[idx];

        // Apply context relay for empty fields
        const station = res.station || lastKnownStation;
        const variety = res.variety || lastKnownVariety;
        const workType = res.workType || lastKnownWorkType;

        // Update context for next iteration
        if (res.station) lastKnownStation = res.station;
        if (res.variety) lastKnownVariety = res.variety;
        if (res.workType) lastKnownWorkType = res.workType;

        // Ensure fileName is from the original record to maintain order and correctness
        return { ...res, station, variety, workType, fileName: targetRecord.fileName };
      });

      const totalTime = performance.now() - batchStartTime;
      const perPhotoTime = totalTime / records.length;
      onLog?.(`[PROFILER] Batch complete: Total=${formatDuration(totalTime)}, Per photo=${formatDuration(perPhotoTime)}, Parse=${formatDuration(parseTime)}`, "success");

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
