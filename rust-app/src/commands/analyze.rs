//! analyze コマンド - 写真フォルダを解析してJSON出力

use anyhow::{Context, Result};
use std::path::Path;

use crate::api::gemini::GeminiClient;
use crate::photo::scanner::scan_folder;
use crate::photo::processor::process_image;
use crate::types::{AnalysisOutput, AppMode, OutputRecord};

pub struct AnalyzeArgs {
    pub folder: String,
    pub output: String,
    pub instruction: Option<String>,
    pub mode: String,
    pub batch_size: usize,
    pub recursive: bool,
}

pub async fn run(args: AnalyzeArgs) -> Result<()> {
    println!("\n📸 GASPhotoAIManager CLI - 写真解析\n");

    // フォルダ存在確認
    let folder_path = Path::new(&args.folder);
    if !folder_path.is_dir() {
        anyhow::bail!("エラー: {} はディレクトリではありません", args.folder);
    }

    // 写真スキャン
    println!("写真をスキャン中...");
    let image_paths = scan_folder(folder_path, args.recursive)
        .context("写真のスキャンに失敗")?;

    if image_paths.is_empty() {
        println!("解析する写真が見つかりませんでした");
        return Ok(());
    }
    println!("{}枚の写真を検出", image_paths.len());

    // モード解析
    let mode: AppMode = args.mode.parse().unwrap_or_default();
    println!("\nモード: {:?}", mode);
    if let Some(ref inst) = args.instruction {
        println!("指示: {}", inst);
    }
    println!();

    // APIキー取得
    let api_key = std::env::var("GEMINI_API_KEY")
        .or_else(|_| std::env::var("GOOGLE_API_KEY"))
        .context("GEMINI_API_KEY または GOOGLE_API_KEY 環境変数を設定してください")?;

    // Geminiクライアント作成
    let client = GeminiClient::new(api_key);

    // バッチ処理
    let mut all_results = Vec::new();
    let batches: Vec<_> = image_paths.chunks(args.batch_size).collect();

    for (batch_idx, batch) in batches.iter().enumerate() {
        println!(
            "バッチ {}/{} ({}枚) 解析中...",
            batch_idx + 1,
            batches.len(),
            batch.len()
        );

        // 画像を処理
        let mut photo_inputs = Vec::new();
        for path in *batch {
            match process_image(path) {
                Ok(input) => photo_inputs.push(input),
                Err(e) => eprintln!("  警告: {} の処理に失敗: {}", path.display(), e),
            }
        }

        // AI解析
        match client
            .analyze_batch(&photo_inputs, mode, args.instruction.as_deref())
            .await
        {
            Ok(results) => {
                println!("  {} 件の結果を取得", results.len());
                all_results.extend(results);
            }
            Err(e) => {
                eprintln!("  エラー: バッチ解析に失敗: {}", e);
            }
        }
    }

    println!("\n{}枚の写真を解析完了", all_results.len());

    // 出力データ作成
    println!("出力データを準備中...");
    let mut output_data: Vec<OutputRecord> = Vec::new();

    for path in &image_paths {
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        // 対応する解析結果を検索
        let analysis = all_results
            .iter()
            .find(|r| r.file_name == file_name)
            .map(|r| AnalysisOutput::from(r.clone()));

        // 画像データを再取得
        match process_image(path) {
            Ok(input) => {
                output_data.push(OutputRecord {
                    file_name: input.file_name,
                    mime_type: input.mime_type,
                    date: input.date,
                    base64: input.base64,
                    analysis,
                });
            }
            Err(e) => {
                eprintln!("  警告: {} の読み込みに失敗: {}", path.display(), e);
            }
        }
    }

    // JSON出力
    let output_path = Path::new(&args.output);
    let json = serde_json::to_string_pretty(&output_data)?;
    std::fs::write(output_path, json).context("結果の保存に失敗")?;

    println!("結果を保存: {}", output_path.display());

    // サマリー表示
    println!("\n✅ 解析完了\n");
    println!("サマリー:");

    let mut work_types: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for record in &output_data {
        let wt = record
            .analysis
            .as_ref()
            .and_then(|a| a.work_type.as_ref())
            .map(|s| s.as_str())
            .unwrap_or("(未分類)");
        *work_types.entry(wt.to_string()).or_insert(0) += 1;
    }

    for (wt, count) in &work_types {
        println!("  {}: {}枚", wt, count);
    }

    println!("\n出力ファイル: {}", output_path.display());
    println!(
        "次のステップ: gaspm export {} -f both\n",
        output_path.display()
    );

    Ok(())
}
