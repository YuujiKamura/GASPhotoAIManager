# update-prompt

AI解析のプロンプトを改善する

## 対象ファイル

- `services/geminiService.ts` - メインのプロンプト
- `utils/analysisRules.ts` - 解析ルール定義
- `services/learningService.ts` - 学習ルール

## 手順

1. **現状の確認**
   - fetchCodeFile で現在のプロンプトを読む
   - getGitHistory でプロンプトの変更履歴を確認

2. **問題の特定**
   - ユーザーからのフィードバックを整理
   - 誤認識のパターンを分析

3. **改善案の作成**
   - 具体的な例を追加
   - 曖昧な表現を明確化
   - 優先順位を調整

4. **検証**
   - validateCodeChange でビルド確認
   - 実際のテストケースで動作確認（可能なら）

5. **プッシュ**
   - pushCodeEdit でコミット
   - メッセージは `improve: プロンプト改善 - 〜` 形式

## プロンプト編集のコツ

- 箇条書きで構造化
- 具体例を含める
- 「〜してはいけない」より「〜する」で書く
- 優先度が高いものを先に
