import { GoogleGenAI, Type, Schema } from "@google/genai";
import { PhotoRecord, AIAnalysisResult, AppMode, LogEntry, AnalysisExample } from "../types";
import { extractBase64Data } from "../utils/imageUtils";
import { formatHierarchyForPrompt, getSelectorPrompt, getHierarchySubset, getWorkTypes, validateAgainstMaster, detectUnknownTerms } from "../utils/constructionMaster";
import { trackUsage } from "./usageTracker";
import { getRelevantExamples, getActiveSession } from "../utils/storage";

// ============================================
// 中断処理の共通インターフェース
// ============================================
export type AbortChecker = () => boolean;

/**
 * 中断チェックを行い、中断が要求されている場合はエラーをスロー
 * @param shouldAbort - 中断チェック関数
 * @param context - エラーメッセージに含めるコンテキスト
 */
export const checkAbort = (shouldAbort?: AbortChecker, context?: string): void => {
  if (shouldAbort?.()) {
    const msg = context ? `処理が中断されました: ${context}` : '処理が中断されました';
    throw new Error(msg);
  }
};

// API Key Management (localStorage)
const API_KEY_STORAGE_KEY = 'construction_album_api_key';

export const getApiKey = (): string | null => {
  return localStorage.getItem(API_KEY_STORAGE_KEY);
};

export const setApiKey = (key: string): void => {
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
};

export const clearApiKey = (): void => {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
};

export const hasApiKey = (): boolean => {
  const key = getApiKey();
  return !!key && key.startsWith('AIza');
};

// Model Selection
export type ModelType = 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-2.0-flash';
const MODEL_STORAGE_KEY = 'construction_album_model';

export const AVAILABLE_MODELS: { id: ModelType; name: string; description: string }[] = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: '高速・低コスト（推奨）' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: '高精度・高コスト' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: '最速・最低コスト' },
];

export const getSelectedModel = (): ModelType => {
  const saved = localStorage.getItem(MODEL_STORAGE_KEY);
  if (saved && AVAILABLE_MODELS.some(m => m.id === saved)) {
    return saved as ModelType;
  }
  return 'gemini-2.5-flash'; // デフォルト
};

export const setSelectedModel = (model: ModelType): void => {
  localStorage.setItem(MODEL_STORAGE_KEY, model);
};

// API Key Validation - Single Model
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
    console.error(`API Key validation failed for ${testModel}:`, e);
    if (e.message?.includes('API_KEY_INVALID') || e.message?.includes('401')) {
      return { valid: false, error: 'APIキーが無効です' };
    }
    if (e.message?.includes('quota') || e.message?.includes('429')) {
      return { valid: false, error: '利用制限に達しました' };
    }
    if (e.message?.includes('not found') || e.message?.includes('404')) {
      return { valid: false, error: 'モデルが利用不可' };
    }
    return { valid: false, error: e.message || '接続エラー' };
  }
};

// Model Availability Status
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
  // Priority: Flash > Pro > 2.0 Flash (balance of speed and capability)
  const priority: ModelType[] = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'];

  for (const modelId of priority) {
    const model = availabilities.find(m => m.id === modelId);
    if (model?.status === 'available') {
      return modelId;
    }
  }
  return null;
};

// Configuration - Use selected model dynamically
const getPrimaryModel = () => getSelectedModel();
const PRIMARY_MODEL = 'gemini-2.5-flash'; // Fallback, actual value comes from getPrimaryModel()
const COMPLEX_MODEL = 'gemini-2.5-flash';
const FALLBACK_MODEL = 'gemini-2.0-flash';
const SELECTOR_MODEL = 'gemini-2.0-flash';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// Sleep helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Profiler helper
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

/**
 * お手本をプロンプト用のテキストに整形
 * Few-shot examples として AI に渡す
 */
const formatExamplesForPrompt = (examples: AnalysisExample[]): string => {
  if (examples.length === 0) return '';

  const exampleTexts = examples.map((ex, i) => {
    const a = ex.analysis;
    return `
Example ${i + 1}: "${ex.name}"
- workType: "${a.workType}"
- variety: "${a.variety || ''}"
- detail: "${a.detail || ''}"
- station: "${a.station}"
- remarks: "${a.remarks}"
- description: "${a.description}"
- hasBoard: ${a.hasBoard}
`.trim();
  });

  return `
--- FEW-SHOT EXAMPLES (お手本) ---
The following are correct examples of analysis output. Use them as reference for similar photos:

${exampleTexts.join('\n\n')}

--- END EXAMPLES ---
`;
};

