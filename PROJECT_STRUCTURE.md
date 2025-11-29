# GASPhotoAIManager - プロジェクト構造

## 📁 フォルダ構成

このプロジェクトはAI Studioでフォルダごと編集可能な構成になっています。

```
GASPhotoAIManager/
├── components/          # UIコンポーネント
│   ├── PhotoAlbumView.tsx      # 写真アルバム表示
│   ├── PreviewView.tsx          # プレビュー画面
│   ├── SimplePairingMode.tsx    # 簡易ペアリングモード
│   └── ConsolePanel.tsx         # コンソールパネル
│
├── services/           # ビジネスロジック・AI連携
│   ├── geminiService.ts              # Gemini AI基本サービス
│   ├── spatialPairingService.ts      # 景観ペアリング
│   ├── optimizedSpatialPairingService.ts  # 高速化版
│   └── smartFlowService.ts           # スマートフロー
│
├── utils/              # ユーティリティ関数
│   ├── storage.ts              # IndexedDBストレージ
│   ├── fileSystemCache.ts     # ローカルキャッシュ
│   ├── imageUtils.ts          # 画像処理
│   ├── translations.ts        # 多言語対応
│   ├── excelExport.ts        # Excel出力
│   └── zipGenerator.ts       # ZIP生成
│
├── types/              # 型定義
│   └── (現在はtypes.tsに統合)
│
├── App.tsx             # メインアプリケーション
├── main.tsx            # エントリーポイント
├── types.ts            # 共通型定義
├── index.css           # グローバルスタイル
├── index.html          # HTMLテンプレート
│
├── vite.config.ts      # Vite設定
├── tsconfig.json       # TypeScript設定
├── tailwind.config.js  # Tailwind CSS設定
├── postcss.config.js   # PostCSS設定
└── package.json        # 依存関係・スクリプト
```

## 🚀 AI Studioでの編集方法

### 1. フォルダ全体をアップロード

このフォルダ全体をAI Studioにドラッグ&ドロップまたはコピー&ペーストできます。

### 2. 主要な編集対象ファイル

#### アプリケーションロジック
- `App.tsx` - メイン処理フロー、状態管理
- `components/*.tsx` - UI部分の変更

#### AI機能
- `services/geminiService.ts` - プロンプトの調整
- `services/spatialPairingService.ts` - ペアリングロジック

#### データ管理
- `utils/storage.ts` - データ永続化
- `types.ts` - データ構造定義

### 3. 環境変数の設定

`.env`ファイルを作成して以下を設定:

```env
VITE_GOOGLE_API_KEY=your-gemini-api-key-here
```

## 📝 コード規約

### TypeScript/React
- 関数コンポーネントを使用
- 型定義を明示的に記述
- async/awaitパターンを使用

### ファイル命名
- コンポーネント: PascalCase (`PhotoAlbumView.tsx`)
- サービス/ユーティリティ: camelCase (`geminiService.ts`)
- 定数: UPPER_SNAKE_CASE

### インポート順序
1. React関連
2. 外部ライブラリ
3. 内部コンポーネント
4. サービス/ユーティリティ
5. 型定義
6. スタイル

## 🎯 主要機能の実装場所

### 写真解析
- **場所**: `services/geminiService.ts`
- **関数**: `analyzeImages()`
- **プロンプト調整**: `getPrompt()`内

### 景観ペアリング
- **場所**: `services/spatialPairingService.ts`
- **関数**: `createSpatialPairs()`
- **特徴抽出**: `extractSpatialFeatures()`

### キャッシュ機能
- **IndexedDB**: `utils/storage.ts`
- **File System API**: `utils/fileSystemCache.ts`

### Excel/PDF出力
- **Excel**: `utils/excelExport.ts`
- **PDF**: `components/PreviewView.tsx`の`handleDownloadPDF()`

## 🔧 開発コマンド

```bash
# 依存関係インストール
npm install

# 開発サーバー起動
npm run dev

# ビルド
npm run build

# プレビュー
npm run preview
```

## 📚 技術スタック

- **フレームワーク**: React 18 + TypeScript
- **ビルドツール**: Vite
- **スタイリング**: Tailwind CSS
- **AI API**: Google Gemini
- **データ管理**: IndexedDB
- **アイコン**: Lucide React

## 🤖 AI Studio統合

このプロジェクトは以下の特徴によりAI Studioでの編集に最適化されています：

1. **明確なフォルダ構造** - 機能ごとに整理
2. **型安全性** - TypeScriptによる型定義
3. **モジュール性** - 独立したサービス層
4. **設定ファイル** - `.ai-studio.json`による構造定義

## 📄 ライセンス

MIT License

---

最終更新: 2024-11-29