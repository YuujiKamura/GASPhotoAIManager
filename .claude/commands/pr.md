# PR作成コマンド

現在のブランチの変更をまとめてPull Requestを作成してください。

## 手順

1. `git log origin/main..HEAD --oneline` で含まれるコミットを確認
2. `git diff origin/main --stat` で変更ファイルを確認
3. コミット内容を分析してPRのタイトルと本文を作成
4. PRを作成（ghコマンドが使えない場合はGitHub WebのURLを提示）

## PRフォーマット

```
## Summary
- 変更点を箇条書きで記載

## Changes
- ファイルごとの変更内容

## Test plan
- [ ] テスト項目
```
