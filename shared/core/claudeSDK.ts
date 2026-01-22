/**
 * Claude Code SDK Wrapper
 *
 * Claude Agent SDKのラッパー。セッション維持による高速化を実現。
 * spawnSyncによるCLI呼び出しを置き換える。
 *
 * ## 変更履歴
 * - 2026-01-22: 初期実装（Issue #169）
 */

import { query } from '@anthropic-ai/claude-code-sdk';
import * as path from 'path';
import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';

// ============================================
// 型定義
// ============================================

export interface SDKMessage {
  type: string;
  session_id?: string;
  content?: SDKContentBlock[];
  modelUsage?: Record<string, ModelUsage>;
  [key: string]: unknown;
}

interface SDKContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

interface ModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  cumulativeInputTokens?: number;
  cumulativeOutputTokens?: number;
  cumulativeCacheReadInputTokens?: number;
  cumulativeCacheCreationInputTokens?: number;
}

export interface SessionState {
  id: string;
  instance: AsyncGenerator<SDKMessage>;
  startTime: number;
  status: 'active' | 'completed' | 'aborted' | 'error';
}

export interface SDKQueryOptions {
  cwd?: string;
  sessionId?: string;
  permissionMode?: 'default' | 'bypassPermissions' | 'plan';
  model?: string;
}

export interface SDKAnalysisResult {
  sessionId: string;
  response: string;
  messages: SDKMessage[];
}

// ============================================
// セッション管理
// ============================================

const activeSessions = new Map<string, SessionState>();

export function getSession(sessionId: string): SessionState | undefined {
  return activeSessions.get(sessionId);
}

export function getAllActiveSessions(): string[] {
  return Array.from(activeSessions.keys());
}

function addSession(sessionId: string, instance: AsyncGenerator<SDKMessage>): void {
  activeSessions.set(sessionId, {
    id: sessionId,
    instance,
    startTime: Date.now(),
    status: 'active',
  });
}

function updateSessionStatus(sessionId: string, status: SessionState['status']): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.status = status;
  }
}

function removeSession(sessionId: string): void {
  activeSessions.delete(sessionId);
}

// ============================================
// 一時ファイル管理
// ============================================

let tempImageDir: string | null = null;

function getTempImageDir(): string {
  if (!tempImageDir) {
    tempImageDir = path.join(process.cwd(), 'temp-images');
    if (!existsSync(tempImageDir)) {
      mkdirSync(tempImageDir, { recursive: true });
    }
  }
  return tempImageDir;
}

export function cleanupTempImages(): void {
  if (tempImageDir && existsSync(tempImageDir)) {
    try {
      const files = readdirSync(tempImageDir);
      for (const file of files) {
        unlinkSync(path.join(tempImageDir, file));
      }
    } catch {
      // ignore cleanup errors
    }
  }
}

function prepareImagePaths(imagePaths: string[]): string[] {
  if (!imagePaths || imagePaths.length === 0) {
    return [];
  }

  const tempDir = getTempImageDir();
  const localPaths: string[] = [];

  for (const p of imagePaths) {
    if (!existsSync(p)) {
      console.warn(`Warning: File not found: ${p}`);
      continue;
    }
    const tempPath = path.join(tempDir, path.basename(p));
    copyFileSync(p, tempPath);
    // 絶対パス、スラッシュ統一
    localPaths.push(path.resolve(tempPath).replace(/\\/g, '/'));
  }

  return localPaths;
}

// ============================================
// SDK Query実行
// ============================================

/**
 * SDKを使用してClaudeにクエリを実行
 *
 * @param prompt - プロンプト
 * @param imagePaths - 解析する画像のパス（オプション）
 * @param options - クエリオプション
 * @returns 解析結果
 */
export async function analyzeWithSDK(
  prompt: string,
  imagePaths?: string[],
  options?: SDKQueryOptions
): Promise<SDKAnalysisResult> {
  const cwd = options?.cwd || process.cwd();
  const sessionId = options?.sessionId;
  const permissionMode = options?.permissionMode || 'bypassPermissions';

  // 画像パスの準備
  let finalPrompt = prompt;
  if (imagePaths && imagePaths.length > 0) {
    const localPaths = prepareImagePaths(imagePaths);
    if (localPaths.length > 0) {
      const imageList = localPaths.join(', ');
      finalPrompt = `Read the following image files and analyze them: ${imageList}\n\n${prompt}`;
    }
  }

  // SDKオプションの構築
  const sdkOptions: Record<string, unknown> = {
    cwd,
    permissionMode,
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
    },
    settingSources: ['project', 'user', 'local'],
  };

  // セッション再開
  if (sessionId) {
    sdkOptions.resume = sessionId;
  }

  // モデル指定
  if (options?.model) {
    sdkOptions.model = options.model;
  }

  // クエリ実行
  const queryInstance = query({
    prompt: finalPrompt,
    options: sdkOptions,
  });

  const messages: SDKMessage[] = [];
  let capturedSessionId = sessionId || '';
  let responseText = '';

  // セッション追跡を開始（resume時）
  if (sessionId) {
    addSession(sessionId, queryInstance as AsyncGenerator<SDKMessage>);
  }

  try {
    for await (const msg of queryInstance as AsyncIterable<SDKMessage>) {
      messages.push(msg);

      // セッションID取得
      if (msg.session_id && !capturedSessionId) {
        capturedSessionId = msg.session_id;
        addSession(capturedSessionId, queryInstance as AsyncGenerator<SDKMessage>);
      }

      // テキスト応答の収集
      if (msg.type === 'assistant' && msg.content) {
        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            responseText += block.text;
          }
        }
      }

      // 結果メッセージ
      if (msg.type === 'result') {
        updateSessionStatus(capturedSessionId, 'completed');
      }
    }
  } catch (error) {
    updateSessionStatus(capturedSessionId, 'error');
    throw error;
  }

  return {
    sessionId: capturedSessionId,
    response: responseText,
    messages,
  };
}

