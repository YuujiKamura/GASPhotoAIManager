import { GoogleGenAI, Type, Schema } from "@google/genai";
import { PhotoRecord, AIAnalysisResult, AppMode, LogEntry } from "../types";
import { extractBase64Data } from "../utils/imageUtils";

// --- CONSTANTS ---
const API_KEY = process.env.API_KEY;

// Construction Hierarchy Master Data
const CONSTRUCTION_HIERARCHY = {
  "直接工事費": {
    "施工状況写真": {
      "道路土工": {
        "作業土工": {
          "掘削工（表土）": {
            "鋤取り・積込状況": {}
          }
        }
      },
      "構造物撤去工": {
        "構造物取壊し工": {
          "コンクリート構造物取壊し": {
            "取壊し状況": {},
            "コンクリート（有筋）処分前": {},
            "コンクリート（有筋）処分中": {},
            "コンクリート（有筋）処分後": {},
            "処分前": {},
            "処分中": {},
            "処分後": {},
            "積込状況": {}
          }
        }
      },
      "舗装工": {
        "舗装打換え工": {
          "舗装版切断": {
            "As舗装版切断状況": {},
            "既設舗装版切断状況": {}
          },
          "舗装版破砕": {
            "剥取状況": {},
            "積込状況": {},
            "既設舗装厚さ確認": {}
          },
          "上層路盤工": {
            "補足材搬入状況 M-40": {},
            "不陸整正状況": {},
            "転圧状況": {},
            "路盤完了状況": {}
          },
          "表層工": {
            "プライムコート乳剤散布状況": {},
            "プライムコート養生砂散布状況": {},
            "プライムコート養生砂清掃状況": {},
            "端部乳剤塗布状況": {},
            "舗設状況": {},
            "初期転圧状況": {},
            "2次転圧状況": {}
          }
        },
        "未舗装部舗装工": {
          "上層路盤工": {
            "補足材搬入状況 M-40": {},
            "不陸整正状況": {},
            "転圧状況": {},
            "路盤完了状況": {}
          },
          "表層工": {
            "プライムコート乳剤散布状況": {},
            "プライムコート養生砂散布状況": {},
            "プライムコート養生砂清掃状況": {},
            "端部乳剤塗布状況": {},
            "舗設状況": {},
            "初期転圧状況": {},
            "2次転圧状況": {}
          }
        },
        "瀝青安定処理路盤工": {
          "上層路盤工": {
            "補足材搬入状況 M-40": {},
            "不陸整正状況": {},
            "転圧状況": {},
            "路盤完了状況": {}
          },
          "表層工": {
            "プライムコート乳剤散布状況": {},
            "プライムコート養生砂散布状況": {},
            "プライムコート養生砂清掃状況": {},
            "端部乳剤塗布状況": {}
          }
        }
      },
      "区画線工": {
        "区画線工": {
          "溶融式区画線": {
            "清掃状況": {},
            "プライマー散布状況": {},
            "区画線設置状況": {}
          }
        }
      },
      "排水構造物工": {
        "作業土工": {
          "床掘り": {
            "掘削状況": {},
            "掘削完了": {}
          },
          "埋戻し": {
            "土砂埋戻し 転圧状況": {},
            "敷均し、転圧状況": {},
            "下層路盤 材料搬入状況 RC-40": {},
            "下層路盤 転圧状況": {},
            "上層路盤 敷均し状況": {},
            "上層路盤M-40 転圧状況": {}
          },
          "基礎砕石工": {
            "RC-40 搬入状況": {},
            "基礎砕石敷均し状況": {},
            "基礎砕石転圧状況": {}
          },
          "基礎コンクリート工": {
            "型枠設置完了": {},
            "打設前": {},
            "打設完了": {},
            "打設状況": {},
            "打設厚さ確認": {},
            "打設幅確認": {}
          }
        },
        "集水桝工": {
          "集水枡底版": {
            "集水桝底版 打設前確認": {},
            "底版コンクリート 打設前確認": {},
            "底版コンクリート 打設完了": {}
          },
          "プレキャスト集水桝": {
            "据付状況": {}
          }
        },
        "側溝工": {
          "側溝蓋": {
            "側溝蓋 打設前確認": {},
            "側溝蓋 打設完了": {},
            "天端コンクリート 打設前確認": {},
            "天端コンクリート 打設完了": {},
            "天端コンクリート 打設状況": {}
          },
          "プレキャストU型側溝": {
            "側溝300　据付状況": {},
            "G付側溝300　据付状況": {},
            "敷モルタル敷均し状況": {},
            "据付状況": {}
          }
        },
        "集水桝・マンホール工": {
          "人孔蓋撤去": {
            "鉄蓋処分状況": {},
            "既設人孔撤去状況": {}
          },
          "人孔蓋据付": {
            "調整ブロック設置状況": {},
            "据付状況": {},
            "高さ調整完了": {}
          },
          "人孔内部清掃": {
            "清掃状況": {},
            "清掃完了": {}
          },
          "調整蓋据付": {
            "据付状況": {}
          },
          "調整リングブロック設置": {
            "設置状況": {}
          },
          "転落防止蓋設置": {
            "設置状況": {}
          }
        }
      },
      "人孔改良工": {
        "集水桝・マンホール工": {
          "人孔蓋撤去": {
            "鉄蓋処分状況": {},
            "既設人孔撤去状況": {}
          },
          "人孔蓋据付": {
            "調整ブロック設置状況": {},
            "据付状況": {},
            "高さ調整完了": {}
          },
          "人孔内部清掃": {
            "清掃状況": {},
            "清掃完了": {}
          },
          "調整ブロック設置": {
            "調整ブロック設置状況": {}
          },
          "調整部撤去": {
            "調整部撤去状況": {}
          },
          "無収縮モルタル充填": {
            "無収縮モルタル充填状況": {}
          }
        },
        "舗装打換え工": {
          "舗装板切断": {
            "舗装板切断状況": {}
          },
          "舗装板破砕": {
            "舗装板破砕状況": {}
          },
          "既設舗装版撤去": {
            "既設舗装版撤去状況": {}
          },
          "上層路盤": {
            "上層路盤施工状況": {}
          },
          "表層（プライムコート）": {
            "プライムコート施工状況": {}
          },
          "表層（温度管理）": {
            "温度管理状況": {}
          },
          "表層（舗設）": {
            "舗設状況": {}
          }
        },
        "人孔蓋据付撤去工": {
          "既設人孔蓋撤去": {
            "既設人孔撤去状況": {},
            "撤去完了": {}
          },
          "既設受枠撤去": {
            "既設受枠撤去状況": {},
            "撤去完了": {}
          },
          "鉄蓋処分": {
            "鉄蓋処分状況": {},
            "処分完了": {}
          },
          "人孔蓋転落防止設置": {
            "人孔蓋転落防止設置状況": {},
            "設置完了": {}
          },
          "調整ブロック設置": {
            "調整ブロック設置状況": {},
            "設置完了": {}
          },
          "調整金具取付": {
            "調整金具パッキン取付状況": {},
            "調整金具パッキン使用": {},
            "固定用ボルト設置状況": {},
            "取付完了": {}
          },
          "人孔高さ調整": {
            "人孔(上部)高さ調整完了": {},
            "高さ調整状況": {}
          },
          "人孔内部清掃": {
            "人孔内清掃前状況": {},
            "人孔内清掃完了": {},
            "人孔内コンクリート撤去清掃状況": {}
          },
          "舗装版切断": {
            "舗装版切断状況": {}
          },
          "舗装版破砕積込": {
            "舗装版破砕積込状況": {},
            "積込完了": {}
          },
          "コンクリートはつり工": {
            "はつり工状況": {},
            "はつり工完了": {}
          },
          "汚泥吸排車": {
            "汚泥吸排状況": {},
            "汚泥吸排完了": {}
          },
          "表層工": {
            "表層工施工状況": {},
            "表層工完了": {}
          }
        }
      },
      "仮設工": {
        "交通管理工": {
          "交通誘導員配置": {
            "誘導員配置状況": {},
            "規制配置状況": {}
          },
          "保安施設設置": {
            "保安施設設置状況": {},
            "保安施設撤去状況": {}
          }
        }
      }
    },
    "出来形管理写真": {
      "舗装工": {
        "舗装打換え工": {
          "上層路盤工": {
            "不陸整正出来形": {
              "aliases": ["路盤出来形", "出来形検測", "路盤", "基準高下がり", "基準高"]
            },
            "不陸整正出来形・管理値": {},
            "不陸整正出来形・接写": {},
            "砕石厚測定": {}
          }
        }
      },
      "排水構造物工": {
        "作業土工": {
          "床掘り": {
            "掘削工出来形測定": {}
          },
          "埋戻し": {
            "土砂埋戻し出来形測定": {},
            "下層路盤出来形測定": {},
            "上層路盤出来形測定": {},
            "路床出来形測定": {}
          },
          "基礎砕石工": {
            "基礎砕石工出来形測定": {}
          },
          "基礎コンクリート工": {
            "基礎コンクリート出来形測定": {}
          }
        },
        "集水桝工": {
          "集水枡底版": {
            "集水桝底版出来形測定": {}
          },
          "プレキャスト集水桝": {
            "プレキャスト集水桝出来形測定": {}
          }
        },
        "側溝工": {
          "側溝蓋": {
            "側溝蓋出来形測定": {}
          },
          "プレキャストU型側溝": {
            "プレキャストU型側溝出来形測定": {}
          }
        }
      }
    },
    "品質管理写真": {
      "舗装工": {
        "舗装打換え工": {
          "表層工": {
            "As混合物 到着温度測定": {},
            "As混合物 敷均し温度測定": {},
            "As混合物 初期締固前温度測定": {},
            "As混合物 開放温度測定": {}
          }
        }
      }
    },
    "安全管理写真": {
      "舗装工": {
        "舗装打換え工": {
          "安全管理": {
            "朝礼・安全ミーティング実施状況": {},
            "規制配置・誘導員配置状況": {}
          }
        }
      },
      "仮設工": {
        "交通管理工": {
          "交通誘導警備員": {
            "交通誘導員配置状況": {},
            "規制配置状況": {}
          }
        }
      },
      "全工種共通": {
        "安全管理": {
          "安全管理": {
            "安全訓練実施状況": {}
          }
        }
      }
    },
    "使用材料写真": {
      "排水構造物工": {
        "側溝工": {
          "プレキャストU型側溝": {
            "G付側溝300": {},
            "側溝300x300": {},
            "側溝300": {}
          },
          "側溝蓋": {
            "蓋材料": {}
          }
        },
        "集水桝工": {
          "プレキャスト集水桝": {
            "集水桝500x500x800": {},
            "集水桝材料": {}
          },
          "集水桝底版": {
            "底版材料": {}
          }
        },
        "作業土工": {
          "基礎砕石工": {
            "砕石材料": {}
          },
          "基礎コンクリート工": {
            "生コンクリート材料": {}
          }
        }
      }
    },
    "着手前及び完成写真": {
      "人孔改良工": {
        "": {
          "": {
            "着手前": {},
            "完成": {}
          }
        }
      }
    },
    "その他": {
      "人孔改良工": {
        "使用機械": {}
      }
    }
  }
};

