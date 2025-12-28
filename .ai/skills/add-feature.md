# add-feature

新機能を追加する

## 手順

1. **要件の整理**
   - ユーザーの要求を明確化
   - 影響範囲を特定

2. **既存コードの調査**
   - listDirectory でプロジェクト構造を把握
   - getPackageInfo で使える依存を確認
   - searchCode で類似機能を探す
   - fetchCodeFile で関連ファイルを読む

3. **設計**
   - 既存のパターンに従う
   - 型定義を先に考える
   - コンポーネント/サービスの責務を明確に

4. **実装**
   - 小さな単位で変更
   - 1ファイルずつ validateCodeChange で確認
   - 型定義 → ロジック → UI の順

5. **品質確認**
   - runTypeCheck で型エラーなし
   - runLint でスタイル違反なし
   - validateCodeChange でビルド成功

6. **プッシュ**
   - pushCodeEdit でコミット（メッセージは `feat: 〜` 形式）

## 注意事項

- 過度な抽象化を避ける
- 既存機能を壊さない
- 必要最小限の変更に留める
