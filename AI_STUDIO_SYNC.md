# AI Studio 同期方法

## 現在のフォルダ構造をそのままコピー

このGASPhotoAIManagerフォルダを**そのまま**AI Studioにコピーしてください。

## コピーする際に除外するもの（重いので）

```
node_modules/     # npmで復元可能
dist/            # ビルド結果
.git/            # Git履歴（重い）
```

## AI Studio側での作業

1. フォルダ全体をコピー（node_modules、dist、.gitは除く）
2. `npm install` で依存関係を復元
3. 編集作業
4. 編集後のファイルをこちらに戻す

## こちら（Claude Code）との同期

- **マスター**: このGitリポジトリ
- **AI Studio**: 一時的な編集環境
- 編集後は必ずこちらに戻してGitにコミット

多重管理にならないよう、AI Studioはあくまで**編集環境**として使用。