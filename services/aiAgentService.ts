/**
 * AI Agent Service
 *
 * Gemini APIにツールを提供し、AIがコードを読み書きできるようにする
 * ツール定義は自動生成
 */

import { GoogleGenAI, FunctionDeclaration, Type } from '@google/genai';
import { getGitHubToken } from './githubSync';
import { getApiKey } from './geminiService';

// 利用可能なツールを定義（実装と連動）
export const CODE_TOOLS: FunctionDeclaration[] = [
  // === スキル系 ===
  {
    name: 'listSkills',
    description: '.ai/skills/ にある利用可能なスキル一覧を取得する',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  },
  {
    name: 'loadSkill',
    description: '指定したスキルの手順を読み込んで実行計画を立てる',
    parameters: {
      type: Type.OBJECT,
      properties: {
        skillName: {
          type: Type.STRING,
          description: 'スキル名（例: fix-bug, add-feature）'
        }
      },
      required: ['skillName']
    }
  },
  // === 調査系 ===
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
  },
  // === 追加ツール：検証・分析系 ===
  {
    name: 'runLint',
    description: 'ESLintを実行してコードスタイルと軽微なエラーを検出する',
    parameters: {
      type: Type.OBJECT,
      properties: {
        filePath: {
          type: Type.STRING,
          description: '検査するファイルパス（省略で全体）'
        }
      },
      required: []
    }
  },
  {
    name: 'runTypeCheck',
    description: 'TypeScriptの型チェックを実行する（tsc --noEmit）',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  },
  {
    name: 'getGitHistory',
    description: '最近のコミット履歴を取得して変更の流れを理解する',
    parameters: {
      type: Type.OBJECT,
      properties: {
        count: {
          type: Type.NUMBER,
          description: '取得するコミット数（デフォルト10）'
        },
        filePath: {
          type: Type.STRING,
          description: '特定ファイルの履歴のみ取得'
        }
      },
      required: []
    }
  },
  {
    name: 'getPackageInfo',
    description: 'package.jsonから依存パッケージやスクリプトを確認する',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  },
  {
    name: 'getDiff',
    description: '2つのコード内容の差分を取得する',
    parameters: {
      type: Type.OBJECT,
      properties: {
        oldContent: {
          type: Type.STRING,
          description: '変更前のコード'
        },
        newContent: {
          type: Type.STRING,
          description: '変更後のコード'
        }
      },
      required: ['oldContent', 'newContent']
    }
  },
  {
    name: 'parseErrors',
    description: 'ビルド/Lint/型エラーを解析して修正方針を立てる',
    parameters: {
      type: Type.OBJECT,
      properties: {
        errorOutput: {
          type: Type.STRING,
          description: 'エラー出力テキスト'
        }
      },
      required: ['errorOutput']
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
    case 'listSkills': {
      const { listDirectory } = await import('./githubSync');
      const skills = await listDirectory(token, '.ai/skills');
      if (!skills) return [];

      return skills
        .filter(s => s.name.endsWith('.md'))
        .map(s => ({
          name: s.name.replace('.md', ''),
          path: s.path
        }));
    }

    case 'loadSkill': {
      const { fetchCodeFile } = await import('./githubSync');
      const result = await fetchCodeFile(token, `.ai/skills/${args.skillName}.md`);
      if (!result) {
        return { error: `スキル "${args.skillName}" が見つかりません` };
      }
      return {
        name: args.skillName,
        content: result.content
      };
    }

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

    case 'runLint': {
      const { runCommand } = await import('./webContainerService');
      const target = args.filePath || '.';
      return await runCommand(`npx eslint ${target} --format json`, onLog);
    }

    case 'runTypeCheck': {
      const { runCommand } = await import('./webContainerService');
      return await runCommand('npx tsc --noEmit', onLog);
    }

    case 'getGitHistory': {
      const count = args.count || 10;
      const url = args.filePath
        ? `https://api.github.com/repos/YuujiKamura/GASPhotoAIManager/commits?path=${encodeURIComponent(args.filePath)}&per_page=${count}`
        : `https://api.github.com/repos/YuujiKamura/GASPhotoAIManager/commits?per_page=${count}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) return null;

      const commits = await response.json();
      return commits.map((c: any) => ({
        sha: c.sha.slice(0, 7),
        message: c.commit.message.split('\n')[0],
        author: c.commit.author.name,
        date: c.commit.author.date
      }));
    }

    case 'getPackageInfo': {
      const { fetchCodeFile } = await import('./githubSync');
      const result = await fetchCodeFile(token, 'package.json');
      if (!result) return null;

      const pkg = JSON.parse(result.content);
      return {
        name: pkg.name,
        version: pkg.version,
        scripts: pkg.scripts,
        dependencies: Object.keys(pkg.dependencies || {}),
        devDependencies: Object.keys(pkg.devDependencies || {})
      };
    }

    case 'getDiff': {
      // 簡易diff: 行ごとの追加・削除を検出
      const oldLines = args.oldContent.split('\n');
      const newLines = args.newContent.split('\n');

      const added: string[] = [];
      const removed: string[] = [];

      // 単純な比較（本格的にはdiff-match-patchなど使う）
      const oldSet = new Set(oldLines);
      const newSet = new Set(newLines);

      for (const line of newLines) {
        if (!oldSet.has(line)) added.push(line);
      }
      for (const line of oldLines) {
        if (!newSet.has(line)) removed.push(line);
      }

      return { added, removed, summary: `+${added.length} -${removed.length}` };
    }

    case 'parseErrors': {
      // エラー出力をパースして構造化
      const lines = args.errorOutput.split('\n');
      const errors: Array<{ file?: string; line?: number; message: string; type: string }> = [];

      for (const line of lines) {
        // TypeScript error: TS2345: ...
        const tsMatch = line.match(/(.+)\((\d+),\d+\):\s*error\s*(TS\d+):\s*(.+)/);
        if (tsMatch) {
          errors.push({
            file: tsMatch[1],
            line: parseInt(tsMatch[2]),
            type: tsMatch[3],
            message: tsMatch[4]
          });
          continue;
        }

        // ESLint: /path/file.ts:10:5: error ...
        const eslintMatch = line.match(/(.+):(\d+):\d+:\s*(error|warning)\s+(.+)/);
        if (eslintMatch) {
          errors.push({
            file: eslintMatch[1],
            line: parseInt(eslintMatch[2]),
            type: eslintMatch[3],
            message: eslintMatch[4]
          });
        }
      }

      return {
        errorCount: errors.filter(e => e.type !== 'warning').length,
        warningCount: errors.filter(e => e.type === 'warning').length,
        errors
      };
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
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('APIキーが設定されていません');
  }

  const genAI = new GoogleGenAI({ apiKey });
  const token = getGitHubToken();
  const hasGitHub = !!token;

  // GitHub連携がある場合のみツール説明を追加
  const toolsSection = hasGitHub ? `

## コード操作ツール（必要な場合のみ使用）

以下のツールはGitHub連携済みなので、コード操作が必要な場合に使えます。
ただし、普通の会話や質問には使わないでください。

- listDirectory: ディレクトリ一覧
- fetchCodeFile: ファイル内容を読む
- searchCode: コード検索
- pushCodeEdit: GitHubにプッシュ

コード操作が必要と判断した場合のみツールを使ってください。` : '';

  const systemPrompt = `あなたは工事写真管理アプリのAIアシスタントです。

## 基本方針
- まず普通に会話してください
- 質問には直接答えてください
- コード操作が明確に必要な場合のみツールを使ってください
- 「ツールを使います」とか「listSkillsを呼び出してください」とか言わないでください

## このアプリについて
- 工事写真をAIで自動分類・整理するアプリです
- Gemini APIを使って画像解析します
- 工種、種別、細別、測点、備考などを自動判定します
${toolsSection}

ユーザーの質問や要望に、普通に日本語で答えてください。`;

  // 会話履歴を管理
  const conversationHistory: Array<{ role: 'user' | 'model', parts: any[] }> = [];

  // 初回リクエスト
  conversationHistory.push({ role: 'user', parts: [{ text: userRequest }] });

  // GitHub連携がない場合はツールなしで会話
  const toolsConfig = hasGitHub ? { tools: [{ functionDeclarations: CODE_TOOLS }] } : {};

  let response = await genAI.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: conversationHistory,
    config: {
      systemInstruction: systemPrompt,
      ...toolsConfig
    }
  });

  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    // テキスト応答があれば完了
    const textPart = response.candidates?.[0]?.content?.parts?.find(p => 'text' in p);
    const hasFunctionCall = response.candidates?.[0]?.content?.parts?.some(p => 'functionCall' in p);

    if (textPart && 'text' in textPart && !hasFunctionCall) {
      return textPart.text;
    }

    // GitHub連携がない場合、またはツール呼び出しがない場合は終了
    if (!hasGitHub) {
      // テキストがあればそれを返す
      if (textPart && 'text' in textPart) {
        return textPart.text;
      }
      break;
    }

    // ツール呼び出しを処理
    const functionCalls = response.candidates?.[0]?.content?.parts?.filter(p => 'functionCall' in p) || [];

    if (functionCalls.length === 0) {
      break;
    }

    // モデルの応答を履歴に追加
    const modelParts = response.candidates?.[0]?.content?.parts || [];
    conversationHistory.push({ role: 'model', parts: modelParts });

    const toolResultParts: any[] = [];

    for (const part of functionCalls) {
      if ('functionCall' in part) {
        const { name, args } = part.functionCall;
        onLog?.(`[Agent] ツール呼び出し: ${name}`);

        try {
          const result = await executeToolCall(name, args || {}, onLog);
          toolResultParts.push({
            functionResponse: {
              name,
              response: { result: JSON.stringify(result) }
            }
          });
          onLog?.(`[Agent] ${name} 完了`);
        } catch (error: any) {
          toolResultParts.push({
            functionResponse: {
              name,
              response: { error: error.message }
            }
          });
          onLog?.(`[Agent] ${name} エラー: ${error.message}`);
        }
      }
    }

    // ツール結果を履歴に追加
    conversationHistory.push({ role: 'user', parts: toolResultParts });

    // 次の応答を取得
    response = await genAI.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: conversationHistory,
      config: {
        systemInstruction: systemPrompt,
        ...toolsConfig
      }
    });
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