// Response Schema
const analysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    results: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          fileName: { type: Type.STRING, description: "The original filename of the image." },
          workType: { type: Type.STRING, description: "工種 (Construction Type) or Main Category." },
          variety: { type: Type.STRING, description: "種別 (Variety) or Sub-category." },
          detail: { type: Type.STRING, description: "細別 (Detail) or Detail tag." },
          station: { type: Type.STRING, description: "測点 (Station) or Location/Date." },
          remarks: { type: Type.STRING, description: "備考 (Remarks) normalized. Do not include Work Type name here." },
          description: { type: Type.STRING, description: "記事 (Description) or Full Explanation." },
          hasBoard: { type: Type.BOOLEAN, description: "True if a construction blackboard/sign is visible." },
          detectedText: { type: Type.STRING, description: "Raw OCR text detected." }
        },
        required: ["fileName", "workType", "station", "remarks", "description", "hasBoard", "detectedText"]
      }
    }
  }
};

/**
 * Identifies which photos need to be re-analyzed based on the user's instruction.
 * This saves tokens/time by filtering out photos that are not relevant to the change request.
 */
export const identifyTargetPhotos = async (
  records: PhotoRecord[],
  instruction: string
): Promise<string[]> => {
  // If instruction is empty or extremely generic, we might want to return all.
  // But usually this function is called when there IS an instruction.
  
  // Filter only records that are already done or have some analysis.
  // Pending records will be processed regardless.
  const analyzedRecords = records.filter(r => r.status === 'done' && r.analysis);
  
  if (analyzedRecords.length === 0) return [];

  const ai = new GoogleGenAI({ apiKey: API_KEY });
  
  // Create a lightweight summary of current state
  const summary = analyzedRecords.map(r => ({
    fileName: r.fileName,
    workType: r.analysis?.workType,
    remarks: r.analysis?.remarks,
    description: r.analysis?.description
  }));

  const prompt = `
  You are a smart filter for a photo processing batch.
  
  Current Photos Status:
  ${JSON.stringify(summary, null, 2)}

  User Instruction:
  "${instruction}"

  Task:
  Identify which filenames from the list above need to be re-analyzed or updated to satisfy the User Instruction.
  
  Rules:
  1. If the instruction applies to ALL photos (e.g., "Change all titles to X", "Translate everything"), return ALL filenames.
  2. If the instruction applies to specific criteria (e.g., "Change Paving photos to...", "Fix the typo in 'Excavation'"), return ONLY the matching filenames.
  3. If you are unsure, include the file to be safe.
  
  Output:
  Return a JSON object with a single property "targetFilenames" containing the array of strings.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            targetFilenames: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        }
      }
    });

    const json = JSON.parse(response.text || "{}");
    return json.targetFilenames || [];
  } catch (e) {
    console.warn("Smart filter failed, defaulting to all photos.", e);
    // Fallback: Return all filenames to be safe
    return analyzedRecords.map(r => r.fileName);
  }
};

/**
 * NORMALIZATION & CONSISTENCY PASS
 * Runs after all photos are processed to fix inconsistencies across the whole batch.
 */
export const normalizeDataConsistency = async (
  records: PhotoRecord[],
  onLog?: (msg: string, type: LogEntry['type'], details?: any) => void
): Promise<PhotoRecord[]> => {
  // Only process 'done' records
  const validRecords = records.filter(r => r.status === 'done' && r.analysis);
  if (validRecords.length < 2) return records; // Need at least 2 to compare

  if (onLog) onLog("Running final consistency check...", 'info');

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  // Prepare minimal data for context
  const inputData = validRecords.map(r => ({
    fileName: r.fileName,
    station: r.analysis!.station,
    date: r.date
  }));

  const prompt = `
    You are a Data Consistency Specialist for construction photos.
    
    INPUT DATA (Chronological):
    ${JSON.stringify(inputData, null, 2)}

    TASK:
    1. **Normalize Station Names (測点)**: 
       - Fix OCR errors (e.g., "No.0132.2" -> "No.0+32.2").
       - Unify formats (e.g., if most are "No.X+XX", change "No.X.XX" to match).
       - Unify location names (e.g., "小山町1359" vs "小山町ノ359" -> Pick the most common/correct one).
    2. **Infer Missing Stations**:
       - If a station is empty or "Unknown", infer it from the previous/next photos based on the sequence.

    OUTPUT:
    Return a JSON object with "corrections": an array of objects { "fileName": "...", "station": "..." }.
    Only include items that CHANGED.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            corrections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  fileName: { type: Type.STRING },
                  station: { type: Type.STRING }
                },
                required: ["fileName", "station"]
              }
            }
          }
        }
      }
    });

    const json = JSON.parse(response.text || "{}");
    const corrections = json.corrections || [];

    if (onLog) onLog(`Consistency check finished. Applying ${corrections.length} corrections.`, 'success', corrections);

    // Apply corrections
    const updatedRecords = records.map(r => {
      const fix = corrections.find((c: any) => c.fileName === r.fileName);
      if (fix && r.analysis) {
        return {
          ...r,
          analysis: {
            ...r.analysis,
            station: fix.station
          }
        };
      }
      return r;
    });

    return updatedRecords;

  } catch (e) {
    console.error("Consistency check failed", e);
    if (onLog) onLog("Consistency check failed. Skipping.", 'error');
    return records;
  }
};

