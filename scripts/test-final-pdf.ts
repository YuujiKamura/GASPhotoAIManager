/**
 * 最終PDF生成・画像抽出テスト
 * 
 * 実行: npx tsx scripts/test-final-pdf.ts
 */
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.join(process.cwd(), 'test-output');
const OUTPUT_PDF = path.join(OUTPUT_DIR, 'test-final-album.pdf');
const FONT_PATH = path.join(process.cwd(), 'public', 'fonts', 'ipaexg.ttf');

async function main() {
  console.log('========================================');
  console.log('最終PDF生成・画像抽出テスト');
  console.log('========================================\n');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // フォントファイルを確認
  if (!fs.existsSync(FONT_PATH)) {
    console.error(`フォントファイルが見つかりません: ${FONT_PATH}`);
    process.exit(1);
  }
  console.log(`✓ フォントファイル確認: ${FONT_PATH}`);

  const fontBuffer = fs.readFileSync(FONT_PATH);
  const fontBase64 = fontBuffer.toString('base64');
  console.log(`  サイズ: ${(fontBuffer.length / 1024 / 1024).toFixed(2)} MB`);
  console.log('');

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
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js"></script>
  <script src="https://unpkg.com/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs" type="module"></script>
</head>
<body>
  <canvas id="c1" width="400" height="300"></canvas>
  <canvas id="c2" width="400" height="300"></canvas>
  <canvas id="c3" width="400" height="300"></canvas>

  <script type="module">
    import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';

    function createTestImage(id, color, text) {
      const canvas = document.getElementById(id);
      const ctx = canvas.getContext('2d');
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, '#ffffff');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 4;
      ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
      ctx.fillStyle = '#333';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
      return canvas.toDataURL('image/jpeg', 0.9);
    }

    const images = [
      createTestImage('c1', '#ffcc00', 'Photo 1'),
      createTestImage('c2', '#00ccff', 'Photo 2'),
      createTestImage('c3', '#ff6699', 'Photo 3'),
    ];

    window.generatePdf = async function(fontBase64) {
      const { PDFDocument, rgb, StandardFonts } = PDFLib;
      
      const pdfDoc = await PDFDocument.create();
      pdfDoc.registerFontkit(fontkit);
      
      // フォント埋め込み
      const binaryString = atob(fontBase64);
      const fontBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        fontBytes[i] = binaryString.charCodeAt(i);
      }
      const japaneseFont = await pdfDoc.embedFont(fontBytes);
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      
      const A4_WIDTH = 595.28;
      const A4_HEIGHT = 841.89;
      const MARGIN = 20;
      const photosPerPage = 3;
      const usableHeight = A4_HEIGHT - MARGIN * 2 - 40;
      const photoRowHeight = usableHeight / photosPerPage;
      const photoHeight = photoRowHeight - 10;
      const photoWidth = (A4_WIDTH - MARGIN * 2) * 0.45;
      const infoWidth = (A4_WIDTH - MARGIN * 2) * 0.50;

      const photos = [
        { fileName: 'photo_001.jpg', base64: images[0], analysis: { workType: '舗装工', variety: 'アスファルト舗装', detail: '表層', station: 'NO.5+10.0', remarks: '施工状況' } },
        { fileName: 'photo_002.jpg', base64: images[1], analysis: { workType: '舗装工', variety: 'アスファルト舗装', detail: '基層', station: 'NO.5+10.0', remarks: '出来形確認' } },
        { fileName: 'photo_003.jpg', base64: images[2], analysis: { workType: '安全管理', variety: '朝礼', detail: '-', station: '-', remarks: '朝礼状況' } },
      ];

      const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

      // ヘッダー
      page.drawText('工事写真帳', { x: MARGIN, y: A4_HEIGHT - MARGIN - 20, size: 14, font: japaneseFont, color: rgb(0.2, 0.2, 0.2) });
      page.drawText('Page 1 / 1', { x: A4_WIDTH - MARGIN - 60, y: A4_HEIGHT - MARGIN - 20, size: 10, font: helvetica, color: rgb(0.5, 0.5, 0.5) });

      // 各写真
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const rowY = A4_HEIGHT - MARGIN - 40 - (i + 1) * photoRowHeight + 5;

        // 画像埋め込み
        const base64Data = photo.base64.split(',')[1];
        const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        const embeddedImage = await pdfDoc.embedJpg(imageBytes);

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

        page.drawImage(embeddedImage, { x: MARGIN + offsetX, y: rowY + offsetY, width: drawWidth, height: drawHeight });
        page.drawRectangle({ x: MARGIN, y: rowY, width: photoWidth, height: photoHeight, borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.5 });

        // 情報欄
        const infoX = MARGIN + photoWidth + 5;
        page.drawRectangle({ x: infoX, y: rowY, width: infoWidth, height: photoHeight, borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.5 });

        const analysis = photo.analysis;
        const infoLines = [
          { label: '工種', value: analysis.workType },
          { label: '種別', value: analysis.variety },
          { label: '細別', value: analysis.detail },
          { label: '測点', value: analysis.station },
          { label: '備考', value: analysis.remarks },
        ];

        const lineHeight = 18;
        infoLines.forEach((line, idx) => {
          const y = rowY + photoHeight - 20 - idx * lineHeight;
          page.drawText(line.label + ':', { x: infoX + 5, y, size: 8, font: japaneseFont, color: rgb(0.4, 0.4, 0.4) });
          page.drawText(line.value, { x: infoX + 45, y, size: 9, font: japaneseFont, color: rgb(0.1, 0.1, 0.1) });
        });

        page.drawText(photo.fileName, { x: infoX + 5, y: rowY + 5, size: 7, font: helvetica, color: rgb(0.6, 0.6, 0.6) });
      }

      // メタデータ
      pdfDoc.setTitle('工事写真帳');
      pdfDoc.setCreator('GASPhotoAIManager');
      pdfDoc.setProducer('pdf-lib + IPA Gothic');
      pdfDoc.setKeywords(['SmartPDF', 'IndividualImages']);

      const pdfBytes = await pdfDoc.save();
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < pdfBytes.length; i += chunkSize) {
        const chunk = pdfBytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(chunk));
      }
      return { base64: btoa(binary), size: pdfBytes.length };
    };

    window.extractImages = async function(pdfBase64) {
      const binaryString = atob(pdfBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      const results = { pageCount: pdf.numPages, images: [] };

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
              console.error('Image extraction error:', e);
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

    console.log('PDF生成中（日本語フォント埋め込み）...');

    const result = await page.evaluate(async (fontBase64: string) => {
      // @ts-ignore
      return await window.generatePdf(fontBase64);
    }, fontBase64) as { base64: string; size: number };

    const pdfBuffer = Buffer.from(result.base64, 'base64');
    fs.writeFileSync(OUTPUT_PDF, pdfBuffer);
    console.log(`✓ PDF生成完了: ${OUTPUT_PDF}`);
    console.log(`  サイズ: ${(result.size / 1024 / 1024).toFixed(2)} MB`);
    console.log('');

    console.log('画像抽出テスト中...');
    const extractResult = await page.evaluate(async (pdfBase64: string) => {
      // @ts-ignore
      return await window.extractImages(pdfBase64);
    }, result.base64) as { pageCount: number; images: Array<{ page: number; name: string; width: number; height: number; size: number }> };

    console.log('');
    console.log('========================================');
    console.log('結果');
    console.log('========================================');
    console.log(`PDFページ数: ${extractResult.pageCount}`);
    console.log(`抽出画像数: ${extractResult.images.length}`);
    console.log('');

    if (extractResult.images.length === 3) {
      console.log('✓ 3枚の個別画像が正しく抽出されました！');
      console.log('');
      console.log('抽出された画像:');
      for (const img of extractResult.images) {
        console.log(`  - ${img.name}: ${img.width}x${img.height}, ${(img.size / 1024).toFixed(1)} KB`);
      }
      console.log('');
      console.log('========================================');
      console.log('✓ テスト成功！');
      console.log('========================================');
    } else {
      console.log(`⚠ 期待: 3枚, 実際: ${extractResult.images.length}枚`);
      process.exit(1);
    }

  } finally {
    await browser.close();
  }
}

main().catch(console.error);



