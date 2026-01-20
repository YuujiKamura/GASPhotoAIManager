//! GASPhotoAIManager CLI
//!
//! 工事写真AI解析ツール

use anyhow::Result;
use clap::{Parser, Subcommand};

mod api;
mod commands;
mod output;
mod photo;
mod types;

use commands::{analyze, config, export};

#[derive(Parser)]
#[command(name = "gaspm")]
#[command(about = "GASPhotoAIManager CLI - 工事写真AI解析ツール", long_about = None)]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// 写真フォルダを解析
    Analyze {
        /// 解析する写真フォルダのパス
        folder: String,

        /// 出力ファイルパス (JSON)
        #[arg(short, long, default_value = "result.json")]
        output: String,

        /// AI解析への追加指示
        #[arg(short, long)]
        instruction: Option<String>,

        /// アプリモード (construction/general)
        #[arg(short, long, default_value = "construction")]
        mode: String,

        /// バッチサイズ
        #[arg(short, long, default_value = "5")]
        batch_size: usize,

        /// サブフォルダも含める
        #[arg(short, long)]
        recursive: bool,
    },

    /// 解析結果をExcel/PDFに出力
    Export {
        /// 入力JSONファイルパス
        input: String,

        /// 出力形式 (excel/pdf/both)
        #[arg(short, long, default_value = "both")]
        format: String,

        /// 出力ディレクトリ
        #[arg(short, long, default_value = ".")]
        output: String,

        /// ページあたりの写真数 (2/3)
        #[arg(short, long, default_value = "3")]
        photos_per_page: u8,

        /// ドキュメントタイトル
        #[arg(short, long, default_value = "工事写真帳")]
        title: String,

        /// 日本語フォントファイルパス
        #[arg(long)]
        font: Option<String>,

        /// PDF画質 (high/medium/low/preview)
        #[arg(short = 'q', long, default_value = "high")]
        pdf_quality: String,
    },

    /// 設定管理
    Config {
        /// アクション (set-key/show/path)
        action: Option<String>,

        /// 設定値
        value: Option<String>,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Analyze {
            folder,
            output,
            instruction,
            mode,
            batch_size,
            recursive,
        } => {
            analyze::run(analyze::AnalyzeArgs {
                folder,
                output,
                instruction,
                mode,
                batch_size,
                recursive,
            })
            .await?;
        }
        Commands::Export {
            input,
            format,
            output,
            photos_per_page,
            title,
            font,
            pdf_quality,
        } => {
            export::run(export::ExportArgs {
                input,
                format,
                output,
                photos_per_page,
                title,
                font,
                pdf_quality,
            })
            .await?;
        }
        Commands::Config { action, value } => {
            config::run(config::ConfigArgs { action, value })?;
        }
    }

    Ok(())
}
