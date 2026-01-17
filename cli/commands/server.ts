/**
 * server コマンド - 常駐ダッシュボードサーバー
 *
 * - `gaspm server start` : サーバー起動
 * - `gaspm server stop`  : サーバー停止
 * - `gaspm server status`: 状態確認
 */

import express from 'express';
import cors from 'cors';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { scanFolder, processImages } from '../adapters/imageAdapter';
import { getMergedHierarchy } from '../adapters/masterAdapter';
import {
  analyzePhotos,
  type PhotoInput,
  type AnalysisResult,
  type AnalysisMetrics,
  type MetricsEvent,
  type AppMode
} from '../../shared/core/claudeAnalysis';

const PORT = 3001;
const PID_FILE = path.join(process.cwd(), '.gaspm-server.pid');

// SSE クライアント管理
type SSEClient = { id: string; res: express.Response };
let sseClients: SSEClient[] = [];

// 現在の解析状態
interface AnalysisState {
  folderPath: string;
  mode: AppMode;
  status: 'idle' | 'running' | 'complete' | 'error';
  results: AnalysisResult[] | null;
  metrics: AnalysisMetrics | null;
  error: string | null;
}

let currentAnalysis: AnalysisState = {
  folderPath: '',
  mode: 'construction',
  status: 'idle',
  results: null,
  metrics: null,
  error: null,
};

// ============================================
// SSE ブロードキャスト
// ============================================

function broadcastLog(msg: string, type: string = 'info') {
  const data = JSON.stringify({ type, message: msg, timestamp: new Date().toISOString() });
  sseClients.forEach(client => {
    try {
      client.res.write(`data: ${data}\n\n`);
    } catch {
      // クライアント切断済み
    }
  });
  console.log(`[${type}] ${msg}`);
}

function broadcastMetrics(event: MetricsEvent) {
  const data = JSON.stringify({ type: 'metrics', event, timestamp: new Date().toISOString() });
  sseClients.forEach(client => {
    try {
      client.res.write(`data: ${data}\n\n`);
    } catch {
      // クライアント切断済み
    }
  });
}

function broadcastStatus() {
  const data = JSON.stringify({
    type: 'status',
    status: currentAnalysis.status,
    folderPath: currentAnalysis.folderPath,
    mode: currentAnalysis.mode,
    timestamp: new Date().toISOString(),
  });
  sseClients.forEach(client => {
    try {
      client.res.write(`data: ${data}\n\n`);
    } catch {
      // クライアント切断済み
    }
  });
}

// ============================================
// 解析実行
// ============================================

