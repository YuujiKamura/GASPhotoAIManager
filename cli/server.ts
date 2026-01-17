/**
 * Local API Server for Web Integration
 *
 * Claude Code CLIを使用した写真解析APIを提供
 * Web版からlocalhost経由で呼び出し
 *
 * 起動: npm run server
 * ポート: 3001
 */

import express from 'express';
import cors from 'cors';
import * as fs from 'fs/promises';
import * as path from 'path';
import { scanFolder, processImages } from './adapters/imageAdapter';
import { getMergedHierarchy } from './adapters/masterAdapter';
import {
  analyzePhotos,
  type PhotoInput,
  type AnalysisResult,
  type AppMode
} from '../shared/core/claudeAnalysis';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  credentials: true
}));
app.use(express.json({ limit: '100mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

  console.log(`[API] /api/analyze - mode: ${body.mode || 'construction'}`);

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
      console.log(`[API] Scanning folder: ${folderPath}`);
      const imagePaths = await scanFolder(folderPath, { recursive: false });

      if (imagePaths.length === 0) {
        return res.json({
          success: true,
          results: [],
          timing: { total: Date.now() - startTime }
        } as AnalyzeResponse);
      }

      // 画像処理
      console.log(`[API] Processing ${imagePaths.length} images...`);
      const imageInfos = await processImages(imagePaths, {});

      photoInputs = imageInfos.map((info, index) => ({
        fileName: info.fileName,
        base64: info.base64,
        mimeType: info.mimeType,
        date: info.date,
        filePath: imagePaths[index],
      }));
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
        console.log('[API] Master data loaded');
      } catch {
        console.log('[API] Master data not available');
      }
    }

    // AI解析実行
    console.log(`[API] Analyzing ${photoInputs.length} photos...`);
    const results = await analyzePhotos(photoInputs, {
      mode: body.mode || 'construction',
      instruction: body.instruction,
      batchSize: body.batchSize || 5,
      hierarchy,
      onLog: (msg, type) => {
        console.log(`[API] ${type}: ${msg}`);
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
    console.log(`[API] Analysis complete: ${results.length} photos in ${totalTime}ms`);

    res.json({
      success: true,
      results: outputData,
      timing: { total: totalTime }
    } as AnalyzeResponse);

  } catch (error) {
    console.error('[API] Error:', error);
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
// サーバー起動
// ============================================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║  GASPhotoAIManager API Server              ║
║  http://localhost:${PORT}                     ║
╠════════════════════════════════════════════╣
║  Endpoints:                                ║
║    GET  /api/health   - Health check       ║
║    POST /api/analyze  - Photo analysis     ║
║    GET  /api/folder   - List folder        ║
╚════════════════════════════════════════════╝
`);
});
