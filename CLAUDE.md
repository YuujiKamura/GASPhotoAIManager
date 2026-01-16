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
写真管理・AI解析ツール。Gemini APIで工事写真の自動分類・ペアリングを行う。
