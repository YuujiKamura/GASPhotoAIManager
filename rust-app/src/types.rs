//! 共通型定義

use serde::{Deserialize, Serialize};

/// 写真入力データ
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhotoInput {
    #[serde(rename = "fileName")]
    pub file_name: String,
    pub base64: String,
    #[serde(rename = "mimeType")]
    pub mime_type: String,
    #[serde(default)]
    pub date: Option<i64>,
    /// ファイルパス（内部用）
    #[serde(skip)]
    pub file_path: Option<String>,
}

/// AI解析結果
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AnalysisResult {
    #[serde(rename = "fileName")]
    pub file_name: String,
    #[serde(rename = "workType", default)]
    pub work_type: String,
    #[serde(default)]
    pub variety: String,
    #[serde(default)]
    pub detail: String,
    #[serde(default)]
    pub station: String,
    #[serde(rename = "remarksCategory", default)]
    pub remarks_category: String,
    #[serde(default)]
    pub measurements: String,
    #[serde(default)]
    pub description: String,
    #[serde(rename = "hasBoard", default)]
    pub has_board: bool,
    #[serde(rename = "detectedText", default)]
    pub detected_text: String,
    #[serde(default)]
    pub reasoning: String,
}

/// 出力用レコード（base64含む）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputRecord {
    #[serde(rename = "fileName")]
    pub file_name: String,
    #[serde(rename = "mimeType")]
    pub mime_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date: Option<i64>,
    pub base64: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub analysis: Option<AnalysisOutput>,
}

/// 解析結果出力用
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisOutput {
    #[serde(rename = "workType", skip_serializing_if = "Option::is_none")]
    pub work_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variety: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub station: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remarks: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub measurements: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(rename = "hasBoard", skip_serializing_if = "Option::is_none")]
    pub has_board: Option<bool>,
    #[serde(rename = "detectedText", skip_serializing_if = "Option::is_none")]
    pub detected_text: Option<String>,
}

impl From<AnalysisResult> for AnalysisOutput {
    fn from(r: AnalysisResult) -> Self {
        Self {
            work_type: Some(r.work_type),
            variety: Some(r.variety),
            detail: Some(r.detail),
            station: Some(r.station),
            remarks: Some(r.remarks_category),
            measurements: Some(r.measurements),
            description: Some(r.description),
            has_board: Some(r.has_board),
            detected_text: Some(r.detected_text),
        }
    }
}

/// アプリモード
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum AppMode {
    #[default]
    Construction,
    General,
}

impl std::str::FromStr for AppMode {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "construction" => Ok(Self::Construction),
            "general" => Ok(Self::General),
            _ => Err(format!("Unknown mode: {}", s)),
        }
    }
}

/// PDF画質設定
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum PdfQuality {
    #[default]
    High,
    Medium,
    Low,
    Preview,
}

impl std::str::FromStr for PdfQuality {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "high" => Ok(Self::High),
            "medium" => Ok(Self::Medium),
            "low" => Ok(Self::Low),
            "preview" => Ok(Self::Preview),
            _ => Err(format!("Unknown quality: {}", s)),
        }
    }
}

/// 備考カテゴリ一覧
pub const REMARKS_CATEGORIES: &[&str] = &[
    "到着温度", "敷均し温度", "初期締固め前温度", "開放温度",
    "アスファルト混合物温度測定",
    "現場密度測定",
    "転圧状況", "敷均し状況", "舗設状況", "初期転圧状況", "2次転圧状況",
    "乳剤散布状況", "端部乳剤塗布状況", "養生砂散布状況", "清掃状況",
    "掘削状況", "積込状況", "取壊し状況", "据付状況", "設置状況",
    "着手前", "完了", "竣工", "施工完了", "既済部分",
    "不陸整正出来形", "路盤厚出来形", "表層厚出来形", "幅員出来形",
    "朝礼実施状況", "朝礼・KYミーティング実施状況", "朝礼状況",
    "KY活動状況", "危険予知活動状況", "KYミーティング実施状況",
    "新規入場者教育状況", "新規入場者教育実施状況",
    "保安施設設置状況", "点灯確認状況", "安全巡視状況",
    "安全訓練実施状況", "避難訓練実施状況",
    "災害発生状況", "事故発生状況", "被害状況",
    "環境対策状況", "騒音対策状況", "粉塵対策状況",
    "その他",
];
