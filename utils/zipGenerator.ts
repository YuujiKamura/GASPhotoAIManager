import { PhotoRecord } from "../types";
import { generatePhotoXML, getDtdContent } from "./xmlGenerator";
import { extractBase64Data } from "./imageUtils";

// Declare JSZip global
declare const JSZip: any;

export const generateZip = async (records: PhotoRecord[]): Promise<Blob> => {
  if (typeof JSZip === 'undefined') {
    throw new Error("JSZip library is not loaded.");
  }

  const zip = new JSZip();
  
  // Standard Folder Structure:
  // ROOT/
  //   PHOTO/
  //     PHOTO.XML
  //     PHOTO.DTD
  //     PIC/
  //       IMAGE1.JPG
  //       IMAGE2.JPG
  
  const photoDir = zip.folder("PHOTO");
  const picDir = photoDir.folder("PIC");

  // 1. Add Images
  const validRecords = records.filter(r => r.status === 'done' && r.analysis);
  
  validRecords.forEach(photo => {
    const base64Data = extractBase64Data(photo.base64);
    // Add file to PIC folder
    picDir.file(photo.fileName, base64Data, { base64: true });
  });

  // 2. Add XML
  const xmlContent = generatePhotoXML(validRecords);
  photoDir.file("PHOTO.XML", xmlContent);

  // 3. Add DTD
  const dtdContent = getDtdContent();
  photoDir.file("PHOTO.DTD", dtdContent);

  // Generate ZIP blob
  const content = await zip.generateAsync({ type: "blob" });
  return content;
};
