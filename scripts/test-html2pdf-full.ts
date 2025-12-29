/**
 * html2pdf PDFから個別写真を抽出する完全テスト
 */
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.join(process.cwd(), 'test-output');

async function main() {
  console.log('========================================');
  console.log('html2pdf PDF → 個別写真抽出テスト');
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
      const text = msg.text();
      if (msg.type() !== 'warning' && !text.includes('parser-blocking') && !text.includes('Setting up fake')) {
        console.log('>', text);
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
    .page-header { text-align: center; font-weight: bold; font-size: 16px; margin-bottom: 5mm; padding: 2mm; background: #f0f0f0; }
    .photo-row { display: flex; margin-bottom: 3mm; border: 1px solid #ccc; }
    .photo-cell { width: 45%; height: 80mm; background: #eee; display: flex; align-items: center; justify-content: center; }
    .info-cell { flex: 1; padding: 3mm; font-size: 10px; }
  </style>
</head>
<body>
  <div id="album-content">
    <div class="album-page">
      <div class="page-header">工事写真帳</div>
      <div class="photo-row">
        <div class="photo-cell"><canvas id="c1" width="300" height="225"></canvas></div>
        <div class="info-cell"><div>工種: 舗装工</div><div>種別: アスファルト</div></div>
      </div>
      <div class="photo-row">
        <div class="photo-cell"><canvas id="c2" width="300" height="225"></canvas></div>
        <div class="info-cell"><div>工種: 舗装工</div><div>種別: 路盤工</div></div>
      </div>
      <div class="photo-row">
        <div class="photo-cell"><canvas id="c3" width="300" height="225"></canvas></div>
        <div class="info-cell"><div>工種: 安全管理</div><div>種別: 朝礼</div></div>
      </div>
    </div>
  </div>

  <script type="module">
    import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';

    // テスト画像を描画
    ['c1', 'c2', 'c3'].forEach((id, idx) => {
      const canvas = document.getElementById(id);
      const ctx = canvas.getContext('2d');
      const colors = ['#ffcc00', '#00ccff', '#ff6699'];
      ctx.fillStyle = colors[idx];
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 4;
      ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
      ctx.fillStyle = '#333';
      ctx.font = 'bold 28px sans-serif';
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

    // ページ全体画像かどうか判定
    function isFullPageImage(width, height) {
      const aspectRatio = width / height;
      const a4Ratio = 210 / 297;
      const isA4Like = Math.abs(aspectRatio - a4Ratio) < 0.15;
      const isLarge = height > 1000;
      return isA4Like && isLarge;
    }

    // ページ画像を個別写真に分割（Canvas経由）
    async function splitPageCanvasIntoPhotos(srcCanvas, photosPerPage) {
      const photos = [];
      const width = srcCanvas.width;
      const height = srcCanvas.height;
      
      const headerRatio = 0.05;
      const photoWidthRatio = 0.43;
      
      const headerHeight = Math.floor(height * headerRatio);
      const usableHeight = height - headerHeight;
      const rowHeight = Math.floor(usableHeight / photosPerPage);
      const photoWidth = Math.floor(width * photoWidthRatio);
      
      const marginTop = Math.floor(rowHeight * 0.02);
      const marginLeft = Math.floor(width * 0.02);

      console.log('Split: ' + width + 'x' + height + ' -> headerH=' + headerHeight + ', rowH=' + rowHeight + ', photoW=' + photoWidth);

      for (let i = 0; i < photosPerPage; i++) {
        const y = headerHeight + i * rowHeight + marginTop;
        const x = marginLeft;
        const w = photoWidth - marginLeft;
        const h = rowHeight - marginTop * 2;

        const destCanvas = document.createElement('canvas');
        destCanvas.width = w;
        destCanvas.height = h;
        const destCtx = destCanvas.getContext('2d');
        destCtx.drawImage(srcCanvas, x, y, w, h, 0, 0, w, h);

        const blob = await new Promise((resolve) => destCanvas.toBlob(resolve, 'image/jpeg', 0.92));
        if (blob && blob.size > 1000) {
          const reader = new FileReader();
          const dataUrl = await new Promise((resolve) => {
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
          
          photos.push({
            index: i + 1,
            width: w,
            height: h,
            size: blob.size,
            dataUrl: dataUrl
          });
          console.log('Photo ' + (i + 1) + ': ' + w + 'x' + h + ', ' + (blob.size / 1024).toFixed(1) + ' KB');
        }
      }
      return photos;
    }

    // 画像抽出（分割機能付き）
    window.extractWithSplit = async function(pdfDataUrl, photosPerPage) {
      const base64 = pdfDataUrl.split(',')[1];
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      console.log('PDF pages: ' + pdf.numPages);

      const allPhotos = [];

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const operatorList = await page.getOperatorList();
        const objs = page.objs;
        const OPS = pdfjsLib.OPS;

        // ページレンダリングでリソースをロード
        const viewport = page.getViewport({ scale: 1.0 });
        const renderCanvas = document.createElement('canvas');
        renderCanvas.width = viewport.width;
        renderCanvas.height = viewport.height;
        const renderCtx = renderCanvas.getContext('2d');
        await page.render({ canvasContext: renderCtx, viewport }).promise;

        // 画像オペレーションを探す
        for (let i = 0; i < operatorList.fnArray.length; i++) {
          const op = operatorList.fnArray[i];
          if (op === OPS.paintImageXObject || op === OPS.paintJpegXObject) {
            const imgName = operatorList.argsArray[i][0];
            console.log('Image: ' + imgName);
            
            try {
              const imgData = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
                objs.get(imgName, (obj) => {
                  clearTimeout(timeout);
                  resolve(obj);
                });
              });

              // 画像サイズを取得
              const width = imgData.width;
              const height = imgData.height;
              console.log('Size: ' + width + 'x' + height);

              // ページ全体画像かチェック
              if (isFullPageImage(width, height)) {
                console.log('Full-page image detected, splitting...');
                
                // bitmapまたはdataから画像を取得してCanvasに描画
                const srcCanvas = document.createElement('canvas');
                srcCanvas.width = width;
                srcCanvas.height = height;
                const srcCtx = srcCanvas.getContext('2d');

                if (imgData.bitmap) {
                  // ImageBitmap形式
                  srcCtx.drawImage(imgData.bitmap, 0, 0);
                  console.log('Using bitmap');
                } else if (imgData.data) {
                  // 生データ形式
                  const imageData = new ImageData(
                    new Uint8ClampedArray(imgData.data),
                    width,
                    height
                  );
                  srcCtx.putImageData(imageData, 0, 0);
                  console.log('Using raw data');
                } else {
                  console.log('No valid image data');
                  continue;
                }

                // 分割処理
                const splitPhotos = await splitPageCanvasIntoPhotos(srcCanvas, photosPerPage);
                allPhotos.push(...splitPhotos);
              } else {
                console.log('Not a full-page image');
              }
            } catch (err) {
              console.log('Error: ' + err.message);
            }
          }
        }
      }

      return allPhotos;
    };
  </script>
</body>
</html>
    `;

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.getElementById('c1')?.getContext('2d'));
    await new Promise(r => setTimeout(r, 500));

    console.log('1. html2pdf形式でPDF生成...');
    const pdfDataUrl = await page.evaluate(async () => {
      // @ts-ignore
      return await window.generatePdf();
    }) as string;
    
    const base64 = pdfDataUrl.split(',')[1];
    const pdfBuffer = Buffer.from(base64, 'base64');
    const pdfPath = path.join(OUTPUT_DIR, 'html2pdf-test.pdf');
    fs.writeFileSync(pdfPath, pdfBuffer);
    console.log(`   保存: ${pdfPath}`);
    console.log(`   サイズ: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);
    console.log('');

    console.log('2. PDFから画像抽出＆分割...');
    const photos = await page.evaluate(async (dataUrl: string) => {
      // @ts-ignore
      return await window.extractWithSplit(dataUrl, 3);
    }, pdfDataUrl) as any[];

    console.log('');
    console.log('========================================');
    console.log('結果');
    console.log('========================================');
    console.log(`分割後の写真数: ${photos.length}`);
    
    if (photos.length > 0) {
      console.log('');
      for (const photo of photos) {
        console.log(`  Photo ${photo.index}: ${photo.width}x${photo.height}, ${(photo.size / 1024).toFixed(1)} KB`);
        
        const imgBase64 = photo.dataUrl.split(',')[1];
        const imgBuffer = Buffer.from(imgBase64, 'base64');
        const imgPath = path.join(OUTPUT_DIR, `extracted-photo-${photo.index}.jpg`);
        fs.writeFileSync(imgPath, imgBuffer);
        console.log(`    → 保存: ${imgPath}`);
      }

      if (photos.length === 3) {
        console.log('');
        console.log('========================================');
        console.log('✓ 成功！3枚の個別写真を抽出しました');
        console.log('========================================');
      }
    } else {
      console.log('');
      console.log('⚠ 写真の抽出に失敗しました');
    }

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
