/**
 * Agent Context Service
 *
 * 将来のエージェント永続化・移動に備えた設計
 * - セッション間でコンテキストを引き継ぐ
 * - 複数のAIバックエンド（Gemini, Claude等）に対応
 * - 将来のAPI進化に対応できる拡張点を用意
 */

// エージェントの状態を表す型
export interface AgentContext {
  // 基本情報
  id: string;
  createdAt: string;
  lastActiveAt: string;

  // 会話履歴（要約含む）
  conversationSummary: string;
  recentMessages: ConversationMessage[];

  // プロジェクト理解
  projectKnowledge: ProjectKnowledge;

  // ユーザーとの関係性
  userPreferences: UserPreferences;

  // 学習した内容
  learnedPatterns: LearnedPattern[];
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ProjectKnowledge {
  // プロジェクトの概要
  summary: string;
  // 主要なファイル・構造
  keyFiles: string[];
  // 技術スタック
  techStack: string[];
  // よく使うパターン
  commonPatterns: string[];
}

export interface UserPreferences {
  // コミュニケーションスタイル
  communicationStyle: 'casual' | 'formal' | 'technical';
  // よく使う機能
  frequentFeatures: string[];
  // 好みの設定
  settings: Record<string, any>;
}

export interface LearnedPattern {
  trigger: string;
  response: string;
  confidence: number;
  learnedAt: string;
}

// エージェントプロバイダーのインターフェース
// 将来、Claude/Gemini/その他を差し替え可能にする
export interface AgentProvider {
  name: string;

  // 会話
  chat(message: string, context?: AgentContext): Promise<string>;

  // コンテキストの注入（将来のAPI対応時）
  injectContext?(context: AgentContext): Promise<void>;

  // セッションの永続化（将来のAPI対応時）
  persistSession?(): Promise<string>; // returns session ID
  resumeSession?(sessionId: string): Promise<void>;
}

// コンテキストの保存/読み込み
const CONTEXT_STORAGE_KEY = 'gaspm_agent_context';

export const saveContext = (context: AgentContext): void => {
  context.lastActiveAt = new Date().toISOString();
  localStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(context));
};

export const loadContext = (): AgentContext | null => {
  const stored = localStorage.getItem(CONTEXT_STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
};

export const createNewContext = (): AgentContext => {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    conversationSummary: '',
    recentMessages: [],
    projectKnowledge: {
      summary: '工事写真をAIで自動分類・整理するアプリ',
      keyFiles: ['App.tsx', 'services/geminiService.ts', 'components/UploadView.tsx'],
      techStack: ['React', 'TypeScript', 'Vite', 'Tailwind', 'Gemini API'],
      commonPatterns: []
    },
    userPreferences: {
      communicationStyle: 'casual',
      frequentFeatures: [],
      settings: {}
    },
    learnedPatterns: []
  };
};

// コンテキストを会話履歴に追加
export const addMessage = (
  context: AgentContext,
  role: 'user' | 'assistant',
  content: string
): void => {
  context.recentMessages.push({
    role,
    content,
    timestamp: new Date().toISOString()
  });

  // 最新20件だけ保持（古いのは要約に回す）
  if (context.recentMessages.length > 20) {
    context.recentMessages = context.recentMessages.slice(-20);
  }

  saveContext(context);
};

// コンテキストをプロンプトに変換
export const contextToPrompt = (context: AgentContext): string => {
  const parts: string[] = [];

  if (context.conversationSummary) {
    parts.push(`## これまでの会話の要約\n${context.conversationSummary}`);
  }

  if (context.projectKnowledge.summary) {
    parts.push(`## プロジェクトについて\n${context.projectKnowledge.summary}`);
  }

  if (context.userPreferences.communicationStyle === 'casual') {
    parts.push(`## コミュニケーションスタイル\nカジュアルに、フレンドリーに話してください。`);
  }

  if (context.learnedPatterns.length > 0) {
    const patterns = context.learnedPatterns
      .filter(p => p.confidence > 0.7)
      .map(p => `- ${p.trigger} → ${p.response}`)
      .join('\n');
    if (patterns) {
      parts.push(`## 学習したパターン\n${patterns}`);
    }
  }

  return parts.join('\n\n');
};

// 将来のエージェント移動に備えたエクスポート
export const exportContext = (context: AgentContext): string => {
  return JSON.stringify(context, null, 2);
};

export const importContext = (json: string): AgentContext | null => {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
};

// --- 将来の拡張ポイント ---

// TODO: Claude APIが永続セッションをサポートしたら
// export const migrateToClaudeSession = async (context: AgentContext): Promise<string> => {
//   // Claude APIにコンテキストを送信してセッションIDを取得
// };

// TODO: エージェント間でコンテキストを共有
// export const shareContext = async (context: AgentContext, targetAgentId: string): Promise<void> => {
//   // 別のエージェントインスタンスにコンテキストを送信
// };

// TODO: リアルタイム同期（WebSocket等）
// export const syncContext = (context: AgentContext): void => {
//   // 複数クライアント間でコンテキストを同期
// };
