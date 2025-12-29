/**
 * テスト画像を含むPDFを作成するスクリプト
 * html2pdfと同様の形式でPDFを生成し、画像抽出テストを行う
 * 
 * 実行: npx tsx scripts/create-test-pdf-with-images.ts
 */
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.join(process.cwd(), 'test-output');
const OUTPUT_PDF = path.join(OUTPUT_DIR, 'test-album-with-images.pdf');

async function main() {
  console.log('========================================');
  console.log('テスト画像入りPDF生成');
  console.log('========================================\n');

  // 出力ディレクトリ作成
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // html2pdfを使ったPDF生成をシミュレート
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Hiragino Sans', 'Yu Gothic', sans-serif; }
    
    .album-page {
      width: 210mm;
      min-height: 297mm;
      padding: 10mm;
      background: white;
      page-break-after: always;
    }
    
    .page-title {
      text-align: center;
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 10mm;
      padding: 5mm;
      background: #f0f0f0;
      border-radius: 4px;
    }
    
    .photo-row {
      display: flex;
      margin-bottom: 5mm;
      border: 1px solid #ccc;
      border-radius: 4px;
      overflow: hidden;
    }
    
    .photo-cell {
      width: 80mm;
      height: 60mm;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #eee;
      border-right: 1px solid #ccc;
    }
    
    .photo-cell canvas {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    
    .info-cell {
      flex: 1;
      padding: 3mm;
      font-size: 10px;
    }
    
    .info-row {
      display: flex;
      border-bottom: 1px solid #eee;
      padding: 2mm 0;
    }
    
    .info-label {
      width: 20mm;
      font-weight: bold;
      color: #666;
    }
    
    .info-value {
      flex: 1;
    }
  </style>
</head>
<body>
  <div id="album-content">
    <div class="album-page">
      <div class="page-title">工事写真帳 - テスト</div>
      
      <div class="photo-row">
        <div class="photo-cell">
          <canvas id="photo1" width="300" height="225"></canvas>
        </div>
        <div class="info-cell">
          <div class="info-row"><span class="info-label">工種</span><span class="info-value">舗装工</span></div>
          <div class="info-row"><span class="info-label">種別</span><span class="info-value">アスファルト舗装</span></div>
          <div class="info-row"><span class="info-label">細別</span><span class="info-value">表層</span></div>
          <div class="info-row"><span class="info-label">測点</span><span class="info-value">NO.5+10.0</span></div>
          <div class="info-row"><span class="info-label">備考</span><span class="info-value">施工状況</span></div>
          <div class="info-row"><span class="info-label">撮影日時</span><span class="info-value">2024/12/28 10:30</span></div>
        </div>
      </div>
      
      <div class="photo-row">
        <div class="photo-cell">
          <canvas id="photo2" width="300" height="225"></canvas>
        </div>
        <div class="info-cell">
          <div class="info-row"><span class="info-label">工種</span><span class="info-value">舗装工</span></div>
          <div class="info-row"><span class="info-label">種別</span><span class="info-value">アスファルト舗装</span></div>
          <div class="info-row"><span class="info-label">細別</span><span class="info-value">基層</span></div>
          <div class="info-row"><span class="info-label">測点</span><span class="info-value">NO.5+10.0</span></div>
          <div class="info-row"><span class="info-label">備考</span><span class="info-value">出来形確認</span></div>
          <div class="info-row"><span class="info-label">撮影日時</span><span class="info-value">2024/12/28 11:00</span></div>
        </div>
      </div>
      
      <div class="photo-row">
        <div class="photo-cell">
          <canvas id="photo3" width="300" height="225"></canvas>
        </div>
        <div class="info-cell">
          <div class="info-row"><span class="info-label">工種</span><span class="info-value">安全管理</span></div>
          <div class="info-row"><span class="info-label">種別</span><span class="info-value">朝礼</span></div>
          <div class="info-row"><span class="info-label">細別</span><span class="info-value">-</span></div>
          <div class="info-row"><span class="info-label">測点</span><span class="info-value">-</span></div>
          <div class="info-row"><span class="info-label">備考</span><span class="info-value">朝礼状況</span></div>
          <div class="info-row"><span class="info-label">撮影日時</span><span class="info-value">2024/12/28 08:00</span></div>
        </div>
      </div>
    </div>
  </div>

  <script>
    // テスト画像を描画
    function drawTestImage(canvasId, color, text) {
      const canvas = document.getElementById(canvasId);
      const ctx = canvas.getContext('2d');
      
      // 背景グラデーション
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, '#ffffff');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // 枠線
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 3;
      ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
      
      // テキスト
      ctx.fillStyle = '#333';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
      
      // 日付
      ctx.font = '14px sans-serif';
      ctx.fillText('2024/12/28', canvas.width / 2, canvas.height - 30);
    }
    
    drawTestImage('photo1', '#ffcc00', '施工状況写真');
    drawTestImage('photo2', '#00ccff', '出来形写真');
    drawTestImage('photo3', '#ff6699', '安全管理写真');

    // PDF生成関数
    window.generatePdf = async function() {
      const element = document.getElementById('album-content');
      const opt = {
        margin: 0,
        filename: 'test-album.pdf',
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      const pdfBlob = await html2pdf().set(opt).from(element).output('blob');
      
      // BlobをBase64に変換
      const reader = new FileReader();
      return new Promise((resolve) => {
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(pdfBlob);
      });
    };
  </script>
</body>
</html>
    `;

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    // 少し待ってCanvasが描画されるのを確認
    await page.waitForFunction(() => {
      const canvas = document.getElementById('photo1') as HTMLCanvasElement;
      return canvas && canvas.getContext('2d');
    });

    console.log('✓ HTMLコンテンツ生成完了');
    console.log('✓ テスト画像3枚をCanvasに描画');
    console.log('');
    console.log('html2pdfでPDF生成中...');

    // PDF生成
    const pdfDataUrl = await page.evaluate(async () => {
      // @ts-ignore
      return await window.generatePdf();
    }) as string;

    // Data URLからバイナリに変換
    const base64Data = pdfDataUrl.split(',')[1];
    const pdfBuffer = Buffer.from(base64Data, 'base64');

    // ファイルに保存
    fs.writeFileSync(OUTPUT_PDF, pdfBuffer);
    console.log(`✓ PDF保存完了: ${OUTPUT_PDF}`);
    console.log(`  サイズ: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

    // 画像抽出テスト
    console.log('');
    console.log('画像抽出テスト実行中...');

    const extractResult = await page.evaluate(async (pdfBase64: string) => {
      // pdf.jsを動的にロード
      const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs');
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';

      // Base64からArrayBufferに変換
      const binaryString = atob(pdfBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      const results = {
        pageCount: pdf.numPages,
        images: [] as Array<{ page: number; name: string; width: number; height: number; size: number }>
      };

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const operatorList = await page.getOperatorList();
        const objs = page.objs;
        const OPS = pdfjsLib.OPS;
        const processed = new Set();

        // オペレーション一覧をデバッグ出力
        const opNames: string[] = [];
        for (let i = 0; i < operatorList.fnArray.length; i++) {
          const op = operatorList.fnArray[i];
          if (op === OPS.paintImageXObject) opNames.push(`paintImageXObject(${operatorList.argsArray[i][0]})`);
          else if (op === OPS.paintJpegXObject) opNames.push(`paintJpegXObject(${operatorList.argsArray[i][0]})`);
          else if (op === OPS.paintInlineImageXObject) opNames.push('paintInlineImageXObject');
          else if (op === OPS.paintInlineImageXObjectGroup) opNames.push('paintInlineImageXObjectGroup');
        }
        console.log(`Page ${pageNum} image operations:`, opNames);

        for (let i = 0; i < operatorList.fnArray.length; i++) {
          const op = operatorList.fnArray[i];
          if (op === OPS.paintImageXObject || op === OPS.paintJpegXObject) {
            const imgName = operatorList.argsArray[i][0];
            if (processed.has(imgName)) continue;
            processed.add(imgName);

            try {
              const imgData = await new Promise<any>((resolve) => {
                const existing = objs.get(imgName);
                if (existing) { resolve(existing); return; }
                objs.get(imgName, resolve);
              });

              // デバッグ: 画像データの構造を出力
              console.log(`Image ${imgName} structure:`, {
                hasData: !!(imgData?.data),
                hasBitmap: !!(imgData?.bitmap),
                hasSrc: !!(imgData?.src),
                width: imgData?.width,
                height: imgData?.height,
                kind: imgData?.kind,
                keys: imgData ? Object.keys(imgData) : []
              });

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
                  const blob = await new Promise<Blob | null>((resolve) => {
                    canvas.toBlob(resolve, 'image/jpeg', 0.95);
                  });
                  if (blob) {
                    results.images.push({
                      page: pageNum,
                      name: imgName,
                      width: imgData.width,
                      height: imgData.height,
                      size: blob.size
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
                  const blob = await new Promise<Blob | null>((resolve) => {
                    canvas.toBlob(resolve, 'image/jpeg', 0.95);
                  });
                  if (blob) {
                    results.images.push({
                      page: pageNum,
                      name: imgName,
                      width: canvas.width,
                      height: canvas.height,
                      size: blob.size
                    });
                  }
                }
              } else if (imgData && imgData.src) {
                // src形式
                const response = await fetch(imgData.src);
                const blob = await response.blob();
                results.images.push({
                  page: pageNum,
                  name: imgName,
                  width: imgData.width || 0,
                  height: imgData.height || 0,
                  size: blob.size
                });
              }
            } catch (e) {
              console.error('Image extraction error:', e);
            }
          }
        }
      }

      return results;
    }, base64Data);

    console.log('');
    console.log('========================================');
    console.log('結果');
    console.log('========================================');
    console.log(`PDFページ数: ${extractResult.pageCount}`);
    console.log(`抽出画像数: ${extractResult.images.length}`);
    console.log('');

    if (extractResult.images.length > 0) {
      console.log('抽出された画像:');
      for (const img of extractResult.images) {
        console.log(`  - ${img.name}: ${img.width}x${img.height}, ${(img.size / 1024).toFixed(1)} KB`);
      }
      console.log('');
      console.log('✓ 画像抽出テスト成功！');
    } else {
      console.log('⚠ 画像が抽出できませんでした');
    }

    console.log('');
    console.log(`出力ファイル: ${OUTPUT_PDF}`);

  } finally {
    await browser.close();
  }
}

main().catch(console.error);

