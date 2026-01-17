/**
 * Local API Service
 *
 * ローカルAPIサーバー (localhost:3001) との通信を管理
 * Claude Code CLIを使用した写真解析をWeb版から利用可能にする
 */

const API_BASE = 'http://localhost:3001';

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
