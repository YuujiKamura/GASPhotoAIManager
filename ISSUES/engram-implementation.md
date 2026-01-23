# Engram的アプローチ実装

## 概要

GASPhotoAIManagerにEngram的な「知識参照」と「論理推論」の分離を適用し、トークン消費を削減しながら推論精度を維持する。

## 現状のトークン構成

| コンポーネント | トークン数 | 選択方式 |
|---|---|---|
| ベースプロンプト | 4,000-6,000 | 固定 |
| マスタ階層 | 1,000-3,000 | 工種フィルタのみ |
| お手本（5件） | 500-1,000 | スコアベース |
| 学習ルール | 200-500 | 全件注入 |
| **合計** | **7,000-15,400** | - |

---

## Level 1: 軽量版 - 連動フィルタ拡張 ✅ Complete

### 概要
工種フィルタをお手本・学習ルールにも連動させる。

### タスク

- [x] `services/engram/types.ts` - 型定義
- [x] `services/engram/knowledgeFilter.ts` - 知識フィルタリング
- [x] `services/engram/index.ts` - エントリポイント
- [x] `utils/storage/examples.ts` - workTypeFilterオプション追加
- [x] `services/learningService.ts` - filterRulesByWorkTypes()追加
- [x] `services/gemini/promptBuilder.ts` - 統合フィルタ使用

### 期待効果
- トークン削減: **35-50%**
- 合計: 7,000-15,400 → 4,500-7,400

---

## Level 2: 中間版 - 類似画像ハッシュ (将来)

### 概要
pHash（知覚ハッシュ）で類似画像を検索し、最適なお手本1-2件のみ注入。

### 新規ファイル
- `services/engram/imageHash.ts` - pHash計算
- `services/engram/hashIndex.ts` - ハッシュインデックス
- `services/engram/similaritySearch.ts` - 類似検索

### 期待効果
- トークン削減: **20-25%** (Level1比)
- 合計: 4,500-7,400 → 3,500-5,900

---

## Level 3: 本格版 - 外部メモリDB (将来)

### 概要
知識を完全にDB化、ハッシュベース検索。プロンプトは推論ルールのみ。

### 新規ファイル
- `services/engram/knowledgeDB.ts` - 知識DB
- `services/engram/engramMemory.ts` - Engram外部メモリ
- `services/engram/reasoningPrompt.ts` - 推論専用プロンプト
- `services/engram/contextRetrieval.ts` - コンテキスト検索

### 期待効果
- トークン削減: **50-55%** (Level2比)
- 合計: 3,500-5,900 → 1,700-2,900
- **総削減率: 75-80%**

---

## 検証方法

### トークン削減率
```bash
npm run prompt:test -- --compare-versions v0,v1,v2,v3
```

### 精度検証
- 同一テストセットで各バージョンの精度比較
- workType/remarks の一致率を計測

---

## 関連ファイル

- `services/gemini/analysis.ts` - 知識注入の中心
- `utils/storage/examples.ts` - お手本取得
- `services/learningService.ts` - 学習ルール管理
- `utils/storage/dbCore.ts` - IndexedDBスキーマ
- `services/gemini/systemPrompts.ts` - プロンプト生成
