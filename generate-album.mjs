#!/usr/bin/env node
/**
 * CLI 写真帳生成ツール
 * Webアプリをpuppeteerで起動し、写真をアップロードしてPDF生成
 *
 * Usage: node generate-album.mjs <input_folder>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 静的ファイルサーバーを起動
 */
function startServer(distPath, port) {
  return new Promise((resolve, reject) => {
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
    };

    const server = http.createServer((req, res) => {
      let filePath = path.join(distPath, req.url === '/' ? 'index.html' : req.url);
      const ext = path.extname(filePath);
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.writeHead(404);
          res.end('Not Found');
        } else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content);
        }
      });
    });

    server.listen(port, () => {
      resolve(server);
    });

    server.on('error', reject);
  });
}

/**
 * フォルダから画像ファイルを取得
 */
function getImageFiles(folderPath) {
  const extensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp'];
  const files = fs.readdirSync(folderPath);

  return files
    .filter(f => extensions.includes(path.extname(f).toLowerCase()))
    .sort()
    .map(f => path.join(folderPath, f));
}

/**
 * メイン処理
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
工事写真帳メーカー CLI

Usage:
  node generate-album.mjs <input_folder>

Example:
  node generate-album.mjs "./photos"
`);
    process.exit(0);
  }

  const inputFolder = args[0];

  // フォルダ確認
  if (!fs.existsSync(inputFolder)) {
    console.error(`❌ フォルダが見つかりません: ${inputFolder}`);
    process.exit(1);
  }

  // 画像ファイル取得
  const imagePaths = getImageFiles(inputFolder);

  if (imagePaths.length === 0) {
    console.error(`❌ 画像ファイルが見つかりません: ${inputFolder}`);
    process.exit(1);
  }

  console.log(`📷 ${imagePaths.length}枚の写真を検出`);
  imagePaths.forEach((p, i) => console.log(`  ${i + 1}. ${path.basename(p)}`));

  // サーバー起動
  const distPath = path.join(__dirname, 'dist');
  const port = 8766;
  const server = await startServer(distPath, port);
  console.log(`\n🌐 サーバー起動: http://localhost:${port}`);

  // ブラウザ起動
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  try {
    const page = await browser.newPage();
    await page.goto(`http://localhost:${port}`, { waitUntil: 'networkidle0' });
    console.log('📂 アプリを開きました');

    // ファイルアップロード
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.uploadFile(...imagePaths);
      console.log(`✅ ${imagePaths.length}枚の写真をアップロードしました`);
    } else {
      console.log('⚠️ ファイル入力が見つかりません。手動でドロップしてください。');
    }

    console.log('\n👉 ブラウザでPDFボタンを押してダウンロードしてください');
    console.log('   ブラウザを閉じると終了します');

    // ブラウザが閉じられるまで待機
    await new Promise(resolve => {
      browser.on('disconnected', resolve);
    });

  } finally {
    server.close();
    console.log('\n✅ 終了しました');
  }
}

main().catch(err => {
  console.error('エラー:', err);
  process.exit(1);
});
