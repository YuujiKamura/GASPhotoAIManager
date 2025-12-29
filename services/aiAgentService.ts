/**
 * AI Agent Service
 * Gemini APIにツールを提供し、AIがコードを読み書きできるようにする
 */

import { GoogleGenAI, FunctionDeclaration, Type } from '@google/genai';
import { getGitHubToken } from './githubSync';
import { getApiKey } from './geminiService';
import { AgentContext, loadContext, createNewContext, addMessage, contextToPrompt } from './agentContext';

// ツール定義ヘルパー
const tool = (name: string, desc: string, props: Record<string, { type: any; description: string }> = {}, required: string[] = []): FunctionDeclaration => ({
  name, description: desc,
  parameters: { type: Type.OBJECT, properties: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, { type: v.type, description: v.description }])), required }
});

const str = (desc: string) => ({ type: Type.STRING, description: desc });
const num = (desc: string) => ({ type: Type.NUMBER, description: desc });

export const CODE_TOOLS: FunctionDeclaration[] = [
  tool('listSkills', '.ai/skills/ のスキル一覧を取得'),
  tool('loadSkill', 'スキルを読み込む', { skillName: str('スキル名') }, ['skillName']),
  tool('listDirectory', 'ディレクトリ一覧取得', { dirPath: str('パス（空でルート）') }),
  tool('fetchCodeFile', 'ファイル内容を読む', { filePath: str('ファイルパス') }, ['filePath']),
  tool('searchCode', 'コード検索', { query: str('検索クエリ') }, ['query']),
  tool('validateCodeChange', 'ビルド検証', { filePath: str('ファイルパス'), newContent: str('新内容') }, ['filePath', 'newContent']),
  tool('pushCodeEdit', 'GitHubにプッシュ', { filePath: str('ファイルパス'), newContent: str('新内容'), commitMessage: str('コミットメッセージ') }, ['filePath', 'newContent', 'commitMessage']),
  tool('runLint', 'ESLint実行', { filePath: str('ファイルパス（省略で全体）') }),
  tool('runTypeCheck', '型チェック実行'),
  tool('getGitHistory', 'コミット履歴取得', { count: num('取得数'), filePath: str('ファイルパス') }),
  tool('getPackageInfo', 'package.json情報取得'),
  tool('getDiff', '差分取得', { oldContent: str('変更前'), newContent: str('変更後') }, ['oldContent', 'newContent']),
  tool('parseErrors', 'エラー解析', { errorOutput: str('エラー出力') }, ['errorOutput'])
];

type ToolHandler = (args: Record<string, any>, token: string, onLog?: (log: string) => void) => Promise<any>;

