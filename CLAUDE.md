# GASPhotoAIManager プロジェクト設定

## 自動化ルール

### コード変更後の必須手順
1. **ビルド確認**: `npm run build` を必ず実行し、エラーがないことを確認
2. **変更をコミット**: ビルド成功後、適切なコミットメッセージでコミット
3. **プッシュ**: mainブランチに直接プッシュ（PRは不要）

### PRについて
- **PRは作成しない**: mainブランチに直接プッシュすること
- 別ブランチでの作業が必要な場合のみPRを使用

### テストについて
- ビルド（`npm run build`）が通ればOK
- 型エラーがないことを確認

## 許可されたコマンド

```
Write(*)
Edit(*)
Read(*)
Bash(mkdir:*)
Bash(rm:*)
Bash(mv:*)
Bash(cp:*)
Bash(ls:*)
Bash(cat:*)
Bash(head:*)
Bash(tail:*)
Bash(which:*)
Bash(echo:*)
Bash(grep:*)
Bash(find:*)
Bash(wc:*)
Bash(sort:*)
Bash(uniq:*)
Bash(sed:*)
Bash(awk:*)
Bash(curl:*)
Bash(wget:*)
Bash(git:*)
Bash(git add:*)
Bash(git commit:*)
Bash(git push:*)
Bash(git checkout:*)
Bash(git branch:*)
Bash(git merge:*)
Bash(git stash:*)
Bash(git rm:*)
Bash(git log:*)
Bash(git status:*)
Bash(git diff:*)
Bash(npm:*)
Bash(npm install:*)
Bash(npm run:*)
Bash(npm test:*)
Bash(node:*)
Bash(npx:*)
Bash(tsc:*)
Bash(esbuild:*)
Bash(cmd:*)
```

## セキュリティルール

### コミット禁止
以下をリポジトリに含めない：
- APIキー、認証情報
- 個人情報（氏名、メール、電話番号）
- 組織情報（会社名、工事名）
- 単価表、見積データ
- ログファイル、出力データ

## プロジェクト概要
写真管理・AI解析ツール。Claude APIで工事写真の自動分類・ペアリングを行う。

## 設計要件

### 最終出力形式
**PDF または Excel が最終成果物**

| 優先度 | 形式 | 用途 |
|--------|------|------|
| 1 | PDF | 写真台帳（印刷・提出用） |
| 1 | Excel | 写真台帳（編集可能版） |
| 2 | JSON/CSV | 中間ファイル（内部処理用） |

### データフロー
```
写真フォルダ → AI解析 → JSON（中間） → PDF/Excel（最終）
```

**注意**: JSON/CSVは内部処理用の中間形式。ユーザーが最終的に必要とするのはPDF/Excel。
