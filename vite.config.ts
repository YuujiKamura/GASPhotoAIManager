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
            manualChunks: {
              // PDF関連を別チャンクに分離
              'pdf': ['pdfjs-dist', 'pdf-lib'],
              // React関連をvendorチャンクに
              'vendor': ['react', 'react-dom'],
              // UI関連
              'ui': ['lucide-react'],
            },
          },
        },
        // チャンクサイズ警告の閾値を上げる
        chunkSizeWarningLimit: 600,
      },
    };
});