async function runAnalysis(folderPath: string, options: {
  mode?: AppMode;
  output?: string;
  useYolo?: boolean;
  yoloConfThreshold?: number;
}): Promise<void> {
  const { mode = 'construction', output, useYolo = false, yoloConfThreshold = 0.5 } = options;
  // 入力パスから引用符を除去し、絶対パスに変換
  const cleanedPath = folderPath.replace(/^["']|["']$/g, '').trim();
  const absoluteFolderPath = path.isAbsolute(cleanedPath) ? cleanedPath : path.resolve(cleanedPath);

  // 状態リセット
  currentAnalysis = {
    folderPath: absoluteFolderPath,
    mode,
    status: 'running',
    results: null,
    metrics: null,
    error: null,
  };
  broadcastStatus();

  try {
    // フォルダ確認
    const stat = await fs.stat(absoluteFolderPath);
    if (!stat.isDirectory()) {
      throw new Error(`ディレクトリではありません: ${absoluteFolderPath}`);
    }

    broadcastLog(`フォルダスキャン: ${absoluteFolderPath}`);
    const imagePaths = await scanFolder(absoluteFolderPath, { recursive: false });

    if (imagePaths.length === 0) {
      throw new Error('画像が見つかりませんでした');
    }

    broadcastLog(`${imagePaths.length}枚の画像を検出`);

    // 画像処理
    const imageInfos = await processImages(imagePaths, {});
    const photoInputs: PhotoInput[] = imageInfos.map((info, index) => ({
      fileName: info.fileName,
      base64: info.base64,
      mimeType: info.mimeType,
      date: info.date,
      filePath: imagePaths[index],
    }));

    // 工種マスタ読み込み
    let hierarchy: Record<string, unknown> | undefined;
    if (mode !== 'general') {
      try {
        hierarchy = await getMergedHierarchy();
        broadcastLog('工種マスタ読み込み完了');
      } catch {
        broadcastLog('工種マスタなし（generalモードで続行）', 'info');
      }
    }

    // AI解析実行
    broadcastLog(`AI解析開始: ${photoInputs.length}枚${useYolo ? ' (YOLO前処理有効)' : ''}`);
    const results = await analyzePhotos(photoInputs, {
      mode,
      batchSize: 10,
      parallelBatches: 1,
      hierarchy,
      useYolo,
      yoloConfThreshold,
      onLog: (msg, type) => broadcastLog(msg, type),
      onProgress: (current, total, fileName) => {
        broadcastLog(`[${current}/${total}] ${fileName}`, 'info');
      },
      onMetrics: (event) => {
        broadcastMetrics(event);
        if (event.type === 'analysis_complete') {
          currentAnalysis.metrics = event.metrics;
        }
      },
    });

    currentAnalysis.results = results;
    currentAnalysis.status = 'complete';
    broadcastLog(`解析完了: ${results.length}枚`, 'success');

    // 出力ファイル保存
    if (output) {
      const outputPath = path.resolve(output);
      await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
      broadcastLog(`結果保存: ${outputPath}`, 'success');
    }

    // 完了通知
    broadcastStatus();
    broadcastLog('ANALYSIS_COMPLETE', 'complete');

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    broadcastLog(`エラー: ${errMsg}`, 'error');
    currentAnalysis.error = errMsg;
    currentAnalysis.status = 'error';
    broadcastStatus();
  }
}

// ============================================
// ブラウザを開く
// ============================================

function openBrowser(url: string) {
  const platform = process.platform;
  let cmd: string;

  if (platform === 'win32') {
    cmd = `start "" "${url}"`;
  } else if (platform === 'darwin') {
    cmd = `open "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }

  exec(cmd, (err) => {
    if (err) console.error('ブラウザを開けませんでした:', err.message);
  });
}

// ============================================
// サーバーコマンド
// ============================================

export async function serverCommand(action: string = 'status'): Promise<void> {
  switch (action) {
    case 'start':
      await startServer();
      break;
    case 'stop':
      await stopServer();
      break;
    case 'status':
      await checkStatus();
      break;
    default:
      console.log('Usage: gaspm server [start|stop|status]');
  }
}

async function startServer(): Promise<void> {
  // 既存サーバー確認
  if (await isServerRunning()) {
    console.log(`\n✅ サーバーは既に起動中です: http://localhost:${PORT}\n`);
    return;
  }

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '100mb' }));

  // 静的ファイル配信
  const projectRoot = process.cwd();
  app.use(express.static(projectRoot));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // SSE endpoint
  app.get('/api/logs', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = Date.now().toString();
    sseClients.push({ id: clientId, res });

    // 現在の状態を送信
    res.write(`data: ${JSON.stringify({
      type: 'status',
      status: currentAnalysis.status,
      folderPath: currentAnalysis.folderPath,
      mode: currentAnalysis.mode,
    })}\n\n`);

    req.on('close', () => {
      const idx = sseClients.findIndex(c => c.id === clientId);
      if (idx >= 0) sseClients.splice(idx, 1);
    });
  });

  // 状態取得API
  app.get('/api/status', (_req, res) => {
    res.json({
      status: currentAnalysis.status,
      folderPath: currentAnalysis.folderPath,
      mode: currentAnalysis.mode,
      complete: currentAnalysis.status === 'complete',
      results: currentAnalysis.results,
      metrics: currentAnalysis.metrics,
      error: currentAnalysis.error,
    });
  });

  // 結果取得API
  app.get('/api/results', (_req, res) => {
    res.json({
      complete: currentAnalysis.status === 'complete',
      success: currentAnalysis.status === 'complete' && !currentAnalysis.error,
      results: currentAnalysis.results,
      metrics: currentAnalysis.metrics,
      error: currentAnalysis.error,
    });
  });

  // 解析リクエストAPI
  app.post('/api/analyze', async (req, res) => {
    const { folderPath, options = {} } = req.body;

    if (!folderPath) {
      return res.status(400).json({ error: 'folderPath is required' });
    }

    if (currentAnalysis.status === 'running') {
      return res.status(409).json({ error: '解析が既に実行中です' });
    }

    res.json({ status: 'started', folderPath });

    // 非同期で解析を実行
    runAnalysis(folderPath, {
      mode: options.mode || 'construction',
      output: options.output,
      useYolo: options.useYolo || false,
      yoloConfThreshold: options.yoloConfThreshold || 0.5,
    });
  });

  // シャットダウンAPI
  app.post('/api/shutdown', (_req, res) => {
    res.json({ message: 'サーバーを終了します' });
    broadcastLog('サーバー終了', 'info');
    setTimeout(() => {
      server.close();
      fs.unlink(PID_FILE).catch(() => {});
      process.exit(0);
    }, 500);
  });

  // サーバー起動
  const server = app.listen(PORT, async () => {
    console.log(`\n📊 GASPhotoAIManager ダッシュボードサーバー`);
    console.log(`   URL: http://localhost:${PORT}/web-analyzer.html`);
    console.log(`   状態: 解析待機中\n`);
    console.log(`   使い方: gaspm analyze ./photos --server\n`);

    // PIDファイル保存
    await fs.writeFile(PID_FILE, process.pid.toString());

    // ブラウザを開く
    openBrowser(`http://localhost:${PORT}/web-analyzer.html`);
  });

  // Ctrl+C で終了
  process.on('SIGINT', async () => {
    console.log('\n終了中...');
    server.close();
    await fs.unlink(PID_FILE).catch(() => {});
    process.exit(0);
  });
}

async function stopServer(): Promise<void> {
  try {
    // まずHTTPで停止リクエスト
    try {
      await fetch(`http://localhost:${PORT}/api/shutdown`, { method: 'POST' });
      console.log('✅ サーバーを停止しました');
      return;
    } catch {
      // HTTPリクエスト失敗、PIDファイルを使用
    }

    // PIDファイルから停止
    const pid = await fs.readFile(PID_FILE, 'utf-8');
    process.kill(parseInt(pid, 10));
    await fs.unlink(PID_FILE);
    console.log('✅ サーバーを停止しました');
  } catch {
    console.log('サーバーは起動していません');
  }
}

async function checkStatus(): Promise<void> {
  if (await isServerRunning()) {
    console.log(`\n✅ サーバー稼働中: http://localhost:${PORT}/web-analyzer.html\n`);

    // 詳細状態を取得
    try {
      const res = await fetch(`http://localhost:${PORT}/api/status`);
      const data = await res.json();
      console.log(`   解析状態: ${data.status}`);
      if (data.folderPath) {
        console.log(`   フォルダ: ${data.folderPath}`);
      }
      console.log('');
    } catch {
      // 詳細取得失敗
    }
  } else {
    console.log('\n❌ サーバーは停止しています\n');
    console.log('   起動: gaspm server start\n');
  }
}

async function isServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${PORT}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}
