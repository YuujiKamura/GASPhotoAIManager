import { PhotoRecord } from "../types";
import { generatePhotoXML, getDtdContent } from "./xmlGenerator";
import { extractBase64Data } from "./imageUtils";
import JSZip from 'jszip';

export const generateZip = async (records: PhotoRecord[]): Promise<Blob> => {
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
  if (!photoDir) throw new Error("Failed to create PHOTO folder in ZIP.");
  const picDir = photoDir.folder("PIC");
  if (!picDir) throw new Error("Failed to create PIC folder in ZIP.");

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