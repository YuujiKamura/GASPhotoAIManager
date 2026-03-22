//! Gemini API クライアント

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::types::{AnalysisResult, AppMode, PhotoInput, REMARKS_CATEGORIES};

const PRIMARY_MODEL: &str = "gemini-2.5-flash";
const FALLBACK_MODEL: &str = "gemini-2.0-flash";
const API_BASE_URL: &str = "https://generativelanguage.googleapis.com/v1beta/models";

pub struct GeminiClient {
    api_key: String,
    client: reqwest::Client,
}

impl GeminiClient {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            client: reqwest::Client::new(),
        }
    }

    /// バッチ解析を実行
    pub async fn analyze_batch(
        &self,
        photos: &[PhotoInput],
        mode: AppMode,
        instruction: Option<&str>,
    ) -> Result<Vec<AnalysisResult>> {
        let system_prompt = get_system_instruction(mode, instruction);

        // 画像パーツを構築
        let mut parts: Vec<Part> = photos
            .iter()
            .map(|p| Part::InlineData {
                inline_data: InlineData {
                    mime_type: p.mime_type.clone(),
                    data: extract_base64_data(&p.base64),
                },
            })
            .collect();

        // プロンプトを追加
        let photo_info: Vec<String> = photos
            .iter()
            .map(|p| {
                let time_info = p
                    .date
                    .map(|d| format_shooting_time(d))
                    .unwrap_or_else(|| "unknown".to_string());
                format!("{} (撮影時間: {})", p.file_name, time_info)
            })
            .collect();

        let prompt = format!(
            r#"Analyze these {} photos.
For each photo, output the JSON object matching the schema.
Order must match the input order.

Photo Info:
{}"#,
            photos.len(),
            photo_info.join("\n")
        );

        parts.push(Part::Text { text: prompt });

        // リクエスト構築
        let request = GenerateContentRequest {
            system_instruction: Some(Content {
                parts: vec![Part::Text {
                    text: system_prompt,
                }],
            }),
            contents: vec![Content { parts }],
            generation_config: Some(GenerationConfig {
                response_mime_type: "application/json".to_string(),
                temperature: Some(0.1),
            }),
        };

        // API呼び出し（リトライ付き）
        let mut model = PRIMARY_MODEL;
        let mut attempts = 0;
        const MAX_RETRIES: u32 = 3;

        loop {
            let url = format!(
                "{}/{}:generateContent?key={}",
                API_BASE_URL, model, self.api_key
            );

            let response = self
                .client
                .post(&url)
                .json(&request)
                .send()
                .await
                .context("API呼び出しに失敗")?;

            if response.status().is_success() {
                let api_response: GenerateContentResponse = response
                    .json()
                    .await
                    .context("APIレスポンスの解析に失敗")?;

                // テキストを抽出
                let text = api_response
                    .candidates
                    .first()
                    .and_then(|c| c.content.parts.first())
                    .and_then(|p| match p {
                        Part::Text { text } => Some(text.clone()),
                        _ => None,
                    })
                    .unwrap_or_default();

                // JSONパース
                let results: Vec<AnalysisResult> =
                    serde_json::from_str(&text).context("AIレスポンスのJSONパースに失敗")?;

                return Ok(results);
            }

            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();

            attempts += 1;

            // レート制限の場合はフォールバック
            if status.as_u16() == 429 || status.as_u16() == 503 {
                if model != FALLBACK_MODEL {
                    eprintln!("  レート制限のためフォールバック: {}", FALLBACK_MODEL);
                    model = FALLBACK_MODEL;
                    tokio::time::sleep(tokio::time::Duration::from_secs(6)).await;
                    continue;
                }
            }

            if attempts >= MAX_RETRIES {
                anyhow::bail!("APIエラー ({}): {}", status, error_text);
            }

            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        }
    }
}

fn get_system_instruction(mode: AppMode, instruction: Option<&str>) -> String {
    match mode {
        AppMode::General => {
            let base = r#"You are a professional photo archivist. Analyze the image and provide structured metadata.
1. Category: Main subject (e.g., Landscape, Family, Work).
2. Sub-category: Specifics (e.g., Mountain, Birthday, Office).
3. Location: Inferred or read from text.
4. Description: A concise caption explaining the photo."#;
            match instruction {
                Some(inst) => format!("{}\n\nUSER OVERRIDE INSTRUCTION: {}", base, inst),
                None => base.to_string(),
            }
        }
        AppMode::Construction => {
            let remarks_list = REMARKS_CATEGORIES.join(", ");
            let base = format!(
                r#"You are a Japanese construction site supervisor creating a formal photo ledger (工事写真帳).

**PHOTO CATEGORIES (写真区分)**:
1. 着手前及び完成写真 - Before construction / After completion
2. 施工状況写真 - Construction in progress (active work)
3. 安全管理写真 - Safety management (morning meetings, KY activities)
4. 使用材料写真 - Materials
5. 品質管理写真 - Quality control (temperature, density)
6. 出来形管理写真 - Finished dimension measurement
7. 災害写真 - Disaster
8. 事故写真 - Accident
9. その他 - Others

**OUTPUT FORMAT**:
- workType: 工種 (e.g., 舗装工, 道路土工)
- variety: 種別 (e.g., 舗装打換え工)
- detail: 細別 (e.g., 表層工, 舗装版破砕)
- station: 測点 format "地名 No.整数" (e.g., "○○町1丁目 No.4")
- remarksCategory: Select from: {}
- measurements: All numerical values with units
- description: Important info from blackboard or scene
- hasBoard: true if blackboard is visible
- detectedText: OCR text from blackboard

**SAFETY PHOTOS (安全管理写真)**:
For safety photos, set workType="", variety="", detail="".
Use remarksCategory like "朝礼実施状況", "KY活動状況", "新規入場者教育状況""#,
                remarks_list
            );
            match instruction {
                Some(inst) => format!("{}\n\nUSER INSTRUCTION: {}", base, inst),
                None => base,
            }
        }
    }
}

fn extract_base64_data(base64: &str) -> String {
    if let Some(pos) = base64.find(',') {
        base64[pos + 1..].to_string()
    } else {
        base64.to_string()
    }
}

fn format_shooting_time(timestamp: i64) -> String {
    use chrono::{TimeZone, Utc};
    let dt = Utc.timestamp_millis_opt(timestamp).unwrap();
    dt.format("%H:%M").to_string()
}

// Gemini API リクエスト/レスポンス型

#[derive(Debug, Serialize)]
struct GenerateContentRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    system_instruction: Option<Content>,
    contents: Vec<Content>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation_config: Option<GenerationConfig>,
}

#[derive(Debug, Serialize)]
struct Content {
    parts: Vec<Part>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
enum Part {
    Text {
        text: String,
    },
    InlineData {
        #[serde(rename = "inlineData")]
        inline_data: InlineData,
    },
}

#[derive(Debug, Serialize, Deserialize)]
struct InlineData {
    #[serde(rename = "mimeType")]
    mime_type: String,
    data: String,
}

#[derive(Debug, Serialize)]
struct GenerationConfig {
    #[serde(rename = "responseMimeType")]
    response_mime_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Debug, Deserialize)]
struct GenerateContentResponse {
    candidates: Vec<Candidate>,
}

#[derive(Debug, Deserialize)]
struct Candidate {
    content: ContentResponse,
}

#[derive(Debug, Deserialize)]
struct ContentResponse {
    parts: Vec<Part>,
}