export const getSystemInstruction = (appMode: AppMode, customInstruction?: string, hierarchy?: object) => {
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
${JSON.stringify(hierarchy || formatHierarchyForPrompt(), null, 2)}

--- HIERARCHY MAPPING RULES (STRICT) ---
The master data JSON has this structure. "直接工事費" is the root and should be IGNORED.

**Hierarchy Structure**:
\`\`\`
直接工事費 (IGNORE - this is the root)
  └─ [カテゴリ] (着手前及び完成写真, 施工状況写真, etc.) - DO NOT output this, it's auto-detected
       └─ [工種 workType] (e.g., 舗装工, 道路土工, 構造物撤去工)
            └─ [種別 variety] (e.g., 舗装打換え工, 未舗装部舗装工)
                 └─ [細別 detail] (e.g., 表層工, 上層路盤工, 舗装版破砕)
                      └─ [備考 remarks] (e.g., 舗設状況, 転圧状況, 着手前)
\`\`\`

**Output Mapping**:
*   **workType**: The key under the category (e.g., "舗装工", "道路土工"). NOT "直接工事費" or category names.
*   **variety**: The key under workType (e.g., "舗装打換え工").
*   **detail**: The key under variety (e.g., "表層工", "舗装版破砕").
*   **remarks**: The leaf key or alias (e.g., "舗設状況", "着手前").

**CRITICAL**: Do NOT output "直接工事費", "施工状況写真", "出来形管理写真" etc. as workType. These are NOT workTypes.

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
    *   **CRITICAL DISTINCTION - SPRAYING**:
        *   **Emulsion Spraying (乳剤散布)**: Worker holding a **THIN NOZZLE/HOSE** connected to a tank/truck. Liquid spray.
        *   **Curing Sand Spraying (養生砂散布)**: Worker using a **SHOVEL** or **BROAD SPREADER**. Sand cannot be sprayed from a thin nozzle.
        *   *Note*: Do NOT rely solely on surface color (black vs gray) as both can look similar. Look at the **EQUIPMENT**.

3.  **"安全管理写真"** (Safety Management) [PRIORITY - VISUAL DETECTION]:
    *   **CRITICAL**: For safety management photos, set workType="", variety="", detail="".
    *   **朝礼状況**: Group of workers standing together (morning assembly). Even WITHOUT blackboard.
        - Visual cues: Workers in circle/line, safety vests/helmets, morning gathering
    *   **KY活動状況**: Workers looking at documents/boards together (hazard prediction activity)
    *   **保安施設設置状況**: Traffic cones, barriers, warning signs being set up
    *   **点灯確認状況**: Checking lights on safety equipment at dusk/night
    *   **新規入場者教育状況**: Training session, workers watching presentation
    *   **安全巡視状況**: Inspection walk, supervisor checking site
    *   **NOTE**: If you see a GROUP of workers NOT actively doing construction work, it's likely 安全管理写真.

4.  **"使用材料写真"**: Material checks.
5.  **"品質管理写真"** (Quality Control) [PRIORITY - TEMPERATURE/DENSITY MEASUREMENT]:
    *   **Definition**: Photos documenting quality measurements during construction.
    *   **Visual Cues**:
        - Thermometers measuring asphalt temperature (デジタル温度計, 棒状温度計)
        - Density meters (RI計器, 砂置換法の器具)
        - Blackboard showing temperature readings (到着温度, 敷均し温度, 初期締固め前温度, 開放温度)
    *   **Temperature Photo Cycles** (温度管理写真のサイクル):
        - Per truck (1台につき3温度 × 3枚 = 9枚):
          1. 到着温度 (arrival temp): 全景 + ボードアップ + 温度計アップ
          2. 敷均し温度 (spread temp): 全景 + ボードアップ + 温度計アップ
          3. 初期締固め前温度 (initial compaction temp): 全景 + ボードアップ + 温度計アップ
        - Per day/location (1日1回 × 3枚):
          4. 開放温度 (release temp): 全景 + ボードアップ + 温度計アップ
    *   **Remarks for 品質管理写真** MUST include:
        - The temperature TYPE (到着温度, 敷均し温度, 初期締固め前温度, 開放温度)
        - The actual temperature VALUE visible on thermometer or blackboard (e.g., 161.1℃)
        - Example: "到着温度 161.1℃", "敷均し温度 155.3℃", "初期締固め前温度 148.8℃"
    *   **NEVER use just** "温度測定" or "アスファルト混合物温度測定" without the actual value.
6.  **"出来形管理写真"** (Finished Dimension Management) [PRIORITY - MEASUREMENT PHOTOS]:
    *   **Definition**: Photos documenting COMPLETED work dimensions with measuring tools.
    *   **Visual Cues**:
        - Measuring ribbons/poles placed on FINISHED surfaces
        - Blackboard showing 設計値 (design value), 実測値 (measured value), 差 (difference)
        - Static scene - NO active work, just measurement verification
    *   **CRITICAL DISTINCTION from 施工状況**:
        - 「〜状況」(status) = DURING work (e.g., 転圧状況 = compacting NOW)
        - 「〜出来形」(finished form) = AFTER work, measuring result (e.g., 不陸整正出来形 = measuring flatness AFTER grading)
    *   **Remarks for 出来形管理写真** should end with 「出来形」:
        - 不陸整正出来形, 表層厚出来形, 路盤厚出来形, 幅員出来形, etc.
    *   **Example**: Photo shows a measuring pole on flat graded surface with blackboard "設計値 0mm / 実測値 +3mm"
        → This is 出来形管理写真, remarks = "不陸整正出来形", NOT "不陸整正状況"

**STEP 2: Traverse & Map Columns**
Traverse the hierarchy directly:
*   **workType**: The key at Level 1 (e.g., "舗装工").
*   **variety**: The key at Level 2 (e.g., "舗装打換え工").
*   **detail**: The key at Level 3 (e.g., "表層工").
*   **remarks**: The key at Level 4 (e.g., "舗設状況", "着手前", "転圧状況").

**STEP 3: Remarks (備考) Logic**
*   **If Category is "着手前及び完成写真"**:
    *   **remarks** MUST be either "着手前" (Before) or "竣工" (Completion/Finished).
    *   Do NOT put "着手前" in the 'detail' or 'variety' columns.
*   **If Category is "施工状況写真"**:
    *   Use the Leaf Node Key (e.g., "転圧状況") as the remarks.
    *   Normalize text: "転圧中" -> "転圧状況".
*   **If Category is "品質管理写真"**:
    *   **remarks** MUST include temperature TYPE + VALUE.
    *   Format: "温度種別 実測値℃" (e.g., "到着温度 161.1℃", "敷均し温度 155.3℃")
    *   Valid temperature types: 到着温度, 敷均し温度, 初期締固め前温度, 開放温度
    *   If temperature value is visible, ALWAYS include it in remarks.
    *   **NEVER use** "アスファルト混合物温度測定" or "温度測定" alone without the actual value.
*   **If Category is "出来形管理写真"**:
    *   **remarks** MUST end with "出来形" AND include measurement values if visible.
    *   Format: "〜出来形　測定値" (e.g., "不陸整正出来形　実測値+3mm", "路盤厚出来形　t=150")
    *   NEVER use "〜状況" for measurement photos - that implies ongoing work.
    *   If blackboard shows measurement values (設計/実測/差), it's definitely 出来形管理.
    *   **ALWAYS include visible measurements in remarks** - don't make user ask for it.

**STEP 4: Description (記事) - 重要な情報を記録**

**description (記事)**: 写真から読み取れる重要な情報を記録
*   黒板に書かれたテキスト、測定値、寸法などを記載
*   出来形管理写真の場合: 設計値、実測値、差を必ず記載（例: "設計値: 50mm / 実測値: 52mm / 差: +2mm"）
*   使用機材、材料名、作業内容など視覚的に確認できる情報
*   着手前・完成写真でも、黒板に工事名や日付があれば記載
*   **空欄にしない**: 黒板や現場から何か読み取れる情報があれば必ず記載する

**measurements (測定値)**: 出来形管理の数値データ（出来形管理写真のみ）
*   出来形管理写真の場合、descriptionに加えてここにも測定値を記録
*   フォーマット例: "設計値: 50mm / 実測値: 52mm / 差: +2mm" または "幅員 W=3.0m"
*   測定値が見えない場合や出来形管理写真でない場合は空文字列 "" を返す

**STEP 5: Station (測点) - FORMAT STANDARDIZATION**
*   **Standard Format**: 「地名 No.整数」 (e.g., "小峯2丁目 No.4", "南区桜町 No.12")
*   **Extraction Rules**:
    1. Extract location name (地名) from blackboard: 丁目, 町名, etc.
    2. Extract station number (No.X) - use INTEGER only, drop decimals and "+XX" suffixes.
       - "No.4-" → "No.4"
       - "No.1+23.5" → "No.1"
       - "N-50" → "No.50"
    3. Combine: "地名 No.整数"
*   **Examples**:
    - Blackboard shows "小峯2丁目 No.4-" → Output: "小峯2丁目 No.4"
    - Blackboard shows "南区 N-3+15" → Output: "南区 No.3"
    - No station visible → Output: "" (empty string, NOT the filename)
*   **Do NOT**:
    - Output filename as station (e.g., "RIMG0151.JPG" is WRONG)
    - Include decimal points or "+XX" suffixes
    - Use "不明", "unknown", "null" - use empty string "" instead

**OUTPUT FORMAT**:
JSON only.
keys: workType, variety, detail, station, remarks, description, measurements, hasBoard, detectedText.

${customInstruction ? `\nUSER OVERRIDE INSTRUCTION: ${customInstruction}` : ""}
  `.trim();
};



