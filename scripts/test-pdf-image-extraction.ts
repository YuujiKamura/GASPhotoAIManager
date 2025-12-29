/**
 * PDF画像抽出E2Eテスト
 * 実行方法: npx tsx scripts/test-pdf-image-extraction.ts
 */
import puppeteer, { Browser, Page } from 'puppeteer';
import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

const TEST_OUTPUT_DIR = path.join(process.cwd(), 'test-output');
const TEST_PDF_PATH = path.join(TEST_OUTPUT_DIR, 'test-image.pdf');

interface TestResult { name: string; passed: boolean; message: string; }
interface ExtractResult {
  pdfLoaded: boolean; pageCount: number; imagesFound: number;
  imagesExtracted: number; imageDetails: Array<{ name: string; width?: number; height?: number; blobSize: number }>; errors: string[];
}

const results: TestResult[] = [];
const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', b: '\x1b[34m', x: '\x1b[0m' };
const log = {
  pass: (m: string) => console.log(`${C.g}✓${C.x} ${m}`),
  fail: (m: string) => console.log(`${C.r}✗${C.x} ${m}`),
  info: (m: string) => console.log(`${C.b}ℹ${C.x} ${m}`),
  warn: (m: string) => console.log(`${C.y}⚠${C.x} ${m}`),
};

// 共通の画像抽出JavaScript（ブラウザ内で実行）
const EXTRACT_IMAGES_JS = `
async function extractImagesFromPdf(pdfData) {
  const results = { pdfLoaded: false, pageCount: 0, imagesFound: 0, imagesExtracted: 0, imageDetails: [], errors: [] };
  try {
    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
    results.pdfLoaded = true;
    results.pageCount = pdf.numPages;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const opList = await page.getOperatorList();
      const objs = page.objs;
      const processed = new Set();

      for (let i = 0; i < opList.fnArray.length; i++) {
        const op = opList.fnArray[i];
        if (op === pdfjsLib.OPS.paintImageXObject || op === pdfjsLib.OPS.paintJpegXObject) {
          const imgName = opList.argsArray[i][0];
          if (processed.has(imgName)) continue;
          processed.add(imgName);
          results.imagesFound++;

          try {
            const imgData = await new Promise(r => {
              const existing = objs.get(imgName);
              if (existing) { r(existing); return; }
              objs.get(imgName, r);
            });

            let blob = null;
            let w = 0, h = 0;

            if (imgData?.data) {
              const canvas = document.createElement('canvas');
              canvas.width = w = imgData.width;
              canvas.height = h = imgData.height;
              const ctx = canvas.getContext('2d');
              ctx.putImageData(new ImageData(new Uint8ClampedArray(imgData.data), w, h), 0, 0);
              blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.95));
            } else if (imgData?.bitmap) {
              const canvas = document.createElement('canvas');
              canvas.width = w = imgData.bitmap.width || imgData.width;
              canvas.height = h = imgData.bitmap.height || imgData.height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(imgData.bitmap, 0, 0);
              blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.95));
            } else if (imgData?.src) {
              const res = await fetch(imgData.src);
              blob = await res.blob();
            }

            if (blob && blob.size > 100) {
              results.imagesExtracted++;
              results.imageDetails.push({ name: imgName, width: w, height: h, blobSize: blob.size });
            }
          } catch (e) { results.errors.push(imgName + ': ' + e.message); }
        }
      }
    }
  } catch (e) { results.errors.push('PDF: ' + e.message); }
  return results;
}`;

async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
}

function showResults(r: ExtractResult, testName: string): void {
  console.log(`\n--- ${testName} ---`);
  const add = (name: string, passed: boolean, msg: string) => {
    (passed ? log.pass : log.fail)(`${name}: ${msg}`);
    results.push({ name, passed, message: msg });
  };
  add('PDF読み込み', r.pdfLoaded, r.pdfLoaded ? `${r.pageCount}ページ` : 'Failed');
  add('画像検出', r.imagesFound > 0, `${r.imagesFound}枚`);
  add('画像抽出', r.imagesExtracted > 0, `${r.imagesExtracted}枚`);

  if (r.imageDetails.length > 0) {
    console.log('\n画像詳細:');
    r.imageDetails.forEach(img => log.info(`  ${img.name}: ${img.width}x${img.height}, ${img.blobSize}bytes`));
  }
  if (r.errors.length > 0) {
    console.log('\nエラー:');
    r.errors.forEach(e => log.warn(`  ${e}`));
  }
}

async function createTestPdf(): Promise<void> {
  if (!fs.existsSync(TEST_OUTPUT_DIR)) fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAADklEQVR4nGP4z8DwHwMBADYEA/kWKwK/AAAAAElFTkSuQmCC', 'base64');
  const image = await pdfDoc.embedPng(pngBytes);
  page.drawImage(image, { x: 50, y: 600, width: 200, height: 200 });
  page.drawImage(image, { x: 300, y: 600, width: 150, height: 150 });
  page.drawText('PDF Image Extraction Test', { x: 50, y: 750, size: 20 });
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(TEST_PDF_PATH, pdfBytes);
  log.info(`テストPDF作成: ${TEST_PDF_PATH} (${pdfBytes.length} bytes)`);
}

async function testPdfLibExtraction(): Promise<void> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(`<!DOCTYPE html><html><head>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs" type="module"></script>
    </head><body><script type="module">
      import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';
      window.pdfjsLib = pdfjsLib;
      ${EXTRACT_IMAGES_JS}
      window.runTest = async (b64) => {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return extractImagesFromPdf(bytes);
      };
    </script></body></html>`, { waitUntil: 'networkidle0' });

    const pdfBase64 = fs.readFileSync(TEST_PDF_PATH).toString('base64');
    log.info('pdf-lib生成PDFから画像抽出中...');
    const result = await page.evaluate((b64: string) => (window as any).runTest(b64), pdfBase64) as ExtractResult;
    showResults(result, 'pdf-lib生成PDF');
  } finally {
    await browser.close();
  }
}

