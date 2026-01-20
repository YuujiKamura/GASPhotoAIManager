# PRD: GASPhotoAIManager Rust移行

## 1. 概要

### 1.1 背景
現行TypeScript実装でPDF生成時に日本語フォントエンコーディングエラーが発生。
```
WinAnsi cannot encode "工" (0x5de5)
```

### 1.2 目的
- RustでCLI版を再実装
- 日本語PDF生成問題を根本解決
- 将来的にWASM版でWebUIも統一

### 1.3 スコープ
| 対象 | 含む | 含まない |
|------|------|----------|
| CLI | analyze, export | server, analyze:web |
| API | Gemini API | Claude API |
| 出力 | PDF, Excel, JSON | HTML |

---

## 2. 現行機能分析

### 2.1 CLIコマンド構造
```
gaspm
├── analyze <folder>     # 写真解析 → JSON出力
│   ├── -o, --output     # 出力ファイルパス
│   ├── -b, --batch-size # バッチサイズ (default: 5)
│   ├── -m, --mode       # construction/general
│   └── -i, --instruction # AI追加指示
│
├── export <input.json>  # JSON → PDF/Excel
│   ├── -f, --format     # excel/pdf/both
│   ├── -o, --output     # 出力ディレクトリ
│   ├── -p, --photos-per-page # 2/3
│   ├── -t, --title      # タイトル
│   ├── --font           # 日本語フォントパス
│   └── -q, --pdf-quality # high/medium/low
│
└── config [action]      # 設定管理
    └── set-key <key>    # APIキー設定
```

### 2.2 データフロー
```
写真フォルダ
    ↓ scanFolder()
画像ファイル一覧
    ↓ processImage() - base64変換
PhotoInput[]
    ↓ analyzePhotos() - Gemini API
AnalysisResult[]
    ↓ JSON保存
result.json
    ↓ export
PDF / Excel
```

### 2.3 Gemini API連携

**エンドポイント**: `@google/genai` SDK
**モデル**: `gemini-2.5-flash` (フォールバック: `gemini-2.0-flash`)

**入力**:
```typescript
{
  fileName: string;
  base64: string;     // 画像データ
  mimeType: string;
  date?: number;      // 撮影日時
}
```

**出力スキーマ**:
```typescript
{
  fileName: string;
  workType: string;      // 工種
  variety: string;       // 種別
  detail: string;        // 細別
  station: string;       // 測点
  remarksCategory: enum; // 備考カテゴリ（固定リスト）
  measurements: string;  // 測定値
  description: string;   // 説明
  hasBoard: boolean;     // 黒板有無
  detectedText: string;  // OCRテキスト
}
```

### 2.4 PDF生成仕様

- A4縦 (595 x 842 pt)
- 1ページあたり2-3枚の写真
- 左: 画像 (65%), 右: 情報欄 (35%)
- 日本語フォント必須（游明朝/游ゴシック/IPAexゴシック）

### 2.5 Excel生成仕様

- A4縦フィット
- ページごとにシート分割
- 列A: 画像, 列B: ラベル, 列C: 値

---

## 3. Rust実装計画

### 3.1 プロジェクト構造
```
rust-app/
├── Cargo.toml
├── src/
│   ├── main.rs          # CLIエントリ
│   ├── lib.rs           # ライブラリルート
│   ├── commands/
│   │   ├── mod.rs
│   │   ├── analyze.rs   # analyzeコマンド
│   │   ├── export.rs    # exportコマンド
│   │   └── config.rs    # configコマンド
│   ├── api/
│   │   ├── mod.rs
│   │   └── gemini.rs    # Gemini API クライアント
│   ├── photo/
│   │   ├── mod.rs
│   │   ├── scanner.rs   # フォルダスキャン
│   │   └── processor.rs # 画像処理
│   ├── output/
│   │   ├── mod.rs
│   │   ├── pdf.rs       # PDF生成
│   │   └── excel.rs     # Excel生成
│   └── types.rs         # 共通型定義
└── fonts/
    └── ipaexg.ttf       # 日本語フォント
```

### 3.2 依存クレート

| 用途 | クレート | 理由 |
|------|----------|------|
| CLI | `clap` | デファクト |
| HTTP | `reqwest` | 非同期対応 |
| JSON | `serde`, `serde_json` | デファクト |
| PDF | `printpdf` | 日本語フォント埋め込み対応 |
| Excel | `rust_xlsxwriter` | xlsxwriter互換 |
| 画像 | `image` | 標準的 |
| Base64 | `base64` | 標準的 |
| 非同期 | `tokio` | デファクト |
| エラー | `anyhow`, `thiserror` | 標準的 |

### 3.3 実装フェーズ

#### Phase 1: 基盤 (MVP)
1. プロジェクト構造作成
2. CLI基盤（clap）
3. 写真スキャン・読み込み
4. Gemini API連携
5. JSON出力

#### Phase 2: 出力
6. PDF生成（日本語対応）
7. Excel生成
8. エイリアス機能

#### Phase 3: 品質
9. エラーハンドリング強化
10. テスト追加
11. ドキュメント

---

## 4. 技術仕様

### 4.1 Gemini API呼び出し

```rust
// POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
// Header: x-goog-api-key: {API_KEY}
// Body: { contents: [...], generationConfig: { responseMimeType: "application/json" } }
```

### 4.2 PDF日本語対応

```rust
use printpdf::*;

let font_bytes = include_bytes!("../fonts/ipaexg.ttf");
let font = doc.add_external_font(font_bytes)?;
layer.use_text("工事写真帳", 14.0, Mm(20.0), Mm(280.0), &font);
```

### 4.3 型定義

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct PhotoInput {
    pub file_name: String,
    pub base64: String,
    pub mime_type: String,
    pub date: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnalysisResult {
    pub file_name: String,
    pub work_type: String,
    pub variety: String,
    pub detail: String,
    pub station: String,
    pub remarks_category: String,
    pub measurements: String,
    pub description: String,
    pub has_board: bool,
    pub detected_text: String,
}
```

---

## 5. 成功基準

1. [ ] `cargo build --release` が成功する
2. [ ] `photo-album analyze <folder>` でJSON出力される
3. [ ] `photo-album export <json> -f pdf` で日本語PDFが生成される
4. [ ] 「工事写真帳」が正しく表示される
5. [ ] 現行CLIと同等の機能を持つ

---

## 6. リスクと対策

| リスク | 対策 |
|--------|------|
| printpdfの日本語対応 | フォント埋め込みで解決済み（実績あり） |
| Gemini API SDKがない | REST API直接呼び出し |
| 画像埋め込みサイズ | リサイズ処理を実装 |

---

## 7. 参考

- 既存スキル: `rust-wasm-pages`, `rust-pdf-filler`, `photo-ai-rust`
- Issue: #150
