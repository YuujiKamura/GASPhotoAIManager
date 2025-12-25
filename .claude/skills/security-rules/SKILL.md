---
name: security-rules
description: コミット禁止ルール。個人情報・組織情報・機密データをリポジトリに含めない。
allowed-tools: Read, Grep, Glob
---

# セキュリティルール

## コミット禁止項目

以下の情報をリポジトリにコミットしてはいけない：

### 1. 認証情報
- APIキー（`AIza*`, `sk-*`, `ghp_*`等）
- パスワード、シークレット
- OAuth トークン、認証ファイル（`.json`, `.pickle`）

### 2. 個人情報
- 氏名（日本語・英語）
- メールアドレス
- 電話番号（`090-`, `080-`, `070-`等）
- 住所

### 3. 組織・業務情報
- 会社名、団体名
- 具体的な工事名・現場名
- 単価表、見積書、請求書データ
- 顧客情報

### 4. 出力データ
- ログファイル（`*.log`, `logs/`）
- 解析結果に個人・組織情報が含まれる場合
- キャッシュファイル

## .gitignore 必須項目

```
# 認証
.env
*.pickle
token.json
credentials.json
*-service-account.json

# ログ・出力
logs/
*.log
dist/
analysis_output.log

# データ
src/data/unit-price/
```

## コミット前チェック

コードをコミットする前に以下を確認：

```bash
# 個人・組織情報の検索
grep -rn "kamura\|@gmail\|090-\|熊本市\|株式会社" src/ services/ scripts/

# APIキーの検索
grep -rn "AIza\|sk-proj\|ghp_" src/ services/ scripts/
```

## 違反を見つけた場合

1. `.gitignore`に追加
2. `git rm --cached <file>` で追跡を解除
3. ローカルにはファイルを残す
