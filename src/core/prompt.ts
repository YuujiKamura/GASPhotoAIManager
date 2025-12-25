/**
 * 共通プロンプトビルダー
 * GUI（services/geminiService.ts）とCLI（scripts/analyze-cli.ts）の両方で使用
 * 
 * このモジュールは環境非依存で、Node.jsとBrowserの両方で動作します。
 */

export type AppMode = 'construction' | 'general';

/**
 * フォルダ名から写真区分のヒントを生成
 */
export function getPhotoCategoryHint(folderName: string | undefined): string {
  if (!folderName) return '';

  const folderLower = folderName.toLowerCase();
  
  if (folderLower.includes('施工状況') || folderLower.includes('施工')) {
    return `
**FOLDER CONTEXT (重要)**: このフォルダは「施工状況」フォルダです。
- **備考は「施工状況写真」カテゴリのもののみを使用してください**
- 「出来形管理写真」カテゴリの備考（例: 「上層路盤工出来形」「不陸整正出来形」「砕石厚測定」）は使用しないでください
- 「品質管理写真」カテゴリの備考（例: 「現場密度測定」「アスファルト混合物温度測定」）も使用しないでください
- 使用可能な備考の例: 「転圧状況」「補足材搬入状況 RC-40」「不陸整正状況」「乳剤養生砂散布状況」など
`;
  }
  
  if (folderLower.includes('出来形') || folderLower.includes('出来')) {
    return `
**FOLDER CONTEXT (重要)**: このフォルダは「出来形管理写真」フォルダです。
- **備考は「出来形管理写真」カテゴリのもののみを使用してください**
- 使用可能な備考の例: 「上層路盤工出来形」「不陸整正出来形」「砕石厚測定」など
`;
  }
  
  if (folderLower.includes('品質') || folderLower.includes('管理')) {
    return `
**FOLDER CONTEXT (重要)**: このフォルダは「品質管理写真」フォルダです。
- **備考は「品質管理写真」カテゴリのもののみを使用してください**
- 使用可能な備考の例: 「現場密度測定」「アスファルト混合物温度測定」など
`;
  }
  
  if (folderLower.includes('温度')) {
    return `
**FOLDER CONTEXT (重要)**: このフォルダは「温度管理」フォルダです。
- **備考は「アスファルト混合物温度測定」を使用してください**
- 測点は自動的にEXIF撮影日から設定されます
`;
  }

  return '';
}

/**
 * 一般モード用のシステムプロンプトを生成
 */
export function getGeneralModePrompt(customInstruction?: string): string {
  return `
You are a professional photo archivist. Analyze the image and provide structured metadata.
1. Category: Main subject (e.g., Landscape, Family, Work).
2. Sub-category: Specifics (e.g., Mountain, Birthday, Office).
3. Location: Inferred or read from text.
4. Description: A concise caption explaining the photo.
${customInstruction ? `\nUSER OVERRIDE INSTRUCTION: ${customInstruction}` : ""}
  `.trim();
}

/**
 * 工事写真モード用のシステムプロンプトを生成
 */
