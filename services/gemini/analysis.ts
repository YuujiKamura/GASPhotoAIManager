/**
 * Gemini API - Analysis Module
 *
 * 解析関連の関数を集約
 * - analyzePhotoBatch: バッチ解析
 * - analyzePhotoInteractive: 対話型解析
 * - identifyTargetPhotos: ターゲット写真の特定
 * - selectWorkTypes: 工種選択
 */

import { GoogleGenAI, Type, Schema } from "@google/genai";
import { PhotoRecord, AIAnalysisResult, AppMode, AnalysisExample, FieldChange, ChangeStage } from "../../types";
import { extractBase64Data } from "../../utils/imageUtils";
import { formatHierarchyForPrompt, getSelectorPrompt, getHierarchySubset, getWorkTypes, validateAgainstMaster, detectUnknownTerms, validateTemperatureRemarks, isQualityManagementPhoto } from "../../utils/constructionMaster";
import { trackUsage } from "../usageTracker";
import { getRelevantExamples, getActiveSession } from "../../utils/storage";
import { RuleSettings, rulesToPromptText, loadRuleSettings } from "../../utils/analysisRules";
import { getLearnedSettings, rulesToPromptText as learnedRulesToPromptText } from "../learningService";
import {
  hasApiKey,
  isAutoApiEnabled,
  sanitizeErrorMessage,
} from './apiKey';
import {
  getSelectedModel,
  PRIMARY_MODEL,
  FALLBACK_MODEL,
  SELECTOR_MODEL,
} from './models';

// ============================================
// 中断処理の共通インターフェース
// ============================================
export type AbortChecker = () => boolean;

/**
 * 中断チェックを行い、中断が要求されている場合はエラーをスロー
 */
export const checkAbort = (shouldAbort?: AbortChecker, context?: string): void => {
  if (shouldAbort?.()) {
    const msg = context ? `処理が中断されました: ${context}` : '処理が中断されました';
    throw new Error(msg);
  }
};

// ============================================
// 定数
// ============================================
const COMPLEX_MODEL = 'gemini-3.0-flash';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// ============================================
// ヘルパー関数
// ============================================

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

/**
 * フィールドの変更を記録する
 */
