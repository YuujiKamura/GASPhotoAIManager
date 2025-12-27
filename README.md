# 工事写真帳メーカー

AIで工事写真を自動分類・整理するツール。

## デモ

**https://yuujikamura.github.io/GASPhotoAIManager/**

## 機能

- **AI解析**: Google Gemini 2.5 Flashで写真を自動分類
- **黒板認識**: 工事黒板のテキストを自動抽出（工種・種別・細別・測点・備考）
- **景観ペアリング**: 着手前/完了の写真を自動マッチング
- **スマートPDF**: セッションデータを埋め込んだPDFを出力・復元可能
- **Excel出力**: 工事写真台帳形式のExcelを生成
- **履歴機能**: 解析履歴を自動保存、いつでも復元可能

## 使い方

1. APIキーを設定（Google AI Studioで無料取得）
2. 写真をドラッグ＆ドロップ
3. AIが自動解析
4. Excel/PDFで出力

**PDFを持っている場合**: APIキー設定画面から「PDFからセッションを復元」で読み込み可能

## 技術スタック

- React + TypeScript + Vite
- Google Gemini 2.5 Flash
- ExcelJS / html2pdf / pdf-lib
- IndexedDB（履歴保存）
- Tailwind CSS