/**
 * セレクターエージェント: 画像群から工種を判定
 * 軽量モデルで高速に工種を特定し、本解析で使う階層サブセットを決定
 */
export const selectWorkTypes = async (
  records: PhotoRecord[],
  apiKey: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error' | 'json', details?: any) => void
): Promise<string[]> => {
  const startTime = performance.now();
  const genAI = new GoogleGenAI({ apiKey });

  // サンプル画像を選択（最初と最後、中間から数枚）
  const sampleCount = Math.min(3, records.length);
  const sampleIndices: number[] = [];
  if (records.length <= 3) {
    sampleIndices.push(...records.map((_, i) => i));
  } else {
    sampleIndices.push(0); // 最初
    sampleIndices.push(Math.floor(records.length / 2)); // 中間
    sampleIndices.push(records.length - 1); // 最後
  }

  const samples = sampleIndices.map(i => records[i]);
  const inputs = samples.map(r => ({
    inlineData: {
      data: extractBase64Data(r.base64),
      mimeType: r.mimeType
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
        responseMimeType: "application/json",
        temperature: 0.1
      }
    });

    const text = result.text || "{}";
    trackUsage(SELECTOR_MODEL, prompt, text, samples.length, 'selectWorkTypes');
    const json = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
    const selectedTypes = (json.workTypes || []).filter((t: string) => availableWorkTypes.includes(t));

    const elapsed = performance.now() - startTime;
    onLog?.(`[SELECTOR] ${formatDuration(elapsed)}: Selected ${selectedTypes.length} work types: ${selectedTypes.join(', ')}`, 'info');

    // 何も選択されなかった場合はフォールバック
    if (selectedTypes.length === 0) {
      onLog?.('[SELECTOR] No work types selected, using all types', 'info');
      return availableWorkTypes;
    }

    return selectedTypes;
  } catch (e: any) {
    onLog?.(`[SELECTOR] Error: ${e.message}, falling back to all types`, 'error');
    return availableWorkTypes;
  }
};