/**
 * SDKを使用してClaudeにクエリを実行（ストリーミング版）
 *
 * async generatorとして結果をストリーム
 */
export async function* analyzeWithSDKStream(
  prompt: string,
  imagePaths?: string[],
  options?: SDKQueryOptions
): AsyncGenerator<SDKMessage, void, undefined> {
  const cwd = options?.cwd || process.cwd();
  const sessionId = options?.sessionId;
  const permissionMode = options?.permissionMode || 'bypassPermissions';

  // 画像パスの準備
  let finalPrompt = prompt;
  if (imagePaths && imagePaths.length > 0) {
    const localPaths = prepareImagePaths(imagePaths);
    if (localPaths.length > 0) {
      const imageList = localPaths.join(', ');
      finalPrompt = `Read the following image files and analyze them: ${imageList}\n\n${prompt}`;
    }
  }

  // SDKオプションの構築
  const sdkOptions: Record<string, unknown> = {
    cwd,
    permissionMode,
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
    },
    settingSources: ['project', 'user', 'local'],
  };

  if (sessionId) {
    sdkOptions.resume = sessionId;
  }

  if (options?.model) {
    sdkOptions.model = options.model;
  }

  const queryInstance = query({
    prompt: finalPrompt,
    options: sdkOptions,
  });

  let capturedSessionId = sessionId || '';

  if (sessionId) {
    addSession(sessionId, queryInstance as AsyncGenerator<SDKMessage>);
  }

  try {
    for await (const msg of queryInstance as AsyncIterable<SDKMessage>) {
      if (msg.session_id && !capturedSessionId) {
        capturedSessionId = msg.session_id;
        addSession(capturedSessionId, queryInstance as AsyncGenerator<SDKMessage>);
      }

      yield msg;

      if (msg.type === 'result') {
        updateSessionStatus(capturedSessionId, 'completed');
      }
    }
  } catch (error) {
    updateSessionStatus(capturedSessionId, 'error');
    throw error;
  }
}

/**
 * 同期的なCLI呼び出しの代替（後方互換性）
 *
 * 内部的にはSDKを使用するが、インターフェースは同期的に見せる
 */
export async function runClaudeCodeSDK(
  prompt: string,
  imagePaths?: string[],
  options?: SDKQueryOptions
): Promise<string> {
  const result = await analyzeWithSDK(prompt, imagePaths, options);
  return result.response;
}

/**
 * セッションを中断
 */
export async function abortSession(sessionId: string): Promise<boolean> {
  const session = getSession(sessionId);
  if (!session) {
    console.log(`Session ${sessionId} not found`);
    return false;
  }

  try {
    // interrupt() がサポートされていれば呼び出し
    if ('interrupt' in session.instance && typeof session.instance.interrupt === 'function') {
      await (session.instance as unknown as { interrupt: () => Promise<void> }).interrupt();
    }

    updateSessionStatus(sessionId, 'aborted');
    removeSession(sessionId);
    return true;
  } catch (error) {
    console.error(`Error aborting session ${sessionId}:`, error);
    return false;
  }
}

// ============================================
// ユーティリティ
// ============================================

/**
 * SDKメッセージからテキスト応答を抽出
 */
export function extractTextFromMessages(messages: SDKMessage[]): string {
  let text = '';
  for (const msg of messages) {
    if (msg.type === 'assistant' && msg.content) {
      for (const block of msg.content) {
        if (block.type === 'text' && block.text) {
          text += block.text;
        }
      }
    }
  }
  return text;
}

/**
 * SDKメッセージからトークン使用量を抽出
 */
export function extractTokenUsage(
  messages: SDKMessage[]
): { input: number; output: number; total: number } | null {
  for (const msg of messages) {
    if (msg.type === 'result' && msg.modelUsage) {
      const modelKey = Object.keys(msg.modelUsage)[0];
      const modelData = msg.modelUsage[modelKey];

      if (modelData) {
        const input =
          modelData.cumulativeInputTokens ||
          modelData.inputTokens ||
          0;
        const output =
          modelData.cumulativeOutputTokens ||
          modelData.outputTokens ||
          0;
        const cacheRead =
          modelData.cumulativeCacheReadInputTokens ||
          modelData.cacheReadInputTokens ||
          0;
        const cacheCreation =
          modelData.cumulativeCacheCreationInputTokens ||
          modelData.cacheCreationInputTokens ||
          0;

        return {
          input: input + cacheRead + cacheCreation,
          output,
          total: input + output + cacheRead + cacheCreation,
        };
      }
    }
  }
  return null;
}