export const analyzePhotoBatch = async (
  records: PhotoRecord[], 
  customInstruction?: string,
  batchSize: number = 3,
  appMode: AppMode = 'construction',
  onLog?: (msg: string, type: LogEntry['type'], details?: any) => void
): Promise<AIAnalysisResult[]> => {
  const ai = new GoogleGenAI({ apiKey: API_KEY });

  if (onLog) onLog(`Preparing batch of ${records.length} photos...`, 'info');

  // Prepare parts: Image + Prompt
  const parts: any[] = [];
  
  // Create Metadata Block
  let fileMetadataList = "";

  // Add images
  records.forEach((record, index) => {
    parts.push({
      inlineData: {
        mimeType: record.mimeType,
        data: extractBase64Data(record.base64)
      }
    });
    
    // Append context for this image
    const dateStr = record.date 
      ? new Date(record.date).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) 
      : "Unknown Date";
      
    fileMetadataList += `Image ${index + 1}: Filename="${record.fileName}", Date="${dateStr}"\n`;
  });

  const hierarchyJson = JSON.stringify(CONSTRUCTION_HIERARCHY, null, 2);

  let prompt = "";

  if (appMode === 'construction') {
    // --- CONSTRUCTION MODE PROMPT ---
    prompt = `
    Analyze this sequence of ${records.length} construction photos. They are sorted chronologically.
    
    CRITICAL INSTRUCTION: Analyze them as a GROUP to ensure consistency.
    
    **DOMAIN KNOWLEDGE (Visual Reasoning):**
    
    1. **PAVING DISAMBIGUATION RULES (CRITICAL):**
       - **Prime Coat (Emulsion vs Sand)**:
         - **Visual Cue (Liquid/Spray)**: If the worker is holding a **long nozzle/wand** connected to a hose or backpack, or if you see a **mist/spray**, this is **"プライムコート乳剤散布状況"** (Emulsion Spraying).
         - **Visual Cue (Solid/Shovel)**: If the worker is holding a **shovel/scoop** or throwing material by **hand** (from a bucket or pile), this is **"プライムコート養生砂散布状況"** (Sand Scattering).
         - **Color Cue**: Emulsion turns the road **black/wet**. Sand is **beige/gray/white** and covers the black surface.
         - **Sequence**: If multiple photos are provided, Spraying (Black) always happens *before* Sanding (Beige).
    
    2. **Extraction Fields & Hierarchy Classification**:
       
       **HIERARCHY MAPPING RULES (CRITICAL):**
       Use the following JSON master data to classify the photo.
       The JSON keys represent levels. You must traverse down to find the match.
       
       Structure Level Definitions:
       - Level 1: Direct Construction Cost (e.g. 直接工事費)
       - Level 2: Photo Classification (e.g. 施工状況写真)
       - **Level 3 (Work Type / 工種)**: The key at this level (e.g. 舗装工, 排水構造物工).
       - **Level 4 (Variety / 種別)**: The key under Level 3 (e.g. 舗装打換え工, 作業土工).
       - **Level 5 (Detail / 細別)**: The key under Level 4 (e.g. 上層路盤工, 床掘り).
       - **Level 6 (Specific Item / Leaf)**: Specific situations or titles under Level 5 (e.g. 不陸整正状況, 完了).
       
       DATA:
       ${hierarchyJson}

       **YOUR TASK:**
       1. Identify the matching path in the JSON based on the blackboard text OR visual content.
       2. Extract the keys from the levels as follows:
       
       - **Work Type (工種)**: Output the key from **Level 3**.
       - **Variety (種別)**: Output the key from **Level 4**.
       - **Detail (細別)**: Output the key from **Level 5**.
         - **IMPORTANT EXCLUSION**: The 'Detail' field MUST be a category noun (like '上層路盤工'). 
         - **DO NOT** output Level 6 keys (situations ending in '状況', '完了', '確認') into the 'Detail' field.
       
       - **Remarks (備考) - NORMALIZATION REQUIRED**: 
         - This field represents the specific situation (Level 6) or specific data.
         - **REDUNDANCY REMOVAL**: If the blackboard says "路盤工　転圧状況" (Sub-base Work: Rolling Compaction), and the Detail (Level 5) is "上層路盤工" (Sub-base Work), **DO NOT** repeat "路盤工" in the Remarks.
         - **CORRECT**: Remarks = "転圧状況"
         - **INCORRECT**: Remarks = "路盤工 転圧状況"
         - **RULE**: Remove words from Remarks that are already present in Work Type, Variety, or Detail fields.

       - **Station (測点) - CONSISTENCY CHECK**: e.g., 'No.1+10.0'.
         - **BATCH CONSISTENCY**: Look at ALL photos in the list.
         - **OCR ERROR CORRECTION**: 
           - If one photo says "No.0132.2" and others say "No.0+32.2", assume the "+" was misread as "1". Output "No.0+32.2".
           - If one photo says "小山町ノ359" and another says "小山町1359", use the context to pick the correct address (likely "小山町1359").
           - **Infer from Sequence**: If Board is missing, infer Station from the previous and next photos.

       - **Description (記事)**: This field is for HUMAN READABLE EXPLANATION.
         - Write a **natural, descriptive sentence** in Japanese (口語/Descriptive style).
         - **Context Aware**: Use the visual tool analysis (Sprayer vs Shovel) to describe the action accurately, even if the blackboard text is generic.
         - Example: "エンジンスプレイヤーを使用し、アスファルト乳剤を散布している状況。"
         - Example: "ロードローラーにより路盤の転圧を行っている状況。"
         - Example: "人力により養生砂を散布している状況。"
    `;
  } else {
    // --- GENERAL ARCHIVE MODE PROMPT ---
    prompt = `
    Analyze this sequence of ${records.length} photos as a 'Photo Archive AI'.
    You are an intelligent robot archivist. You process photos like folding laundry: neatly, efficiently, and with respect for the memories.
    
    **CONTEXT IS KEY (TIME & DATE):**
    I have provided the capture timestamp for each image below. USE THIS.
    - If the date says "December", look for winter cues (snow, coats) or events (Christmas).
    - If the time says "19:00", expect a night scene.
    - Mention the season or time of day in the description if relevant.

    **IMAGE METADATA:**
    ${fileMetadataList}

    **Mapping Rules:**
    - **Work Type**: Use this field for the **Main Category** (e.g., 'Kitchen', 'Landscape', 'Damaged Area', 'Item').
    - **Variety**: Use this field for **Sub-Category** (e.g., 'Sink', 'Mountain', 'Wall Crack', 'Model A').
    - **Detail**: Use this field for **Specific Detail** (e.g., 'Leaking', 'Snowy', 'Width 5mm').
    - **Station**: Use this field for **LOCATION**. 
      - Infer the specific location from visual cues (e.g., 'Living Room', 'Tokyo Station', 'North Side').
      - Do NOT put the date here (it is displayed separately). JUST the location.
    - **Remarks**: Use this field for **Title or Key Point** (e.g., 'Renovation Needed', 'Beautiful Sunset', 'Inventory Count').
    - **Description**: Write a detailed, natural explanation of what is shown in the photo, incorporating the context of the date/time provided.
    - **hasBoard**: True if any text signage or label is prominent.

    **Style:**
    - Be concise and organized.
    - Use Japanese for all text output unless instructed otherwise.
    `;
  }

  // Common footer
  prompt += `
    IMPORTANT: The output JSON 'results' array MUST contain exactly ${records.length} items.
    Ensure every input image has a corresponding result, in the exact same order.
    The 'fileName' in the result must match the input filename: 
    ${records.map(r => r.fileName).join(', ')}
  `;

  // Inject User Custom Instruction if provided
  if (customInstruction) {
    prompt += `
    
    ----------------------------------------------------------------
    **USER OVERRIDE / REFINEMENT INSTRUCTION**:
    The user has provided a specific rule to fix or adjust the output. 
    You MUST apply the following logic strictly to the results:
    
    "${customInstruction}"
    
    **SAFEGUARD**: Even when applying the user's instruction, do NOT violate the core data integrity rules.
    ----------------------------------------------------------------
    `;
  }

  parts.push({ text: prompt });

  // Retry Logic for Rate Limits
  let retries = 5;
  let delay = 20000; // Start with 20 seconds delay if hit 429

  while (true) {
    try {
      if (onLog) onLog(`Sending Request to Gemini 2.5 Flash... (Attempt ${6 - retries}/5)`, 'info');

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: analysisSchema,
          systemInstruction: appMode === 'construction' 
            ? "You are an expert construction site supervisor assistant." 
            : "You are an intelligent photo archivist."
        }
      });

      const text = response.text;
      if (!text) {
        if (onLog) onLog("Received empty response from API.", 'error');
        return [];
      }
      
      const json = JSON.parse(text);

      if (onLog) {
         onLog(`Received Response (${json.results?.length || 0} items):`, 'json', json);
      }
      
      return json.results || [];

    } catch (error: any) {
      const errMsg = error.message || JSON.stringify(error) || "";
      const isQuota = errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota");
      
      if (onLog) onLog(`API Error: ${errMsg}`, 'error');

      if (isQuota && retries > 0) {
        if (onLog) onLog(`Quota Exceeded. Pausing for ${delay/1000}s...`, 'info');
        console.warn(`Gemini Quota Exceeded. Retrying in ${delay}ms. Retries left: ${retries}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        retries--;
        delay *= 2; // Exponential Backoff: 20s -> 40s -> 80s -> 160s -> 320s
      } else {
        console.error("Gemini Batch Error:", error);
        throw error;
      }
    }
  }
};