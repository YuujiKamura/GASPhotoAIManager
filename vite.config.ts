import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// 分析スクリプトを実行するViteプラグイン
function analyzePlugin() {
  return {
    name: 'analyze-plugin',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.url === '/api/analyze') {
          try {
            res.setHeader('Content-Type', 'application/json');
            await execAsync('npx tsx scripts/analyze-codebase.ts', { cwd: process.cwd() });
            res.end(JSON.stringify({ success: true, timestamp: new Date().toISOString() }));
          } catch (error: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: error.message }));
          }
          return;
        }
        next();
      });
    }
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: '/GASPhotoAIManager/',
      // YAMLファイルをアセットとして認識（import.meta.globのフォールバック用）
      assetsInclude: ['**/*.yaml'],
      server: {
        port: 3000,
        host: '0.0.0.0',
        headers: {
          // WebContainerに必要なCross-Origin Isolation
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Opener-Policy': 'same-origin',
        },
      },
      plugins: [react(), analyzePlugin()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        sourcemap: true,
        rollupOptions: {
          output: {
            manualChunks: (id) => {
              // node_modulesのパッケージを分離
              if (id.includes('node_modules')) {
                // fontkit関連（PDF用フォント処理）
                if (id.includes('fontkit') || id.includes('@pdf-lib/fontkit')) {
                  return 'fontkit';
                }
                // PDF関連
                if (id.includes('pdfjs-dist') || id.includes('pdf-lib')) {
                  return 'pdf';
                }
                // Gemini API
                if (id.includes('@google/genai')) {
                  return 'gemini';
                }
                // WebContainer
                if (id.includes('@webcontainer')) {
                  return 'webcontainer';
                }
                // UI関連（lucide-react）- vendorより先にチェック
                if (id.includes('lucide-react')) {
                  return 'ui';
                }
                // React関連
                if (id.includes('react-dom') || id.includes('react')) {
                  return 'vendor';
                }
              }
              return undefined;
            },
          },
        },
        // チャンクサイズ警告の閾値を上げる
        chunkSizeWarningLimit: 600,
      },
    };
});
