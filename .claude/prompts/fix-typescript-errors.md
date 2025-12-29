# TypeScript型エラー修正

## 状況
ビルド時の健全性チェックでTypeScriptエラーが検出された。

## 実行コマンド
```bash
npx tsc --noEmit
```

## 修正手順

1. エラー箇所を特定
2. エラーの種類を判断:
   - `import.meta.env` → vite-env.d.ts の型定義確認
   - `Property 'X' does not exist` → 型定義の追加または修正
   - `Cannot find module` → パス確認、型定義インストール

3. 修正を適用
4. `npx tsc --noEmit` で再確認
5. エラーがなくなるまで繰り返す

## よくあるパターン

### import.meta.env の型エラー
```typescript
// src/vite-env.d.ts に追加
/// <reference types="vite/client" />
```

### 外部ライブラリの型がない
```bash
npm install -D @types/ライブラリ名
```

### 自作モジュールの型エラー
該当ファイルの型定義を修正

## 完了条件
- `npx tsc --noEmit` がエラー0で完了
- `npm run build` が成功
