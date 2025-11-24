import { PhotoRecord } from "../types";

const DTD_CONTENT = `<!-- PHOTO05.DTD / 2008/05 -->
<!ELEMENT photodata (基礎情報, 写真情報+, ソフトメーカ用TAG*)>
<!ATTLIST photodata DTD_version CDATA #FIXED "05">

<!-- 基礎情報 -->
<!ELEMENT 基礎情報 (写真フォルダ名, 参考図フォルダ名?, 適用要領名)>
\t<!ELEMENT 写真フォルダ名 (#PCDATA)>
\t<!ELEMENT 参考図フォルダ名 (#PCDATA)>
\t<!ELEMENT 適用要領名 (#PCDATA)>

<!-- 写真情報 -->
<!ELEMENT 写真情報 (写真ファイル情報, 撮影工種区分, 代表写真*, 写真説明*, 関連写真?, 測定箇所?, ソフトメーカ用TAG?)>
\t<!ELEMENT 関連写真 (#PCDATA)>
\t<!ELEMENT 測定箇所 (#PCDATA)>
\t<!ELEMENT ソフトメーカ用TAG (#PCDATA)>

<!-- 写真ファイル情報 -->
<!ELEMENT 写真ファイル情報 (シリアル番号, 写真ファイル名, 写真ファイル実サイズ?, メディア番号)>
\t<!ELEMENT シリアル番号 (#PCDATA)>
\t<!ELEMENT 写真ファイル名 (#PCDATA)>
\t<!ELEMENT 写真ファイル実サイズ (#PCDATA)>
\t<!ELEMENT メディア番号 (#PCDATA)>

<!-- 撮影工種区分 -->
<!ELEMENT 撮影工種区分 (写真-大分類, 写真区分?, 工種?, 種別?, 細別?, 写真タイトル, 工種種別コード*)>
\t<!ELEMENT 写真-大分類 (#PCDATA)>
\t<!ELEMENT 写真区分 (#PCDATA)>
\t<!ELEMENT 工種 (#PCDATA)>
\t<!ELEMENT 種別 (#PCDATA)>
\t<!ELEMENT 細別 (#PCDATA)>
\t<!ELEMENT 写真タイトル (#PCDATA)>
\t<!ELEMENT 工種種別コード (#PCDATA)>

<!-- 代表写真 -->
<!ELEMENT 代表写真 (参考図ファイル名, 参考図ファイル実サイズ?, 参考図面, 代表写真コード*)>
\t<!ELEMENT 参考図ファイル名 (#PCDATA)>
\t<!ELEMENT 参考図ファイル実サイズ (#PCDATA)>
\t<!ELEMENT 参考図面 (#PCDATA)>
\t<!ELEMENT 代表写真コード (#PCDATA)>

<!-- 写真説明 -->
<!ELEMENT 写真説明 (撮影箇所?, 撮影年月日)>
\t<!ELEMENT 撮影箇所 (#PCDATA)>
\t<!ELEMENT 撮影年月日 (#PCDATA)>

<!ELEMENT ソフトメーカ用TAG (#PCDATA)>
`;

const XSL_CONTENT = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:template match="/">
    <html>
      <head>
        <title>PHOTO.XML Viewer</title>
        <style>
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid black; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <h2>Construction Photos</h2>
        <table>
          <tr>
            <th>No.</th>
            <th>File</th>
            <th>Type</th>
            <th>Title</th>
            <th>Date</th>
          </tr>
          <xsl:for-each select="photodata/写真情報">
            <tr>
              <td><xsl:value-of select="写真ファイル情報/シリアル番号"/></td>
              <td><xsl:value-of select="写真ファイル情報/写真ファイル名"/></td>
              <td>
                <xsl:value-of select="撮影工種区分/工種"/> - 
                <xsl:value-of select="撮影工種区分/種別"/> - 
                <xsl:value-of select="撮影工種区分/細別"/>
              </td>
              <td><xsl:value-of select="撮影工種区分/写真タイトル"/></td>
              <td><xsl:value-of select="写真説明/撮影年月日"/></td>
            </tr>
          </xsl:for-each>
        </table>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
`;

// Helper to escape XML special characters
const escapeXml = (unsafe: string | undefined): string => {
      if (!unsafe) return "";
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

// Helper to format date YYYY-MM-DD
const formatDate = (timestamp: number): string => {
      const d = new Date(timestamp);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
};

export const generatePhotoXML = (photos: PhotoRecord[], standard = "土木202003-01"): string => {
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      xml += `<!DOCTYPE photodata SYSTEM "PHOTO05.DTD">\n`;
      xml += `<?xml-stylesheet type="text/xsl" href="PHOTO05.XSL"?>\n`;
      xml += `<photodata DTD_version="05">\n`;

      // Basic Info
      xml += `  <基礎情報>\n`;
      xml += `    <写真フォルダ名>PHOTO/PIC</写真フォルダ名>\n`;
      xml += `    <参考図フォルダ名>PHOTO/DRA</参考図フォルダ名>\n`;
      xml += `    <適用要領名>${escapeXml(standard)}</適用要領名>\n`;
      xml += `  </基礎情報>\n`;

      // Photos
      photos.forEach((photo, index) => {
            if (photo.status !== 'done' || !photo.analysis) return;

            const analysis = photo.analysis;
            const serial = index + 1;
            const dateStr = photo.originalFile ? formatDate(photo.originalFile.lastModified) : formatDate(Date.now());

            xml += `  <写真情報>\n`;

            // File Info
            xml += `    <写真ファイル情報>\n`;
            xml += `      <シリアル番号>${serial}</シリアル番号>\n`;
            xml += `      <写真ファイル名>${escapeXml(photo.fileName)}</写真ファイル名>\n`;
            xml += `      <メディア番号>1</メディア番号>\n`;
            xml += `    </写真ファイル情報>\n`;

            // Construction Type Info
            xml += `    <撮影工種区分>\n`;
            xml += `      <写真-大分類>工事</写真-大分類>\n`;
            xml += `      <写真区分>施工状況写真</写真区分>\n`; // Default to construction status

            // Hierarchy Fields
            if (analysis.constructionType) xml += `      <工種>${escapeXml(analysis.constructionType)}</工種>\n`;
            if (analysis.variety) xml += `      <種別>${escapeXml(analysis.variety)}</種別>\n`;
            if (analysis.detail) xml += `      <細別>${escapeXml(analysis.detail)}</細別>\n`;

            // Title logic: Use Detail -> Remarks -> Filename
            let title = analysis.detail || analysis.remarks || photo.fileName;
            xml += `      <写真タイトル>${escapeXml(title)}</写真タイトル>\n`;
            xml += `    </撮影工種区分>\n`;

            // Description
            xml += `    <写真説明>\n`;
            if (analysis.station) {
                  xml += `      <撮影箇所>${escapeXml(analysis.station)}</撮影箇所>\n`;
            }
            xml += `      <撮影年月日>${dateStr}</撮影年月日>\n`;
            xml += `    </写真説明>\n`;

            xml += `  </写真情報>\n`;
      });

      xml += `</photodata>`;
      return xml;
};

export const getDtdContent = () => DTD_CONTENT;
export const getXslContent = () => XSL_CONTENT;
