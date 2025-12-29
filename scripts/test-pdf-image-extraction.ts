/**
 * PDF画像抽出E2Eテスト
 * Puppeteerを使用してブラウザ環境でPDFの画像抽出機能をテスト
 * 
 * 実行方法: npx tsx scripts/test-pdf-image-extraction.ts
 */
import puppeteer, { Browser, Page } from 'puppeteer';
import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

const TEST_OUTPUT_DIR = path.join(process.cwd(), 'test-output');
const TEST_PDF_PATH = path.join(TEST_OUTPUT_DIR, 'test-image.pdf');

// テスト結果を保存
interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

const results: TestResult[] = [];

// コンソール出力用の色付け
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

const log = {
  pass: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  fail: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  info: (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
};

/**
 * テスト用のPDFを作成（png画像を埋め込み）
 */
async function createTestPdfWithImage(): Promise<void> {
  // 出力ディレクトリを作成
  if (!fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4サイズ

  // 100x100の赤い画像を作成（PNG）
  // 最小限のPNG: 赤い10x10ピクセル
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAADklEQVR4nGP4z8DwHwMBADYEA/kWKwK/AAAAAElFTkSuQmCC';
  const pngBytes = Buffer.from(pngBase64, 'base64');
  
  try {
    const image = await pdfDoc.embedPng(pngBytes);
    
    // 画像を大きく配置（抽出しやすくする）
    page.drawImage(image, {
      x: 50,
      y: 600,
      width: 200,
      height: 200,
    });

    // 2つ目の画像も追加
    page.drawImage(image, {
      x: 300,
      y: 600,
      width: 150,
      height: 150,
    });

    log.info(`画像を2枚埋め込みました`);
  } catch (e) {
    log.warn(`画像埋め込み失敗: ${e}`);
    throw e;
  }

  // テキストも追加
  page.drawText('PDF Image Extraction Test', {
    x: 50,
    y: 750,
    size: 20,
  });

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(TEST_PDF_PATH, pdfBytes);
  log.info(`テストPDF作成: ${TEST_PDF_PATH} (${pdfBytes.length} bytes)`);
}

/**
 * Puppeteerでブラウザを起動してPDF画像抽出をテスト
 */
async function testPdfImageExtraction(): Promise<void> {
  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    // コンソールログを取得
    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error') {
        console.log(`  [Browser Error] ${text}`);
      } else if (type === 'warn') {
        console.log(`  [Browser Warn] ${text}`);
      }
    });

    // pdf.jsとpdf-libを読み込むHTMLを作成
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs" type="module"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js"></script>
</head>
<body>
  <h1>PDF Image Extraction Test</h1>
  <div id="result"></div>
  <script type="module">
    import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';
    
    // Worker設定
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';

    window.runTest = async function(pdfBase64) {
      const results = {
        pdfLoaded: false,
        pageCount: 0,
        imagesFound: 0,
        imagesExtracted: 0,
        imageDetails: [],
        errors: []
      };

      try {
        // Base64からArrayBufferに変換
        const binaryString = atob(pdfBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // PDFを読み込み
        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
        results.pdfLoaded = true;
        results.pageCount = pdf.numPages;

        // 各ページから画像を抽出
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const operatorList = await page.getOperatorList();
          const objs = page.objs;

          const OPS = pdfjsLib.OPS;
          const imageNames = [];

          for (let i = 0; i < operatorList.fnArray.length; i++) {
            const op = operatorList.fnArray[i];
            if (op === OPS.paintImageXObject || op === OPS.paintJpegXObject) {
              const imgName = operatorList.argsArray[i][0];
              if (!imageNames.includes(imgName)) {
                imageNames.push(imgName);
              }
            }
          }

          results.imagesFound += imageNames.length;

          // 画像を抽出
          for (const imgName of imageNames) {
              try {
                const imgData = await new Promise((resolve) => {
                  const existing = objs.get(imgName);
                  if (existing) {
                    resolve(existing);
                    return;
                  }
                  objs.get(imgName, resolve);
                });

                // デバッグ情報を追加
                const debugInfo = {
                  name: imgName,
                  hasData: !!(imgData && imgData.data),
                  hasSrc: !!(imgData && imgData.src),
                  hasBitmap: !!(imgData && imgData.bitmap),
                  width: imgData?.width,
                  height: imgData?.height,
                  dataLength: imgData?.data?.length,
                  keys: imgData ? Object.keys(imgData) : []
                };
                console.log('Image debug:', JSON.stringify(debugInfo));

                if (imgData && imgData.data) {
                  // ImageDataとして有効か確認
                  const canvas = document.createElement('canvas');
                  canvas.width = imgData.width;
                  canvas.height = imgData.height;
                  const ctx = canvas.getContext('2d');

                  if (ctx) {
                    const imageData = new ImageData(
                      new Uint8ClampedArray(imgData.data),
                      imgData.width,
                      imgData.height
                    );
                    ctx.putImageData(imageData, 0, 0);

                    // Blobに変換できるか確認
                    const blob = await new Promise((resolve) => {
                      canvas.toBlob(resolve, 'image/jpeg', 0.95);
                    });

                    if (blob) {
                      results.imagesExtracted++;
                      results.imageDetails.push({
                        name: imgName,
                        width: imgData.width,
                        height: imgData.height,
                        blobSize: blob.size,
                        readable: true
                      });
                    }
                  }
                } else if (imgData && imgData.bitmap) {
                  // ImageBitmap形式の場合
                  const canvas = document.createElement('canvas');
                  canvas.width = imgData.bitmap.width || imgData.width;
                  canvas.height = imgData.bitmap.height || imgData.height;
                  const ctx = canvas.getContext('2d');
                  
                  if (ctx) {
                    ctx.drawImage(imgData.bitmap, 0, 0);
                    const blob = await new Promise((resolve) => {
                      canvas.toBlob(resolve, 'image/jpeg', 0.95);
                    });
                    
                    if (blob) {
                      results.imagesExtracted++;
                      results.imageDetails.push({
                        name: imgName,
                        width: canvas.width,
                        height: canvas.height,
                        blobSize: blob.size,
                        readable: true,
                        type: 'bitmap'
                      });
                    }
                  }
                } else if (imgData && imgData.src) {
                  // JPEG画像の場合（srcがdata URLの場合）
                  try {
                    const response = await fetch(imgData.src);
                    const blob = await response.blob();
                    results.imagesExtracted++;
                    results.imageDetails.push({
                      name: imgName,
                      blobSize: blob.size,
                      hasSrc: true,
                      readable: true,
                      type: 'src'
                    });
                  } catch (srcErr) {
                    results.errors.push('Src fetch error: ' + srcErr.message);
                  }
                }
              } catch (imgErr) {
                results.errors.push('Image extraction error: ' + imgErr.message);
              }
          }
        }
      } catch (e) {
        results.errors.push('PDF loading error: ' + e.message);
      }

      return results;
    };
  </script>
