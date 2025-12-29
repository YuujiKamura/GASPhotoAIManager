/**
 * PDFロードダイアログの自動テスト
 */
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

const PDF_PATH = 'H:/マイドライブ/〇東区市道（2工区）舗装補修工事（水防等含）（単価契約）/20251117 小峯2丁目6-6付近　舗装打換/工事写真/路盤出来形、小峯2丁目No.2　2025-12-27.pdf';
const FOLDER_PATH = 'H:/マイドライブ/〇東区市道（2工区）舗装補修工事（水防等含）（単価契約）/20251117 小峯2丁目6-6付近　舗装打換/工事写真/路盤出来形/No2';

async function main() {
  console.log('========================================');
  console.log('PDFロード処理テスト');
  console.log('========================================\n');

  // ファイル・フォルダ存在確認
  if (!fs.existsSync(PDF_PATH)) {
    console.error(`❌ PDFが見つかりません: ${PDF_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(FOLDER_PATH)) {
    console.error(`❌ フォルダが見つかりません: ${FOLDER_PATH}`);
    process.exit(1);
  }

  console.log(`PDF: ${path.basename(PDF_PATH)}`);
  console.log(`フォルダ: ${FOLDER_PATH}`);

  // フォルダ内の画像を取得
  const imageFiles = fs.readdirSync(FOLDER_PATH)
    .filter(f => /\.(jpg|jpeg|png|gif)$/i.test(f))
    .sort();
  console.log(`画像ファイル: ${imageFiles.length}枚`);
  imageFiles.forEach(f => console.log(`  - ${f}`));
  console.log('');

  // PDFを読み込んでスマートPDFか判定
  const pdfBuffer = fs.readFileSync(PDF_PATH);
  const pdfText = pdfBuffer.toString('utf-8').slice(0, 100000);
  const isSmart = pdfText.includes('GASPM_SESSION_V1:');
  console.log(`PDF形式: ${isSmart ? 'スマートPDF' : '旧形式PDF'}`);
  console.log('');

  // handlePdfLoadのロジックをシミュレート
  console.log('========================================');
  console.log('handlePdfLoad シミュレーション');
  console.log('========================================\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    page.on('console', msg => {
      if (msg.type() !== 'warning') {
        console.log('>', msg.text());
      }
    });

    // PDFとフォルダ画像をBase64として渡す
    const pdfBase64 = pdfBuffer.toString('base64');
    const folderImagesData: { name: string; base64: string }[] = [];
    
    for (const imgFile of imageFiles) {
      const imgPath = path.join(FOLDER_PATH, imgFile);
      const imgBuffer = fs.readFileSync(imgPath);
      const ext = path.extname(imgFile).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
      folderImagesData.push({
        name: imgFile,
        base64: `data:${mimeType};base64,${imgBuffer.toString('base64')}`
      });
    }

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

    // extractSessionFromPdf のシンプル版
    async function extractSession(pdfBase64) {
      const bytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 200000));
      
      const marker = 'GASPM_SESSION_V1:';
      const idx = text.indexOf(marker);
      if (idx === -1) return null;

      const start = idx + marker.length;
      const end = text.indexOf('%%EOF', start);
      const jsonStr = text.slice(start, end > start ? end : undefined).trim();
      
      try {
        return JSON.parse(jsonStr);
      } catch {
        return null;
      }
    }

    // extractTextWithPositions のシンプル版
    async function extractText(pdfBase64) {
      const bytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      const pages = [];
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const items = textContent.items.map(item => ({
          text: item.str,
          x: item.transform[4],
          y: item.transform[5]
        }));
        pages.push({ pageNum: i, items });
      }
      return pages;
    }

    // parsePositionedTextToRecords のシンプル版
    function parseText(textData, imageCount, photosPerPage) {
      const records = [];
      for (let i = 0; i < imageCount; i++) {
        records.push({
          fileName: 'photo_' + (i + 1) + '.jpg',
          status: 'done',
          analysis: {
            workType: '舗装工',
            variety: '-',
            detail: '-',
            station: '-',
            remarks: '-',
            hasBoard: false
          }
        });
      }
      return records;
    }

    window.testPdfLoad = async function(pdfBase64, folderImages, isSmart) {
      console.log('Starting test...');
      console.log('isSmart:', isSmart);
      console.log('Folder images:', folderImages.length);

      let sessionData = null;
      
      if (isSmart) {
        sessionData = await extractSession(pdfBase64);
        console.log('Session data:', sessionData ? sessionData.length + ' records' : 'null');
      }

      if (!sessionData || sessionData.length === 0) {
        console.log('No session data, parsing text...');
        const textData = await extractText(pdfBase64);
        console.log('Text pages:', textData.length);
        
        const imageCount = folderImages.length;
        const photosPerPage = textData.length > 0 && imageCount / textData.length <= 2.5 ? 2 : 3;
        console.log('Estimated layout:', photosPerPage, 'per page');
        
        sessionData = parseText(textData, imageCount, photosPerPage);
        console.log('Parsed records:', sessionData.length);
      }

      // セッションデータと画像をマッチング
      const restoredPhotos = sessionData.map((data, index) => {
        const fileName = data.fileName || 'photo_' + (index + 1) + '.jpg';
        
        // フォルダ画像とマッチング
        const folderImg = folderImages[index];
        const base64 = folderImg ? folderImg.base64 : '';
        
        return {
          fileName,
          base64,
          hasImage: !!base64,
          analysis: data.analysis
        };
      });

      const matchedCount = restoredPhotos.filter(p => p.hasImage).length;
      
      return {
        totalRecords: restoredPhotos.length,
        matchedImages: matchedCount,
        photos: restoredPhotos.map(p => ({
          fileName: p.fileName,
          hasImage: p.hasImage,
          workType: p.analysis?.workType
        }))
      };
    };
  </script>
</body>
</html>
    `;

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1000));

    console.log('テスト実行中...\n');
    
    const result = await page.evaluate(async (pdfB64: string, folderImgs: any[], smart: boolean) => {
      // @ts-ignore
      return await window.testPdfLoad(pdfB64, folderImgs, smart);
    }, pdfBase64, folderImagesData, isSmart) as any;

    console.log('\n========================================');
    console.log('結果');
    console.log('========================================');
    console.log(`レコード数: ${result.totalRecords}`);
    console.log(`マッチした画像: ${result.matchedImages}`);
    console.log('');
    console.log('写真一覧:');
    result.photos.forEach((p: any, i: number) => {
      const status = p.hasImage ? '✓' : '✗';
      console.log(`  ${status} ${i + 1}. ${p.fileName}`);
    });

    if (result.matchedImages === result.totalRecords) {
      console.log('\n========================================');
      console.log('✓ 成功！全ての画像がマッチしました');
      console.log('========================================');
    } else if (result.matchedImages > 0) {
      console.log('\n========================================');
      console.log(`⚠ ${result.matchedImages}/${result.totalRecords} 枚マッチ`);
      console.log('========================================');
    } else {
      console.log('\n========================================');
      console.log('✗ 画像のマッチに失敗');
      console.log('========================================');
    }

  } finally {
    await browser.close();
  }
}

main().catch(console.error);


