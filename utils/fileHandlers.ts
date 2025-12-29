/**
 * ファイル操作関連のユーティリティ関数
 */

/**
 * FileをBase64に変換
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * フォルダから画像とJSONを読み込む（ファイル名順にソート）
 */
export async function loadImagesFromFolder(folder: FileSystemDirectoryHandle): Promise<{
  images: Array<{ fileName: string; base64: string; mimeType: string }>;
  analysisData: Record<string, any> | null;
}> {
  const images: Array<{ fileName: string; base64: string; mimeType: string }> = [];
  let analysisData: Record<string, any> | null = null;
  console.log('[loadImagesFromFolder] Start:', folder.name);

  const readDir = async (dir: FileSystemDirectoryHandle, depth = 0) => {
    for await (const entry of dir.values()) {
      if (entry.kind === 'file') {
        const file = await (entry as FileSystemFileHandle).getFile();
        if (file.type.startsWith('image/')) {
          const base64 = await fileToBase64(file);
          images.push({ fileName: file.name, base64, mimeType: file.type });
          console.log(`[loadImagesFromFolder] Added image: ${file.name}`);
        } else if (file.name.endsWith('.json') && file.name !== 'desktop.ini') {
          try {
            const text = await file.text();
            const json = JSON.parse(text);
            analysisData = analysisData || {};

            // 配列形式（analysis_result.json等）
            if (Array.isArray(json)) {
              json.forEach((item: any) => {
                if (item.fileName) {
                  analysisData![item.fileName] = {
                    ...item,
                    analysis: item.analysis || {
                      workType: item.workType || '',
                      variety: item.variety || '',
                      detail: item.detail || '',
                      station: item.station || '',
                      remarks: item.remarks || '',
                      description: item.description || '',
                      measurements: item.measurements || ''
                    }
                  };
                }
              });
            } else if (json.photos && Array.isArray(json.photos)) {
              json.photos.forEach((item: any) => {
                if (item.fileName) {
                  analysisData![item.fileName] = {
                    ...item,
                    analysis: item.analysis || {
                      workType: item.workType || '',
                      variety: item.variety || '',
                      detail: item.detail || '',
                      station: item.station || '',
                      remarks: item.remarks || '',
                      description: item.description || '',
                      measurements: item.measurements || ''
                    }
                  };
                }
              });
            }
            console.log(`[loadImagesFromFolder] Loaded JSON: ${file.name}, keys:`, analysisData ? Object.keys(analysisData) : []);
          } catch (e) {
            console.warn(`[loadImagesFromFolder] Failed to parse JSON: ${file.name}`, e);
          }
        }
      } else if (entry.kind === 'directory') {
        await readDir(entry as FileSystemDirectoryHandle, depth + 1);
      }
    }
  };

  await readDir(folder);
  // ファイル名順にソート
  images.sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true }));
  console.log('[loadImagesFromFolder] Done, total images:', images.length, 'analysisData:', !!analysisData);
  return { images, analysisData };
}