const trackFieldChange = (
  changeLog: FieldChange[],
  field: string,
  stage: ChangeStage,
  before: string,
  after: string,
  reason?: string
): void => {
  if (before !== after) {
    changeLog.push({ field, stage, before, after, reason });
  }
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

// Sanitize error messages to prevent API key leakage in logs
const sanitizeErrorMessage = (message: string, apiKey?: string): string => {
  if (!message) return message;
  let sanitized = message;
  if (apiKey) {
    sanitized = sanitized.replace(new RegExp(apiKey, 'g'), '[API_KEY_REDACTED]');
  }
  sanitized = sanitized.replace(/AIza[A-Za-z0-9_-]{30,}/g, '[API_KEY_REDACTED]');
  return sanitized;
};

// ============================================
// システム指示生成
// ============================================

export const getSystemInstruction = (appMode: AppMode, customInstruction?: string, hierarchy?: object, ruleSettings?: RuleSettings) => {
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

**STEP 3: Remarks (備考) - remarksCategory のみ出力**
*   **remarksCategory**: Select from the enum (e.g., "到着温度", "転圧状況", "着手前")
*   **IMPORTANT**: 備考には測定値を含めない。測定値はすべて measurements フィールドに出力する。

**Category-specific rules:**
*   **着手前及び完成写真**: remarksCategory = "着手前" or "竣工"
*   **施工状況写真**: remarksCategory = "転圧状況" etc.
*   **品質管理写真 (温度管理)**:
    - remarksCategory = "到着温度" / "敷均し温度" / "初期締固め前温度" / "開放温度"
    - **CRITICAL**: Each photo has a SPECIFIC temperature. Do NOT use generic "温度管理" or "温度測定".
*   **出来形管理写真**:
    - remarksCategory = "不陸整正出来形" etc. (MUST end with "出来形")
    - NEVER use "〜状況" for measurement photos - that implies ongoing work.

**STEP 4: Description (記事) - 重要な情報を記録**

**description (記事)**: 写真から読み取れる重要な情報を記録
*   黒板に書かれたテキスト、測定値、寸法などを記載
*   出来形管理写真の場合: 設計値、実測値、差を必ず記載（例: "設計値: 50mm / 実測値: 52mm / 差: +2mm"）
*   使用機材、材料名、作業内容など視覚的に確認できる情報
*   着手前・完成写真でも、黒板に工事名や日付があれば記載
*   **空欄にしない**: 黒板や現場から何か読み取れる情報があれば必ず記載する

**measurements (測定値)**: すべての測定値・数値データを記録
*   **フォーマット規則（必ず改行で整形）**:
    - 測定種別ごとに改行で区切る
    - 単位は種別名の後ろに1回だけ記載（数値には付けない）
    - 各種別: 種別名(単位) → 改行 → 設計値行 → 改行 → 実測値行
    - **例（複数測点）**:
      "基準高下がり (mm)\\n設計値 H1=50, H2=50, H3=50\\n実測値 H1=50, H2=50, H3=51"
    - **例（厚さ - t=記号）**:
      "砕石厚 (mm)\\n設計t=30/実測t=30"
      ※砕石厚は1測点につき通常1箇所のみ測定。厚さは「t=」記号で表記する。
    - **例（複数種別）**:
      "基準高下がり (mm)\\n設計値 H1=50, H2=50\\n実測値 H1=50, H2=51\\n\\n砕石厚 (mm)\\n設計t=30/実測t=30"
    - **温度**: "到着温度 161.1℃"（温度は数値に℃を付ける）
*   測定値が見えない場合は空文字列 "" を返す
*   **CRITICAL**: remarksCategory に該当する数値はすべてここに出力する

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
keys: workType, variety, detail, station, remarksCategory, measurements, description, hasBoard, detectedText.
Note: remarksCategory is from the enum, measurements contains all numerical values.

${(() => {
  const rules = ruleSettings || loadRuleSettings();
  return `\n--- ACTIVE ANALYSIS RULES ---\n${rulesToPromptText(rules)}`;
})()}
${customInstruction ? `\nUSER OVERRIDE INSTRUCTION: ${customInstruction}` : ""}
  `.trim();
};

// ============================================
// 工種選択（セレクターエージェント）
// ============================================

/**
 * セレクターエージェント: 画像群から工種を判定
 * 軽量モデルで高速に工種を特定し、本解析で使う階層サブセットを決定
 *
 * NOTE: autoSelectWorkTypes が false の場合、API呼び出しをスキップして全工種を返す
 */
export const selectWorkTypes = async (
  records: PhotoRecord[],
  apiKey: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error' | 'json', details?: any) => void
): Promise<string[]> => {
  const availableWorkTypes = getWorkTypes();

  // 自動工種選択が無効の場合、API呼び出しをスキップ
  if (!isAutoApiEnabled('autoSelectWorkTypes')) {
    onLog?.('[SELECTOR] 自動工種選択がOFF - API呼び出しをスキップ（全工種を使用）', 'info');
    return availableWorkTypes;
  }

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

// ============================================
// ターゲット写真の特定
// ============================================

export const identifyTargetPhotos = async (
  photos: PhotoRecord[],
  instruction: string,
  apiKey: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error' | 'json', details?: any) => void,
  shouldAbort?: AbortChecker
): Promise<string[]> => {
  // Early validation: Check API key before proceeding
  if (!apiKey || !hasApiKey()) {
    throw new Error('APIキーが設定されていません。設定画面からAPIキーを入力してください。');
  }

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
      model: PRIMARY_MODEL,
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

// ============================================
// バッチ解析
// ============================================

export const analyzePhotoBatch = async (
  records: PhotoRecord[],
  instruction: string,
  batchSize: number,
  appMode: AppMode,
  apiKey: string,
  onLog?: (msg: string, type: 'info' | 'success' | 'error' | 'json', details?: any) => void,
  onIndividualResult?: (fileName: string, result: AIAnalysisResult) => void,
  shouldAbort?: AbortChecker,
  onReasoningStream?: (text: string) => void,
  ruleSettings?: RuleSettings
): Promise<AIAnalysisResult[]> => {
  // Early validation: Check API key before proceeding
  if (!apiKey || !hasApiKey()) {
    throw new Error('APIキーが設定されていません。設定画面からAPIキーを入力してください。');
  }

  const batchStartTime = performance.now();
  const genAI = new GoogleGenAI({ apiKey });
  const getPrimaryModel = () => getSelectedModel();

  onLog?.(`[PROFILER] Batch start: ${records.length} photos, model=${getPrimaryModel()}`, "info");
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

  const systemPrompt = getSystemInstruction(appMode, instruction, filteredHierarchy, ruleSettings);

  // 学習ルールを取得してプロンプトに追加
  let learnedRulesPrompt = "";
  try {
    const learnedSettings = await getLearnedSettings();
    if (learnedSettings.rules.length > 0 || learnedSettings.aliases.length > 0) {
      learnedRulesPrompt = learnedRulesToPromptText(learnedSettings);
      onLog?.(`[LEARNING] ${learnedSettings.rules.length}件のルール、${learnedSettings.aliases.length}件のエイリアスを適用`, "success");
    }
  } catch (e) {
    console.warn('Failed to load learned settings:', e);
  }

  const fullSystemPrompt = [systemPrompt, examplesPrompt, learnedRulesPrompt].filter(Boolean).join('\n\n');

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

  // 温度管理・品質管理写真の備考カテゴリ（enumで強制）
  const REMARKS_CATEGORIES = [
    // 温度管理（品質管理写真）
    "到着温度", "敷均し温度", "初期締固め前温度", "開放温度",
    "アスファルト混合物温度測定",
    // 密度測定（品質管理写真）
    "現場密度測定",
    // 施工状況
    "転圧状況", "敷均し状況", "舗設状況", "初期転圧状況", "2次転圧状況",
    "乳剤散布状況", "養生砂散布状況", "清掃状況",
    "掘削状況", "積込状況", "取壊し状況", "据付状況", "設置状況",
    // 着手前・完成
    "着手前", "完了", "竣工", "施工完了",
    // 出来形
    "不陸整正出来形", "路盤厚出来形", "表層厚出来形", "幅員出来形",
    // 安全管理
    "朝礼状況", "KY活動状況", "新規入場者教育状況", "保安施設設置状況", "点灯確認状況", "安全巡視状況",
    // その他
    "その他"
  ];

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
        remarksCategory: {
          type: Type.STRING,
          enum: REMARKS_CATEGORIES,
          description: "備考の種類。温度管理なら「到着温度」「敷均し温度」等を選択（測定値は含めない）"
        },
        measurements: {
          type: Type.STRING,
          description: "測定値。単位は種別名の後ろに1回。例: 「基準高下がり (mm)\\n設計値 H1=50, H2=50\\n実測値 H1=50, H2=51」。複数種別は空行で区切る。値がない場合は空文字"
        },
        description: { type: Type.STRING },
        hasBoard: { type: Type.BOOLEAN },
        detectedText: { type: Type.STRING },
        reasoning: { type: Type.STRING }
      },
      required: ["fileName", "workType", "station", "description", "remarksCategory"]
    }
  };

  let attempt = 0;
  let modelToUse = getPrimaryModel(); // ユーザー選択モデルを使用

  while (attempt < MAX_RETRIES) {
    // Check if analysis should be aborted
    checkAbort(shouldAbort, 'analyzePhotoBatch リトライループ');

    try {
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
      const validResults: AIAnalysisResult[] = parsed.map((item: any) => {
        const remarksCategory = item.remarksCategory || "";
        const measurements = item.measurements || "";

        return {
          fileName: item.fileName || "unknown",
          workType: item.workType || "",
          variety: item.variety || "",
          detail: item.detail || "",
          station: item.station || "",
          remarks: remarksCategory,
          remarksCategory: remarksCategory,
          remarksValue: "",
          description: item.description || "",
          measurements: measurements,
          hasBoard: !!item.hasBoard,
          detectedText: item.detectedText || "",
          reasoning: item.reasoning || "",
          changeLog: []
        };
      });

      // Log individual results
      validResults.forEach(res => {
        onIndividualResult?.(res.fileName, res);
      });

      // Match AI results to original records by fileName (not by index)
      const matchedResults: AIAnalysisResult[] = records.map(record => {
        const aiResult = validResults.find(res => res.fileName === record.fileName);

        if (aiResult) {
          return aiResult;
        } else {
          onLog?.(`[WARNING] No AI result found for ${record.fileName}, using placeholder`, 'error');
          return {
            fileName: record.fileName,
            workType: '',
            variety: '',
            detail: '',
            station: '',
            remarks: '',
            remarksCategory: '',
            remarksValue: '',
            description: '',
            measurements: '',
            hasBoard: false,
            detectedText: '',
            reasoning: '',
            changeLog: []
          };
        }
      });

      // Apply context relay: inherit from previous photos
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
        const changeLog = res.changeLog || [];

        // Safety management photos should keep empty workType/variety
        if (isSafetyRemarks(res.remarks || '')) {
          return res;
        }

        // Apply context relay for empty fields (non-safety photos only)
        const station = res.station || lastKnownStation;
        const variety = res.variety || lastKnownVariety;
        const workType = res.workType || lastKnownWorkType;
        const detail = res.detail || lastKnownDetail;
        const remarks = res.remarks || lastKnownRemarks;
        const measurements = res.measurements || lastKnownMeasurements;

        // 継承による変更を記録
        trackFieldChange(changeLog, 'station', 'context_relay', res.station || '', station, '前の写真から継承');
        trackFieldChange(changeLog, 'variety', 'context_relay', res.variety || '', variety, '前の写真から継承');
        trackFieldChange(changeLog, 'workType', 'context_relay', res.workType || '', workType, '前の写真から継承');
        trackFieldChange(changeLog, 'detail', 'context_relay', res.detail || '', detail, '前の写真から継承');
        trackFieldChange(changeLog, 'remarks', 'context_relay', res.remarks || '', remarks, '前の写真から継承');
        trackFieldChange(changeLog, 'measurements', 'context_relay', res.measurements || '', measurements, '前の写真から継承');

        // Update context for next iteration (only if current has value)
        if (res.station) lastKnownStation = res.station;
        if (res.variety) lastKnownVariety = res.variety;
        if (res.workType) lastKnownWorkType = res.workType;
        if (res.detail) lastKnownDetail = res.detail;
        if (res.remarks) lastKnownRemarks = res.remarks;
        if (res.measurements) lastKnownMeasurements = res.measurements;

        return { ...res, station, variety, workType, detail, remarks, measurements, changeLog };
      });

      // Validate against master data and log warnings for AI-invented values
      const validatedResults = finalResults.map(res => {
        const changeLog = res.changeLog || [];
        const { validatedWorkType, validatedVariety, validatedDetail, warnings } =
          validateAgainstMaster(res.workType, res.variety, res.detail, res.remarks);

        if (warnings.length > 0) {
          onLog?.(`[MASTER警告] ${res.fileName}: ${warnings.join(', ')}`, "error");
        }

        // マスタバリデーションによる変更を記録
        trackFieldChange(changeLog, 'workType', 'master_validation', res.workType || '', validatedWorkType, 'マスタに存在しない値を修正');
        trackFieldChange(changeLog, 'variety', 'master_validation', res.variety || '', validatedVariety, 'マスタに存在しない値を修正');
        trackFieldChange(changeLog, 'detail', 'master_validation', res.detail || '', validatedDetail, 'マスタに存在しない値を修正');

        // 備考に「〜工」が含まれている場合は警告
        if (res.remarks && res.remarks.match(/[^着手完]工/) && !res.remarks.includes('施工')) {
          onLog?.(`🚨 [AI創作検出] ${res.fileName}: 備考「${res.remarks}」に「〜工」が含まれています`, "error");
        }

        // 温度管理写真のバリデーション
        let finalRemarks = res.remarks;
        let finalRemarksCategory = res.remarksCategory;
        let finalMeasurements = res.measurements;

        if (res.remarksCategory && isQualityManagementPhoto(res.remarksCategory)) {
          const tempValidation = validateTemperatureRemarks(
            res.remarksCategory || '',
            res.measurements || ''
          );

          if (!tempValidation.isValid) {
            tempValidation.warnings.forEach(w => {
              onLog?.(`[温度バリデーション] ${res.fileName}: ${w}`, "error");
            });

            // 修正を適用
            if (tempValidation.correctedCategory) {
              trackFieldChange(changeLog, 'remarksCategory', 'temperature_validation', res.remarksCategory || '', tempValidation.correctedCategory, '温度バリデーションで修正');
              finalRemarksCategory = tempValidation.correctedCategory;
              trackFieldChange(changeLog, 'remarks', 'temperature_validation', res.remarks || '', finalRemarksCategory, '温度バリデーションで修正');
              finalRemarks = finalRemarksCategory;
            }
            if (tempValidation.correctedValue) {
              trackFieldChange(changeLog, 'measurements', 'temperature_validation', res.measurements || '', tempValidation.correctedValue, '温度バリデーションで修正');
              finalMeasurements = tempValidation.correctedValue;
            }
          }
        }

        return {
          ...res,
          workType: validatedWorkType,
          variety: validatedVariety,
          detail: validatedDetail,
          remarks: finalRemarks,
          remarksCategory: finalRemarksCategory,
          measurements: finalMeasurements,
          changeLog
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
        // Try fallback chain
        if (modelToUse !== FALLBACK_MODEL) {
          const previousModel = modelToUse;
          if (modelToUse === 'gemini-2.5-pro') {
            modelToUse = 'gemini-2.5-flash';
          } else {
            modelToUse = FALLBACK_MODEL;
          }
          onLog?.(`Rate Limit hit on ${previousModel}. Switching to: ${modelToUse}`, "info");
          await sleep(RETRY_DELAY_MS);
        } else {
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

// ============================================
// 対話型写真解析 (Interactive Analysis)
// ============================================

export interface InteractiveMessage {
  role: 'ai' | 'user' | 'system';
  content: string;
}

export interface InteractiveAnalysisResult {
  response: string;
  analysis: AIAnalysisResult | null;
}

const INTERACTIVE_SYSTEM_PROMPT = `あなたは工事写真の解析アシスタントです。
MGS2の無線通信のように、簡潔でプロフェッショナルに対話してください。

## スタイル
- 敬語は使わず、フランクに話す（「～だね」「～しよう」）
- 専門用語は適切に使う
- 長文は避け、要点を簡潔に
- 1-2文で返答する

## 対話の流れ
1. 写真を解析したら、まず所見を述べる
2. 解析結果の確認を促す
3. ユーザーの修正要望に応じて調整
4. 最終確認を取る

## 出力形式
必ず以下のJSON形式で返答すること:
{
  "response": "ユーザーへの返答メッセージ",
  "analysis": {
    "fileName": "ファイル名",
    "workType": "工種",
    "variety": "種別",
    "detail": "細別",
    "station": "測点",
    "remarks": "備考",
    "measurements": "測定値",
    "description": "記事",
    "hasBoard": true/false,
    "detectedText": "OCRテキスト",
    "reasoning": "判断根拠"
  }
}
`;

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
