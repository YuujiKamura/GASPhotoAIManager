# 🚀 今すぐデプロイする方法

## 方法1: Vercel（推奨・最速）

### 1. Vercelアカウント作成
https://vercel.com にアクセスしてGitHubでサインイン

### 2. GitHubリポジトリを接続
1. Vercelダッシュボードで「Import Project」
2. GitHubから「YuujiKamura/GASPhotoAIManager」を選択
3. 環境変数を設定:
   - Name: `VITE_GOOGLE_API_KEY`
   - Value: あなたのGemini APIキー

### 3. デプロイ
「Deploy」ボタンをクリック → 3分で完了！

**URL例**: https://gas-photo-manager.vercel.app

---

## 方法2: Netlify（ドラッグ&ドロップ）

### 1. ローカルでビルド
```bash
npm run build
```

### 2. Netlifyにドロップ
1. https://app.netlify.com/drop を開く
2. `dist`フォルダをドラッグ&ドロップ
3. 即座に公開！

**URL例**: https://amazing-einstein-123abc.netlify.app

---

## 方法3: GitHub Pages（完全無料）

### 1. vite.config.tsを編集
```typescript
export default defineConfig({
  base: '/GASPhotoAIManager/',
  // ... 他の設定
})
```

### 2. デプロイスクリプト実行
```bash
npm run build
git add dist -f
git commit -m "Deploy to GitHub Pages"
git subtree push --prefix dist origin gh-pages
```

### 3. GitHub設定
リポジトリ設定 → Pages → Source: gh-pages

**URL**: https://yuujikamura.github.io/GASPhotoAIManager/

---

## 🎯 どれを選ぶ？

| 方法 | 速さ | 簡単さ | カスタムドメイン | 無料枠 |
|------|------|--------|-----------------|--------|
| Vercel | ⚡最速 | ⭐最簡単 | ✅ | 無制限 |
| Netlify | ⚡速い | ⭐簡単 | ✅ | 100GB/月 |
| GitHub Pages | 🐢遅い | 📝手順多い | ✅ | 無制限 |

## 💡 私のおすすめ

**Vercel一択です！**

理由：
1. GitHubと自動連携
2. pushするだけで自動デプロイ
3. プレビューURL自動生成
4. 環境変数の管理が楽
5. 無料で商用利用OK

---

## 今すぐやること

1. https://vercel.com でアカウント作成（30秒）
2. このリポジトリをインポート（1分）
3. APIキーを環境変数に設定（30秒）
4. デプロイボタンをクリック（3分）

**合計5分で世界中からアクセス可能に！**