---
description: 写真帳を作成する（CLIまたはWebアプリ）
argument-hint: [フォルダパス]
---

# 写真帳作成スキル

## 概要
GASPhotoAIManagerを使って工事写真帳を作成する。

## 使い方

### 1. CLI版（自動でブラウザ起動、写真アップロード）
```bash
cd C:/Users/yuuji/Sanyuu2Kouku/GASPhotoAIManager
node generate-album.mjs "<写真フォルダのパス>"
```

### 2. Webアプリ版（手動操作）
```bash
cd C:/Users/yuuji/Sanyuu2Kouku/GASPhotoAIManager/dist
npx serve . -p 8765
# ブラウザで http://localhost:8765 を開く
```

## 写真の準備
1. 対象の写真を検索（例：特定日付の写真）
2. 作業用フォルダを作成してコピー
3. 不要な写真を除外（notuse/フォルダに移動）

## 出力
- PDF形式の写真帳
- Excel形式（オプション）
- XML/ZIP（電子納品用）

## 注意事項
- 景観写真（着手前・完成）は黒板なしでOK
- 1ページあたり2枚または3枚を選択可能
- PDF出力後、ブラウザを閉じるとCLIが終了
