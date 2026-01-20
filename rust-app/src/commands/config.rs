//! config コマンド - 設定管理

use anyhow::Result;
use std::path::PathBuf;

pub struct ConfigArgs {
    pub action: Option<String>,
    pub value: Option<String>,
}

fn get_config_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("gaspm")
        .join("config.json")
}

pub fn run(args: ConfigArgs) -> Result<()> {
    let action = args.action.as_deref().unwrap_or("show");

    match action {
        "set-key" => {
            let key = args
                .value
                .ok_or_else(|| anyhow::anyhow!("APIキーを指定してください"))?;

            let config_path = get_config_path();
            if let Some(parent) = config_path.parent() {
                std::fs::create_dir_all(parent)?;
            }

            let config = serde_json::json!({
                "apiKey": key
            });
            std::fs::write(&config_path, serde_json::to_string_pretty(&config)?)?;

            println!("APIキーを保存しました: {}", config_path.display());
            println!("\n推奨: 環境変数 GEMINI_API_KEY を使用してください");
        }
        "show" => {
            println!("設定情報:");
            println!("  設定ファイル: {}", get_config_path().display());

            if std::env::var("GEMINI_API_KEY").is_ok() {
                println!("  GEMINI_API_KEY: 設定済み (環境変数)");
            } else if std::env::var("GOOGLE_API_KEY").is_ok() {
                println!("  GOOGLE_API_KEY: 設定済み (環境変数)");
            } else {
                println!("  APIキー: 未設定");
            }
        }
        "path" => {
            println!("{}", get_config_path().display());
        }
        _ => {
            println!("使用方法:");
            println!("  gaspm config set-key <API_KEY>  # APIキーを設定");
            println!("  gaspm config show               # 設定を表示");
            println!("  gaspm config path               # 設定ファイルパスを表示");
        }
    }

    Ok(())
}
