## タスク：プロンプト外部化と自動最適化システム

### 背景
- 現在プロンプトは `services/gemini/systemPrompts.ts` にハードコード
- プロンプト調整のたびにコード変更 → ビルド → デプロイが必要
- 複数のプロンプトバリエーションを同時に試して比較する手段がない

### 目的
1. プロンプトを外部ファイル化し、コード変更なしで差し替え可能にする
2. 複数プロンプトを並列実行して結果を比較できる仕組みを作る
3. 将来的に Claude Code CLI を解析エンジンとして使えるよう準備する

### Phase 1: プロンプト外部化

#### 1-1. ディレクトリ構造
```
prompts/
├── construction/
│   ├── v1_baseline.yaml       # 現行プロンプト
│   ├── v2_detailed.yaml       # 詳細版
│   └── v3_minimal.yaml        # 簡潔版
├── general/
│   └── v1_baseline.yaml
├── schemas/
│   └── analysis_result.json   # JSON Schema定義
└── config.yaml                # どのプロンプトを使うかの設定
```

#### 1-2. プロンプトファイル形式（YAML）
```yaml
# prompts/construction/v1_baseline.yaml
id: construction_v1_baseline
version: "1.0.0"
description: "工事写真解析の基本プロンプト"
author: "system"
created: "2025-01-23"

system_instruction: |
  あなたは工事写真の専門家です。
  画像を解析し、以下の情報を抽出してください...

variables:
  - name: chainRecordsHierarchy
    description: "マスターデータの階層表示"
  - name: customInstruction
    description: "ユーザーからの追加指示"

template: |
  {system_instruction}

  ## 参照データ
  {chainRecordsHierarchy}

  ## 追加指示
  {customInstruction}
```

#### 1-3. 実装タスク
- [ ] `prompts/` ディレクトリ作成
- [ ] 現行プロンプトをYAMLに抽出（`systemPrompts.ts` から）
- [ ] プロンプトローダー実装（`utils/promptLoader.ts`）
- [ ] `systemPrompts.ts` をローダー経由に書き換え
- [ ] ビルド時にYAMLをバンドルに含める（Vite設定）

### Phase 2: 並列実行・比較システム

#### 2-1. 評価フレームワーク
```yaml
# prompts/evaluation/criteria.yaml
criteria:
  - id: field_accuracy
    description: "フィールド抽出の正確さ"
    weight: 0.4
  - id: hierarchy_match
    description: "マスターデータとの整合性"
    weight: 0.3
  - id: consistency
    description: "同一シーンでの一貫性"
    weight: 0.2
  - id: response_time
    description: "応答速度"
    weight: 0.1
```

#### 2-2. バッチ実行モード
```
npm run prompt:test -- --prompts v1,v2,v3 --images ./test-images/ --output ./results/
```

- 指定した複数プロンプトで同じ画像セットを解析
- 結果をJSON出力
- 評価スコアを計算して比較表を生成

#### 2-3. 実装タスク
- [ ] テスト画像セット作成（10-20枚、正解データ付き）
- [ ] バッチ実行CLI（`scripts/prompt-test.ts`）
- [ ] 結果比較・スコアリング（`scripts/evaluate.ts`）
- [ ] レポート生成（Markdown/HTML）

### Phase 3: Claude Code CLI 統合（将来）

#### 3-1. 解析エンジン抽象化
```typescript
interface AnalysisEngine {
  analyze(image: Base64, prompt: string): Promise<AnalysisResult>;
}

class GeminiEngine implements AnalysisEngine { ... }
class ClaudeCodeEngine implements AnalysisEngine { ... }
```

#### 3-2. メリット
- ローカル実行でAPI課金を抑えながら大量テスト可能
- 評価もClaudeに任せられる（LLM-as-judge）
- プロンプト改善提案もClaudeに生成させられる

### 優先度・依存関係

```
Phase 1-1, 1-2 (ディレクトリ・形式設計)
    ↓
Phase 1-3 (プロンプトローダー実装)
    ↓
Phase 2-1, 2-2 (評価基準・バッチ実行)
    ↓
Phase 2-3 (比較・レポート)
    ↓
Phase 3 (Claude統合) ← 別Issue化推奨
```

### 参考ファイル
- `services/gemini/systemPrompts.ts` - 現行プロンプト
- `services/gemini/promptBuilder.ts` - プロンプト構築ロジック
- `services/gemini/helpers.ts` - スキーマ定義

---

## 解決済：モバイルでの画像読み込みエラー（Fileハンドル無効化問題）

### 現象
モバイルで画像を選択 → APIキー設定画面に遷移 → 戻る → 解析開始しようとすると画像読み込みエラー

### 原因
**File オブジェクトの参照とファイルハンドルの乖離**

```
JavaScript側: File オブジェクト（参照あり、GC的には生きてる）
      ↓
ブラウザ側: ファイルハンドル（OS/ブラウザが管理）
      ↓
OS側: 実際のファイルデータ
```

- JS の参照が生きていても、ブラウザ/OS層でハンドルが切れることがある
- 特にモバイル（iOS Safari等）ではメモリ圧迫時やDOM操作時に発生しやすい
- GC言語で「ダングリング参照」が起きる珍しいケース

### なぜ起きるか
**リソースの所有権がJS/GCとOS/ブラウザで異なる**

- JS/GC: 「参照がある限りオブジェクトは有効」
- OS: 「ファイルハンドルは有限リソース、必要に応じて回収する権利がある」

モバイルが特に厳しい理由：
- メモリが少ない
- バックグラウンドプロセスを積極的に殺す
- ファイルアクセスはセキュリティ上、一時的にしか許可しない設計

### 教訓
外部リソースへのハンドル（File, WebSocket, IndexedDB Transaction, WebGL Context等）は「いつ無効になってもおかしくない」前提で設計すべき。必要なデータは早めに自分の管理下（Base64等）にコピーしておく。

### 修正内容（コミット: 19e053f）
- `ProcessedFile` 型を追加（Base64変換済みデータを保持）
- ファイル選択時に即座にBase64変換し、File参照への依存を排除
- 関連する全コンポーネント・フックを `ProcessedFile[]` 型に移行

### 類似の問題が起きうるAPI
- `URL.createObjectURL()` で作ったBlob URL
- WebSocket接続
- IndexedDBトランザクション
- Canvas WebGLコンテキスト
- MediaStream（カメラ/マイク）

---

## タスク：写真区分レベルの明示化

### 背景
対話型解析で Gemini が「施工状況写真」「安全管理写真」などを返していても、PhotoCategory を UI に明示せず、かつ JSON schema にも含めていなかったため、備考（remarks）との関連性が曖昧になっていた。

### 実施内容（完了済）
- `construction_hierarchy.csv` に photoCategory（Level5）列を追加し、CSV から読み込めるように `MasterRow`/`ChainRecord` を拡張
- Gemini の system prompt と schema に photoCategory を追加し、必須 field として要求
- 対話型解析結果と UI を更新して、photoCategory を表示

### 残タスク
- 追加した CSV カラムのメンテナンス手順を README などに明記（いつ/誰が更新するか）
- Gemini が返す photoCategory 候補のバリエーションを現場用語に合わせて定期的に見直す
- ビルド後に GH Pages にデプロイして表示を再確認

### 参考
- `services/gemini/systemPrompts.ts`：prompt/docs への記述追加
- `services/gemini/helpers.ts`：schema 定義
- `components/InteractiveAnalysisDialog`：表示の追加

