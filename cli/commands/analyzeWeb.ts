/**
 * analyze:web - ブラウザUIで写真解析
 *
 * 1コマンドで:
 * - サーバー起動
 * - ブラウザ自動オープン
 * - 解析進捗リアルタイム表示
 * - 完了後自動終了
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
  console.log(`[${type}] ${msg}`);
}

function broadcastMetrics(event: MetricsEvent) {
  const data = JSON.stringify({ type: 'metrics', event, timestamp: new Date().toISOString() });
  sseClients.forEach(client => {
    client.res.write(`data: ${data}\n\n`);
  });
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
// メイン
// ============================================

export async function runAnalyzeWeb(folderPath: string, options: {
  mode?: AppMode;
  output?: string;
} = {}) {
  const { mode = 'construction', output } = options;
  const absoluteFolderPath = path.resolve(folderPath);

  // フォルダ確認
  try {
    const stat = await fs.stat(absoluteFolderPath);
    if (!stat.isDirectory()) {
      console.error(`エラー: ディレクトリではありません: ${absoluteFolderPath}`);
      process.exit(1);
    }
  } catch {
    console.error(`エラー: フォルダが見つかりません: ${absoluteFolderPath}`);
    process.exit(1);
  }

  // Express サーバー設定
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '100mb' }));

  // 静的ファイル配信（process.cwd()を使用）
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
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'ログストリーム接続' })}\n\n`);

    req.on('close', () => {
      const idx = sseClients.findIndex(c => c.id === clientId);
      if (idx >= 0) sseClients.splice(idx, 1);
    });
  });

  // 解析状態
  let analysisResults: AnalysisResult[] | null = null;
  let analysisMetrics: AnalysisMetrics | null = null;
  let analysisError: string | null = null;
  let analysisComplete = false;

  // 解析状態取得API
  app.get('/api/status', (_req, res) => {
    res.json({
      complete: analysisComplete,
      results: analysisResults,
      metrics: analysisMetrics,
      error: analysisError,
      folderPath: absoluteFolderPath,
      mode,
    });
  });

  // 結果取得API
  app.get('/api/results', (_req, res) => {
    if (!analysisComplete) {
      return res.json({ complete: false });
    }
    res.json({
      complete: true,
      success: !analysisError,
      results: analysisResults,
      metrics: analysisMetrics,
      error: analysisError,
    });
  });

  // メトリクス取得API
  app.get('/api/metrics', (_req, res) => {
    res.json({
      complete: analysisComplete,
      metrics: analysisMetrics,
    });
  });

  // サーバー起動
  const server = app.listen(PORT, async () => {
    console.log(`\n📷 写真解析 (Web UI)`);
    console.log(`   フォルダ: ${absoluteFolderPath}`);
    console.log(`   モード: ${mode}`);
    console.log(`   URL: http://localhost:${PORT}/web-analyzer.html\n`);

    // ブラウザを開く
    openBrowser(`http://localhost:${PORT}/web-analyzer.html`);

    // 解析開始
    try {
      broadcastLog(`フォルダスキャン: ${absoluteFolderPath}`);
      const imagePaths = await scanFolder(absoluteFolderPath, { recursive: false });

      if (imagePaths.length === 0) {
        broadcastLog('画像が見つかりませんでした', 'error');
        analysisError = '画像が見つかりませんでした';
        analysisComplete = true;
        return;
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
      broadcastLog(`AI解析開始: ${photoInputs.length}枚`);
      analysisResults = await analyzePhotos(photoInputs, {
        mode,
        batchSize: 5,
        hierarchy,
        onLog: (msg, type) => broadcastLog(msg, type),
        onProgress: (current, total, fileName) => {
          broadcastLog(`[${current}/${total}] ${fileName}`, 'info');
        },
        onMetrics: (event) => {
          broadcastMetrics(event);
          // 完了時にメトリクスを保存
          if (event.type === 'analysis_complete') {
            analysisMetrics = event.metrics;
          }
        },
      });

      broadcastLog(`解析完了: ${analysisResults.length}枚`, 'success');
      analysisComplete = true;

      // 出力ファイル保存
      if (output) {
        const outputPath = path.resolve(output);
        await fs.writeFile(outputPath, JSON.stringify(analysisResults, null, 2));
        broadcastLog(`結果保存: ${outputPath}`, 'success');
      }

      // 完了通知
      broadcastLog('ANALYSIS_COMPLETE', 'complete');

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      broadcastLog(`エラー: ${errMsg}`, 'error');
      analysisError = errMsg;
      analysisComplete = true;
    }
  });

  // シャットダウンAPI
  app.post('/api/shutdown', (_req, res) => {
    res.json({ message: 'サーバーを終了します' });
    broadcastLog('サーバー終了', 'info');
    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 500);
  });

  // Ctrl+C で終了
  process.on('SIGINT', () => {
    console.log('\n終了中...');
    server.close();
    process.exit(0);
  });
}
