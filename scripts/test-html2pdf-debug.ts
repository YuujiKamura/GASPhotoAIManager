/**
 * html2pdf形式PDFの構造デバッグ
 */
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.join(process.cwd(), 'test-output');

async function main() {
  console.log('========================================');
  console.log('html2pdf PDF構造デバッグ');
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

    // コンソールログを表示
    page.on('console', msg => {
      if (msg.type() !== 'warning') {
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
    </div>
  </div>

  <script type="module">
    import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';

    // テスト画像
    ['c1', 'c2'].forEach((id, idx) => {
      const canvas = document.getElementById(id);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = idx === 0 ? '#ffcc00' : '#00ccff';
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

    window.debugPdf = async function(pdfDataUrl) {
      const base64 = pdfDataUrl.split(',')[1];
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      
      console.log('Loading PDF...');
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      console.log('Pages:', pdf.numPages);

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const operatorList = await page.getOperatorList();
        const objs = page.objs;
        const OPS = pdfjsLib.OPS;

        console.log('=== Page ' + pageNum + ' ===');
        console.log('OperatorList length:', operatorList.fnArray.length);

        // 全オペレーションを確認
        const opNames = Object.entries(OPS).reduce((acc, [k, v]) => { acc[v] = k; return acc; }, {});
        const opCounts = {};
        
        for (let i = 0; i < operatorList.fnArray.length; i++) {
          const op = operatorList.fnArray[i];
          const name = opNames[op] || 'unknown_' + op;
          opCounts[name] = (opCounts[name] || 0) + 1;

          // 画像関連のオペレーションを詳しく表示
          if (op === OPS.paintImageXObject || op === OPS.paintJpegXObject || 
              op === OPS.paintInlineImageXObject || op === OPS.paintInlineImageXObjectGroup) {
            console.log('Image op found:', name, 'args:', operatorList.argsArray[i]);
          }
        }

        console.log('Operation counts:', JSON.stringify(opCounts, null, 2));

        // commonObjsもチェック
        console.log('\\nChecking page.commonObjs...');
        const commonObjs = page.commonObjs;
        if (commonObjs && commonObjs._objs) {
          console.log('commonObjs keys:', Object.keys(commonObjs._objs));
        }

        // ページをレンダリングして、その後リソースを確認
        console.log('\\nTrying to render page to trigger resource loading...');
        const viewport = page.getViewport({ scale: 1.0 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        
        await page.render({ canvasContext: ctx, viewport }).promise;
        console.log('Page rendered:', viewport.width, 'x', viewport.height);

        // レンダリング後に再度オブジェクトをチェック
        console.log('\\nAfter render, objs._objs keys:', Object.keys(objs._objs || {}));
      }

      return 'debug complete';
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

    console.log('PDF構造解析...\n');
    await page.evaluate(async (dataUrl: string) => {
      // @ts-ignore
      return await window.debugPdf(dataUrl);
    }, pdfDataUrl);

  } finally {
    await browser.close();
  }
}

main().catch(console.error);



