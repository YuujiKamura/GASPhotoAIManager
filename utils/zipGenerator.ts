import JSZip from 'jszip';
import { PhotoRecord } from "../types";
import { generatePhotoXML, getDtdContent, getXslContent } from './xmlGenerator';
import { extractBase64Data } from './imageUtils';

export const generateDeliveryZip = async (photos: PhotoRecord[]): Promise<Blob> => {
      const zip = new JSZip();

      // Create folder structure
      const photoDir = zip.folder("PHOTO");
      if (!photoDir) throw new Error("Failed to create PHOTO folder");

      const picDir = photoDir.folder("PIC");
      if (!picDir) throw new Error("Failed to create PIC folder");

      // Add Static Files
      photoDir.file("PHOTO05.DTD", getDtdContent());
      photoDir.file("PHOTO05.XSL", getXslContent());

      // Add XML
      const xmlContent = generatePhotoXML(photos);
      photoDir.file("PHOTO.XML", xmlContent);

      // Add Images
      // We need to convert base64 back to binary for the ZIP
      photos.forEach((photo) => {
            if (photo.status !== 'done') return;

            const base64Data = extractBase64Data(photo.base64);
            picDir.file(photo.fileName, base64Data, { base64: true });
      });

      // Generate ZIP blob
      const content = await zip.generateAsync({ type: "blob" });
      return content;
};
