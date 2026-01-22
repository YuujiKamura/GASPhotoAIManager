/**
 * Local API Server for Web Integration
 *
 * Claude Code SDK/CLIを使用した写真解析APIを提供
 * Web版からlocalhost経由で呼び出し
 *
 * ## 変更履歴
 * - 2026-01-22: WebSocket追加、SDK対応（Issue #169）
 *
 * 起動: npm run server
 * ポート: 3001
 */

import express from 'express';
import cors from 'cors';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { scanFolder, createPhotoInputs } from './adapters/imageAdapter';
import { getMergedHierarchy } from './adapters/masterAdapter';
import {
  analyzePhotos,
  type PhotoInput,
  type AnalysisResult,
  type AppMode
} from '../shared/core/claudeAnalysis';
import {
  analyzeWithSDKStream,
  type SDKMessage
} from '../shared/core/claudeSDK';

const app = express();
const PORT = 3001;

// HTTP Server（WebSocket用）
const server = createServer(app);

// Middleware
app.use(cors());  // 全オリジン許可
app.use(express.json({ limit: '100mb' }));

// 静的ファイル配信（local-client.html用）
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
app.use(express.static(projectRoot));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// SSE ログストリーミング
// ============================================

type SSEClient = { id: string; res: express.Response };
const sseClients: SSEClient[] = [];

function broadcastLog(msg: string, type: string = 'info') {
  const data = JSON.stringify({ type, message: msg, timestamp: new Date().toISOString() });
  sseClients.forEach(client => {
    client.res.write(`data: ${data}\n\n`);
  });
  console.log(`[API] ${type}: ${msg}`);
}

app.get('/api/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now().toString();
  sseClients.push({ id: clientId, res });
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'ログストリーム接続' })}\n\n`);

  req.on('close', () => {
    const idx = sseClients.findIndex(c => c.id === clientId);
    if (idx >= 0) sseClients.splice(idx, 1);
  });
});

// ============================================
// 写真解析 API
// ============================================

interface AnalyzeRequest {
  folderPath?: string;
  photos?: Array<{
    fileName: string;
    base64: string;
    mimeType: string;
    date?: number;
  }>;
  mode?: AppMode;
  instruction?: string;
  batchSize?: number;
}

interface AnalyzeResponse {
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
    step1?: number;
    step2?: number;
  };
}

app.post('/api/analyze', async (req, res) => {
  const startTime = Date.now();
  const body = req.body as AnalyzeRequest;

  broadcastLog(`解析開始 - mode: ${body.mode || 'construction'}`);

  try {
    let photoInputs: PhotoInput[];

    // フォルダパス指定の場合
    if (body.folderPath) {
      const folderPath = body.folderPath;

      // フォルダ存在確認
      try {
        const stat = await fs.stat(folderPath);
        if (!stat.isDirectory()) {
          return res.status(400).json({
            success: false,
            error: `Not a directory: ${folderPath}`
          } as AnalyzeResponse);
        }
      } catch {
        return res.status(400).json({
          success: false,
          error: `Folder not found: ${folderPath}`
        } as AnalyzeResponse);
      }

      // 写真スキャン
      broadcastLog(`フォルダスキャン: ${folderPath}`);
      const imagePaths = await scanFolder(folderPath, { recursive: false });

      if (imagePaths.length === 0) {
        return res.json({
          success: true,
          results: [],
          timing: { total: Date.now() - startTime }
        } as AnalyzeResponse);
      }

      broadcastLog(`${imagePaths.length}枚の画像を検出`);
      photoInputs = createPhotoInputs(imagePaths);
    }
    // base64画像直接指定の場合
    else if (body.photos && body.photos.length > 0) {
      photoInputs = body.photos.map(p => ({
        fileName: p.fileName,
        base64: p.base64,
        mimeType: p.mimeType,
        date: p.date,
      }));
    }
    // どちらも指定なし
    else {
      return res.status(400).json({
        success: false,
        error: 'Either folderPath or photos must be provided'
      } as AnalyzeResponse);
    }

    // 工種マスタ読み込み
    let hierarchy: Record<string, unknown> | undefined;
    if (body.mode !== 'general') {
      try {
        hierarchy = await getMergedHierarchy();
        broadcastLog('工種マスタ読み込み完了');
      } catch {
        broadcastLog('工種マスタなし', 'warning');
      }
    }

    // AI解析実行
    broadcastLog(`AI解析開始: ${photoInputs.length}枚`);
    const results = await analyzePhotos(photoInputs, {
      mode: body.mode || 'construction',
      instruction: body.instruction,
      batchSize: body.batchSize || 5,
      hierarchy,
      onLog: (msg, type) => {
        broadcastLog(msg, type);
      },
    });

    // 結果をマージ
    const outputData = photoInputs.map((photo, index) => {
      const analysis = results.find(r => r.fileName === photo.fileName) || results[index];
      return {
        fileName: photo.fileName,
        mimeType: photo.mimeType,
        date: photo.date,
        base64: photo.base64,
        analysis,
      };
    });

    const totalTime = Date.now() - startTime;
    broadcastLog(`解析完了: ${results.length}枚 (${totalTime}ms)`, 'success');

    res.json({
      success: true,
      results: outputData,
      timing: { total: totalTime }
    } as AnalyzeResponse);

  } catch (error) {
    broadcastLog(`エラー: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    } as AnalyzeResponse);
  }
});

