# GASPhotoAIManager

工事写真のAI自動分類・写真台帳生成ツール。

## 技術スタック

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS
- **AI**: Google Gemini 2.5 Flash（メイン）、Claude Code SDK（ローカル専用）
- **出力**: ExcelJS、pdf-lib、html2pdf
- **ストレージ**: IndexedDB（履歴）、LocalStorage（設定）

## 動作モード

| モード | 説明 | AI |
|--------|------|-----|
| Web (GitHub Pages) | https://yuujikamura.github.io/GASPhotoAIManager/ | Gemini API |
| Web (ローカル) | `npm run dev` | Gemini or Claude SDK |
| CLI | `npm run cli` | Gemini or Claude SDK |
| Server | `npm run server` (WebSocket on :3001) | Claude SDK |

## 主要機能

- **黒板OCR**: 工事黒板から工種・種別・細別・測点・備考を抽出
- **景観ペアリング**: 着手前/完了写真の自動マッチング
- **Engramトークン最適化**: 解析結果を圧縮してトークン消費75-80%削減
- **スマートPDF**: セッションデータ埋め込み、後から復元可能

## コマンド

```bash
npm run dev          # 開発サーバー
npm run build        # プロダクションビルド
npm run test         # テスト実行
npm run cli          # CLI解析ツール
npm run server       # WebSocketサーバー
```

## ワークフロー

- **PR不要**: mainブランチに直接プッシュ
- **ビルド確認**: `npm run build` 成功を確認してからコミット
- **テスト**: ビルドが通ればOK

## セキュリティ

コミット禁止:
- APIキー、認証情報
- 個人情報（氏名、住所、電話番号）
- 工事固有情報（工事名、単価）

## アーキテクチャ

```
写真 → AI解析(Gemini/Claude) → JSON → PDF/Excel
         ↓
    Engram圧縮 → 履歴保存(IndexedDB)
```

**最終成果物**: PDF（印刷提出用）、Excel（編集用）

## ディレクトリ構造

```
cli/              # CLIツール・サーバー
components/       # Reactコンポーネント
services/         # API・バックエンド接続
shared/core/      # 解析ロジック（claudeSDK, engram等）
hooks/            # React hooks
types/            # TypeScript型定義
```