/**
 * 工種に基づいた階層サブセットを取得
 */
export const getFilteredHierarchy = (workTypes: string[]): object => {
  if (workTypes.length === 0 || workTypes.length === getWorkTypes().length) {
    return formatHierarchyForPrompt();
  }
  return getHierarchySubset(workTypes);
};

export const identifyTargetPhotos = async (
  photos: PhotoRecord[],
  instruction: string,
  apiKey: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error' | 'json', details?: any) => void,
  shouldAbort?: AbortChecker
): Promise<string[]> => {
  checkAbort(shouldAbort, 'identifyTargetPhotos開始前');

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
    checkAbort(shouldAbort, 'identifyTargetPhotos API呼び出し前');
    const result = await genAI.models.generateContent({
      model: PRIMARY_MODEL, // Use Pro for better logic interpretation
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json"
      }
    });

    const responseText = result.text || "{}";
    trackUsage(PRIMARY_MODEL, prompt, responseText, 0, 'identifyTargetPhotos');
    const json = JSON.parse(responseText);
    const totalTime = performance.now() - startTime;
    onLog?.(`[PROFILER] identifyTargetPhotos: Total=${formatDuration(totalTime)}, Found ${json.targetFiles?.length || 0} targets`, "info");
    return json.targetFiles || [];
  } catch (e) {
    console.error("Identify targets failed", e);
    return [];
  }
};