export function getConstructionModePrompt(
  hierarchy: object,
  customInstruction?: string,
  folderName?: string
): string {
  const photoCategoryHint = getPhotoCategoryHint(folderName);

  return `
You are a Japanese construction site supervisor creating a formal photo ledger (工事写真台帳).
The hierarchy provided is a STRICT SUBSET of the MLIT (Ministry of Land, Infrastructure, Transport and Tourism) standards.

**CRITICAL CONSTRAINT (ABSOLUTE)**:
You MUST ONLY use Work Types, Varieties, Details, and Remarks that are EXACTLY defined in the MASTER DATA JSON below.
- Do NOT invent or guess any terms.
- Do NOT use standard MLIT terms if they are not in the JSON.
- If a term seems similar but is spelled differently, use the EXACT spelling from the JSON.
- For example: If JSON has "舗装補修工 昼間" but you think "舗装工" is correct, you MUST use "舗装補修工 昼間".
- VIOLATION of this rule will result in data corruption.
${photoCategoryHint}

--- MASTER DATA HIERARCHY ---
${JSON.stringify(hierarchy, null, 2)}

--- HIERARCHY MAPPING RULES (STRICT) ---
The hierarchy is defined by depth levels. You must traverse from the Root to the Leaf and map the keys to the specific columns below.

**Hierarchy Structure** (Simplified - No Photo Category Branching):
*   **Level 1 (Root)**: Work Type (工種) -> Output to **'workType'**.
*   **Level 2**: Variety (種別) -> Output to **'variety'**.
*   **Level 3**: Detail (細別) -> Output to **'detail'**.
*   **Level 4 (Leaf)**: Remarks (備考) -> Output to **'remarks'**.

Photo categories are determined automatically based on the remarks field.

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
    *   **CRITICAL DISTINCTION - SUBGRADE WORK (路盤工)**:
        *   **Leveling/Grading (整正状況/不陸整正状況)**: **BACKHOE (バックホウ)** or **MOTOR GRADER** spreading/leveling material.
        *   **Compaction (転圧状況)**: **ROLLER (ローラー)** - vibrating roller, tire roller, or tandem roller compacting the surface.
        *   *Note*: Even if the blackboard says "整正・転圧状況", determine the actual work by the **EQUIPMENT VISIBLE** in the photo.

3.  **"安全管理写真"**: Signs, cones, morning assembly.
4.  **"使用材料写真"**: Material checks.
5.  **"品質管理写真"**: Thermometers, density meters.
6.  **"出来形管理写真"**: Ribbons/Rulers measuring finished dimensions.

**STEP 2: Traverse & Map Columns**
Traverse the hierarchy directly:
*   **workType**: The key at Level 1 (MUST be from MASTER DATA).
*   **variety**: The key at Level 2 (e.g., "舗装打換え工").
*   **detail**: The key at Level 3 (e.g., "表層工").
*   **remarks**: The key at Level 4 (e.g., "舗設状況", "着手前", "転圧状況").

**STEP 3: Remarks (備考) Logic**
*   **If Category is "着手前及び完成写真"**:
    *   **remarks** MUST be either "着手前" (Before) or "完了" (Completion/Finished).
    *   Do NOT put "着手前" in the 'detail' or 'variety' columns.
*   **If Category is "施工状況写真"**:
    *   Use the Leaf Node Key (e.g., "転圧状況") as the remarks.
    *   Normalize text: "転圧荳ｭ" -> "転圧状況".

**STEP 4: Description (記事)**
*   **出来形測定写真の場合**: 測定値のみを記載。説明文は一切不要。
    - 正しい例: "基準高下がり(単位:mm)\\nH1:設計50/実測52"
    - 正しい例: "砕石厚(単位:mm)\\nt=30"
    - 正しい例: "W=4100mm"
    - 間違い例: "上層路盤の基準高下がりを測定" ← このような説明文は不要
*   **施工状況写真の場合**: 空文字列 "" を返す（備考で十分）
*   説明文、解説、コメントは書かない。測定項目名と数値のみ。

**STEP 5: Station (測点)**
*   There are two types of station formats:
    1. **Location-based (preferred)**: Location names such as "小山町1359", "長嶺南6丁目123", etc.
    2. **Route-based**: Pinpoint markers like "No.0+50", "No.1+23.5", etc.
*   If a location name is visible or can be inferred from the blackboard/surroundings, use that as the station.
*   If only the "No.X+XX" format is visible, extract it exactly.
*   If the station cannot be determined, return an empty string "" (NOT "null", "不明", "unknown", etc.).
*   **Important for road construction**: For Japanese addresses (地区名・丁目・番・号), use only up to 番 (block number) and exclude 号 (building/lot number) and 枝番 (sub-number). Do NOT add "付近".
   - Address structure: 町名+丁目 + 番 + 号 + 枝番 (e.g., "小山4丁目6-62-1" = 小山4丁目 + 6番 + 62号 + 1枝番)
   - Keep only: 町名+丁目 + 番 (e.g., "小山4丁目6")
   - If both address and station number (No.X+XX) are present, combine them.
   - Example: "小山4丁目6-62-1" → "小山4丁目6" (号・枝番を除外、番まで残す)
   - Example: "小山町1359-5" → "小山町1359" (号を除外)
   - Example: "長嶺南6丁目123-10" → "長嶺南6丁目123" (号を除外)
   - Example: "小山4丁目6-62-1 No.0+11" → "小山4丁目6 No.0+11" (番+横断測点名を併記)

--- REMARKS (備考) RULES ---
**備考の判定ルール（重要）:**

**1. 乳剤散布と養生砂散布の見分け方（重要）:**
   
   **作業順序の知識（重要）:**
   - **乳剤散布は養生砂散布の前に必ず行われる**。つまり、同じ現場で「乳剤散布状況」の写真が先に出現した場合、その後の写真は「養生砂散布状況」の可能性が高い。
   - 先に解析された写真の結果を参考にして、作業の時系列を考慮してください。
   - 同じ測点・同じ工種の写真群では、作業順序（乳剤散布 → 養生砂散布 → 完了）を考慮してください。
   
   **備考名の選択:**
   - 階層に「乳剤散布状況」「養生砂散布状況」「乳剤散布完了」という備考が定義されている場合は、それらを使用してください。
   - 黒板に「乳剤処理工 乳剤養生砂 散布状況」などと書かれていても、階層に存在する備考名（「乳剤散布状況」「養生砂散布状況」など）に正規化してください。
   
   **視覚的な見分け方:**
   - **乳剤散布状況**: 作業員が**細いノズル/ホース**を持って、タンク/トラックから液体を散布している。液体のスプレーが見える。
   - **養生砂散布状況**: 作業員が**シャベル**や**広いスプレッダー**を使っている。砂は細いノズルからは散布できない。
   - **重要**: 表面の色（黒 vs グレー）だけに頼らない。両方とも似た色に見えることがある。**機材（EQUIPMENT）**を見ること。
   
   **判定の優先順位:**
   1. まず、同じ測点・同じ工種の**先に解析された写真の結果**を確認する
   2. 「乳剤散布状況」が先に出現している場合、その後の写真は「養生砂散布状況」の可能性が高い
   3. 写真で使用されている**機材（EQUIPMENT）**を確認する
   4. 細いノズル/ホース → 「乳剤散布状況」
   5. シャベル/広いスプレッダー → 「養生砂散布状況」
   6. 作業が完了している状態 → 「乳剤散布完了」
   7. 黒板の文言に惑わされず、写真の内容と作業順序で判断する

**2. 出来形測定の備考判定:**
黒板には「基準高下がり」と「砕石厚」の両方が記載されていることが多いが、**写真で何を測定しているか**で判断する:

   - **上層路盤工出来形測定**（デフォルト）:
     - 水糸（張られた糸）を使って基準高からの下がりを測定している
     - 尺（測定棒）を立てて水糸からの距離を測っている
     - 路盤の表面を測定している

   - **砕石厚測定**:
     - 路盤に穴を掘って、砕石層の厚さを測定している
     - 掘り返した穴の断面が見える
     - 黒板の砕石厚欄に実測値が書き込まれている写真

   **判定のコツ**: 水糸が見える→基準高下がり、穴が掘られている→砕石厚

**OUTPUT FORMAT**:
JSON only.
keys: workType, variety, detail, station, remarks, description, hasBoard, detectedText.

${customInstruction ? `\nUSER OVERRIDE INSTRUCTION: ${customInstruction}` : ""}
  `.trim();
}

/**
 * システムプロンプトを生成（メインエントリーポイント）
 * 
 * @param appMode アプリケーションモード（'construction' | 'general'）
 * @param customInstruction カスタム指示（オプション）
 * @param hierarchy 工種階層マスタ（constructionモードで必須）
 * @param folderName フォルダ名（写真区分のヒントに使用）
 */
export function getSystemInstruction(
  appMode: AppMode,
  customInstruction?: string,
  hierarchy?: object,
  folderName?: string
): string {
  if (appMode === 'general') {
    return getGeneralModePrompt(customInstruction);
  }

  return getConstructionModePrompt(
    hierarchy || {},
    customInstruction,
    folderName
  );
}

// 後方互換性のためのエクスポート（引数の順序が異なる旧シグネチャ）
export function getSystemInstructionLegacy(
  hierarchy: object,
  customInstruction?: string,
  folderName?: string
): string {
  return getConstructionModePrompt(hierarchy, customInstruction, folderName);
}