</body>
</html>
    `;

    // HTMLをdata URLとして読み込み
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    // PDFファイルを読み込み
    const pdfBuffer = fs.readFileSync(TEST_PDF_PATH);
    const pdfBase64 = pdfBuffer.toString('base64');

    // テストを実行
    log.info('ブラウザでPDF画像抽出テストを実行中...');
    
    const testResult = await page.evaluate(async (pdfBase64: string) => {
      // @ts-ignore
      return await window.runTest(pdfBase64);
    }, pdfBase64);

    // 結果を表示
    console.log('\n--- テスト結果 ---');
    
    if (testResult.pdfLoaded) {
      log.pass(`PDF読み込み成功: ${testResult.pageCount}ページ`);
      results.push({ name: 'PDF読み込み', passed: true, message: `${testResult.pageCount}ページ`, duration: 0 });
    } else {
      log.fail('PDF読み込み失敗');
      results.push({ name: 'PDF読み込み', passed: false, message: 'Failed', duration: 0 });
    }

    if (testResult.imagesFound > 0) {
      log.pass(`画像検出: ${testResult.imagesFound}枚`);
      results.push({ name: '画像検出', passed: true, message: `${testResult.imagesFound}枚`, duration: 0 });
    } else {
      log.fail('画像が検出されませんでした');
      results.push({ name: '画像検出', passed: false, message: '0枚', duration: 0 });
    }

    if (testResult.imagesExtracted > 0) {
      log.pass(`画像抽出成功: ${testResult.imagesExtracted}枚`);
      results.push({ name: '画像抽出', passed: true, message: `${testResult.imagesExtracted}枚`, duration: 0 });
    } else {
      log.fail('画像の抽出に失敗');
      results.push({ name: '画像抽出', passed: false, message: '0枚', duration: 0 });
    }

    // 画像詳細を表示
    if (testResult.imageDetails.length > 0) {
      console.log('\n画像詳細:');
      for (const img of testResult.imageDetails) {
        if (img.width && img.height) {
          log.info(`  ${img.name}: ${img.width}x${img.height}, blob=${img.blobSize}bytes, readable=${img.readable}`);
        } else {
          log.info(`  ${img.name}: src形式, readable=${img.readable}`);
        }
      }
    }

    // エラーを表示
    if (testResult.errors.length > 0) {
      console.log('\nエラー:');
      for (const err of testResult.errors) {
        log.warn(`  ${err}`);
      }
    }

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * html2pdf生成PDFのテスト（実際のアプリケーションに近い形式）
 */
async function testHtml2PdfLikeExtraction(): Promise<void> {
  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    // html2pdfと同様の方式でPDFを生成
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs" type="module"></script>
  <style>
    .test-content {
      width: 595px;
      padding: 20px;
      background: white;
    }
    .test-image {
      width: 200px;
      height: 200px;
      background: linear-gradient(135deg, #ff0000, #00ff00, #0000ff);
      margin: 20px;
    }
    .photo-frame {
      border: 1px solid #ccc;
      padding: 10px;
      margin: 10px;
    }
  </style>
</head>
<body>
  <div id="test-content" class="test-content">
    <h1>工事写真帳テスト</h1>
    <div class="photo-frame">
      <div class="test-image"></div>
      <p>写真1: テスト画像</p>
    </div>
    <div class="photo-frame">
      <canvas id="test-canvas" width="200" height="200"></canvas>
      <p>写真2: Canvas画像</p>
    </div>
  </div>

  <script type="module">
    import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';

    // Canvasに画像を描画
    const canvas = document.getElementById('test-canvas');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff6600';
    ctx.fillRect(0, 0, 200, 200);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px Arial';
    ctx.fillText('Test Image', 50, 100);

    window.generatePdf = async function() {
      const element = document.getElementById('test-content');
      const opt = {
        margin: 0,
        filename: 'test.pdf',
        image: { type: 'jpeg', quality: 1.0 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      const blob = await html2pdf().set(opt).from(element).output('blob');
      return blob;
    };

    window.extractImages = async function(pdfBlob) {
      const results = {
        pdfLoaded: false,
        pageCount: 0,
        imagesFound: 0,
        imagesExtracted: 0,
        imageDetails: [],
        errors: []
      };

      try {
        const arrayBuffer = await pdfBlob.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        results.pdfLoaded = true;
        results.pageCount = pdf.numPages;

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const operatorList = await page.getOperatorList();
          const objs = page.objs;

          const OPS = pdfjsLib.OPS;
          const processedNames = new Set();

          for (let i = 0; i < operatorList.fnArray.length; i++) {
            const op = operatorList.fnArray[i];
            if (op === OPS.paintImageXObject || op === OPS.paintJpegXObject) {
              const imgName = operatorList.argsArray[i][0];
              if (processedNames.has(imgName)) continue;
              processedNames.add(imgName);
              results.imagesFound++;

              try {
                const imgData = await new Promise((resolve) => {
                  const existing = objs.get(imgName);
                  if (existing) {
                    resolve(existing);
                    return;
                  }
                  objs.get(imgName, resolve);
                });

                // デバッグ情報
                const debugInfo = {
                  name: imgName,
                  hasData: !!(imgData && imgData.data),
                  hasSrc: !!(imgData && imgData.src),
                  hasBitmap: !!(imgData && imgData.bitmap),
                  width: imgData?.width,
                  height: imgData?.height,
                  keys: imgData ? Object.keys(imgData) : []
                };
                console.log('html2pdf Image debug:', JSON.stringify(debugInfo));

                if (imgData && imgData.data) {
                  const canvas = document.createElement('canvas');
                  canvas.width = imgData.width;
                  canvas.height = imgData.height;
                  const ctx = canvas.getContext('2d');

                  if (ctx) {
                    const imageData = new ImageData(
                      new Uint8ClampedArray(imgData.data),
                      imgData.width,
                      imgData.height
                    );
                    ctx.putImageData(imageData, 0, 0);

                    const blob = await new Promise((resolve) => {
                      canvas.toBlob(resolve, 'image/jpeg', 0.95);
                    });

                    if (blob && blob.size > 100) {
                      results.imagesExtracted++;
                      results.imageDetails.push({
                        name: imgName,
                        width: imgData.width,
                        height: imgData.height,
                        blobSize: blob.size,
                        readable: true
                      });
                    }
                  }
                } else if (imgData && imgData.bitmap) {
                  // ImageBitmap形式
                  const canvas = document.createElement('canvas');
                  canvas.width = imgData.bitmap.width || imgData.width;
                  canvas.height = imgData.bitmap.height || imgData.height;
                  const ctx = canvas.getContext('2d');
                  
                  if (ctx) {
                    ctx.drawImage(imgData.bitmap, 0, 0);
                    const blob = await new Promise((resolve) => {
                      canvas.toBlob(resolve, 'image/jpeg', 0.95);
                    });
                    
                    if (blob && blob.size > 100) {
                      results.imagesExtracted++;
                      results.imageDetails.push({
                        name: imgName,
                        width: canvas.width,
                        height: canvas.height,
                        blobSize: blob.size,
                        readable: true,
                        type: 'bitmap'
                      });
                    }
                  }
                } else if (imgData && imgData.src) {
                  // src形式（data URL）
                  try {
                    const response = await fetch(imgData.src);
                    const blob = await response.blob();
                    if (blob.size > 100) {
                      results.imagesExtracted++;
                      results.imageDetails.push({
                        name: imgName,
                        blobSize: blob.size,
                        readable: true,
                        type: 'src'
                      });
                    }
                  } catch (srcErr) {
                    results.errors.push('Src fetch: ' + srcErr.message);
                  }
                }
              } catch (e) {
                results.errors.push('Image ' + imgName + ': ' + e.message);
              }
            }
          }
        }
      } catch (e) {
        results.errors.push('PDF error: ' + e.message);
      }

      return results;
    };
  </script>
</body>
</html>
    `;

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    // html2pdfでPDFを生成
    log.info('html2pdf形式でPDFを生成中...');
    
    const pdfBlob = await page.evaluate(async () => {
      // @ts-ignore
      const blob = await window.generatePdf();
      // BlobをBase64に変換して返す
      const reader = new FileReader();
      return new Promise((resolve) => {
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    });

    log.pass('html2pdf形式PDF生成完了');

    // 画像を抽出
    log.info('html2pdf形式PDFから画像を抽出中...');
    
    const extractResult = await page.evaluate(async (pdfDataUrl: string) => {
      // Data URLからBlobに変換
      const response = await fetch(pdfDataUrl);
      const blob = await response.blob();
      // @ts-ignore
      return await window.extractImages(blob);
    }, pdfBlob as string);

    // 結果を表示
    console.log('\n--- html2pdf形式PDFテスト結果 ---');
    
    if (extractResult.pdfLoaded) {
      log.pass(`PDF読み込み成功: ${extractResult.pageCount}ページ`);
    } else {
      log.fail('PDF読み込み失敗');
    }

    if (extractResult.imagesFound > 0) {
      log.pass(`画像検出: ${extractResult.imagesFound}枚`);
    } else {
      log.warn('画像が検出されませんでした（html2pdfはページ全体を1画像化する場合があります）');
    }

    if (extractResult.imagesExtracted > 0) {
      log.pass(`読み込み可能な画像: ${extractResult.imagesExtracted}枚`);
      
      console.log('\n抽出画像詳細:');
      for (const img of extractResult.imageDetails) {
        log.info(`  ${img.name}: ${img.width}x${img.height}, ${img.blobSize}bytes`);
      }
    } else {
      log.warn('読み込み可能な画像が抽出できませんでした');
    }

    if (extractResult.errors.length > 0) {
      console.log('\nエラー:');
      for (const err of extractResult.errors) {
        log.warn(`  ${err}`);
      }
    }

    results.push({
      name: 'html2pdf形式テスト',
      passed: extractResult.imagesExtracted > 0,
      message: `${extractResult.imagesExtracted}枚抽出`,
      duration: 0
    });

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// メイン実行
async function main() {
  console.log('========================================');
  console.log('PDF画像抽出機能テスト');
  console.log('========================================\n');

  try {
    // テスト1: pdf-libで作成したPDFからの抽出
    console.log('【テスト1】pdf-lib生成PDFからの画像抽出\n');
    await createTestPdfWithImage();
    await testPdfImageExtraction();

    console.log('\n');

    // テスト2: html2pdf形式のPDFからの抽出
    console.log('【テスト2】html2pdf形式PDFからの画像抽出\n');
    await testHtml2PdfLikeExtraction();

    // 最終結果
    console.log('\n========================================');
    console.log('テスト完了');
    console.log('========================================');
    
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    
    console.log(`\n結果: ${passed}成功 / ${failed}失敗`);
    
    if (failed > 0) {
      process.exit(1);
    }
  } catch (e) {
    console.error('テスト実行エラー:', e);
    process.exit(1);
  }
}

main();

