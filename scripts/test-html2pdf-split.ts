/**
 * html2pdf形式PDFからの画像分割テスト
 * 
 * 実行: npx tsx scripts/test-html2pdf-split.ts
 */
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.join(process.cwd(), 'test-output');
const HTML2PDF_OUTPUT = path.join(OUTPUT_DIR, 'test-html2pdf-format.pdf');

async function main() {
  console.log('========================================');
  console.log('html2pdf形式PDF → 画像分割テスト');
  console.log('========================================\n');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs" type="module"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: sans-serif; }
    .album-page { width: 210mm; min-height: 297mm; padding: 10mm; background: white; }
    .page-title { text-align: center; font-size: 16px; font-weight: bold; margin-bottom: 8mm; padding: 3mm; background: #f0f0f0; }
    .photo-row { display: flex; margin-bottom: 3mm; border: 1px solid #ccc; }
    .photo-cell { width: 45%; height: 80mm; display: flex; align-items: center; justify-content: center; background: #eee; border-right: 1px solid #ccc; }
    .info-cell { flex: 1; padding: 3mm; font-size: 10px; }
    .info-row { display: flex; border-bottom: 1px solid #eee; padding: 2mm 0; }
    .info-label { width: 15mm; font-weight: bold; color: #666; }
  </style>
</head>
<body>
  <div id="album-content">
    <div class="album-page">
      <div class="page-title">工事写真帳 - テスト</div>
      <div class="photo-row">
        <div class="photo-cell"><canvas id="c1" width="300" height="225"></canvas></div>
        <div class="info-cell">
          <div class="info-row"><span class="info-label">工種</span><span>舗装工</span></div>
          <div class="info-row"><span class="info-label">種別</span><span>アスファルト舗装</span></div>
          <div class="info-row"><span class="info-label">測点</span><span>NO.5+10.0</span></div>
        </div>
      </div>
      <div class="photo-row">
        <div class="photo-cell"><canvas id="c2" width="300" height="225"></canvas></div>
        <div class="info-cell">
          <div class="info-row"><span class="info-label">工種</span><span>舗装工</span></div>
          <div class="info-row"><span class="info-label">種別</span><span>アスファルト舗装</span></div>
          <div class="info-row"><span class="info-label">測点</span><span>NO.6+0.0</span></div>
        </div>
      </div>
      <div class="photo-row">
        <div class="photo-cell"><canvas id="c3" width="300" height="225"></canvas></div>
        <div class="info-cell">
          <div class="info-row"><span class="info-label">工種</span><span>安全管理</span></div>
          <div class="info-row"><span class="info-label">種別</span><span>朝礼</span></div>
          <div class="info-row"><span class="info-label">測点</span><span>-</span></div>
        </div>
      </div>
    </div>
  </div>

  <script type="module">
    import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';

    // テスト画像を描画
    function drawTestImage(id, color, text) {
      const canvas = document.getElementById(id);
      const ctx = canvas.getContext('2d');
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, '#ffffff');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 3;
      ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
      ctx.fillStyle = '#333';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    }
    
    drawTestImage('c1', '#ffcc00', 'Photo 1');
    drawTestImage('c2', '#00ccff', 'Photo 2');
    drawTestImage('c3', '#ff6699', 'Photo 3');

    // html2pdfでPDF生成
    window.generateHtml2Pdf = async function() {
      const element = document.getElementById('album-content');
      const opt = {
        margin: 0,
        filename: 'test.pdf',
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      const blob = await html2pdf().set(opt).from(element).output('blob');
      const reader = new FileReader();
      return new Promise((resolve) => {
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    };

    // 画像分割ロジック
    function isFullPageImage(width, height) {
      const aspectRatio = width / height;
      const a4Ratio = 210 / 297;
      return Math.abs(aspectRatio - a4Ratio) < 0.15 && height > 1000;
    }

    async function splitPageImage(rawData, width, height, photosPerPage) {
      const photos = [];
      const headerRatio = 0.05;
      const photoWidthRatio = 0.43;
      const headerHeight = Math.floor(height * headerRatio);
      const usableHeight = height - headerHeight;
      const rowHeight = Math.floor(usableHeight / photosPerPage);
      const photoWidth = Math.floor(width * photoWidthRatio);
      const marginTop = Math.floor(rowHeight * 0.03);
      const marginLeft = Math.floor(width * 0.02);

      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = width;
      srcCanvas.height = height;
      const srcCtx = srcCanvas.getContext('2d');
      const srcImageData = new ImageData(rawData, width, height);
      srcCtx.putImageData(srcImageData, 0, 0);

      for (let i = 0; i < photosPerPage; i++) {
        const y = headerHeight + i * rowHeight + marginTop;
        const x = marginLeft;
        const w = photoWidth - marginLeft * 2;
        const h = rowHeight - marginTop * 2;

        const destCanvas = document.createElement('canvas');
        destCanvas.width = w;
        destCanvas.height = h;
        const destCtx = destCanvas.getContext('2d');
        destCtx.drawImage(srcCanvas, x, y, w, h, 0, 0, w, h);

        const blob = await new Promise((resolve) => destCanvas.toBlob(resolve, 'image/jpeg', 0.92));
        if (blob && blob.size > 1000) {
          photos.push({ width: w, height: h, size: blob.size });
        }
      }
      return photos;
    }

    // 画像抽出（分割機能付き）
    window.extractWithSplit = async function(pdfDataUrl) {
      const base64 = pdfDataUrl.split(',')[1];
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      const results = { pageCount: pdf.numPages, rawImages: [], splitImages: [] };

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const operatorList = await page.getOperatorList();
        const objs = page.objs;
        const OPS = pdfjsLib.OPS;
        const processed = new Set();

        for (let i = 0; i < operatorList.fnArray.length; i++) {
          const op = operatorList.fnArray[i];
          if (op === OPS.paintImageXObject || op === OPS.paintJpegXObject) {
            const imgName = operatorList.argsArray[i][0];
            if (processed.has(imgName)) continue;
            processed.add(imgName);

            const imgData = await new Promise((resolve) => {
              const existing = objs.get(imgName);
              if (existing) { resolve(existing); return; }
              objs.get(imgName, resolve);
            });

            if (imgData && imgData.data) {
              const width = imgData.width;
              const height = imgData.height;
              results.rawImages.push({ name: imgName, width, height });

              if (isFullPageImage(width, height)) {
                console.log('Detected full-page image, splitting...');
                const rawData = new Uint8ClampedArray(imgData.data);
                const splitPhotos = await splitPageImage(rawData, width, height, 3);
                results.splitImages.push(...splitPhotos);
              }
            }
          }
        }
      }
      return results;
    };
  </script>
</body>
</html>
    `;

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.getElementById('c1')?.getContext('2d'));

    console.log('1. html2pdf形式でPDF生成中...');
    const pdfDataUrl = await page.evaluate(async () => {
      // @ts-ignore
      return await window.generateHtml2Pdf();
    }) as string;

    const base64 = pdfDataUrl.split(',')[1];
    const pdfBuffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(HTML2PDF_OUTPUT, pdfBuffer);
    console.log(`   ✓ 保存: ${HTML2PDF_OUTPUT}`);
    console.log(`   サイズ: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);
    console.log('');

    console.log('2. 画像分割抽出テスト...');
    const result = await page.evaluate(async (dataUrl: string) => {
      // @ts-ignore
      return await window.extractWithSplit(dataUrl);
    }, pdfDataUrl) as { pageCount: number; rawImages: any[]; splitImages: any[] };

    console.log('');
    console.log('========================================');
    console.log('結果');
    console.log('========================================');
    console.log(`PDFページ数: ${result.pageCount}`);
    console.log(`生の画像数: ${result.rawImages.length}`);
    
    if (result.rawImages.length > 0) {
      console.log('');
      console.log('生の画像（ページ全体）:');
      for (const img of result.rawImages) {
        console.log(`  - ${img.name}: ${img.width}x${img.height}`);
      }
    }

    console.log('');
    console.log(`分割後の画像数: ${result.splitImages.length}`);
    
    if (result.splitImages.length > 0) {
      console.log('');
      console.log('分割された個別写真:');
      for (let i = 0; i < result.splitImages.length; i++) {
        const img = result.splitImages[i];
        console.log(`  - Photo ${i + 1}: ${img.width}x${img.height}, ${(img.size / 1024).toFixed(1)} KB`);
      }
      
      if (result.splitImages.length === 3) {
        console.log('');
        console.log('========================================');
        console.log('✓ テスト成功！3枚に分割されました');
        console.log('========================================');
      }
    } else {
      console.log('');
      console.log('⚠ 画像の分割に失敗しました');
    }

  } finally {
    await browser.close();
  }
}

main().catch(console.error);



