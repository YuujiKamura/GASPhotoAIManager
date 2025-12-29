/**
 * pdf-lib 日本語フォント埋め込みテスト
 * 
 * 実行: npx tsx scripts/test-pdflib-japanese.ts
 */
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.join(process.cwd(), 'test-output');
const OUTPUT_PDF = path.join(OUTPUT_DIR, 'test-pdflib-japanese.pdf');

// IPA ゴシックフォントファイル（ローカル TTF）
const JAPANESE_FONT_PATH = path.join(OUTPUT_DIR, 'IPAexfont00401', 'ipaexg.ttf');

async function main() {
  console.log('========================================');
  console.log('pdf-lib 日本語フォント埋め込みテスト');
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
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js"></script>
  <script src="https://unpkg.com/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js"></script>
</head>
<body>
  <canvas id="testCanvas" width="400" height="300"></canvas>

  <script>
    // テスト画像を生成
    function createTestImage() {
      const canvas = document.getElementById('testCanvas');
      const ctx = canvas.getContext('2d');
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, '#ffcc00');
      gradient.addColorStop(1, '#ffffff');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 4;
      ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
      ctx.fillStyle = '#333';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Test Photo', canvas.width / 2, canvas.height / 2);
      return canvas.toDataURL('image/jpeg', 0.9);
    }

    const testImage = createTestImage();

    window.generatePdf = async function(fontBase64) {
      const { PDFDocument, rgb, StandardFonts } = PDFLib;
      
      const pdfDoc = await PDFDocument.create();
      
      // fontkit を登録
      pdfDoc.registerFontkit(fontkit);
      
      // Base64からフォントバイト配列に変換
      const binaryString = atob(fontBase64);
      const fontBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        fontBytes[i] = binaryString.charCodeAt(i);
      }
      console.log('Font size:', (fontBytes.length / 1024).toFixed(1), 'KB');
      
      const notoSansJP = await pdfDoc.embedFont(fontBytes);
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      
      const A4_WIDTH = 595.28;
      const A4_HEIGHT = 841.89;
      const MARGIN = 20;

      const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

      // 日本語タイトル
      page.drawText('工事写真帳', {
        x: MARGIN,
        y: A4_HEIGHT - MARGIN - 25,
        size: 18,
        font: notoSansJP,
        color: rgb(0.2, 0.2, 0.2),
      });

      page.drawText('Page 1 / 1', {
        x: A4_WIDTH - MARGIN - 60,
        y: A4_HEIGHT - MARGIN - 20,
        size: 10,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
      });

      // 写真を埋め込み
      const photoWidth = 250;
      const photoHeight = 187;
      const photoX = MARGIN;
      const photoY = A4_HEIGHT - MARGIN - 60 - photoHeight;

      const base64Data = testImage.split(',')[1];
      const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const embeddedImage = await pdfDoc.embedJpg(imageBytes);

      page.drawImage(embeddedImage, {
        x: photoX,
        y: photoY,
        width: photoWidth,
        height: photoHeight,
      });

      page.drawRectangle({
        x: photoX,
        y: photoY,
        width: photoWidth,
        height: photoHeight,
        borderColor: rgb(0.7, 0.7, 0.7),
        borderWidth: 0.5,
      });

      // 日本語情報欄
      const infoX = photoX + photoWidth + 10;
      const infoWidth = A4_WIDTH - MARGIN - infoX;
      const lineHeight = 22;
      
      page.drawRectangle({
        x: infoX,
        y: photoY,
        width: infoWidth,
        height: photoHeight,
        borderColor: rgb(0.7, 0.7, 0.7),
        borderWidth: 0.5,
      });

      const infoLines = [
        { label: '工種', value: '舗装工' },
        { label: '種別', value: 'アスファルト舗装' },
        { label: '細別', value: '表層（密粒度As 13F）' },
        { label: '測点', value: 'NO.5+10.0 ～ NO.6+5.0' },
        { label: '備考', value: '施工状況' },
        { label: '撮影日時', value: '2024/12/28 10:30' },
      ];

      const startY = photoY + photoHeight - 20;
      infoLines.forEach((line, idx) => {
        const y = startY - idx * lineHeight;
        // ラベル
        page.drawText(line.label, {
          x: infoX + 5,
          y: y,
          size: 9,
          font: notoSansJP,
          color: rgb(0.4, 0.4, 0.4),
        });
        // 値
        page.drawText(line.value, {
          x: infoX + 55,
          y: y,
          size: 10,
          font: notoSansJP,
          color: rgb(0.1, 0.1, 0.1),
        });
      });

      // メタデータ
      pdfDoc.setTitle('工事写真帳 - テスト');
      pdfDoc.setCreator('GASPhotoAIManager');
      pdfDoc.setProducer('pdf-lib + Noto Sans JP');

      const pdfBytes = await pdfDoc.save();
      
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < pdfBytes.length; i += chunkSize) {
        const chunk = pdfBytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(chunk));
      }
      return { base64: btoa(binary), size: pdfBytes.length };
    };
  </script>
</body>
</html>
    `;

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    // ローカルフォントファイルを読み込み
    console.log('日本語フォントを読み込み中...');
    console.log(`フォントファイル: ${JAPANESE_FONT_PATH}`);
    
    const fontBuffer = fs.readFileSync(JAPANESE_FONT_PATH);
    const fontBase64 = fontBuffer.toString('base64');
    console.log(`フォントサイズ: ${(fontBuffer.length / 1024).toFixed(1)} KB`);
    console.log('');

    // PDF生成
    const result = await page.evaluate(async (fontBase64: string) => {
      // @ts-ignore
      return await window.generatePdf(fontBase64);
    }, fontBase64) as { base64: string; size: number };

    const pdfBuffer = Buffer.from(result.base64, 'base64');
    fs.writeFileSync(OUTPUT_PDF, pdfBuffer);

    console.log('========================================');
    console.log('結果');
    console.log('========================================');
    console.log(`✓ PDF生成成功`);
    console.log(`  サイズ: ${(result.size / 1024).toFixed(1)} KB`);
    console.log(`  出力: ${OUTPUT_PDF}`);
    console.log('');
    console.log('日本語テキストが含まれています:');
    console.log('  - タイトル: 工事写真帳');
    console.log('  - ラベル: 工種、種別、細別、測点、備考、撮影日時');
    console.log('  - 値: 舗装工、アスファルト舗装、表層（密粒度As 13F）等');

  } finally {
    await browser.close();
  }
}

main().catch(console.error);