async function testHtml2PdfExtraction(): Promise<void> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(`<!DOCTYPE html><html><head>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs" type="module"></script>
      <style>.box{width:200px;height:200px;background:linear-gradient(135deg,#f00,#0f0,#00f);margin:20px}</style>
    </head><body>
      <div id="content" style="width:595px;padding:20px;background:#fff">
        <h1>工事写真帳テスト</h1>
        <div class="box"></div>
        <canvas id="c" width="200" height="200"></canvas>
      </div>
      <script type="module">
        import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';
        window.pdfjsLib = pdfjsLib;
        const ctx = document.getElementById('c').getContext('2d');
        ctx.fillStyle = '#f60'; ctx.fillRect(0,0,200,200);
        ctx.fillStyle = '#fff'; ctx.font = '20px Arial'; ctx.fillText('Test', 70, 100);
        ${EXTRACT_IMAGES_JS}
        window.genAndExtract = async () => {
          const blob = await html2pdf().set({
            margin: 0, image: { type: 'jpeg', quality: 1 },
            html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4' }
          }).from(document.getElementById('content')).output('blob');
          return extractImagesFromPdf(await blob.arrayBuffer());
        };
      </script>
    </body></html>`, { waitUntil: 'networkidle0' });

    log.info('html2pdf形式PDFを生成・抽出中...');
    const result = await page.evaluate(() => (window as any).genAndExtract()) as ExtractResult;
    showResults(result, 'html2pdf形式PDF');
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('========================================');
  console.log('PDF画像抽出機能テスト');
  console.log('========================================\n');

  try {
    console.log('【テスト1】pdf-lib生成PDFからの画像抽出\n');
    await createTestPdf();
    await testPdfLibExtraction();

    console.log('\n【テスト2】html2pdf形式PDFからの画像抽出\n');
    await testHtml2PdfExtraction();

    console.log('\n========================================');
    console.log('テスト完了');
    console.log('========================================');
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    console.log(`\n結果: ${passed}成功 / ${failed}失敗`);
    if (failed > 0) process.exit(1);
  } catch (e) {
    console.error('テスト実行エラー:', e);
    process.exit(1);
  }
}

main();
