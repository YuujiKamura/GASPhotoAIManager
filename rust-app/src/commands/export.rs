//! export コマンド - 解析結果をExcel/PDFに出力

use anyhow::{Context, Result};
use std::path::Path;

use crate::output::{excel, pdf};
use crate::types::{OutputRecord, PdfQuality};

pub struct ExportArgs {
    pub input: String,
    pub format: String,
    pub output: String,
    pub photos_per_page: u8,
    pub title: String,
    pub font: Option<String>,
    pub pdf_quality: String,
}

pub async fn run(args: ExportArgs) -> Result<()> {
    println!("\n📄 GASPhotoAIManager CLI - エクスポート\n");

    // 入力ファイル読み込み
    let input_path = Path::new(&args.input);
    let content = std::fs::read_to_string(input_path)
        .with_context(|| format!("ファイルが見つかりません: {}", input_path.display()))?;

    let input_data: Vec<OutputRecord> =
        serde_json::from_str(&content).context("JSONの解析に失敗")?;

    let pdf_quality: PdfQuality = args.pdf_quality.parse().unwrap_or_default();

    println!("入力: {}", input_path.display());
    println!("写真数: {}枚", input_data.len());
    println!("形式: {}", args.format);
    println!("ページあたり: {}枚", args.photos_per_page);
    if args.format == "pdf" || args.format == "both" {
        println!("PDF画質: {:?}", pdf_quality);
    }
    println!();

    // 出力ディレクトリ確認
    let output_dir = Path::new(&args.output);
    std::fs::create_dir_all(output_dir).ok();

    let date_str = chrono::Local::now().format("%Y-%m-%d").to_string();
    let base_name = input_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");

    // フォーマットに応じて出力
    let formats: Vec<&str> = if args.format == "both" {
        vec!["excel", "pdf"]
    } else {
        vec![args.format.as_str()]
    };

    for format in formats {
        match format {
            "excel" => {
                println!("Excelファイルを生成中...");
                let output_path = output_dir.join(format!("{}_{}.xlsx", base_name, date_str));
                excel::generate(&input_data, &output_path, args.photos_per_page, &args.title)?;
                println!("Excel出力: {}", output_path.display());
            }
            "pdf" => {
                println!("PDFファイルを生成中...");
                let output_path = output_dir.join(format!("{}_{}.pdf", base_name, date_str));
                pdf::generate(
                    &input_data,
                    &output_path,
                    args.photos_per_page,
                    &args.title,
                    args.font.as_deref(),
                    pdf_quality,
                )?;
                println!("PDF出力: {}", output_path.display());
            }
            _ => {
                eprintln!("警告: 不明な形式: {}", format);
            }
        }
    }

    println!("\n✅ エクスポート完了\n");

    Ok(())
}
