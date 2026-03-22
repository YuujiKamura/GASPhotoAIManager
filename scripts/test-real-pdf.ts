/**
 * 実際のPDFファイルで画像抽出テスト
 */
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

const PDF_PATH = './test-data/sample.pdf';
const OUTPUT_DIR = path.join(process.cwd(), 'test-output', 'real-pdf-test');

async function main() {
  console.log('========================================');
  console.log('実PDFファイル画像抽出テスト');
  console.log('========================================\n');

  // PDFファイルの存在確認
  if (!fs.existsSync(PDF_PATH)) {
    console.error(`❌ PDFファイルが見つかりません: ${PDF_PATH}`);
    process.exit(1);
  }

  console.log(`PDF: ${PDF_PATH}`);
  const pdfStats = fs.statSync(PDF_PATH);
  console.log(`サイズ: ${(pdfStats.size / 1024).toFixed(1)} KB`);
  console.log('');

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

    // PDFファイルを読み込んでbase64に変換
    const pdfBuffer = fs.readFileSync(PDF_PATH);
    const pdfBase64 = pdfBuffer.toString('base64');
    const pdfDataUrl = `data:application/pdf;base64,${pdfBase64}`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs" type="module"></script>
</head>
<body>
  <script type="module">
    import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';

    // ページ全体画像かどうか判定
    function isFullPageImage(width, height) {
      const aspectRatio = width / height;
      const a4Ratio = 210 / 297;
      const isA4Like = Math.abs(aspectRatio - a4Ratio) < 0.15;
      const isLarge = height > 1000;
      return isA4Like && isLarge;
    }

    // ページ画像を個別写真に分割
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

      console.log('Split: ' + width + 'x' + height + ' -> ' + photosPerPage + ' photos');

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
            pageIndex: -1,
            index: i + 1,
            width: w,
            height: h,
            size: blob.size,
            dataUrl: dataUrl,
            isFullPage: true
          });
        }
      }
      return photos;
    }

    // 画像抽出
    window.extractImages = async function(pdfDataUrl, photosPerPage) {
      const base64 = pdfDataUrl.split(',')[1];
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      
      console.log('PDF size: ' + (bytes.length / 1024).toFixed(1) + ' KB');
      
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      console.log('PDF pages: ' + pdf.numPages);

      const allImages = [];
      let totalSplitPhotos = 0;
      let totalIndividualImages = 0;

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        console.log('\\n=== Page ' + pageNum + ' ===');
        const page = await pdf.getPage(pageNum);
        const operatorList = await page.getOperatorList();
        const objs = page.objs;
        const OPS = pdfjsLib.OPS;

        // ページレンダリング
        const viewport = page.getViewport({ scale: 1.0 });
        const renderCanvas = document.createElement('canvas');
        renderCanvas.width = viewport.width;
        renderCanvas.height = viewport.height;
        const renderCtx = renderCanvas.getContext('2d');
        await page.render({ canvasContext: renderCtx, viewport }).promise;

        let pageImageCount = 0;

        for (let i = 0; i < operatorList.fnArray.length; i++) {
          const op = operatorList.fnArray[i];
          if (op === OPS.paintImageXObject || op === OPS.paintJpegXObject) {
            const imgName = operatorList.argsArray[i][0];
            pageImageCount++;
            
            try {
              const imgData = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
                objs.get(imgName, (obj) => {
                  clearTimeout(timeout);
                  resolve(obj);
                });
              });

              const width = imgData.width;
              const height = imgData.height;
              console.log('Image ' + imgName + ': ' + width + 'x' + height);

              // Canvasに描画
              const srcCanvas = document.createElement('canvas');
              srcCanvas.width = width;
              srcCanvas.height = height;
              const srcCtx = srcCanvas.getContext('2d');

              if (imgData.bitmap) {
                srcCtx.drawImage(imgData.bitmap, 0, 0);
              } else if (imgData.data) {
                const imageData = new ImageData(
                  new Uint8ClampedArray(imgData.data),
                  width,
                  height
                );
                srcCtx.putImageData(imageData, 0, 0);
              } else {
                console.log('No valid image data for ' + imgName);
                continue;
              }

              // ページ全体画像かチェック
              if (isFullPageImage(width, height)) {
                console.log('-> Full-page image, splitting...');
                const splitPhotos = await splitPageCanvasIntoPhotos(srcCanvas, photosPerPage);
                splitPhotos.forEach(p => { p.pageIndex = pageNum; });
                allImages.push(...splitPhotos);
                totalSplitPhotos += splitPhotos.length;
                console.log('-> Split into ' + splitPhotos.length + ' photos');
              } else {
                // 個別画像
                const blob = await new Promise((resolve) => srcCanvas.toBlob(resolve, 'image/jpeg', 0.92));
                if (blob && blob.size > 1000) {
                  const reader = new FileReader();
                  const dataUrl = await new Promise((resolve) => {
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                  });
                  
                  allImages.push({
                    pageIndex: pageNum,
                    index: totalIndividualImages + 1,
                    width: width,
                    height: height,
                    size: blob.size,
                    dataUrl: dataUrl,
                    isFullPage: false
                  });
                  totalIndividualImages++;
                  console.log('-> Individual image: ' + width + 'x' + height + ', ' + (blob.size / 1024).toFixed(1) + ' KB');
                }
              }
            } catch (err) {
              console.log('Error: ' + err.message);
            }
          }
        }
        console.log('Page ' + pageNum + ': ' + pageImageCount + ' image operations');
      }

      return {
        totalPages: pdf.numPages,
        totalImages: allImages.length,
        splitPhotos: totalSplitPhotos,
        individualImages: totalIndividualImages,
        images: allImages
      };
    };
  </script>
</body>
</html>
    `;

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1000));

    console.log('画像抽出開始...\n');
    const result = await page.evaluate(async (dataUrl: string) => {
      // @ts-ignore
      return await window.extractImages(dataUrl, 3);
    }, pdfDataUrl) as any;

    console.log('\n========================================');
    console.log('結果');
    console.log('========================================');
    console.log(`PDFページ数: ${result.totalPages}`);
    console.log(`抽出画像数: ${result.totalImages}`);
    console.log(`  - 分割抽出: ${result.splitPhotos}`);
    console.log(`  - 個別画像: ${result.individualImages}`);

    if (result.images && result.images.length > 0) {
      console.log('\n抽出した画像:');
      for (const img of result.images) {
        const type = img.isFullPage ? '分割' : '個別';
        console.log(`  [${type}] Page ${img.pageIndex}, Photo ${img.index}: ${img.width}x${img.height}, ${(img.size / 1024).toFixed(1)} KB`);
        
        // 画像を保存
        const imgBase64 = img.dataUrl.split(',')[1];
        const imgBuffer = Buffer.from(imgBase64, 'base64');
        const filename = `page${img.pageIndex}_${img.isFullPage ? 'split' : 'img'}_${img.index}.jpg`;
        const imgPath = path.join(OUTPUT_DIR, filename);
        fs.writeFileSync(imgPath, imgBuffer);
      }
      
      console.log(`\n→ 画像を保存しました: ${OUTPUT_DIR}`);
    }

  } finally {
    await browser.close();
  }
}

main().catch(console.error);



