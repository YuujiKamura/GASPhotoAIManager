/**
 * WebContainer Service
 *
 * ブラウザ内でNode.jsを実行し、コード変更のビルド検証を行う
 */

import { WebContainer } from '@webcontainer/api';

let webcontainerInstance: WebContainer | null = null;
let isBooting = false;

/**
 * WebContainerを起動（シングルトン）
 */
export const bootWebContainer = async (): Promise<WebContainer> => {
  if (webcontainerInstance) {
    return webcontainerInstance;
  }

  if (isBooting) {
    // 起動中の場合は待機
    while (isBooting) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return webcontainerInstance!;
  }

  isBooting = true;
  try {
    console.log('[WebContainer] Booting...');
    webcontainerInstance = await WebContainer.boot();
    console.log('[WebContainer] Ready');
    return webcontainerInstance;
  } finally {
    isBooting = false;
  }
};

/**
 * GitHubからプロジェクトファイルを取得してWebContainerにマウント
 */
export const mountProjectFromGitHub = async (
  container: WebContainer,
  token: string,
  branch: string = 'main'
): Promise<void> => {
  const { listDirectory, fetchCodeFile } = await import('./githubSync');

  console.log('[WebContainer] Fetching project files from GitHub...');

  // 再帰的にファイルを取得
  const fetchDir = async (dirPath: string): Promise<Record<string, any>> => {
    const items = await listDirectory(token, dirPath, branch);
    if (!items) return {};

    const result: Record<string, any> = {};

    for (const item of items) {
      // node_modules, dist, .git はスキップ
      if (['node_modules', 'dist', '.git', '.vercel'].includes(item.name)) {
        continue;
      }

      if (item.type === 'dir') {
        result[item.name] = {
          directory: await fetchDir(item.path)
        };
      } else {
        const file = await fetchCodeFile(token, item.path, branch);
        if (file) {
          result[item.name] = {
            file: { contents: file.content }
          };
        }
      }
    }

    return result;
  };

  const files = await fetchDir('');
  console.log('[WebContainer] Mounting files...');
  await container.mount(files);
  console.log('[WebContainer] Files mounted');
};

/**
 * 特定のファイルだけを更新
 */
export const updateFile = async (
  container: WebContainer,
  filePath: string,
  content: string
): Promise<void> => {
  await container.fs.writeFile(filePath, content);
  console.log(`[WebContainer] Updated: ${filePath}`);
};

/**
 * npm installを実行
 */
export const runNpmInstall = async (
  container: WebContainer,
  onLog?: (log: string) => void
): Promise<{ success: boolean; output: string }> => {
  console.log('[WebContainer] Running npm install...');
  onLog?.('npm install を実行中...');

  const installProcess = await container.spawn('npm', ['install']);

  let output = '';

  installProcess.output.pipeTo(new WritableStream({
    write(data) {
      output += data;
      onLog?.(data);
    }
  }));

  const exitCode = await installProcess.exit;

  return {
    success: exitCode === 0,
    output
  };
};

/**
 * npm run buildを実行
 */
export const runBuild = async (
  container: WebContainer,
  onLog?: (log: string) => void
): Promise<{ success: boolean; output: string; errors: string[] }> => {
  console.log('[WebContainer] Running npm run build...');
  onLog?.('npm run build を実行中...');

  const buildProcess = await container.spawn('npm', ['run', 'build']);

  let output = '';
  const errors: string[] = [];

  buildProcess.output.pipeTo(new WritableStream({
    write(data) {
      output += data;
      onLog?.(data);

      // エラー行を抽出
      if (data.includes('error') || data.includes('Error')) {
        errors.push(data.trim());
      }
    }
  }));

  const exitCode = await buildProcess.exit;

  return {
    success: exitCode === 0,
    output,
    errors
  };
};

/**
 * コード変更をビルド検証
 */
export const validateCodeChange = async (
  token: string,
  filePath: string,
  newContent: string,
  onLog?: (log: string) => void
): Promise<{
  success: boolean;
  errors: string[];
  output: string;
}> => {
  try {
    onLog?.('WebContainer を起動中...');
    const container = await bootWebContainer();

    // 初回はプロジェクト全体をマウント
    onLog?.('プロジェクトファイルを読み込み中...');
    await mountProjectFromGitHub(container, token, 'main');

    // 変更ファイルを上書き
    onLog?.(`${filePath} を更新中...`);
    await updateFile(container, filePath, newContent);

    // npm install（初回のみ必要、キャッシュされる）
    const installResult = await runNpmInstall(container, onLog);
    if (!installResult.success) {
      return {
        success: false,
        errors: ['npm install failed'],
        output: installResult.output
      };
    }

    // ビルド実行
    const buildResult = await runBuild(container, onLog);

    return {
      success: buildResult.success,
      errors: buildResult.errors,
      output: buildResult.output
    };
  } catch (error: any) {
    console.error('[WebContainer] Error:', error);
    return {
      success: false,
      errors: [error.message || 'Unknown error'],
      output: ''
    };
  }
};

/**
 * WebContainerが利用可能かチェック
 */
export const isWebContainerSupported = (): boolean => {
  // WebContainerはCross-Origin Isolationが必要
  return typeof window !== 'undefined' &&
         'crossOriginIsolated' in window &&
         window.crossOriginIsolated === true;
};

/**
 * WebContainerの状態
 */
const getWebContainerStatus = (): 'not-supported' | 'not-booted' | 'booting' | 'ready' => {
  if (!isWebContainerSupported()) return 'not-supported';
  if (isBooting) return 'booting';
  if (webcontainerInstance) return 'ready';
  return 'not-booted';
};

/**
 * 任意のコマンドを実行
 */
export const runCommand = async (
  command: string,
  onLog?: (log: string) => void
): Promise<{ success: boolean; output: string }> => {
  const container = await bootWebContainer();

  console.log(`[WebContainer] Running: ${command}`);
  onLog?.(`実行中: ${command}`);

  const parts = command.split(' ');
  const cmd = parts[0];
  const args = parts.slice(1);

  const process = await container.spawn(cmd, args);

  let output = '';

  process.output.pipeTo(new WritableStream({
    write(data) {
      output += data;
      onLog?.(data);
    }
  }));

  const exitCode = await process.exit;

  return {
    success: exitCode === 0,
    output
  };
};
