/**
 * pdf-lib個別画像埋め込みPDF生成テスト
 * 
 * 実行: npx tsx scripts/test-pdflibgen.ts
 */
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.join(process.cwd(), 'test-output');
const OUTPUT_PDF = path.join(OUTPUT_DIR, 'test-pdflib-individual-images.pdf');

async function main() {
  console.log('========================================');
  console.log('pdf-lib 個別画像埋め込みPDF生成テスト');
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

    // テスト用のHTMLを作成（pdf-libとpdf.jsを読み込み）
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs" type="module"></script>
</head>
<body>
  <canvas id="testCanvas1" width="400" height="300"></canvas>
  <canvas id="testCanvas2" width="400" height="300"></canvas>
  <canvas id="testCanvas3" width="400" height="300"></canvas>

  <script type="module">
    import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';

    // テスト画像を生成
    function createTestImage(canvasId, color, text) {
      const canvas = document.getElementById(canvasId);
      const ctx = canvas.getContext('2d');
      
      // 背景
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, '#ffffff');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // 枠
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 4;
      ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
      
      // テキスト
      ctx.fillStyle = '#333';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
      
      return canvas.toDataURL('image/jpeg', 0.9);
    }

    const testImages = [
      createTestImage('testCanvas1', '#ffcc00', 'Photo 1: Construction'),
      createTestImage('testCanvas2', '#00ccff', 'Photo 2: Inspection'),
      createTestImage('testCanvas3', '#ff6699', 'Photo 3: Safety'),
    ];

    // PDFを生成
    window.generatePdf = async function() {
      const { PDFDocument, rgb, StandardFonts } = PDFLib;
      
      const pdfDoc = await PDFDocument.create();
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // A4サイズ
      const A4_WIDTH = 595.28;
      const A4_HEIGHT = 841.89;
      const MARGIN = 20;

      // テスト用の写真データ
      const photos = [
        { fileName: 'photo_001.jpg', base64: testImages[0], analysis: { workType: 'Paving', variety: 'Asphalt', detail: 'Surface', station: 'NO.5+10.0', remarks: 'Construction' } },
        { fileName: 'photo_002.jpg', base64: testImages[1], analysis: { workType: 'Paving', variety: 'Asphalt', detail: 'Base', station: 'NO.5+10.0', remarks: 'Inspection' } },
        { fileName: 'photo_003.jpg', base64: testImages[2], analysis: { workType: 'Safety', variety: 'Meeting', detail: '-', station: '-', remarks: 'Morning assembly' } },
      ];

      const photosPerPage = 3;
      const photoRowHeight = (A4_HEIGHT - MARGIN * 2 - 40) / photosPerPage;
      const photoWidth = (A4_WIDTH - MARGIN * 2) * 0.45;
      const photoHeight = photoRowHeight - 10;
      const infoWidth = (A4_WIDTH - MARGIN * 2) * 0.50;

      const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

      // ヘッダー
      page.drawText('Construction Photo Album - Test', {
        x: MARGIN,
        y: A4_HEIGHT - MARGIN - 20,
        size: 14,
        font: helveticaBold,
        color: rgb(0.2, 0.2, 0.2),
      });

      // 各写真を個別に埋め込み
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const rowY = A4_HEIGHT - MARGIN - 40 - (i + 1) * photoRowHeight + 5;

        // base64からバイナリに変換
        const base64Data = photo.base64.split(',')[1];
        const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

        // JPEG画像を埋め込み
        const embeddedImage = await pdfDoc.embedJpg(imageBytes);

        // アスペクト比を維持
        const imgAspect = embeddedImage.width / embeddedImage.height;
        const boxAspect = photoWidth / photoHeight;
        let drawWidth, drawHeight;
        if (imgAspect > boxAspect) {
          drawWidth = photoWidth;
          drawHeight = photoWidth / imgAspect;
        } else {
          drawHeight = photoHeight;
          drawWidth = photoHeight * imgAspect;
        }
        const offsetX = (photoWidth - drawWidth) / 2;
        const offsetY = (photoHeight - drawHeight) / 2;

        // 画像を描画
        page.drawImage(embeddedImage, {
          x: MARGIN + offsetX,
          y: rowY + offsetY,
          width: drawWidth,
          height: drawHeight,
        });

        // 枠
        page.drawRectangle({
          x: MARGIN,
          y: rowY,
          width: photoWidth,
          height: photoHeight,
          borderColor: rgb(0.7, 0.7, 0.7),
          borderWidth: 0.5,
        });

        // 情報欄
        const infoX = MARGIN + photoWidth + 5;
        page.drawRectangle({
          x: infoX,
          y: rowY,
          width: infoWidth,
          height: photoHeight,
          borderColor: rgb(0.7, 0.7, 0.7),
          borderWidth: 0.5,
        });

        const analysis = photo.analysis;
        const infoLines = [
          { label: 'Work Type', value: analysis.workType },
          { label: 'Variety', value: analysis.variety },
          { label: 'Detail', value: analysis.detail },
          { label: 'Station', value: analysis.station },
          { label: 'Remarks', value: analysis.remarks },
        ];

        const lineHeight = 18;
        infoLines.forEach((line, idx) => {
          const y = rowY + photoHeight - 20 - idx * lineHeight;
          page.drawText(line.label + ':', { x: infoX + 5, y, size: 8, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) });
          page.drawText(line.value, { x: infoX + 60, y, size: 9, font: helvetica, color: rgb(0.1, 0.1, 0.1) });
        });

        page.drawText(photo.fileName, { x: infoX + 5, y: rowY + 5, size: 7, font: helvetica, color: rgb(0.6, 0.6, 0.6) });
      }

      // メタデータ
      pdfDoc.setTitle('Construction Photo Album - Test');
      pdfDoc.setCreator('GASPhotoAIManager');
      pdfDoc.setProducer('pdf-lib (Individual Images)');
      pdfDoc.setKeywords(['Test', 'IndividualImages']);

      const pdfBytes = await pdfDoc.save();
      
      // Uint8ArrayをBase64に変換
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < pdfBytes.length; i += chunkSize) {
        const chunk = pdfBytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(chunk));
      }
      return btoa(binary);
    };

    // 画像抽出テスト
    window.extractImages = async function(pdfBase64) {
      const binaryString = atob(pdfBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      const results = {
        pageCount: pdf.numPages,
        images: []
      };

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

            try {
              const imgData = await new Promise((resolve) => {
                const existing = objs.get(imgName);
                if (existing) { resolve(existing); return; }
                objs.get(imgName, resolve);
              });

              if (imgData && imgData.data) {
                const canvas = document.createElement('canvas');
                canvas.width = imgData.width;
                canvas.height = imgData.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  const imageData = new ImageData(new Uint8ClampedArray(imgData.data), imgData.width, imgData.height);
                  ctx.putImageData(imageData, 0, 0);
                  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
                  if (blob) {
                    results.images.push({ page: pageNum, name: imgName, width: imgData.width, height: imgData.height, size: blob.size });
                  }
                }
              } else if (imgData && imgData.bitmap) {
                const canvas = document.createElement('canvas');
                canvas.width = imgData.bitmap.width || imgData.width;
                canvas.height = imgData.bitmap.height || imgData.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(imgData.bitmap, 0, 0);
                  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
                  if (blob) {
                    results.images.push({ page: pageNum, name: imgName, width: canvas.width, height: canvas.height, size: blob.size });
                  }
                }
              }
            } catch (e) {
              console.error('Extraction error:', e);
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

    // Canvas描画を待つ
    await page.waitForFunction(() => {
      const canvas = document.getElementById('testCanvas1') as HTMLCanvasElement;
      return canvas && canvas.getContext('2d');
    });

    console.log('✓ テスト画像3枚を生成');
    console.log('');
    console.log('pdf-libでPDF生成中（個別画像埋め込み）...');

    // PDF生成
    const pdfBase64 = await page.evaluate(async () => {
      // @ts-ignore
      return await window.generatePdf();
    }) as string;

    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    fs.writeFileSync(OUTPUT_PDF, pdfBuffer);
    console.log(`✓ PDF保存完了: ${OUTPUT_PDF}`);
    console.log(`  サイズ: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

    // 画像抽出テスト
    console.log('');
    console.log('画像抽出テスト実行中...');

    const extractResult = await page.evaluate(async (pdfBase64: string) => {
      // @ts-ignore
      return await window.extractImages(pdfBase64);
    }, pdfBase64) as { pageCount: number; images: Array<{ page: number; name: string; width: number; height: number; size: number }> };

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
      
      if (extractResult.images.length === 3) {
        console.log('✓ 3枚の個別画像が正しく抽出されました！');
      } else {
        console.log(`⚠ 期待: 3枚, 実際: ${extractResult.images.length}枚`);
      }
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


