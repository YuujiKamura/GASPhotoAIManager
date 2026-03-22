import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';

const pdfPath = process.argv[2] || './test-data/sample.pdf';

async function analyzePdf() {
  console.log('=== PDF Analysis ===');
  console.log('File:', pdfPath);
  console.log('');

  const buffer = fs.readFileSync(pdfPath);
  console.log('File size:', (buffer.length / 1024).toFixed(1), 'KB');
  console.log('');

  // pdf-lib でメタデータを取得
  const pdfDoc = await PDFDocument.load(buffer);

  console.log('=== Metadata ===');
  console.log('Title:', pdfDoc.getTitle() || '(none)');
  console.log('Author:', pdfDoc.getAuthor() || '(none)');
  console.log('Subject:', pdfDoc.getSubject()?.substring(0, 200) || '(none)');
  console.log('Keywords:', pdfDoc.getKeywords() || '(none)');
  console.log('Creator:', pdfDoc.getCreator() || '(none)');
  console.log('Producer:', pdfDoc.getProducer() || '(none)');
  console.log('');

  console.log('=== Pages ===');
  console.log('Page count:', pdfDoc.getPageCount());

  const pages = pdfDoc.getPages();
  pages.forEach((page, i) => {
    const { width, height } = page.getSize();
    console.log(`Page ${i + 1}: ${width.toFixed(0)} x ${height.toFixed(0)} pts`);
  });
  console.log('');

  // Check for GASPM_SESSION marker
  const subject = pdfDoc.getSubject() || '';
  if (subject.startsWith('GASPM_SESSION_V1:')) {
    console.log('=== Smart PDF Session Data ===');
    const encoded = subject.substring('GASPM_SESSION_V1:'.length);
    try {
      const json = Buffer.from(encoded, 'base64').toString('utf-8');
      const data = JSON.parse(json);
      console.log('Records:', data.length);
      data.slice(0, 3).forEach((rec: any, i: number) => {
        console.log(`  [${i}] fileName: ${rec.fileName}`);
        console.log(`       workType: ${rec.analysis?.workType || rec.workType || ''}`);
        console.log(`       station: ${rec.analysis?.station || rec.station || ''}`);
        console.log(`       remarks: ${rec.analysis?.remarks || rec.remarks || ''}`);
      });
      if (data.length > 3) console.log(`  ... and ${data.length - 3} more`);
    } catch (e) {
      console.log('Failed to decode session data:', e);
    }
  } else {
    console.log('=== NOT a Smart PDF (no session data) ===');
  }

  // Raw バイナリからテキストをサンプル抽出
  console.log('');
  console.log('=== Raw Text Sample (first 2000 bytes as text) ===');
  const textSample = buffer.toString('utf-8', 0, 2000).replace(/[^\x20-\x7E\n]/g, '.');
  console.log(textSample);
}

analyzePdf().catch(console.error);