// ============================================
// フォルダ内容取得 API (ファイル選択用)
// ============================================

app.get('/api/folder', async (req, res) => {
  const folderPath = req.query.path as string;

  if (!folderPath) {
    return res.status(400).json({ error: 'path query parameter required' });
  }

  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const items = entries.map(entry => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      path: path.join(folderPath, entry.name),
    }));
    res.json({ items });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to read folder'
    });
  }
});

// ============================================
// WebSocket サーバー（SDK連携用）
// ============================================

const wss = new WebSocketServer({ server, path: '/ws' });

interface WSMessage {
  type: string;
  prompt?: string;
  imagePaths?: string[];
  sessionId?: string;
  [key: string]: unknown;
}

// WebSocket接続管理
const wsClients = new Map<string, WebSocket>();

wss.on('connection', (ws, req) => {
  const clientId = Date.now().toString();
  wsClients.set(clientId, ws);
  console.log(`[WS] Client connected: ${clientId}`);

  // メッセージ送信ヘルパー
  const send = (data: unknown) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  };

  // 接続確認
  send({ type: 'connected', clientId });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString()) as WSMessage;
      console.log(`[WS] Received: ${message.type}`);

      switch (message.type) {
        case 'analyze':
          // SDK経由でストリーミング解析
          await handleWSAnalyze(message, send);
          break;

        case 'ping':
          send({ type: 'pong' });
          break;

        default:
          send({ type: 'error', message: `Unknown message type: ${message.type}` });
      }
    } catch (error) {
      console.error('[WS] Error:', error);
      send({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  ws.on('close', () => {
    wsClients.delete(clientId);
    console.log(`[WS] Client disconnected: ${clientId}`);
  });

  ws.on('error', (error) => {
    console.error(`[WS] Error for ${clientId}:`, error);
  });
});

async function handleWSAnalyze(
  message: WSMessage,
  send: (data: unknown) => void
) {
  const { prompt, imagePaths, sessionId } = message;

  if (!prompt) {
    send({ type: 'error', message: 'prompt is required' });
    return;
  }

  try {
    send({ type: 'analysis-start' });

    const stream = analyzeWithSDKStream(prompt, imagePaths, {
      cwd: process.cwd(),
      sessionId,
      permissionMode: 'bypassPermissions',
    });

    let capturedSessionId: string | undefined;

    for await (const msg of stream) {
      // セッションID取得
      if (msg.session_id && !capturedSessionId) {
        capturedSessionId = msg.session_id;
        send({ type: 'session-created', sessionId: capturedSessionId });
      }

      // SDKメッセージを転送
      send({ type: 'sdk-message', data: msg });

      // 完了通知
      if (msg.type === 'result') {
        send({
          type: 'analysis-complete',
          sessionId: capturedSessionId
        });
      }
    }
  } catch (error) {
    send({
      type: 'analysis-error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// ============================================
// サーバー起動
// ============================================

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║  GASPhotoAIManager API Server              ║
║  http://localhost:${PORT}                     ║
╠════════════════════════════════════════════╣
║  Endpoints:                                ║
║    GET  /api/health   - Health check       ║
║    POST /api/analyze  - Photo analysis     ║
║    GET  /api/folder   - List folder        ║
║    GET  /api/logs     - SSE log stream     ║
║    WS   /ws           - WebSocket (SDK)    ║
╚════════════════════════════════════════════╝
`);
});
