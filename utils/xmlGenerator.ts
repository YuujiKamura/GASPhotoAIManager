
import { PhotoRecord } from "../types";

// Helper to escape XML characters
const escapeXml = (unsafe: string): string => {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
};

export const generatePhotoXML = (records: PhotoRecord[]): string => {
  const dateStr = new Date().toISOString();
  
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<!DOCTYPE 工事写真情報 SYSTEM "PHOTO.DTD">\n';
  xml += '<工事写真情報>\n';
  xml += '  <電子納品要領基準>案/2010</電子納品要領基準>\n';
  xml += `  <作成日>${dateStr}</作成日>\n`;
  
  xml += '  <写真情報>\n';
  
  records.forEach((record, index) => {
    if (record.status !== 'done' || !record.analysis) return;
    
    // Sort number: 1-based index padded to 3 digits usually, but simple integer is ok
    const sortNum = index + 1;
    
    xml += '    <写真>\n';
    xml += `      <整理番号>${sortNum}</整理番号>\n`;
    xml += `      <工種>${escapeXml(record.analysis.workType || "")}</工種>\n`;
    xml += `      <種別>${escapeXml(record.analysis.variety || "")}</種別>\n`;
    xml += `      <細別>${escapeXml(record.analysis.detail || "")}</細別>\n`;
    xml += `      <撮影箇所>${escapeXml(record.analysis.station || "")}</撮影箇所>\n`;
    xml += `      <写真タイトル>${escapeXml(record.analysis.remarks || "")}</写真タイトル>\n`;
    xml += `      <写真説明>${escapeXml(record.analysis.description || "")}</写真説明>\n`;
    xml += `      <写真ファイル名>${escapeXml(record.fileName)}</写真ファイル名>\n`;
    xml += '    </写真>\n';
  });

  xml += '  </写真情報>\n';
  xml += '</工事写真情報>';
  
  return xml;
};

export const getDtdContent = (): string => {
  // A minimal DTD for PHOTO.XML validation context
  return `
<!ELEMENT 工事写真情報 (電子納品要領基準, 作成日, 写真情報)>
<!ELEMENT 電子納品要領基準 (#PCDATA)>
<!ELEMENT 作成日 (#PCDATA)>
<!ELEMENT 写真情報 (写真*)>
<!ELEMENT 写真 (整理番号, 工種, 種別, 細別, 撮影箇所, 写真タイトル, 写真説明, 写真ファイル名)>
<!ELEMENT 整理番号 (#PCDATA)>
<!ELEMENT 工種 (#PCDATA)>
<!ELEMENT 種別 (#PCDATA)>
<!ELEMENT 細別 (#PCDATA)>
<!ELEMENT 撮影箇所 (#PCDATA)>
<!ELEMENT 写真タイトル (#PCDATA)>
<!ELEMENT 写真説明 (#PCDATA)>
<!ELEMENT 写真ファイル名 (#PCDATA)>
  `.trim();
};