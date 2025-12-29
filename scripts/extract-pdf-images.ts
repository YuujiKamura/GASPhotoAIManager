/**
 * PDFから有効な画像だけを抽出してファイル保存
 */
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

const PDF_PATH = 'H:/マイドライブ/〇東区市道（2工区）舗装補修工事（水防等含）（単価契約）/20251117 小峯2丁目6-6付近　舗装打換/工事写真/路盤出来形、小峯2丁目No.2　2025-12-27.pdf';

// 出力先：PDFと同じフォルダに「extracted_images」フォルダを作成
const PDF_DIR = path.dirname(PDF_PATH);
const OUTPUT_DIR = path.join(PDF_DIR, 'extracted_images');

async function main() {
  console.log('========================================');
  console.log('PDF画像抽出');
  console.log('========================================\n');

  if (!fs.existsSync(PDF_PATH)) {
    console.error(`❌ PDFファイルが見つかりません: ${PDF_PATH}`);
    process.exit(1);
  }

  const pdfName = path.basename(PDF_PATH, '.pdf');
  console.log(`PDF: ${pdfName}`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

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

    function isFullPageImage(width, height) {
      const aspectRatio = width / height;
      const a4Ratio = 210 / 297;
      return Math.abs(aspectRatio - a4Ratio) < 0.15 && height > 1000;
    }

    // 空白画像かどうかを判定（色の分散が小さい場合は空白）
    function isBlankImage(canvas) {
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // サンプリングして色の分散を計算
      let sumR = 0, sumG = 0, sumB = 0;
      let count = 0;
      const step = 100; // 100ピクセルごとにサンプリング
      
      for (let i = 0; i < data.length; i += 4 * step) {
        sumR += data[i];
        sumG += data[i + 1];
        sumB += data[i + 2];
        count++;
      }
      
      const avgR = sumR / count;
      const avgG = sumG / count;
      const avgB = sumB / count;
      
      // 分散を計算
      let varR = 0, varG = 0, varB = 0;
      for (let i = 0; i < data.length; i += 4 * step) {
        varR += Math.pow(data[i] - avgR, 2);
        varG += Math.pow(data[i + 1] - avgG, 2);
        varB += Math.pow(data[i + 2] - avgB, 2);
      }
      varR /= count;
      varG /= count;
      varB /= count;
      
      const totalVariance = varR + varG + varB;
      
      // 分散が小さく、かつ明るい（白に近い）場合は空白
      const isWhitish = avgR > 240 && avgG > 240 && avgB > 240;
      const isLowVariance = totalVariance < 500;
      
      return isWhitish && isLowVariance;
    }

    async function splitPageCanvasIntoPhotos(srcCanvas, photosPerPage) {
      const photos = [];
      const width = srcCanvas.width;
      const height = srcCanvas.height;
      
      const headerRatio = 0.04;
      const photoWidthRatio = 0.48; // 48%に拡大
      
      const headerHeight = Math.floor(height * headerRatio);
      const usableHeight = height - headerHeight;
      const rowHeight = Math.floor(usableHeight / photosPerPage);
      const photoWidth = Math.floor(width * photoWidthRatio);
      
      const marginTop = Math.floor(rowHeight * 0.015);
      const marginLeft = Math.floor(width * 0.015);

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

        // 空白チェック
        if (isBlankImage(destCanvas)) {
          console.log('Photo ' + (i + 1) + ': BLANK - skipped');
          continue;
        }

        const blob = await new Promise((resolve) => destCanvas.toBlob(resolve, 'image/jpeg', 0.92));
        if (blob && blob.size > 5000) { // 5KB以上のみ
          const reader = new FileReader();
          const dataUrl = await new Promise((resolve) => {
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
          
          photos.push({
            pageIndex: -1,
            slotIndex: i + 1,
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

    window.extractImages = async function(pdfDataUrl, photosPerPage) {
      const base64 = pdfDataUrl.split(',')[1];
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      console.log('PDF pages: ' + pdf.numPages);

      const allImages = [];
      let photoNumber = 0;

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        console.log('\\n--- Page ' + pageNum + ' ---');
        const page = await pdf.getPage(pageNum);
        const operatorList = await page.getOperatorList();
        const objs = page.objs;
        const OPS = pdfjsLib.OPS;

        const viewport = page.getViewport({ scale: 1.0 });
        const renderCanvas = document.createElement('canvas');
        renderCanvas.width = viewport.width;
        renderCanvas.height = viewport.height;
        const renderCtx = renderCanvas.getContext('2d');
        await page.render({ canvasContext: renderCtx, viewport }).promise;

        for (let i = 0; i < operatorList.fnArray.length; i++) {
          const op = operatorList.fnArray[i];
          if (op === OPS.paintImageXObject || op === OPS.paintJpegXObject) {
            const imgName = operatorList.argsArray[i][0];
            
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
                continue;
              }

              if (isFullPageImage(width, height)) {
                console.log('Full-page image, splitting...');
                const splitPhotos = await splitPageCanvasIntoPhotos(srcCanvas, photosPerPage);
                splitPhotos.forEach(p => {
                  photoNumber++;
                  p.pageIndex = pageNum;
                  p.photoNumber = photoNumber;
                });
                allImages.push(...splitPhotos);
              } else {
                // 個別画像
                if (!isBlankImage(srcCanvas)) {
                  const blob = await new Promise((resolve) => srcCanvas.toBlob(resolve, 'image/jpeg', 0.92));
                  if (blob && blob.size > 5000) {
                    photoNumber++;
                    const reader = new FileReader();
                    const dataUrl = await new Promise((resolve) => {
                      reader.onload = () => resolve(reader.result);
                      reader.readAsDataURL(blob);
                    });
                    
                    allImages.push({
                      pageIndex: pageNum,
                      photoNumber: photoNumber,
                      width: width,
                      height: height,
                      size: blob.size,
                      dataUrl: dataUrl
                    });
                    console.log('Individual image: ' + width + 'x' + height + ', ' + (blob.size / 1024).toFixed(1) + ' KB');
                  }
                }
              }
            } catch (err) {
              console.log('Error: ' + err.message);
            }
          }
        }
      }

      return allImages;
    };
  </script>
</body>
</html>
    `;

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1000));

    console.log('画像抽出中...\n');
    const images = await page.evaluate(async (dataUrl: string) => {
      // @ts-ignore
      return await window.extractImages(dataUrl, 3);
    }, pdfDataUrl) as any[];

    console.log('\n========================================');
    console.log('抽出結果');
    console.log('========================================');
    console.log(`有効な画像: ${images.length}枚`);
    console.log(`出力先: ${OUTPUT_DIR}`);
    console.log('');

    // ファイルに保存
    for (const img of images) {
      const filename = `${pdfName}_${String(img.photoNumber).padStart(2, '0')}.jpg`;
      const imgBase64 = img.dataUrl.split(',')[1];
      const imgBuffer = Buffer.from(imgBase64, 'base64');
      const imgPath = path.join(OUTPUT_DIR, filename);
      fs.writeFileSync(imgPath, imgBuffer);
      console.log(`✓ ${filename} (${(img.size / 1024).toFixed(1)} KB)`);
    }

    console.log('\n========================================');
    console.log(`✓ 完了！${images.length}枚の画像を保存しました`);
    console.log(`  ${OUTPUT_DIR}`);
    console.log('========================================');

  } finally {
    await browser.close();
  }
}

main().catch(console.error);

