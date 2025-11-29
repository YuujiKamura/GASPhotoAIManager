# AI Studioへのコピー手順

## 📋 コピー方法

AI StudioはGitが使えないため、以下の手順でコードをコピーしてください。

## 1️⃣ 必要なフォルダ/ファイルをコピー

以下のフォルダとファイルをそのままコピー：

### フォルダ（中身ごと）
```
components/
services/
utils/
scripts/
```

### ルートファイル
```
App.tsx
main.tsx
types.ts
index.css
index.html
vite.config.ts
tsconfig.json
tailwind.config.js
postcss.config.js
package.json
.gitignore
```

## 2️⃣ コピー不要なもの

以下は無視してOK：
- node_modules/
- dist/
- .git/
- .env
- package-lock.json
- test-*.mjs
- debug-*
- *.log

## 3️⃣ 環境変数の設定

AI Studio側で`.env`ファイルを作成：
```
VITE_GOOGLE_API_KEY=あなたのAPIキー
```

## 📁 一括コピー用コマンド（Windows）

PowerShellで以下を実行すると、必要なファイルだけをコピー用フォルダに集められます：

```powershell
# コピー用フォルダを作成
$dest = "FOR_AI_STUDIO"
Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue
New-Item $dest -ItemType Directory

# フォルダをコピー
Copy-Item components $dest\components -Recurse
Copy-Item services $dest\services -Recurse
Copy-Item utils $dest\utils -Recurse
Copy-Item scripts $dest\scripts -Recurse

# ファイルをコピー
Copy-Item App.tsx $dest\
Copy-Item main.tsx $dest\
Copy-Item types.ts $dest\
Copy-Item index.css $dest\
Copy-Item index.html $dest\
Copy-Item vite.config.ts $dest\
Copy-Item tsconfig.json $dest\
Copy-Item tailwind.config.js $dest\
Copy-Item postcss.config.js $dest\
Copy-Item package.json $dest\
Copy-Item .gitignore $dest\

Write-Host "✅ FOR_AI_STUDIOフォルダにコピー完了！"
```

## 📝 AI Studio側での初期セットアップ

1. コピーしたファイルを配置
2. ターミナルで `npm install`
3. `npm run dev` で開発サーバー起動

## 🔄 更新時の手順

1. ここ（Claude Code）で変更
2. Gitにプッシュ
3. 上記の手順でFOR_AI_STUDIOフォルダを作成
4. AI Studioの古いファイルを削除
5. 新しいファイルをコピー

---
最終更新: 2024-11-29