// 正規化の修正提案の型
export interface NormalizationCorrection {
  fileName: string;
  workType?: string;
  variety?: string;
  detail?: string;
  station?: string;
  remarks?: string;
}

export interface NormalizationResult {
  corrections: NormalizationCorrection[];
  originalData: Array<{
    fileName: string;
    workType: string;
    variety: string;
    detail: string;
    station: string;
    remarks: string;
  }>;
}

// 修正提案を取得（適用はしない）
export const getNormalizationProposals = async (
  records: PhotoRecord[],
  apiKey: string,
  customPrompt?: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error' | 'json', details?: any) => void,
  shouldAbort?: AbortChecker
): Promise<NormalizationResult> => {
  checkAbort(shouldAbort, 'getNormalizationProposals開始前');

  const completedRecords = records.filter(r => r.status === 'done' && r.analysis);
  if (completedRecords.length === 0) {
    return { corrections: [], originalData: [] };
  }

  const genAI = new GoogleGenAI({ apiKey });

  const dataSnapshot = completedRecords.map(r => ({
    fileName: r.fileName,
    workType: r.analysis!.workType || '',
    variety: r.analysis!.variety || '',
    detail: r.analysis!.detail || '',
    station: r.analysis!.station || '',
    remarks: r.analysis!.remarks || ''
  }));

  onLog?.(`Running consistency check with ${COMPLEX_MODEL}...`, "info");

  const userInstruction = customPrompt ? `\n\n**USER INSTRUCTION:** ${customPrompt}` : '';

  const prompt = `
    You are a data consistency expert for construction photos.
    Review the following list of records.

    **CRITICAL RULES:**
    1. DO NOT create new terms - only use what exists in the input
    2. DO NOT add "〜工" suffix to remarks (〜工 is only for workType/variety/detail)
    3. DO NOT change remarks that contain measurement values (numbers, ℃, mm, cm, m, %)
    4. PRESERVE specific data from each photo - do not unify remarks across photos
    5. If unsure, leave the field UNCHANGED
    6. NEVER invent terms like "温度管理工", "温度測定工", "密度管理工"

    **TEMPERATURE PHOTO CYCLES (温度管理写真のルール):**
    Temperature management photos come in specific cycles. DO NOT unify them.

    Per truck (1サイクル = 9枚):
    - 到着温度 (arrival temp): 全景 + ボードアップ + 温度計アップ = 3枚
    - 敷均し温度 (spread temp): 全景 + ボードアップ + 温度計アップ = 3枚
    - 初期締固め前温度 (initial compaction temp): 全景 + ボードアップ + 温度計アップ = 3枚

    Per day/location (1日1回):
    - 開放温度 (release temp): 全景 + ボードアップ + 温度計アップ = 3枚

    IMPORTANT:
    - Each truck has DIFFERENT temperature values - do not unify!
    - "到着温度 161.1℃" and "到着温度 158.5℃" are from different trucks - keep both!
    - "敷均し温度 155.3℃" is specific to that measurement - do not change!
    - Photos in the same cycle share the SAME temperature value

    VALID remarks for temperature photos:
    - "到着温度 161.1℃"
    - "敷均し温度 155.3℃"
    - "初期締固め前温度 148.8℃"
    - "開放温度 50℃"
    - "アスファルト混合物温度測定 到着温度 161.1℃"

    INVALID remarks (do not create these):
    - "温度管理工" ❌
    - "温度測定工" ❌
    - "温度測定" ❌ (missing actual value)
    - "温度管理" ❌ (too vague)

    TASKS:
    1. **Normalize Station Names (測点) ONLY**:
       - Fix OCR errors (e.g., "No.0+00" vs "No.0.00" -> unify to "No.X+XX").

    2. **Fix Hierarchy Errors (RARE)**:
       - Only if "Detail" is clearly wrong (e.g., "完了", "状況" as detail).
       - Move status words to "Remarks", clear "Detail".

    3. **DO NOT touch Remarks unless clearly wrong**:
       - Keep measurement values intact (e.g., "出荷時156℃", "t=50mm")
       - Keep specific descriptions from board photos
       - DO NOT simplify "アスファルト混合物温度測定 出荷時156℃" to just "温度測定"
    ${userInstruction}

    INPUT DATA:
    ${JSON.stringify(dataSnapshot, null, 2)}

    OUTPUT:
    Return JSON: { "corrections": [ { "fileName": "...", "workType": "...", "variety": "...", "detail": "...", "station": "...", "remarks": "..." } ] }
    Only include records that need changing. If no changes needed, return { "corrections": [] }.
  `;

  let modelToUse = COMPLEX_MODEL;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    checkAbort(shouldAbort, 'getNormalizationProposals リトライループ');
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

      trackUsage(modelToUse, prompt, text, 0, 'getNormalizationProposals');
      const json = JSON.parse(text);
      onLog?.("Normalization proposals received", "json", json);

      const corrections = (json.corrections || []) as NormalizationCorrection[];

      // マスタ外用語の検出（警告のみ）
      for (const c of corrections) {
        const warnings = detectUnknownTerms(
          c.workType || '',
          c.variety || '',
          c.detail || '',
          c.remarks || ''
        );
        if (warnings.length > 0) {
          onLog?.(`🚨 提案に問題: ${c.fileName}: ${warnings.join(', ')}`, "error");
        }
      }

      return { corrections, originalData: dataSnapshot };

    } catch (e: any) {
      attempt++;
      const isQuotaError = e.message?.includes("429") || e.status === 429;
      onLog?.(`Normalization Error (${modelToUse}) - ${attempt}/${MAX_RETRIES}`, "error", e.message);

      if (attempt < MAX_RETRIES) {
        if (isQuotaError && modelToUse !== FALLBACK_MODEL) {
          modelToUse = FALLBACK_MODEL;
          onLog?.(`Rate limit hit, switching to ${FALLBACK_MODEL}`, "info");
        }
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  onLog?.("Normalization failed (Non-fatal)", "error");
  return { corrections: [], originalData: dataSnapshot };
};

// 承認された修正を適用
export const applyNormalizationCorrections = (
  records: PhotoRecord[],
  corrections: NormalizationCorrection[]
): PhotoRecord[] => {
  return records.map(r => {
    const fix = corrections.find(c => c.fileName === r.fileName);
    if (fix && r.analysis) {
      return {
        ...r,
        analysis: {
          ...r.analysis,
          workType: fix.workType !== undefined ? fix.workType : r.analysis.workType,
          variety: fix.variety !== undefined ? fix.variety : r.analysis.variety,
          detail: fix.detail !== undefined ? fix.detail : r.analysis.detail,
          station: fix.station !== undefined ? fix.station : r.analysis.station,
          remarks: fix.remarks !== undefined ? fix.remarks : r.analysis.remarks
        }
      };
    }
    return r;
  });
};

// 後方互換性のため残す（内部で新しい関数を使用）
export const normalizeDataConsistency = async (
  records: PhotoRecord[],
  apiKey: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error' | 'json', details?: any) => void,
  shouldAbort?: AbortChecker
): Promise<PhotoRecord[]> => {
  const { corrections } = await getNormalizationProposals(records, apiKey, undefined, onLog, shouldAbort);
  if (corrections.length === 0) return records;
  return applyNormalizationCorrections(records, corrections);
};

/**
 * NEW: Visual Anchoring & Clustering
 * Optimized to use cache for visual feature extraction.
 */
export const assignSceneIds = async (
  records: PhotoRecord[],
  apiKey: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error' | 'json', details?: any) => void,
  shouldAbort?: AbortChecker
): Promise<{ fileName: string, sceneId: string, phase: 'before' | 'after' | 'status', visualAnchors: string }[]> => {
  checkAbort(shouldAbort, 'assignSceneIds開始前');

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
      checkAbort(shouldAbort, 'assignSceneIds バッチ処理');
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
        trackUsage(COMPLEX_MODEL, 'featureExtraction', text, batch.length, 'assignSceneIds:extract');
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
    trackUsage(PRIMARY_MODEL, clusteringPrompt, text, 0, 'assignSceneIds:cluster');
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
  shouldAbort?: AbortChecker,
  onReasoningStream?: (text: string) => void
): Promise<AIAnalysisResult[]> => {
  const batchStartTime = performance.now();
  const genAI = new GoogleGenAI({ apiKey });

  onLog?.(`[PROFILER] Batch start: ${records.length} photos, model=${PRIMARY_MODEL}`, "info");
  records.forEach((r, i) => onLog?.(`  [${i + 1}/${records.length}] ${r.fileName}`, 'info'));

  // Use selector to determine work types (only for construction mode)
  let filteredHierarchy: object | undefined;
  if (appMode === 'construction' && records.length >= 3) {
    const selectorStart = performance.now();
    const selectedWorkTypes = await selectWorkTypes(records, apiKey, onLog);
    filteredHierarchy = getFilteredHierarchy(selectedWorkTypes);
    const selectorTime = performance.now() - selectorStart;
    const fullSize = JSON.stringify(formatHierarchyForPrompt()).length;
    const filteredSize = JSON.stringify(filteredHierarchy).length;
    onLog?.(`[PROFILER] Selector: ${formatDuration(selectorTime)}, hierarchy ${fullSize} -> ${filteredSize} chars (${((1 - filteredSize/fullSize) * 100).toFixed(1)}% reduction)`, "info");
  }

  const prepStartTime = performance.now();
  const inputs = records.map(r => ({
    inlineData: {
      data: extractBase64Data(r.base64),
      mimeType: r.mimeType
    }
  }));
  const prepTime = performance.now() - prepStartTime;
  onLog?.(`[PROFILER] Image prep: ${formatDuration(prepTime)}`, "info");

  // Fetch relevant examples (お手本) for few-shot learning
  let examplesPrompt = "";
  if (appMode === 'construction') {
    try {
      // アクティブなセッションを確認してログに表示
      const activeSession = await getActiveSession();
      if (activeSession) {
        onLog?.(`[EXAMPLES] お手本セッション適用中: "${activeSession.name}" (${activeSession.photoCount}枚)`, "info");
      }

      const examples = await getRelevantExamples(undefined, undefined, 5); // セッションから最大5件
      if (examples.length > 0) {
        examplesPrompt = formatExamplesForPrompt(examples);
        onLog?.(`[EXAMPLES] ${examples.length}件のお手本をプロンプトに適用`, "success");
      }
    } catch (e) {
      // Examples are optional, continue without them
      console.warn('Failed to load examples:', e);
    }
  }

  const systemPrompt = getSystemInstruction(appMode, instruction, filteredHierarchy);
  const fullSystemPrompt = examplesPrompt ? `${systemPrompt}\n\n${examplesPrompt}` : systemPrompt;

  // Context relay: Build context hint from previously analyzed photos in this batch
  let contextHint = "";
  const previousResults: AIAnalysisResult[] = [];

  // We'll update this as we process, for now initialize empty

  const prompt = `
    Analyze these ${records.length} photos.
    For each photo, output the JSON object matching the schema.
    Order must match the input order.
    
    **CONTEXT RELAY**: If you cannot clearly determine the station (測点) or variety (種別) from a photo, 
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
        detectedText: { type: Type.STRING },
        reasoning: { type: Type.STRING }
      },
      required: ["fileName", "workType", "station", "description"]
    }
  };

  let attempt = 0;
  let modelToUse = getPrimaryModel(); // ユーザー選択モデルを使用

  while (attempt < MAX_RETRIES) {
    // Check if analysis should be aborted
    checkAbort(shouldAbort, 'analyzePhotoBatch リトライループ');

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
          systemInstruction: fullSystemPrompt,
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.1
        }
      });

      let fullText = "";
      let chunkCount = 0;
      for await (const chunk of result) {
        // Check abort during streaming
        checkAbort(shouldAbort, 'analyzePhotoBatch ストリーミング中');

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

      // Track usage for this batch
      trackUsage(modelToUse, prompt + systemPrompt, text, records.length, 'analyzePhotoBatch');

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
        measurements: item.measurements || "", // 出来形管理の測定値
        hasBoard: !!item.hasBoard,
        detectedText: item.detectedText || "",
        reasoning: item.reasoning || "" // Capture reasoning
      }));

      // Log individual results
      validResults.forEach(res => {
        onIndividualResult?.(res.fileName, res);
      });

      // Match AI results to original records by fileName (not by index)
      // This fixes the bug where AI might return results in a different order
      const matchedResults: AIAnalysisResult[] = records.map(record => {
        // Find the AI result that matches this record's fileName
        const aiResult = validResults.find(res => res.fileName === record.fileName);

        if (aiResult) {
          return aiResult;
        } else {
          // If no match found, log warning and create placeholder
          onLog?.(`[WARNING] No AI result found for ${record.fileName}, using placeholder`, 'error');
          return {
            fileName: record.fileName,
            workType: '',
            variety: '',
            detail: '',
            station: '',
            remarks: '',
            description: '',
            measurements: '',
            hasBoard: false,
            detectedText: '',
            reasoning: ''
          };
        }
      });

      // Apply context relay: inherit from previous photos (especially board-up photos)
      // This ensures continuity across sequential photos (e.g., 下がり測定の連続写真)
      // BUT: Do NOT apply to safety management photos (they legitimately have empty workType)
      const isSafetyRemarks = (remarks: string) => {
        const safetyKeywords = ['朝礼', 'KY', '安全', '新規入場', '点灯', '巡視'];
        return safetyKeywords.some(kw => remarks.includes(kw));
      };

      let lastKnownStation = "";
      let lastKnownVariety = "";
      let lastKnownWorkType = "";
      let lastKnownDetail = "";
      let lastKnownRemarks = "";
      let lastKnownMeasurements = "";

      const finalResults = matchedResults.map((res) => {
        // Safety management photos should keep empty workType/variety
        if (isSafetyRemarks(res.remarks || '')) {
          // Don't inherit - keep original empty values
          return res;
        }

        // Apply context relay for empty fields (non-safety photos only)
        // ボードアップ写真の情報を後続写真に継承
        const station = res.station || lastKnownStation;
        const variety = res.variety || lastKnownVariety;
        const workType = res.workType || lastKnownWorkType;
        const detail = res.detail || lastKnownDetail;
        const remarks = res.remarks || lastKnownRemarks;
        const measurements = res.measurements || lastKnownMeasurements;

        // Update context for next iteration (only if current has value)
        if (res.station) lastKnownStation = res.station;
        if (res.variety) lastKnownVariety = res.variety;
        if (res.workType) lastKnownWorkType = res.workType;
        if (res.detail) lastKnownDetail = res.detail;
        if (res.remarks) lastKnownRemarks = res.remarks;
        if (res.measurements) lastKnownMeasurements = res.measurements;

        return { ...res, station, variety, workType, detail, remarks, measurements };
      });

      // Validate against master data and log warnings for AI-invented values
      const validatedResults = finalResults.map(res => {
        const { validatedWorkType, validatedVariety, validatedDetail, warnings } =
          validateAgainstMaster(res.workType, res.variety, res.detail, res.remarks);

        if (warnings.length > 0) {
          onLog?.(`[MASTER警告] ${res.fileName}: ${warnings.join(', ')}`, "error");
        }

        // 備考に「〜工」が含まれている場合は警告（細別以下には「工」は不要）
        if (res.remarks && res.remarks.match(/[^着手完]工/) && !res.remarks.includes('施工')) {
          onLog?.(`🚨 [AI創作検出] ${res.fileName}: 備考「${res.remarks}」に「〜工」が含まれています`, "error");
        }

        return {
          ...res,
          workType: validatedWorkType,
          variety: validatedVariety,
          detail: validatedDetail
        };
      });

      const totalTime = performance.now() - batchStartTime;
      const perPhotoTime = totalTime / records.length;
      onLog?.(`[PROFILER] Batch complete: Total=${formatDuration(totalTime)}, Per photo=${formatDuration(perPhotoTime)}, Parse=${formatDuration(parseTime)}`, "success");

      return validatedResults;

    } catch (error: any) {
      attempt++;
      const isQuotaError = error.message?.includes("429") || error.status === 429 || error.status === 503;

      onLog?.(`API Error (${modelToUse}) - Attempt ${attempt}/${MAX_RETRIES}`, "error", { message: error.message });

      if (attempt >= MAX_RETRIES) {
        throw error;
      }

      if (isQuotaError) {
        // Try fallback chain: user-selected -> 2.5-flash -> 2.0-flash
        if (modelToUse !== FALLBACK_MODEL) {
          const previousModel = modelToUse;
          // If current is 2.5-pro or user-selected, try 2.5-flash first
          if (modelToUse === 'gemini-2.5-pro') {
            modelToUse = 'gemini-2.5-flash';
          } else {
            modelToUse = FALLBACK_MODEL;
          }
          onLog?.(`Rate Limit hit on ${previousModel}. Switching to: ${modelToUse}`, "info");
          await sleep(RETRY_DELAY_MS);
        } else {
          // Already on fallback model, just wait longer
          onLog?.(`Rate Limit on fallback model. Waiting...`, "info");
          await sleep(RETRY_DELAY_MS * 3);
        }
      } else {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw new Error("Max retries exceeded");
};