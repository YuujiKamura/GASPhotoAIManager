# GASPhotoAIManager プロジェクト設定

## 許可されたコマンド

```
Bash(mkdir:*)
Bash(git add:*)
Bash(git commit:*)
Bash(git push:*)
Bash(git checkout:*)
Bash(git merge:*)
Bash(git stash:*)
Bash(git rm:*)
Bash(npm:*)
Bash(node:*)
Bash(npx:*)
```

## セキュリティルール

### コミット禁止

以下をリポジトリに含めない：

- APIキー、認証情報
- 個人情報（氏名、メール、電話番号）
- 組織情報（会社名、工事名）
- 単価表、見積データ
- ログファイル、出力データ

### コミット前確認

```bash
grep -rn "AIza\|sk-\|@gmail\|090-\|株式会社" src/ services/ scripts/
```

## プロジェクト概要

写真管理・AI解析ツール。Gemini APIで工事写真の自動分類・ペアリングを行う。
