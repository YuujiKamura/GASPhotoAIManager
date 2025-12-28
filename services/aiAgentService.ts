/**
 * AI Agent Service
 *
 * Gemini APIにツールを提供し、AIがコードを読み書きできるようにする
 * ツール定義は自動生成
 */

import { GoogleGenAI, FunctionDeclaration, Type } from '@google/genai';
import { getGitHubToken } from './githubSync';

// 利用可能なツールを定義（実装と連動）
export const CODE_TOOLS: FunctionDeclaration[] = [
  {
    name: 'listDirectory',
    description: 'リポジトリのディレクトリ一覧を取得する',
    parameters: {
      type: Type.OBJECT,
      properties: {
        dirPath: {
          type: Type.STRING,
          description: 'ディレクトリパス（空文字でルート）'
        }
      },
      required: []
    }
  },
  {
    name: 'fetchCodeFile',
    description: 'GitHubからコードファイルを取得して内容を読む',
    parameters: {
      type: Type.OBJECT,
      properties: {
        filePath: {
          type: Type.STRING,
          description: 'ファイルパス（例: services/geminiService.ts）'
        }
      },
      required: ['filePath']
    }
  },
  {
    name: 'searchCode',
    description: 'リポジトリ内のコードを検索する',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: '検索クエリ'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'validateCodeChange',
    description: 'コード変更をブラウザ内でビルド検証する（WebContainer使用）',
    parameters: {
      type: Type.OBJECT,
      properties: {
        filePath: {
          type: Type.STRING,
          description: '変更するファイルパス'
        },
        newContent: {
          type: Type.STRING,
          description: '新しいファイル内容'
        }
      },
      required: ['filePath', 'newContent']
    }
  },
  {
    name: 'pushCodeEdit',
    description: 'コード変更をGitHubにプッシュする（ビルド検証後に使用）',
    parameters: {
      type: Type.OBJECT,
      properties: {
        filePath: {
          type: Type.STRING,
          description: '変更するファイルパス'
        },
        newContent: {
          type: Type.STRING,
          description: '新しいファイル内容'
        },
        commitMessage: {
          type: Type.STRING,
          description: 'コミットメッセージ'
        }
      },
      required: ['filePath', 'newContent', 'commitMessage']
    }
  }
];

/**
 * ツール呼び出しを実行
 */
export const executeToolCall = async (
  toolName: string,
  args: Record<string, any>,
  onLog?: (log: string) => void
): Promise<any> => {
  const token = getGitHubToken();
  if (!token) {
    throw new Error('GitHub token not set');
  }

  onLog?.(`[Tool] ${toolName} を実行中...`);

  switch (toolName) {
    case 'listDirectory': {
      const { listDirectory } = await import('./githubSync');
      return await listDirectory(token, args.dirPath || '');
    }

    case 'fetchCodeFile': {
      const { fetchCodeFile } = await import('./githubSync');
      const result = await fetchCodeFile(token, args.filePath);
      return result ? { content: result.content } : null;
    }

    case 'searchCode': {
      const { searchCode } = await import('./githubSync');
      return await searchCode(token, args.query);
    }

    case 'validateCodeChange': {
      const { validateCodeChange } = await import('./webContainerService');
      return await validateCodeChange(token, args.filePath, args.newContent, onLog);
    }

    case 'pushCodeEdit': {
      const { pushCodeEdit } = await import('./githubSync');
      return await pushCodeEdit(token, args.filePath, args.newContent, args.commitMessage);
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
};

/**
 * AIエージェントを実行（ツール使用ループ）
 */
export const runAIAgent = async (
  userRequest: string,
  onLog?: (log: string) => void,
  maxIterations: number = 10
): Promise<string> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not set');
  }

  const genAI = new GoogleGenAI({ apiKey });

  const systemPrompt = `あなたはコード編集AIエージェントです。
ユーザーの要求に応じて、以下のツールを使ってコードを調査・編集できます。

## 作業フロー
1. まず listDirectory や searchCode でコードベースを調査
2. fetchCodeFile で関連ファイルを読む
3. 変更が必要な場合は validateCodeChange でビルド検証
4. 検証成功したら pushCodeEdit でGitHubにプッシュ

## 注意
- 変更前に必ず現在のコードを読むこと
- ビルド検証なしでプッシュしないこと
- 小さな変更を積み重ねること`;

  const chat = genAI.chats.create({
    model: 'gemini-2.0-flash',
    config: {
      systemInstruction: systemPrompt,
      tools: [{ functionDeclarations: CODE_TOOLS }]
    }
  });

  let response = await chat.sendMessage(userRequest);
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    // テキスト応答があれば完了
    const textPart = response.candidates?.[0]?.content?.parts?.find(p => 'text' in p);
    if (textPart && 'text' in textPart && !response.candidates?.[0]?.content?.parts?.some(p => 'functionCall' in p)) {
      return textPart.text;
    }

    // ツール呼び出しを処理
    const functionCalls = response.candidates?.[0]?.content?.parts?.filter(p => 'functionCall' in p) || [];

    if (functionCalls.length === 0) {
      break;
    }

    const toolResults: any[] = [];

    for (const part of functionCalls) {
      if ('functionCall' in part) {
        const { name, args } = part.functionCall;
        onLog?.(`[Agent] ツール呼び出し: ${name}`);

        try {
          const result = await executeToolCall(name, args || {}, onLog);
          toolResults.push({
            functionResponse: {
              name,
              response: { result: JSON.stringify(result) }
            }
          });
          onLog?.(`[Agent] ${name} 完了`);
        } catch (error: any) {
          toolResults.push({
            functionResponse: {
              name,
              response: { error: error.message }
            }
          });
          onLog?.(`[Agent] ${name} エラー: ${error.message}`);
        }
      }
    }

    // ツール結果を送信して次の応答を取得
    response = await chat.sendMessage(toolResults);
  }

  return '処理が完了しませんでした（最大反復回数に達しました）';
};

/**
 * 簡易版：単発のコード修正リクエスト
 */
export const requestCodeEdit = async (
  description: string,
  onLog?: (log: string) => void
): Promise<{ success: boolean; message: string; commitUrl?: string }> => {
  try {
    onLog?.('[Agent] コード編集リクエストを処理中...');
    const result = await runAIAgent(description, onLog);
    onLog?.('[Agent] 完了');

    return {
      success: true,
      message: result
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'エラーが発生しました'
    };
  }
};
