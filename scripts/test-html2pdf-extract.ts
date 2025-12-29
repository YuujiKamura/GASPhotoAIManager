/**
 * html2pdf PDFから画像を実際に抽出するテスト
 */
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.join(process.cwd(), 'test-output');

async function main() {
  console.log('========================================');
  console.log('html2pdf PDF画像抽出テスト');
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

    page.on('console', msg => {
      if (msg.type() !== 'warning' && !msg.text().includes('parser-blocking')) {
        console.log('BROWSER:', msg.text());
      }
    });

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs" type="module"></script>
  <style>
    .album-page { width: 210mm; padding: 10mm; background: white; }
    .photo-row { display: flex; margin-bottom: 5mm; border: 1px solid #ccc; }
    .photo-cell { width: 45%; height: 80mm; background: #eee; display: flex; align-items: center; justify-content: center; }
    .info-cell { flex: 1; padding: 3mm; }
  </style>
</head>
<body>
  <div id="album-content">
    <div class="album-page">
      <h1>Test Album</h1>
      <div class="photo-row">
        <div class="photo-cell"><canvas id="c1" width="300" height="225"></canvas></div>
        <div class="info-cell">Info 1</div>
      </div>
      <div class="photo-row">
        <div class="photo-cell"><canvas id="c2" width="300" height="225"></canvas></div>
        <div class="info-cell">Info 2</div>
      </div>
      <div class="photo-row">
        <div class="photo-cell"><canvas id="c3" width="300" height="225"></canvas></div>
        <div class="info-cell">Info 3</div>
      </div>
    </div>
  </div>

  <script type="module">
    import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';

    ['c1', 'c2', 'c3'].forEach((id, idx) => {
      const canvas = document.getElementById(id);
      const ctx = canvas.getContext('2d');
      const colors = ['#ffcc00', '#00ccff', '#ff6699'];
      ctx.fillStyle = colors[idx];
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#333';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Photo ' + (idx + 1), canvas.width / 2, canvas.height / 2);
    });

    window.generatePdf = async function() {
      const element = document.getElementById('album-content');
      const blob = await html2pdf().set({
        margin: 0,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4' }
      }).from(element).output('blob');
      const reader = new FileReader();
      return new Promise((resolve) => {
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    };

    // 画像抽出
    window.extractImages = async function(pdfDataUrl) {
      const base64 = pdfDataUrl.split(',')[1];
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      console.log('PDF pages:', pdf.numPages);

      const images = [];

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const operatorList = await page.getOperatorList();
        const objs = page.objs;
        const OPS = pdfjsLib.OPS;

        // まずページをレンダリングしてリソースをロード
        const viewport = page.getViewport({ scale: 1.0 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        // 画像オペレーションを探す
        for (let i = 0; i < operatorList.fnArray.length; i++) {
          const op = operatorList.fnArray[i];
          if (op === OPS.paintImageXObject || op === OPS.paintJpegXObject) {
            const imgName = operatorList.argsArray[i][0];
            console.log('Found image op:', imgName);

            // 非同期でオブジェクトを取得
            try {
              const imgData = await new Promise((resolve, reject) => {
                // タイムアウト設定
                const timeout = setTimeout(() => reject(new Error('Timeout')), 3000);
                
                // まず同期的に取得を試みる
                const existing = objs._objs ? objs._objs[imgName] : null;
                if (existing && existing.data) {
                  clearTimeout(timeout);
                  resolve(existing.data);
                  return;
                }

                // 非同期取得
                objs.get(imgName, (obj) => {
                  clearTimeout(timeout);
                  resolve(obj);
                });
              });

              console.log('Got image data:', {
                type: typeof imgData,
                constructor: imgData?.constructor?.name,
                width: imgData?.width,
                height: imgData?.height,
                hasData: !!imgData?.data,
                hasBitmap: !!imgData?.bitmap,
                keys: imgData ? Object.keys(imgData) : []
              });

              // 画像データをCanvasに描画して抽出
              if (imgData && (imgData.data || imgData.bitmap)) {
                const imgCanvas = document.createElement('canvas');
                imgCanvas.width = imgData.width;
                imgCanvas.height = imgData.height;
                const imgCtx = imgCanvas.getContext('2d');

                if (imgData.bitmap) {
                  imgCtx.drawImage(imgData.bitmap, 0, 0);
                } else if (imgData.data) {
                  const imageData = new ImageData(
                    new Uint8ClampedArray(imgData.data),
                    imgData.width,
                    imgData.height
                  );
                  imgCtx.putImageData(imageData, 0, 0);
                }

                const blob = await new Promise((resolve) => imgCanvas.toBlob(resolve, 'image/jpeg', 0.9));
                if (blob) {
                  images.push({
                    name: imgName,
                    width: imgData.width,
                    height: imgData.height,
                    size: blob.size
                  });
                  console.log('Extracted image:', imgData.width, 'x', imgData.height, 'size:', blob.size);
                }
              }
            } catch (err) {
              console.log('Error getting image:', err.message);
            }
          }
        }
      }

      return images;
    };
  </script>
</body>
</html>
    `;

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.getElementById('c1')?.getContext('2d'));

    console.log('PDF生成...');
    const pdfDataUrl = await page.evaluate(async () => {
      // @ts-ignore
      return await window.generatePdf();
    }) as string;
    console.log('PDF生成完了\n');

    console.log('画像抽出...\n');
    const images = await page.evaluate(async (dataUrl: string) => {
      // @ts-ignore
      return await window.extractImages(dataUrl);
    }, pdfDataUrl) as any[];

    console.log('\n========================================');
    console.log('結果');
    console.log('========================================');
    console.log(`抽出画像数: ${images.length}`);
    
    if (images.length > 0) {
      for (const img of images) {
        console.log(`  - ${img.name}: ${img.width}x${img.height}, ${(img.size / 1024).toFixed(1)} KB`);
      }
      
      // A4比率チェック
      const img = images[0];
      const ratio = img.width / img.height;
      const a4Ratio = 210 / 297;
      console.log(`\nアスペクト比: ${ratio.toFixed(3)} (A4: ${a4Ratio.toFixed(3)})`);
      
      if (Math.abs(ratio - a4Ratio) < 0.15 && img.height > 1000) {
        console.log('→ ページ全体画像と判定');
        console.log('→ この画像を3分割して個別写真を抽出する必要があります');
      }
    }

  } finally {
    await browser.close();
  }
}

main().catch(console.error);



