import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: '/GASPhotoAIManager/',
      server: {
        port: 3000,
        host: '0.0.0.0',
        headers: {
          // WebContainerに必要なCross-Origin Isolation
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Opener-Policy': 'same-origin',
        },
      },
      plugins: [react()],
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