const toolHandlers: Record<string, ToolHandler> = {
  async listSkills(_, token) {
    const { listDirectory } = await import('./githubSync');
    const skills = await listDirectory(token, '.ai/skills');
    return skills?.filter(s => s.name.endsWith('.md')).map(s => ({ name: s.name.replace('.md', ''), path: s.path })) || [];
  },

  async loadSkill(args, token) {
    const { fetchCodeFile } = await import('./githubSync');
    const result = await fetchCodeFile(token, `.ai/skills/${args.skillName}.md`);
    return result ? { name: args.skillName, content: result.content } : { error: `スキル "${args.skillName}" が見つかりません` };
  },

  async listDirectory(args, token) {
    const { listDirectory } = await import('./githubSync');
    return await listDirectory(token, args.dirPath || '');
  },

  async fetchCodeFile(args, token) {
    const { fetchCodeFile } = await import('./githubSync');
    const result = await fetchCodeFile(token, args.filePath);
    return result ? { content: result.content } : null;
  },

  async searchCode(args, token) {
    const { searchCode } = await import('./githubSync');
    return await searchCode(token, args.query);
  },

  async validateCodeChange(args, token, onLog) {
    const { validateCodeChange } = await import('./webContainerService');
    return await validateCodeChange(token, args.filePath, args.newContent, onLog);
  },

  async pushCodeEdit(args, token) {
    const { pushCodeEdit } = await import('./githubSync');
    return await pushCodeEdit(token, args.filePath, args.newContent, args.commitMessage);
  },

  async runLint(args, _, onLog) {
    const { runCommand } = await import('./webContainerService');
    return await runCommand(`npx eslint ${args.filePath || '.'} --format json`, onLog);
  },

  async runTypeCheck(_, __, onLog) {
    const { runCommand } = await import('./webContainerService');
    return await runCommand('npx tsc --noEmit', onLog);
  },

  async getGitHistory(args, token) {
    const count = args.count || 10;
    const url = `https://api.github.com/repos/YuujiKamura/GASPhotoAIManager/commits?${args.filePath ? `path=${encodeURIComponent(args.filePath)}&` : ''}per_page=${count}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } });
    if (!res.ok) return null;
    return (await res.json()).map((c: any) => ({ sha: c.sha.slice(0, 7), message: c.commit.message.split('\n')[0], author: c.commit.author.name, date: c.commit.author.date }));
  },

  async getPackageInfo(_, token) {
    const { fetchCodeFile } = await import('./githubSync');
    const result = await fetchCodeFile(token, 'package.json');
    if (!result) return null;
    const pkg = JSON.parse(result.content);
    return { name: pkg.name, version: pkg.version, scripts: pkg.scripts, dependencies: Object.keys(pkg.dependencies || {}), devDependencies: Object.keys(pkg.devDependencies || {}) };
  },

  async getDiff(args) {
    const oldLines = args.oldContent.split('\n'), newLines = args.newContent.split('\n');
    const oldSet = new Set(oldLines), newSet = new Set(newLines);
    const added = newLines.filter(l => !oldSet.has(l)), removed = oldLines.filter(l => !newSet.has(l));
    return { added, removed, summary: `+${added.length} -${removed.length}` };
  },

  async parseErrors(args) {
    const errors: Array<{ file?: string; line?: number; message: string; type: string }> = [];
    for (const line of args.errorOutput.split('\n')) {
      const ts = line.match(/(.+)\((\d+),\d+\):\s*error\s*(TS\d+):\s*(.+)/);
      if (ts) { errors.push({ file: ts[1], line: parseInt(ts[2]), type: ts[3], message: ts[4] }); continue; }
      const es = line.match(/(.+):(\d+):\d+:\s*(error|warning)\s+(.+)/);
      if (es) errors.push({ file: es[1], line: parseInt(es[2]), type: es[3], message: es[4] });
    }
    return { errorCount: errors.filter(e => e.type !== 'warning').length, warningCount: errors.filter(e => e.type === 'warning').length, errors };
  }
};

export const executeToolCall = async (toolName: string, args: Record<string, any>, onLog?: (log: string) => void): Promise<any> => {
  const token = getGitHubToken();
  if (!token) throw new Error('GitHub token not set');
  onLog?.(`[Tool] ${toolName} を実行中...`);
  const handler = toolHandlers[toolName];
  if (!handler) throw new Error(`Unknown tool: ${toolName}`);
  return handler(args, token, onLog);
};

let currentContext: AgentContext | null = null;

export const getAgentContext = (): AgentContext => {
  if (!currentContext) currentContext = loadContext() || createNewContext();
  return currentContext;
};

const SYSTEM_PROMPT_BASE = `あなたは工事写真管理アプリのAIアシスタントです。
フレンドリーにカジュアルに話してください。質問には直接答えてください。
このアプリは工事写真をAIで自動分類・整理します。Gemini APIで画像解析し、工種、種別、細別、測点、備考を自動判定します。`;

const TOOLS_SECTION = `
コード操作ツール（必要な場合のみ使用）:
- listDirectory, fetchCodeFile, searchCode, pushCodeEdit
コード操作が必要な場合のみ使ってください。`;

export const runAIAgent = async (userRequest: string, onLog?: (log: string) => void, maxIterations = 10): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('APIキーが設定されていません');

  const genAI = new GoogleGenAI({ apiKey });
  const token = getGitHubToken();
  const hasGitHub = !!token;
  const context = getAgentContext();
  const ctxPrompt = contextToPrompt(context);

  const systemPrompt = SYSTEM_PROMPT_BASE + (hasGitHub ? TOOLS_SECTION : '') + (ctxPrompt ? `\n\nエージェントの記憶:\n${ctxPrompt}` : '');
  addMessage(context, 'user', userRequest);

  const history: Array<{ role: 'user' | 'model'; parts: any[] }> = [{ role: 'user', parts: [{ text: userRequest }] }];
  const config = { systemInstruction: systemPrompt, ...(hasGitHub ? { tools: [{ functionDeclarations: CODE_TOOLS }] } : {}) };

  let response = await genAI.models.generateContent({ model: 'gemini-2.0-flash', contents: history, config });

  for (let i = 0; i < maxIterations; i++) {
    const parts = response.candidates?.[0]?.content?.parts || [];
    const textPart = parts.find(p => 'text' in p);
    const fnCalls = parts.filter(p => 'functionCall' in p);

    if (textPart && 'text' in textPart && fnCalls.length === 0) {
      addMessage(context, 'assistant', textPart.text);
      return textPart.text;
    }

    if (!hasGitHub || fnCalls.length === 0) {
      if (textPart && 'text' in textPart) { addMessage(context, 'assistant', textPart.text); return textPart.text; }
      break;
    }

    history.push({ role: 'model', parts });
    const results: any[] = [];

    for (const part of fnCalls) {
      if ('functionCall' in part) {
        const { name, args } = part.functionCall;
        onLog?.(`[Agent] ツール呼び出し: ${name}`);
        try {
          const result = await executeToolCall(name, args || {}, onLog);
          results.push({ functionResponse: { name, response: { result: JSON.stringify(result) } } });
          onLog?.(`[Agent] ${name} 完了`);
        } catch (error: any) {
          results.push({ functionResponse: { name, response: { error: error.message } } });
          onLog?.(`[Agent] ${name} エラー: ${error.message}`);
        }
      }
    }

    history.push({ role: 'user', parts: results });
    response = await genAI.models.generateContent({ model: 'gemini-2.0-flash', contents: history, config });
  }

  return '処理が完了しませんでした（最大反復回数に達しました）';
};

const requestCodeEdit = async (description: string, onLog?: (log: string) => void): Promise<{ success: boolean; message: string; commitUrl?: string }> => {
  try {
    onLog?.('[Agent] コード編集リクエストを処理中...');
    const result = await runAIAgent(description, onLog);
    onLog?.('[Agent] 完了');
    return { success: true, message: result };
  } catch (error: any) {
    return { success: false, message: error.message || 'エラーが発生しました' };
  }
};
