// Declare EXIF global from exif-js script
declare const EXIF: any;

export const getPhotoDate = (file: File): Promise<number> => {
  return new Promise((resolve) => {
    // Default to lastModified if EXIF fails
    const defaultDate = file.lastModified;

    if (typeof EXIF === 'undefined') {
      resolve(defaultDate);
      return;
    }

    EXIF.getData(file, function(this: any) {
      const dateStr = EXIF.getTag(this, "DateTimeOriginal");
      if (dateStr) {
        // Format is usually "YYYY:MM:DD HH:MM:SS"
        // Needs conversion to be parsed by Date
        try {
          const [datePart, timePart] = dateStr.split(' ');
          const [y, m, d] = datePart.split(':');
          const [h, min, s] = timePart.split(':');
          const dateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), parseInt(h), parseInt(min), parseInt(s));
          resolve(dateObj.getTime());
        } catch (e) {
          resolve(defaultDate);
        }
      } else {
        resolve(defaultDate);
      }
    });
  });
};

// Resizes an image to a maximum dimension to save bandwidth/tokens and convert to base64
// Reduced default from 2048 to 1600 for mobile stability (still ~450dpi for A4 3-up layout)
export const processImageForAI = (file: File, maxDimension: number = 1600): Promise<{ base64: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height *= maxDimension / width;
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width *= maxDimension / height;
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        
        // Gemini prefers standard base64 without the prefix for the API part, 
        // but for display we need the prefix. We return standard data URL.
        // Compressed to 0.7 to allow larger batches (e.g., 15 photos) without timeout/payload issues
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7); 
        resolve({
          base64: dataUrl,
          mimeType: 'image/jpeg'
        });
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      if (readerEvent.target?.result) {
        img.src = readerEvent.target.result as string;
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
};

export const extractBase64Data = (dataUrl: string): string => {
  return dataUrl.split(',')[1];
};