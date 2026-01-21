# インタラクティブ解析モード

## 概要

解析中にAIと対話できる機能。ステップごとに一時停止し、質問や指示を送れる。

## 現状の問題

1. 解析は一方通行（開始→完了 or 中断のみ）
2. 「なぜこう判定したか」を途中で聞けない
3. 解析結果に疑問があっても、最後まで待つ必要がある
4. AIのコンテキストが各API呼び出しで独立している

## ユースケース

1. **黒板が読めない時**: 「この写真の黒板が認識できない理由は？」
2. **分類が不明確な時**: 「なぜ舗装工事ではなく区画線工事と判定した？」
3. **途中で方針変更**: 「残りの写真は全部"竣工"として処理して」
4. **部分的なやり直し**: 「この3枚だけ再解析して」

## 設計

### 1. 解析モードの追加

```typescript
type AnalysisMode =
  | 'auto'        // 従来通り自動進行
  | 'interactive' // ステップごとに確認
  | 'debug';      // 全写真で停止（開発用）
```

### 2. ステップ制御の拡張

```typescript
interface AnalysisStepControl {
  canPause: boolean;      // 一時停止可能か
  isPaused: boolean;      // 現在停止中か
  pauseReason?: string;   // 停止理由
  pendingQuestion?: string; // ユーザーからの質問
}

// useAnalysisSteps に追加
const {
  steps,
  pauseAtStep,      // 特定ステップで停止
  resumeAnalysis,   // 再開
  askQuestion,      // 質問を送信
  currentContext,   // 現在のコンテキスト（画像・結果）
} = useAnalysisSteps();
```

### 3. 会話コンテキストの保持

```typescript
interface AnalysisConversation {
  sessionId: string;
  messages: ConversationMessage[];
  currentPhotos: PhotoRecord[];     // 解析中の写真
  currentResults: AIAnalysisResult[]; // 途中結果
  stepHistory: AnalysisStep[];      // ステップ履歴
}

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  attachments?: {
    type: 'photo' | 'result';
    data: any;
  }[];
}
```

### 4. UI設計

```
┌─────────────────────────────────────────────────────┐
│ AI解析の進捗                              [自動|対話] │
├─────────────────────────────────────────────────────┤
│ 1. 画像準備    ✓ 10枚読込                           │
│ 2. 黒板判定    ● 実行中...           [⏸ 一時停止]  │
│ 3. AI解析     ○ 待機                               │
│ 4. 正規化     ○ 待機                               │
├─────────────────────────────────────────────────────┤
│ ▼ AIとの対話 (3件)                                  │
│ ┌─────────────────────────────────────────────────┐ │
│ │ [User] この写真の黒板が読めない理由は？        │ │
│ │        📷 IMG_001.jpg                          │ │
│ │                                                 │ │
│ │ [AI] 照明の反射が強く、文字のコントラストが    │ │
│ │      低いため認識精度が落ちています。          │ │
│ │      推奨: 手動入力するか、再撮影してください  │ │
│ └─────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────┤
│ [質問を入力...]                        [送信] [▶再開]│
└─────────────────────────────────────────────────────┘
```

### 5. APIコンテキストの設計

```typescript
// Gemini APIへの会話履歴の渡し方
const buildPromptWithContext = (
  conversation: AnalysisConversation,
  newQuestion: string
): string => {
  return `
## 解析セッション情報
- 写真数: ${conversation.currentPhotos.length}枚
- 現在のステップ: ${conversation.stepHistory.at(-1)?.name}
- 解析済み結果: ${conversation.currentResults.length}件

## これまでの対話
${conversation.messages.map(m => `[${m.role}] ${m.content}`).join('\n')}

## 新しい質問
${newQuestion}

上記のコンテキストを踏まえて回答してください。
`;
};
```

## 実装フェーズ

### Phase 1: 一時停止機能（基盤）
- [ ] `AnalysisMode` 型の追加
- [ ] `useAnalysisSteps` に `pauseAtStep`, `resumeAnalysis` 追加
- [ ] ステップ進捗UIに一時停止ボタン追加
- [ ] `useAnalysisPipeline` にポーズ判定ロジック追加

### Phase 2: 対話UI
- [ ] `AnalysisConversation` 型定義
- [ ] `useAnalysisConversation` フック作成
- [ ] 対話パネルUI作成（`InteractiveAnalysisPanel.tsx`）
- [ ] ステップ進捗UIに対話パネルを統合

### Phase 3: AIコンテキスト連携
- [ ] 会話履歴をAPIに渡す仕組み
- [ ] 写真を添付して質問できる機能
- [ ] 途中結果を参照した質問への回答

### Phase 4: 高度な操作
- [ ] 「この写真だけ再解析」機能
- [ ] 「残り全部をXとして処理」機能
- [ ] 解析パラメータの途中変更

## 変更ファイル（Phase 1-2）

| ファイル | 変更内容 |
|---------|---------|
| `types/analysis.ts` | `AnalysisMode`, `AnalysisConversation` 追加 |
| `hooks/useAnalysisSteps.ts` | 一時停止/再開機能追加 |
| `hooks/useAnalysisConversation.ts` | 新規作成 |
| `hooks/useAnalysisPipeline.ts` | ポーズ判定ロジック追加 |
| `components/AnalysisStepProgress.tsx` | 一時停止ボタン、対話パネル追加 |
| `components/InteractiveAnalysisPanel.tsx` | 新規作成 |

## 技術的考慮事項

### API制限
- Gemini APIの会話履歴はトークン制限あり
- 長い会話は要約して渡す必要あり

### 状態管理
- 一時停止中もメモリに写真データを保持
- ブラウザリロードで会話コンテキストは消える（LocalStorage保存は検討）

### UX
- 自動モードがデフォルト（従来ユーザーに影響なし）
- 対話モードは明示的に選択

## 工数見積もり

- Phase 1: 2-3時間
- Phase 2: 3-4時間
- Phase 3: 2-3時間
- Phase 4: 4-5時間

合計: 11-15時間
