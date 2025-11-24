
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { PhotoRecord, AIAnalysisResult } from "../types";
import { extractBase64Data } from "../utils/imageUtils";

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
          workType: { type: Type.STRING, description: "Inferred Work Type (工種). MUST be consistent with previous photos if not clearly visible." },
          station: { type: Type.STRING, description: "Station point (測点). Infer from sequence if necessary." },
          remarks: { type: Type.STRING, description: "Remarks (備考). The short title on the board (e.g. '床掘状況') AND normalized specs (e.g. 't=50'). IGNORE rod product codes." },
          description: { type: Type.STRING, description: "Description (記事). A full natural language sentence explaining the work activity (口語)." },
          hasBoard: { type: Type.BOOLEAN, description: "True if a construction blackboard/sign is visible." },
          detectedText: { type: Type.STRING, description: "Raw OCR text detected." }
        },
        required: ["fileName", "workType", "station", "remarks", "description", "hasBoard", "detectedText"]
      }
    }
  }
};

export const analyzePhotoBatch = async (
  records: PhotoRecord[], 
  customInstruction?: string // New Argument for user refinement
): Promise<AIAnalysisResult[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Prepare parts: Image + Prompt
  const parts: any[] = [];
  
  // Add images
  records.forEach((record) => {
    parts.push({
      inlineData: {
        mimeType: record.mimeType,
        data: extractBase64Data(record.base64)
      }
    });
  });

  let prompt = `
    Analyze this sequence of ${records.length} construction photos. They are sorted chronologically.
    
    CRITICAL INSTRUCTION: Analyze them as a GROUP to ensure consistency.
    
    1. **Contextual Interpolation**: If a photo's blackboard is blurry, obscured, or missing text:
       - Look at the photos BEFORE and AFTER it in this list.
       - Infer the 'Station' (測点) based on the numerical sequence.
       
    2. **Extraction Fields**:
       - **Work Type (工種)**: e.g., '道路土工', '排水構造物工'.
       
       - **Station (測点)**: e.g., 'No.1+10.0'.
         - **STRICT FILTER**: Only extract values that look like valid station numbers (usually starting with 'No.', 'STA.', 'SP', 'EP', 'BP', or containing '+').
         - **Ground Markings (CAUTION)**: Numbers spray-painted on the ground CAN be a **HINT** if the board is missing, but **CONSIDERATION IS NEEDED**.
           - Distinguish Station numbers (e.g. "No.5", "BP") from construction indicators (e.g. "-30" for depth, "500" for offset).
           - **VALIDATION**: Only adopt a ground number if it logically fits the numerical sequence of the surrounding photos.
         - If you are not sure or the confidence is low, prefer to **INFER** from the previous photo's station or leave blank.

       - **Remarks (備考)**: This field represents the DATA on the blackboard.
         - 1. Extract the **Short Title** EXACTLY as written on the board (e.g., '床掘状況', '埋戻状況', '完了').
           - **IMPORTANT**: Respect the blackboard text. Do NOT add inferred words or technical prefixes that are not visible (e.g. if board says '乳剤塗布', do NOT change it to '剥取端部乳剤塗布状況' based on visual guess). Keep it simple and faithful to the text.
         - 2. Extract **Technical Specs/Dimensions** (e.g., 't=50', 'W=1500', 'L=20.0'). Normalize them (e.g. "Thickness 50" -> "t=50").
         - **CRITICAL EXCLUSION**: IGNORE product codes printed on the measuring rods/poles themselves (e.g., 'N-50', 'N-100', 'R-50', 'High-Rod', 'Ribbon Rod'). These are tool identifiers, NOT measurement values. Only extract what is handwritten or printed on the BLACKBOARD.

       - **Description (記事)**: This field is for HUMAN READABLE EXPLANATION.
         - Write a **natural, descriptive sentence** in Japanese (口語/Descriptive style).
         - Describe the action simply.
         - Example: "バックホウにより所定の深さまで掘削を行っている。" 
         - Example: "検測ロッドを用いて幅員の出来形計測を行っている。"
         - Example: "路盤材の敷均し完了後の全景。"

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
    
    **SAFEGUARD**: Even when applying the user's instruction, do NOT violate the core data integrity rules:
    1. 'Remarks' (備考) MUST still primarily reflect the blackboard content. Do NOT fill it with long descriptive sentences or Work Type names unless explicitly told to "Replace Remarks with Work Type".
    2. Do NOT hallucinate data not present in the image or the user instruction.
    ----------------------------------------------------------------
    `;
  }

  parts.push({ text: prompt });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
        systemInstruction: "You are an expert construction site supervisor assistant. You prioritize OCR text fidelity for the 'Remarks' field. You adapt strictly to user provided Correction Rules."
      }
    });

    const text = response.text;
    if (!text) return [];
    
    const json = JSON.parse(text);
    return json.results || [];

  } catch (error) {
    console.error("Gemini Batch Error:", error);
    throw error;
  }
};