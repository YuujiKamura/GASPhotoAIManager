/**
 * Local API Service
 *
 * ローカルAPIサーバー (localhost:3001) との通信を管理
 * Claude Code SDK/CLIを使用した写真解析をWeb版から利用可能にする
 *
 * ## 変更履歴
 * - 2026-01-22: WebSocket対応追加（SDK連携用）
 */

const API_BASE = 'http://localhost:3001';
const WS_BASE = 'ws://localhost:3001/ws';

export interface PhotoInput {
  fileName: string;
  base64: string;
  mimeType: string;
  date?: number;
}

export interface AnalysisResult {
  fileName: string;
  workType: string;
  variety?: string;
  detail?: string;
  station: string;
  remarks: string;
  remarksCategory?: string;
  remarksValue?: string;
  description: string;
  measurements?: string;
  hasBoard: boolean;
  detectedText: string;
  reasoning?: string;
}

export interface AnalyzeResponse {
  success: boolean;
  results?: Array<{
    fileName: string;
    mimeType?: string;
    date?: number;
    base64?: string;
    analysis: AnalysisResult;
  }>;
  error?: string;
  timing?: {
    total: number;
  };
}

/**
 * APIサーバーの状態を確認
 */
export async function checkServerHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * フォルダパスを指定して写真解析
 */
export async function analyzeFolder(
  folderPath: string,
  options?: {
    mode?: 'construction' | 'general';
    instruction?: string;
    batchSize?: number;
  }
): Promise<AnalyzeResponse> {
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      folderPath,
      mode: options?.mode || 'construction',
      instruction: options?.instruction,
      batchSize: options?.batchSize || 5,
    }),
  });

  return res.json();
}

/**
 * 写真データを直接送信して解析
 */
export async function analyzePhotos(
  photos: PhotoInput[],
  options?: {
    mode?: 'construction' | 'general';
    instruction?: string;
    batchSize?: number;
    workType?: string;
  }
): Promise<AnalyzeResponse> {
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      photos,
      mode: options?.mode || 'construction',
      instruction: options?.instruction,
      batchSize: options?.batchSize || 5,
      workType: options?.workType,
    }),
  });

  return res.json();
}

/**
 * フォルダ内容を取得
 */
export async function listFolder(
  folderPath: string
): Promise<{ items: Array<{ name: string; isDirectory: boolean; path: string }> }> {
  const res = await fetch(`${API_BASE}/api/folder?path=${encodeURIComponent(folderPath)}`);
  return res.json();
}

/**
 * サーバー未起動時のエラーメッセージ
 */
export const SERVER_NOT_RUNNING_MESSAGE = `
ローカルAPIサーバーが起動していません。

以下のコマンドでサーバーを起動してください:
  npm run build:server && npm run server

または別ターミナルで:
  cd ${window.location.pathname.includes('GASPhotoAIManager') ? '.' : 'GASPhotoAIManager'}
  npm run server
`.trim();

// ============================================
// WebSocket クライアント（SDK連携用）
// ============================================

export interface SDKMessage {
  type: string;
  session_id?: string;
  data?: unknown;
  [key: string]: unknown;
}

export type WSMessageHandler = (message: SDKMessage) => void;

export class LocalServerWebSocket {
  private ws: WebSocket | null = null;
  private messageHandlers: Set<WSMessageHandler> = new Set();
  private reconnectTimer: number | null = null;
  private _isConnected = false;
  private sessionId: string | null = null;

  get isConnected(): boolean {
    return this._isConnected;
  }

  get currentSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * WebSocket接続を開始
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      try {
        this.ws = new WebSocket(WS_BASE);

        this.ws.onopen = () => {
          console.log('[WS] Connected to local server');
          this._isConnected = true;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as SDKMessage;

            // セッションID取得
            if (message.type === 'session-created' && message.sessionId) {
              this.sessionId = message.sessionId as string;
            }

            // 登録されたハンドラに通知
            this.messageHandlers.forEach(handler => handler(message));
          } catch (error) {
            console.error('[WS] Failed to parse message:', error);
          }
        };

        this.ws.onclose = () => {
          console.log('[WS] Disconnected');
          this._isConnected = false;
          this.ws = null;
        };

        this.ws.onerror = (error) => {
          console.error('[WS] Error:', error);
          this._isConnected = false;
          reject(new Error('WebSocket connection failed'));
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * WebSocket接続を切断
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._isConnected = false;
    this.sessionId = null;
  }

  /**
   * メッセージハンドラを登録
   */
  onMessage(handler: WSMessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * メッセージを送信
   */
  send(message: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    this.ws.send(JSON.stringify(message));
  }

  /**
   * SDKを使って解析（ストリーミング）
   */
  async analyze(
    prompt: string,
    options?: {
      imagePaths?: string[];
      sessionId?: string;
      onMessage?: WSMessageHandler;
    }
  ): Promise<string> {
    if (!this.isConnected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      let responseText = '';
      let completed = false;

      const cleanup = this.onMessage((message) => {
        // カスタムハンドラがあれば呼び出し
        options?.onMessage?.(message);

        switch (message.type) {
          case 'sdk-message': {
            const sdkMsg = message.data as SDKMessage;
            if (sdkMsg?.type === 'assistant' && sdkMsg.content) {
              const content = sdkMsg.content as Array<{ type: string; text?: string }>;
              for (const block of content) {
                if (block.type === 'text' && block.text) {
                  responseText += block.text;
                }
              }
            }
            break;
          }
          case 'analysis-complete':
            completed = true;
            cleanup();
            resolve(responseText);
            break;
          case 'analysis-error':
            cleanup();
            reject(new Error(message.message as string || 'Analysis failed'));
            break;
        }
      });

      // リクエスト送信
      this.send({
        type: 'analyze',
        prompt,
        imagePaths: options?.imagePaths,
        sessionId: options?.sessionId || this.sessionId,
      });

      // タイムアウト（5分）
      setTimeout(() => {
        if (!completed) {
          cleanup();
          reject(new Error('Analysis timeout'));
        }
      }, 5 * 60 * 1000);
    });
  }
}

// シングルトンインスタンス
export const localServerWS = new LocalServerWebSocket();

/**
 * WebSocket経由でSDK解析を実行
 */
export async function analyzeWithSDK(
  prompt: string,
  options?: {
    imagePaths?: string[];
    sessionId?: string;
    onMessage?: WSMessageHandler;
  }
): Promise<string> {
  return localServerWS.analyze(prompt, options);
}

/**
 * WebSocket接続状態を確認
 */
export function isWebSocketConnected(): boolean {
  return localServerWS.isConnected;
}

/**
 * WebSocket接続を開始
 */
export async function connectWebSocket(): Promise<void> {
  return localServerWS.connect();
}

/**
 * WebSocket接続を切断
 */
export function disconnectWebSocket(): void {
  localServerWS.disconnect();
}
