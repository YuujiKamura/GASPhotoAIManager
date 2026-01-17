// cli/server.ts
import express from "express";
import cors from "cors";
import * as fs4 from "fs/promises";
import * as path5 from "path";

// cli/adapters/imageAdapter.ts
import sharp from "sharp";
import * as fs from "fs/promises";
import * as path from "path";
var SUPPORTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".tiff", ".gif"];
async function processImage(filePath, options = {}) {
  const { maxWidth = 1024, maxHeight = 1024, quality = 85 } = options;
  const buffer = await fs.readFile(filePath);
  const image = sharp(buffer);
  const metadata = await image.metadata();
  let processedImage = image;
  if (metadata.width && metadata.width > maxWidth || metadata.height && metadata.height > maxHeight) {
    processedImage = image.resize(maxWidth, maxHeight, {
      fit: "inside",
      withoutEnlargement: true
    });
  }
  const outputBuffer = await processedImage.jpeg({ quality }).toBuffer();
  const base64 = outputBuffer.toString("base64");
  let date;
  if (metadata.exif) {
    try {
      const exifDate = await extractExifDate(buffer);
      if (exifDate) {
        date = exifDate;
      }
    } catch {
    }
  }
  if (!date) {
    const stats = await fs.stat(filePath);
    date = stats.mtime.getTime();
  }
  const outputMetadata = await sharp(outputBuffer).metadata();
  return {
    fileName: path.basename(filePath),
    base64: `data:image/jpeg;base64,${base64}`,
    mimeType: "image/jpeg",
    width: outputMetadata.width || 0,
    height: outputMetadata.height || 0,
    date
  };
}
async function extractExifDate(buffer) {
  try {
    const metadata = await sharp(buffer).metadata();
    if (metadata.exif) {
      const exifStr = metadata.exif.toString("binary");
      const datePatterns = [
        /(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/
      ];
      for (const pattern of datePatterns) {
        const match = exifStr.match(pattern);
        if (match) {
          const [, year, month, day, hour, minute, second] = match;
          const dateObj = new Date(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
            parseInt(hour),
            parseInt(minute),
            parseInt(second)
          );
          if (!isNaN(dateObj.getTime())) {
            return dateObj.getTime();
          }
        }
      }
    }
  } catch {
  }
  return null;
}
async function scanFolder(folderPath, options = {}) {
  const { recursive = false } = options;
  const results = [];
  async function scan(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && recursive) {
        await scan(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          results.push(fullPath);
        }
      }
    }
  }
  await scan(folderPath);
  results.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  return results;
}
async function processImages(filePaths, options = {}, onProgress) {
  const results = [];
  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];
    onProgress?.(i + 1, filePaths.length, path.basename(filePath));
    try {
      const info = await processImage(filePath, options);
      results.push(info);
    } catch (error) {
      console.error(`Failed to process ${filePath}:`, error);
    }
  }
  return results;
}

// cli/adapters/masterAdapter.ts
import * as fs2 from "fs/promises";
import * as path2 from "path";
import * as os from "os";

// utils/constructionHierarchyData.ts
var _ = () => ({});
var createSurfaceLayerCommon = () => ({
  "\u30D7\u30E9\u30A4\u30E0\u30B3\u30FC\u30C8\u4E73\u5264\u6563\u5E03\u72B6\u6CC1": _(),
  "\u30D7\u30E9\u30A4\u30E0\u30B3\u30FC\u30C8\u990A\u751F\u7802\u6563\u5E03\u72B6\u6CC1": _(),
  "\u30D7\u30E9\u30A4\u30E0\u30B3\u30FC\u30C8\u990A\u751F\u7802\u6E05\u6383\u72B6\u6CC1": _(),
  "\u7AEF\u90E8\u4E73\u5264\u5857\u5E03\u72B6\u6CC1": _()
});
var createFullSurfaceLayer = () => ({
  ...createSurfaceLayerCommon(),
  "\u8217\u8A2D\u72B6\u6CC1": _(),
  "\u521D\u671F\u8EE2\u5727\u72B6\u6CC1": _(),
  "2\u6B21\u8EE2\u5727\u72B6\u6CC1": _(),
  "\u65BD\u5DE5\u5B8C\u4E86": _()
});
var createSimpleSurfaceLayer = () => ({
  ...createSurfaceLayerCommon(),
  "\u65BD\u5DE5\u5B8C\u4E86": _()
});
var createUpperRoadbedCommon = () => ({
  "\u88DC\u8DB3\u6750\u642C\u5165\u72B6\u6CC1 M-40": _(),
  "\u88DC\u8DB3\u6750\u642C\u5165\u72B6\u6CC1 RC-40": _(),
  "\u88DC\u8DB3\u6750\u642C\u5165\u72B6\u6CC1 RM-40": _(),
  "\u4E0D\u9678\u6574\u6B63\u72B6\u6CC1": _(),
  "\u8EE2\u5727\u72B6\u6CC1": _(),
  "\u8DEF\u76E4\u5B8C\u4E86\u72B6\u6CC1": _()
});
var createManholeRemoval = () => ({
  "\u9244\u84CB\u51E6\u5206\u72B6\u6CC1": _(),
  "\u65E2\u8A2D\u4EBA\u5B54\u64A4\u53BB\u72B6\u6CC1": _(),
  "\u5B8C\u4E86": _()
});
var createManholeInstall = () => ({
  "\u8ABF\u6574\u30D6\u30ED\u30C3\u30AF\u8A2D\u7F6E\u72B6\u6CC1": _(),
  "\u636E\u4ED8\u72B6\u6CC1": _(),
  "\u9AD8\u3055\u8ABF\u6574\u5B8C\u4E86": _()
});
var createManholeClean = () => ({
  "\u6E05\u6383\u72B6\u6CC1": _(),
  "\u6E05\u6383\u5B8C\u4E86": _()
});
var createStatusComplete = () => ({ "\u8A2D\u7F6E\u72B6\u6CC1": _(), "\u5B8C\u4E86": _() });
var createPlaceComplete = () => ({ "\u636E\u4ED8\u72B6\u6CC1": _(), "\u5B8C\u4E86": _() });
var CONSTRUCTION_HIERARCHY = {
  "\u76F4\u63A5\u5DE5\u4E8B\u8CBB": {
    "\u7740\u624B\u524D\u53CA\u3073\u5B8C\u6210\u5199\u771F": {
      "\u8217\u88C5\u5DE5": {
        "\u8217\u88C5\u6253\u63DB\u3048\u5DE5": { "\u8868\u5C64\u5DE5": { matchPatterns: ["\u7740\u624B\u524D", "\u5B8C\u4E86", "\u7AE3\u5DE5"] } },
        "\u672A\u8217\u88C5\u90E8\u8217\u88C5\u5DE5": { "\u8868\u5C64\u5DE5": { matchPatterns: ["\u7740\u624B\u524D", "\u5B8C\u4E86", "\u7AE3\u5DE5"] } },
        "\u701D\u9752\u5B89\u5B9A\u51E6\u7406\u8DEF\u76E4\u5DE5": { "\u8868\u5C64\u5DE5": { matchPatterns: ["\u7740\u624B\u524D", "\u5B8C\u4E86", "\u7AE3\u5DE5"] } }
      }
    },
    "\u65BD\u5DE5\u72B6\u6CC1\u5199\u771F": {
      "\u69CB\u9020\u7269\u64A4\u53BB\u5DE5": {
        "\u69CB\u9020\u7269\u53D6\u58CA\u3057\u5DE5": {
          "\u30B3\u30F3\u30AF\u30EA\u30FC\u30C8\u69CB\u9020\u7269\u53D6\u58CA\u3057": {
            "\u53D6\u58CA\u3057\u72B6\u6CC1": _(),
            "\u30B3\u30F3\u30AF\u30EA\u30FC\u30C8\uFF08\u6709\u7B4B\uFF09\u51E6\u5206\u524D": _(),
            "\u30B3\u30F3\u30AF\u30EA\u30FC\u30C8\uFF08\u6709\u7B4B\uFF09\u51E6\u5206\u4E2D": _(),
            "\u30B3\u30F3\u30AF\u30EA\u30FC\u30C8\uFF08\u6709\u7B4B\uFF09\u51E6\u5206\u5F8C": _(),
            "\u51E6\u5206\u524D": _(),
            "\u51E6\u5206\u4E2D": _(),
            "\u51E6\u5206\u5F8C": _(),
            "\u7A4D\u8FBC\u72B6\u6CC1": _()
          }
        }
      },
      "\u9053\u8DEF\u571F\u5DE5": {
        "\u6398\u524A\u5DE5": { "\u6398\u524A\u72B6\u6CC1": _(), "\u6398\u524A\u5B8C\u4E86": _() },
        "\u8DEF\u5E8A\u5DE5": { "\u8DEF\u5E8A\u6574\u6B63\u72B6\u6CC1": _(), "\u8DEF\u5E8A\u8EE2\u5727\u72B6\u6CC1": _(), "\u8DEF\u5E8A\u5B8C\u4E86": _() },
        "\u6CD5\u9762\u5DE5": { "\u6CD5\u9762\u6574\u5F62\u72B6\u6CC1": _(), "\u690D\u751F\u5DE5\u65BD\u5DE5\u72B6\u6CC1": _() }
      },
      "\u8217\u88C5\u5DE5": {
        "\u8217\u88C5\u6253\u63DB\u3048\u5DE5": {
          "\u8217\u88C5\u7248\u5207\u65AD": { "As\u8217\u88C5\u7248\u5207\u65AD\u72B6\u6CC1": _(), "\u65E2\u8A2D\u8217\u88C5\u7248\u5207\u65AD\u72B6\u6CC1": _(), "\u5B8C\u4E86": _() },
          "\u8217\u88C5\u7248\u7834\u7815": { "\u5265\u53D6\u72B6\u6CC1": _(), "\u7A4D\u8FBC\u72B6\u6CC1": _(), "\u65E2\u8A2D\u8217\u88C5\u539A\u3055\u78BA\u8A8D": _(), "\u5B8C\u4E86": _() },
          "\u4E0A\u5C64\u8DEF\u76E4\u5DE5": createUpperRoadbedCommon(),
          "\u8868\u5C64\u5DE5": createFullSurfaceLayer()
        },
        "\u672A\u8217\u88C5\u90E8\u8217\u88C5\u5DE5": {
          "\u4E0A\u5C64\u8DEF\u76E4\u5DE5": { "\u92E4\u53D6\u308A\u72B6\u6CC1": _(), ...createUpperRoadbedCommon() },
          "\u8868\u5C64\u5DE5": createFullSurfaceLayer()
        },
        "\u701D\u9752\u5B89\u5B9A\u51E6\u7406\u8DEF\u76E4\u5DE5": {
          "\u4E0A\u5C64\u8DEF\u76E4\u5DE5": createUpperRoadbedCommon(),
          "\u8868\u5C64\u5DE5": createSimpleSurfaceLayer()
        }
      },
      "\u533A\u753B\u7DDA\u5DE5": {
        "\u533A\u753B\u7DDA\u5DE5": {
          "\u6EB6\u878D\u5F0F\u533A\u753B\u7DDA": { "\u6E05\u6383\u72B6\u6CC1": _(), "\u30D7\u30E9\u30A4\u30DE\u30FC\u6563\u5E03\u72B6\u6CC1": _(), "\u533A\u753B\u7DDA\u8A2D\u7F6E\u72B6\u6CC1": _(), "\u5B8C\u4E86": _() }
        }
      },
      "\u6392\u6C34\u69CB\u9020\u7269\u5DE5": {
        "\u4F5C\u696D\u571F\u5DE5": {
          "\u5E8A\u6398\u308A": { "\u6398\u524A\u72B6\u6CC1": _(), "\u6398\u524A\u5B8C\u4E86": _() },
          "\u57CB\u623B\u3057": {
            "\u571F\u7802\u57CB\u623B\u3057 \u8EE2\u5727\u72B6\u6CC1": _(),
            "\u6577\u5747\u3057\u3001\u8EE2\u5727\u72B6\u6CC1": _(),
            "\u4E0B\u5C64\u8DEF\u76E4 \u6750\u6599\u642C\u5165\u72B6\u6CC1 RC-40": _(),
            "\u4E0B\u5C64\u8DEF\u76E4 \u8EE2\u5727\u72B6\u6CC1": _(),
            "\u4E0A\u5C64\u8DEF\u76E4 \u6577\u5747\u3057\u72B6\u6CC1": _(),
            "\u4E0A\u5C64\u8DEF\u76E4M-40 \u8EE2\u5727\u72B6\u6CC1": _(),
            "\u5B8C\u4E86": _()
          },
          "\u57FA\u790E\u7815\u77F3\u5DE5": { "RC-40 \u642C\u5165\u72B6\u6CC1": _(), "\u57FA\u790E\u7815\u77F3\u6577\u5747\u3057\u72B6\u6CC1": _(), "\u57FA\u790E\u7815\u77F3\u8EE2\u5727\u72B6\u6CC1": _(), "\u5B8C\u4E86": _() },
          "\u57FA\u790E\u30B3\u30F3\u30AF\u30EA\u30FC\u30C8\u5DE5": {
            "\u578B\u67A0\u8A2D\u7F6E\u5B8C\u4E86": _(),
            "\u6253\u8A2D\u524D": _(),
            "\u6253\u8A2D\u5B8C\u4E86": _(),
            "\u6253\u8A2D\u72B6\u6CC1": _(),
            "\u6253\u8A2D\u539A\u3055\u78BA\u8A8D": _(),
            "\u6253\u8A2D\u5E45\u78BA\u8A8D": _()
          }
        },
        "\u96C6\u6C34\u685D\u5DE5": {
          "\u96C6\u6C34\u67A1\u5E95\u7248": { "\u96C6\u6C34\u685D\u5E95\u7248 \u6253\u8A2D\u524D\u78BA\u8A8D": _(), "\u5E95\u7248\u30B3\u30F3\u30AF\u30EA\u30FC\u30C8 \u6253\u8A2D\u524D\u78BA\u8A8D": _(), "\u5E95\u7248\u30B3\u30F3\u30AF\u30EA\u30FC\u30C8 \u6253\u8A2D\u5B8C\u4E86": _() },
          "\u30D7\u30EC\u30AD\u30E3\u30B9\u30C8\u96C6\u6C34\u685D": createPlaceComplete()
        },
        "\u5074\u6E9D\u5DE5": {
          "\u5074\u6E9D\u84CB": {
            "\u5074\u6E9D\u84CB \u6253\u8A2D\u524D\u78BA\u8A8D": _(),
            "\u5074\u6E9D\u84CB \u6253\u8A2D\u5B8C\u4E86": _(),
            "\u5929\u7AEF\u30B3\u30F3\u30AF\u30EA\u30FC\u30C8 \u6253\u8A2D\u524D\u78BA\u8A8D": _(),
            "\u5929\u7AEF\u30B3\u30F3\u30AF\u30EA\u30FC\u30C8 \u6253\u8A2D\u5B8C\u4E86": _(),
            "\u5929\u7AEF\u30B3\u30F3\u30AF\u30EA\u30FC\u30C8 \u6253\u8A2D\u72B6\u6CC1": _()
          },
          "\u30D7\u30EC\u30AD\u30E3\u30B9\u30C8U\u578B\u5074\u6E9D": {
            "\u5074\u6E9D300\u3000\u636E\u4ED8\u72B6\u6CC1": _(),
            "G\u4ED8\u5074\u6E9D300\u3000\u636E\u4ED8\u72B6\u6CC1": _(),
            "\u6577\u30E2\u30EB\u30BF\u30EB\u6577\u5747\u3057\u72B6\u6CC1": _(),
            "\u636E\u4ED8\u72B6\u6CC1": _(),
            "\u5B8C\u4E86": _()
          }
        },
        "\u96C6\u6C34\u685D\u30FB\u30DE\u30F3\u30DB\u30FC\u30EB\u5DE5": {
          "\u4EBA\u5B54\u84CB\u64A4\u53BB": createManholeRemoval(),
          "\u4EBA\u5B54\u84CB\u636E\u4ED8": createManholeInstall(),
          "\u4EBA\u5B54\u5185\u90E8\u6E05\u6383": createManholeClean(),
          "\u8ABF\u6574\u84CB\u636E\u4ED8": createPlaceComplete(),
          "\u8ABF\u6574\u30EA\u30F3\u30B0\u30D6\u30ED\u30C3\u30AF\u8A2D\u7F6E": createStatusComplete(),
          "\u8EE2\u843D\u9632\u6B62\u84CB\u8A2D\u7F6E": createStatusComplete()
        }
      },
      "\u4EBA\u5B54\u6539\u826F\u5DE5": {
        "\u96C6\u6C34\u685D\u30FB\u30DE\u30F3\u30DB\u30FC\u30EB\u5DE5": {
          "\u4EBA\u5B54\u84CB\u64A4\u53BB": createManholeRemoval(),
          "\u4EBA\u5B54\u84CB\u636E\u4ED8": createManholeInstall(),
          "\u4EBA\u5B54\u5185\u90E8\u6E05\u6383": createManholeClean(),
          "\u8ABF\u6574\u30D6\u30ED\u30C3\u30AF\u8A2D\u7F6E": { "\u8ABF\u6574\u30D6\u30ED\u30C3\u30AF\u8A2D\u7F6E\u72B6\u6CC1": _(), "\u5B8C\u4E86": _() },
          "\u8ABF\u6574\u90E8\u64A4\u53BB": { "\u8ABF\u6574\u90E8\u64A4\u53BB\u72B6\u6CC1": _(), "\u5B8C\u4E86": _() },
          "\u7121\u53CE\u7E2E\u30E2\u30EB\u30BF\u30EB\u5145\u586B": { "\u7121\u53CE\u7E2E\u30E2\u30EB\u30BF\u30EB\u5145\u586B\u72B6\u6CC1": _(), "\u5B8C\u4E86": _() }
        },
        "\u8217\u88C5\u6253\u63DB\u3048\u5DE5": {
          "\u8217\u88C5\u677F\u5207\u65AD": { "\u8217\u88C5\u677F\u5207\u65AD\u72B6\u6CC1": _(), "\u5B8C\u4E86": _() },
          "\u8217\u88C5\u677F\u7834\u7815": { "\u8217\u88C5\u677F\u7834\u7815\u72B6\u6CC1": _(), "\u5B8C\u4E86": _() },
          "\u65E2\u8A2D\u8217\u88C5\u7248\u64A4\u53BB": { "\u65E2\u8A2D\u8217\u88C5\u7248\u64A4\u53BB\u72B6\u6CC1": _(), "\u5B8C\u4E86": _() },
          "\u4E0A\u5C64\u8DEF\u76E4": { "\u4E0A\u5C64\u8DEF\u76E4\u65BD\u5DE5\u72B6\u6CC1": _(), "\u5B8C\u4E86": _() },
          "\u8868\u5C64\uFF08\u30D7\u30E9\u30A4\u30E0\u30B3\u30FC\u30C8\uFF09": { "\u30D7\u30E9\u30A4\u30E0\u30B3\u30FC\u30C8\u65BD\u5DE5\u72B6\u6CC1": _(), "\u5B8C\u4E86": _() },
          "\u8868\u5C64\uFF08\u6E29\u5EA6\u7BA1\u7406\uFF09": { "\u6E29\u5EA6\u7BA1\u7406\u72B6\u6CC1": _() },
          "\u8868\u5C64\uFF08\u8217\u8A2D\uFF09": { "\u8217\u8A2D\u72B6\u6CC1": _(), "\u65BD\u5DE5\u5B8C\u4E86": _() }
        },
        "\u4EBA\u5B54\u84CB\u636E\u4ED8\u64A4\u53BB\u5DE5": {
          "\u65E2\u8A2D\u4EBA\u5B54\u84CB\u64A4\u53BB": { "\u65E2\u8A2D\u4EBA\u5B54\u64A4\u53BB\u72B6\u6CC1": _(), "\u64A4\u53BB\u5B8C\u4E86": _() },
          "\u65E2\u8A2D\u53D7\u67A0\u64A4\u53BB": { "\u65E2\u8A2D\u53D7\u67A0\u64A4\u53BB\u72B6\u6CC1": _(), "\u64A4\u53BB\u5B8C\u4E86": _() },
          "\u9244\u84CB\u51E6\u5206": { "\u9244\u84CB\u51E6\u5206\u72B6\u6CC1": _(), "\u51E6\u5206\u5B8C\u4E86": _() },
          "\u4EBA\u5B54\u84CB\u8EE2\u843D\u9632\u6B62\u8A2D\u7F6E": { "\u4EBA\u5B54\u84CB\u8EE2\u843D\u9632\u6B62\u8A2D\u7F6E\u72B6\u6CC1": _(), "\u8A2D\u7F6E\u5B8C\u4E86": _() },
          "\u8ABF\u6574\u30D6\u30ED\u30C3\u30AF\u8A2D\u7F6E": { "\u8ABF\u6574\u30D6\u30ED\u30C3\u30AF\u8A2D\u7F6E\u72B6\u6CC1": _(), "\u8A2D\u7F6E\u5B8C\u4E86": _() },
          "\u8ABF\u6574\u91D1\u5177\u53D6\u4ED8": { "\u8ABF\u6574\u91D1\u5177\u30D1\u30C3\u30AD\u30F3\u53D6\u4ED8\u72B6\u6CC1": _(), "\u8ABF\u6574\u91D1\u5177\u30D1\u30C3\u30AD\u30F3\u4F7F\u7528": _(), "\u56FA\u5B9A\u7528\u30DC\u30EB\u30C8\u8A2D\u7F6E\u72B6\u6CC1": _(), "\u53D6\u4ED8\u5B8C\u4E86": _() },
          "\u4EBA\u5B54\u9AD8\u3055\u8ABF\u6574": { "\u4EBA\u5B54(\u4E0A\u90E8)\u9AD8\u3055\u8ABF\u6574\u5B8C\u4E86": _(), "\u9AD8\u3055\u8ABF\u6574\u72B6\u6CC1": _() },
          "\u4EBA\u5B54\u5185\u90E8\u6E05\u6383": { "\u4EBA\u5B54\u5185\u6E05\u6383\u524D\u72B6\u6CC1": _(), "\u4EBA\u5B54\u5185\u6E05\u6383\u5B8C\u4E86": _(), "\u4EBA\u5B54\u5185\u30B3\u30F3\u30AF\u30EA\u30FC\u30C8\u64A4\u53BB\u6E05\u6383\u72B6\u6CC1": _() },
          "\u8217\u88C5\u7248\u5207\u65AD": { "\u8217\u88C5\u7248\u5207\u65AD\u72B6\u6CC1": _(), "\u5B8C\u4E86": _() },
          "\u8217\u88C5\u7248\u7834\u7815\u7A4D\u8FBC": { "\u8217\u88C5\u7248\u7834\u7815\u7A4D\u8FBC\u72B6\u6CC1": _(), "\u7A4D\u8FBC\u5B8C\u4E86": _() },
          "\u30B3\u30F3\u30AF\u30EA\u30FC\u30C8\u306F\u3064\u308A\u5DE5": { "\u306F\u3064\u308A\u5DE5\u72B6\u6CC1": _(), "\u306F\u3064\u308A\u5DE5\u5B8C\u4E86": _() },
          "\u6C5A\u6CE5\u5438\u6392\u8ECA": { "\u6C5A\u6CE5\u5438\u6392\u72B6\u6CC1": _(), "\u6C5A\u6CE5\u5438\u6392\u5B8C\u4E86": _() },
          "\u8868\u5C64\u5DE5": { "\u8868\u5C64\u5DE5\u65BD\u5DE5\u72B6\u6CC1": _(), "\u8868\u5C64\u5DE5\u5B8C\u4E86": _() }
        }
      },
      "\u4EEE\u8A2D\u5DE5": {
        "\u4EA4\u901A\u7BA1\u7406\u5DE5": {
          "\u4EA4\u901A\u8A98\u5C0E\u54E1\u914D\u7F6E": { "\u8A98\u5C0E\u54E1\u914D\u7F6E\u72B6\u6CC1": _(), "\u898F\u5236\u914D\u7F6E\u72B6\u6CC1": _() },
          "\u4FDD\u5B89\u65BD\u8A2D\u8A2D\u7F6E": { "\u4FDD\u5B89\u65BD\u8A2D\u8A2D\u7F6E\u72B6\u6CC1": _(), "\u4FDD\u5B89\u65BD\u8A2D\u64A4\u53BB\u72B6\u6CC1": _(), "\u5B8C\u4E86": _() }
        }
      }
    },
    "\u5B89\u5168\u7BA1\u7406\u5199\u771F": {
      "": { "": { "\u671D\u793C\u72B6\u6CC1": _(), "KY\u6D3B\u52D5\u72B6\u6CC1": _(), "\u65B0\u898F\u5165\u5834\u8005\u6559\u80B2\u72B6\u6CC1": _(), "\u4FDD\u5B89\u65BD\u8A2D\u8A2D\u7F6E\u72B6\u6CC1": _(), "\u70B9\u706F\u78BA\u8A8D\u72B6\u6CC1": _(), "\u5B89\u5168\u5DE1\u8996\u72B6\u6CC1": _() } }
    },
    "\u4F7F\u7528\u6750\u6599\u5199\u771F": {
      "\u8217\u88C5\u5DE5": { "\u8217\u88C5\u6253\u63DB\u3048\u5DE5": { "\u8868\u5C64\u5DE5": { "\u6750\u6599\u691C\u53CE\u72B6\u6CC1": _(), "\u642C\u5165\u72B6\u6CC1": _() } } }
    },
    "\u54C1\u8CEA\u7BA1\u7406\u5199\u771F": {
      "\u8217\u88C5\u5DE5": {
        "\u8217\u88C5\u6253\u63DB\u3048\u5DE5": {
          "\u4E0A\u5C64\u8DEF\u76E4\u5DE5": { "\u73FE\u5834\u5BC6\u5EA6\u6E2C\u5B9A": { matchPatterns: ["\u5BC6\u5EA6\u6E2C\u5B9A", "RI\u8A08\u5668", "\u7802\u7F6E\u63DB\u6CD5"] } },
          "\u8868\u5C64\u5DE5": { "\u30A2\u30B9\u30D5\u30A1\u30EB\u30C8\u6DF7\u5408\u7269\u6E29\u5EA6\u6E2C\u5B9A": { matchPatterns: ["\u6E29\u5EA6\u7BA1\u7406", "\u5408\u6750\u6E29\u5EA6", "\u51FA\u8377\u6E29\u5EA6", "\u5230\u7740\u6E29\u5EA6", "\u6577\u5747\u3057\u6E29\u5EA6", "\u521D\u671F\u8EE2\u5727\u6E29\u5EA6"] } }
        }
      },
      "\u4EBA\u5B54\u6539\u826F\u5DE5": {
        "\u4EBA\u5B54\u84CB\u636E\u4ED8\u64A4\u53BB\u5DE5": {
          "\u8868\u5C64\u5DE5": { "\u30A2\u30B9\u30D5\u30A1\u30EB\u30C8\u6DF7\u5408\u7269\u6E29\u5EA6\u6E2C\u5B9A": { matchPatterns: ["\u6E29\u5EA6\u7BA1\u7406", "\u5408\u6750\u6E29\u5EA6", "\u51FA\u8377\u6E29\u5EA6", "\u5230\u7740\u6E29\u5EA6", "\u6577\u5747\u3057\u6E29\u5EA6", "\u521D\u671F\u8EE2\u5727\u6E29\u5EA6"] } },
          "\u4E0A\u5C64\u8DEF\u76E4": { "\u73FE\u5834\u5BC6\u5EA6\u6E2C\u5B9A": { matchPatterns: ["\u5BC6\u5EA6\u6E2C\u5B9A", "RI\u8A08\u5668", "\u7802\u7F6E\u63DB\u6CD5"] } }
        }
      }
    },
    "\u51FA\u6765\u5F62\u7BA1\u7406\u5199\u771F": {
      "\u8217\u88C5\u5DE5": {
        "\u8217\u88C5\u6253\u63DB\u3048\u5DE5": {
          "\u4E0A\u5C64\u8DEF\u76E4\u5DE5": {
            "\u4E0D\u9678\u6574\u6B63\u51FA\u6765\u5F62": { matchPatterns: ["\u8DEF\u76E4\u51FA\u6765\u5F62", "\u51FA\u6765\u5F62\u691C\u6E2C", "\u8DEF\u76E4", "\u57FA\u6E96\u9AD8\u4E0B\u304C\u308A", "\u57FA\u6E96\u9AD8"] },
            "\u4E0D\u9678\u6574\u6B63\u51FA\u6765\u5F62\u30FB\u7BA1\u7406\u5024": _(),
            "\u4E0D\u9678\u6574\u6B63\u51FA\u6765\u5F62\u30FB\u63A5\u5199": _(),
            "\u7815\u77F3\u539A\u6E2C\u5B9A": _()
          }
        }
      },
      "\u6392\u6C34\u69CB\u9020\u7269\u5DE5": {
        "\u4F5C\u696D\u571F\u5DE5": {
          "\u5E8A\u6398\u308A": { "\u6398\u524A\u5DE5\u51FA\u6765\u5F62\u6E2C\u5B9A": _() },
          "\u57CB\u623B\u3057": { "\u571F\u7802\u57CB\u623B\u3057\u51FA\u6765\u5F62\u6E2C\u5B9A": _(), "\u4E0B\u5C64\u8DEF\u76E4\u51FA\u6765\u5F62\u6E2C\u5B9A": _(), "\u4E0A\u5C64\u8DEF\u76E4\u51FA\u6765\u5F62\u6E2C\u5B9A": _(), "\u8DEF\u5E8A\u51FA\u6765\u5F62\u6E2C\u5B9A": _() },
          "\u57FA\u790E\u7815\u77F3\u5DE5": { "\u57FA\u790E\u7815\u77F3\u5DE5\u51FA\u6765\u5F62\u6E2C\u5B9A": _() },
          "\u57FA\u790E\u30B3\u30F3\u30AF\u30EA\u30FC\u30C8\u5DE5": { "\u57FA\u790E\u30B3\u30F3\u30AF\u30EA\u30FC\u30C8\u51FA\u6765\u5F62\u6E2C\u5B9A": _() }
        },
        "\u96C6\u6C34\u685D\u5DE5": {
          "\u96C6\u6C34\u67A1\u5E95\u7248": { "\u96C6\u6C34\u685D\u5E95\u7248\u51FA\u6765\u5F62\u6E2C\u5B9A": _() },
          "\u30D7\u30EC\u30AD\u30E3\u30B9\u30C8\u96C6\u6C34\u685D": { "\u30D7\u30EC\u30AD\u30E3\u30B9\u30C8\u96C6\u6C34\u685D\u51FA\u6765\u5F62\u6E2C\u5B9A": _() }
        },
        "\u5074\u6E9D\u5DE5": {
          "\u5074\u6E9D\u84CB": { "\u5074\u6E9D\u84CB\u51FA\u6765\u5F62\u6E2C\u5B9A": _() },
          "\u30D7\u30EC\u30AD\u30E3\u30B9\u30C8U\u578B\u5074\u6E9D": { "\u30D7\u30EC\u30AD\u30E3\u30B9\u30C8U\u578B\u5074\u6E9D\u51FA\u6765\u5F62\u6E2C\u5B9A": _() }
        }
      }
    }
  }
};

// cli/adapters/masterAdapter.ts
var CONFIG_DIR = path2.join(os.homedir(), ".gaspm");
var CUSTOM_MASTER_FILE = path2.join(CONFIG_DIR, "master.json");
var loadCustomMaster = async () => {
  try {
    const content = await fs2.readFile(CUSTOM_MASTER_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
};
var deepMerge = (target, source) => {
  for (const key in source) {
    const val = source[key];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      if (!target[key]) target[key] = {};
      deepMerge(
        target[key],
        val
      );
    } else {
      target[key] = val;
    }
  }
  return target;
};
var getMergedHierarchy = async () => {
  const customMaster = await loadCustomMaster();
  return deepMerge(
    JSON.parse(JSON.stringify(CONSTRUCTION_HIERARCHY)),
    customMaster
  );
};

// shared/core/claudeAnalysis.ts
import { execSync as execSync2 } from "child_process";
import * as fs3 from "fs/promises";
import { existsSync as existsSync2 } from "fs";
import * as path4 from "path";

// shared/core/yoloPreprocess.ts
import { execSync } from "child_process";
import * as path3 from "path";
import { existsSync } from "fs";
var DEFAULT_CONF_THRESHOLD = 0.25;
var DEFAULT_DEVICE = "cpu";
function getDefaultModelPath() {
  const projectRoot2 = process.cwd();
  return path3.join(projectRoot2, "models", "yolo-construction.pt");
}
function getScriptPath() {
  const projectRoot2 = process.cwd();
  return path3.join(projectRoot2, "models", "yolo_detect.py");
}
function runYoloSingle(imagePath, options = {}) {
  const {
    confThreshold = DEFAULT_CONF_THRESHOLD,
    modelPath = getDefaultModelPath(),
    device = DEFAULT_DEVICE
  } = options;
  const scriptPath = getScriptPath();
  if (!existsSync(scriptPath)) {
    return {
      image: imagePath,
      model: modelPath,
      detections: [],
      count: 0,
      error: `YOLO script not found: ${scriptPath}`
    };
  }
  if (!existsSync(modelPath)) {
    return {
      image: imagePath,
      model: modelPath,
      detections: [],
      count: 0,
      error: `YOLO model not found: ${modelPath}. Copy from: ~/Sanyuu2Kouku/cursor_tools/summarygenerator/runs/train/db_training/weights/best.pt`
    };
  }
  if (!existsSync(imagePath)) {
    return {
      image: imagePath,
      model: modelPath,
      detections: [],
      count: 0,
      error: `Image not found: ${imagePath}`
    };
  }
  try {
    const cmd = `python "${scriptPath}" "${imagePath}" --model "${modelPath}" --conf ${confThreshold} --device ${device}`;
    const stdout = execSync(cmd, {
      encoding: "utf-8",
      timeout: 6e4,
      // 1分タイムアウト
      maxBuffer: 10 * 1024 * 1024
    });
    const result = JSON.parse(stdout.trim());
    return result;
  } catch (error) {
    const err = error;
    return {
      image: imagePath,
      model: modelPath,
      detections: [],
      count: 0,
      error: `YOLO execution failed: ${err.message || err.stderr}`
    };
  }
}
async function runYoloDetection(imagePaths, options = {}) {
  const results = /* @__PURE__ */ new Map();
  for (const imagePath of imagePaths) {
    const result = runYoloSingle(imagePath, options);
    if (result.error) {
      console.warn(`[YOLO] ${result.error}`);
      results.set(imagePath, []);
    } else {
      results.set(imagePath, result.detections);
    }
  }
  return results;
}
function formatYoloHint(detections, minConfidence = 0.5) {
  if (!detections || detections.length === 0) {
    return "";
  }
  const hints = detections.filter((d) => d.confidence >= minConfidence).map((d) => `${d.class_name}(${(d.confidence * 100).toFixed(0)}%)`).join(", ");
  return hints ? ` [\u691C\u51FA: ${hints}]` : "";
}
function isYoloAvailable(modelPath) {
  const model = modelPath || getDefaultModelPath();
  const script = getScriptPath();
  return existsSync(model) && existsSync(script);
}

// shared/core/claudeAnalysis.ts
var formatDuration = (ms) => {
  if (ms < 1e3) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1e3).toFixed(2)}s`;
};
var checkAbort = (shouldAbort, context) => {
  if (shouldAbort?.()) {
    const msg = context ? `\u51E6\u7406\u304C\u4E2D\u65AD\u3055\u308C\u307E\u3057\u305F: ${context}` : "\u51E6\u7406\u304C\u4E2D\u65AD\u3055\u308C\u307E\u3057\u305F";
    throw new Error(msg);
  }
};
var formatShootingTime = (timestamp) => {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
};
function runClaudeCode(prompt, imagePaths, onLog) {
  const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, " ");
  let cmd;
  if (imagePaths && imagePaths.length > 0) {
    for (const p of imagePaths) {
      if (!existsSync2(p)) {
        onLog?.(`Warning: File not found: ${p}`, "error");
      } else {
        onLog?.(`File exists: ${p}`, "info");
      }
    }
    const cwd = process.cwd();
    const relativePaths = imagePaths.map((p) => {
      const rel = path4.relative(cwd, p).replace(/\\/g, "/");
      return rel.startsWith(".") ? rel : `./${rel}`;
    });
    const imageArgs = relativePaths.map((p) => `"${p}"`).join(" ");
    cmd = `claude -p "${escapedPrompt}" --output-format text ${imageArgs}`;
    onLog?.(`Command: ${cmd.substring(0, 200)}...`, "info");
  } else {
    cmd = `claude -p "${escapedPrompt}" --output-format text`;
    onLog?.(`Step2: claude [text only]`, "info");
  }
  try {
    const result = execSync2(cmd, {
      encoding: "utf-8",
      timeout: 12e4,
      maxBuffer: 10 * 1024 * 1024
    });
    return result;
  } catch (error) {
    const err = error;
    throw new Error(`claude failed (code ${err.status}): ${err.stderr || err.message}`);
  }
}
var PHOTO_CATEGORIES = [
  // 品質管理 - 温度測定
  "\u5230\u7740\u6E29\u5EA6",
  "\u6577\u5747\u3057\u6E29\u5EA6",
  "\u521D\u671F\u7DE0\u56FA\u3081\u524D\u6E29\u5EA6",
  "\u958B\u653E\u6E29\u5EA6",
  "\u30A2\u30B9\u30D5\u30A1\u30EB\u30C8\u6DF7\u5408\u7269\u6E29\u5EA6\u6E2C\u5B9A",
  // 品質管理 - 密度測定
  "\u73FE\u5834\u5BC6\u5EA6\u6E2C\u5B9A",
  // 施工状況
  "\u8EE2\u5727\u72B6\u6CC1",
  "\u6577\u5747\u3057\u72B6\u6CC1",
  "\u8217\u8A2D\u72B6\u6CC1",
  "\u521D\u671F\u8EE2\u5727\u72B6\u6CC1",
  "2\u6B21\u8EE2\u5727\u72B6\u6CC1",
  "\u4E73\u5264\u6563\u5E03\u72B6\u6CC1",
  "\u7AEF\u90E8\u4E73\u5264\u5857\u5E03\u72B6\u6CC1",
  "\u990A\u751F\u7802\u6563\u5E03\u72B6\u6CC1",
  "\u6E05\u6383\u72B6\u6CC1",
  "\u6398\u524A\u72B6\u6CC1",
  "\u7A4D\u8FBC\u72B6\u6CC1",
  "\u53D6\u58CA\u3057\u72B6\u6CC1",
  "\u636E\u4ED8\u72B6\u6CC1",
  "\u8A2D\u7F6E\u72B6\u6CC1",
  // 着手前・完成
  "\u7740\u624B\u524D",
  "\u5B8C\u4E86",
  "\u7AE3\u5DE5",
  "\u65BD\u5DE5\u5B8C\u4E86",
  "\u65E2\u6E08\u90E8\u5206",
  // 出来形管理
  "\u4E0D\u9678\u6574\u6B63\u51FA\u6765\u5F62",
  "\u8DEF\u76E4\u539A\u51FA\u6765\u5F62",
  "\u8868\u5C64\u539A\u51FA\u6765\u5F62",
  "\u5E45\u54E1\u51FA\u6765\u5F62",
  // 安全管理
  "\u671D\u793C\u5B9F\u65BD\u72B6\u6CC1",
  "\u671D\u793C\u30FBKY\u30DF\u30FC\u30C6\u30A3\u30F3\u30B0\u5B9F\u65BD\u72B6\u6CC1",
  "\u671D\u793C\u72B6\u6CC1",
  "KY\u6D3B\u52D5\u72B6\u6CC1",
  "\u5371\u967A\u4E88\u77E5\u6D3B\u52D5\u72B6\u6CC1",
  "KY\u30DF\u30FC\u30C6\u30A3\u30F3\u30B0\u5B9F\u65BD\u72B6\u6CC1",
  "\u65B0\u898F\u5165\u5834\u8005\u6559\u80B2\u72B6\u6CC1",
  "\u65B0\u898F\u5165\u5834\u8005\u6559\u80B2\u5B9F\u65BD\u72B6\u6CC1",
  "\u4FDD\u5B89\u65BD\u8A2D\u8A2D\u7F6E\u72B6\u6CC1",
  "\u70B9\u706F\u78BA\u8A8D\u72B6\u6CC1",
  "\u5B89\u5168\u5DE1\u8996\u72B6\u6CC1",
  "\u5B89\u5168\u8A13\u7DF4\u5B9F\u65BD\u72B6\u6CC1",
  "\u907F\u96E3\u8A13\u7DF4\u5B9F\u65BD\u72B6\u6CC1",
  // 災害・事故
  "\u707D\u5BB3\u767A\u751F\u72B6\u6CC1",
  "\u4E8B\u6545\u767A\u751F\u72B6\u6CC1",
  "\u88AB\u5BB3\u72B6\u6CC1",
  // 環境対策
  "\u74B0\u5883\u5BFE\u7B56\u72B6\u6CC1",
  "\u9A12\u97F3\u5BFE\u7B56\u72B6\u6CC1",
  "\u7C89\u5875\u5BFE\u7B56\u72B6\u6CC1",
  // その他
  "\u305D\u306E\u4ED6"
];
var STEP1_PROMPT = `
\u3042\u306A\u305F\u306F\u5DE5\u4E8B\u5199\u771F\u5E33\u3092\u4F5C\u6210\u3059\u308B\u73FE\u5834\u76E3\u7763\u3067\u3059\u3002\u8907\u6570\u306E\u5199\u771F\u3092\u540C\u6642\u306B\u89E3\u6790\u3057\u3001\u4E00\u8CAB\u6027\u306E\u3042\u308B\u5206\u985E\u3092\u884C\u3063\u3066\u304F\u3060\u3055\u3044\u3002

## \u5199\u771F\u533A\u5206\uFF08\u30D5\u30A9\u30C8\u30AB\u30C6\u30B4\u30EA\uFF09
\u4EE5\u4E0B\u304B\u3089\u6700\u3082\u9069\u5207\u306A\u3082\u306E\u3092\u9078\u629E\uFF1A
${PHOTO_CATEGORIES.join(", ")}

## \u51FA\u529B\u5F62\u5F0F\uFF08\u53B3\u5BC6\u306B\u3053\u306EJSON\u914D\u5217\u5F62\u5F0F\u3067\u51FA\u529B\uFF09
[
  {
    "fileName": "\u30D5\u30A1\u30A4\u30EB\u540D",
    "hasBoard": true/false,
    "detectedText": "\u9ED2\u677F\u30FB\u770B\u677F\u304B\u3089\u8AAD\u307F\u53D6\u3063\u305F\u5168\u30C6\u30AD\u30B9\u30C8",
    "measurements": "\u6570\u5024\u30C7\u30FC\u30BF\uFF08\u6E29\u5EA6\u3001\u5BF8\u6CD5\u3001\u5BC6\u5EA6\u7B49\uFF09\u5358\u4F4D\u4ED8\u304D",
    "sceneDescription": "\u5199\u771F\u306B\u5199\u3063\u3066\u3044\u308B\u3082\u306E\u306E\u5BA2\u89B3\u7684\u306A\u8AAC\u660E",
    "photoCategory": "\u5199\u771F\u533A\u5206\u304B\u3089\u9078\u629E"
  }
]

## \u6CE8\u610F
- \u9ED2\u677F\u306E\u30C6\u30AD\u30B9\u30C8\u306F\u6B63\u78BA\u306BOCR
- \u6570\u5024\u306F\u5358\u4F4D\u3082\u542B\u3081\u3066\u6B63\u78BA\u306B\uFF08\u4F8B: "160.4\u2103", "\u539A\u305550mm"\uFF09
- \u540C\u3058\u5834\u6240\u30FB\u540C\u3058\u4F5C\u696D\u306E\u5199\u771F\u306F\u4E00\u8CAB\u3057\u305F\u5206\u985E\u3092
- \u63A8\u6E2C\u305B\u305A\u3001\u898B\u3048\u308B\u3082\u306E\u3060\u3051\u3092\u8A18\u8F09
- JSON\u914D\u5217\u306E\u307F\u51FA\u529B\u3002\u8AAC\u660E\u6587\u306F\u4E0D\u8981
`;
function buildStep1Prompt(photos, yoloConfThreshold = 0.5) {
  const photoInfoList = photos.map((p) => {
    const timeInfo = p.date ? formatShootingTime(p.date) : "unknown";
    const yoloHint = formatYoloHint(p.yoloDetections || [], yoloConfThreshold);
    return `- ${p.fileName} (\u64AE\u5F71: ${timeInfo})${yoloHint}`;
  }).join("\n");
  return `${STEP1_PROMPT}

\u5BFE\u8C61\u5199\u771F:
${photoInfoList}
`.trim();
}
function buildStep2Prompt(rawData, hierarchy) {
  const hierarchyStr = JSON.stringify(hierarchy, null, 0);
  const rawDataStr = rawData.map((d) => `
\u30D5\u30A1\u30A4\u30EB: ${d.fileName}
\u9ED2\u677F: ${d.hasBoard ? "\u3042\u308A" : "\u306A\u3057"}
OCR\u30C6\u30AD\u30B9\u30C8: ${d.detectedText || "\u306A\u3057"}
\u6570\u5024: ${d.measurements || "\u306A\u3057"}
\u30B7\u30FC\u30F3: ${d.sceneDescription}
\u5199\u771F\u533A\u5206: ${d.photoCategory}
`).join("\n---\n");
  return `
\u3042\u306A\u305F\u306F\u5DE5\u4E8B\u5199\u771F\u306E\u5206\u985E\u5C02\u9580\u5BB6\u3067\u3059\u3002
\u4EE5\u4E0B\u306E\u753B\u50CF\u89E3\u6790\u7D50\u679C\u3092\u3001\u5DE5\u7A2E\u30DE\u30B9\u30BF\u306B\u57FA\u3065\u3044\u3066\u6B63\u78BA\u306B\u5206\u985E\u3057\u3066\u304F\u3060\u3055\u3044\u3002

## \u5DE5\u7A2E\u30DE\u30B9\u30BF\uFF08\u968E\u5C64\u69CB\u9020\uFF09
${hierarchyStr}

## \u753B\u50CF\u89E3\u6790\u7D50\u679C
${rawDataStr}

## \u51FA\u529B\u30EB\u30FC\u30EB
1. workType, variety, detail \u306F\u5FC5\u305A\u30DE\u30B9\u30BF\u306B\u5B58\u5728\u3059\u308B\u5024\u3092\u9078\u629E
2. \u30DE\u30B9\u30BF\u306B\u306A\u3044\u5024\u306F\u7D76\u5BFE\u306B\u4F7F\u7528\u3057\u306A\u3044
3. remarks \u306F\u30DE\u30B9\u30BF\u306E\u6700\u4E0B\u5C64\u30AD\u30FC\uFF08\u6B63\u5F0F\u540D\u79F0\uFF09\u3092\u51FA\u529B
   - matchPatterns \u306F\u691C\u7D22\u7528\u30D1\u30BF\u30FC\u30F3\u3002OCR\u30C6\u30AD\u30B9\u30C8\u304CmatchPatterns\u306B\u30DE\u30C3\u30C1\u3057\u305F\u5834\u5408\u3001\u305D\u306E\u89AA\u30AD\u30FC\u3092\u51FA\u529B
   - \u4F8B: OCR\u3067"\u5230\u7740\u6E29\u5EA6"\u2192 \u89AA\u30AD\u30FC"\u30A2\u30B9\u30D5\u30A1\u30EB\u30C8\u6DF7\u5408\u7269\u6E29\u5EA6\u6E2C\u5B9A"\u3092\u51FA\u529B
4. \u8A72\u5F53\u306A\u3057\u306E\u5834\u5408\u306F\u7A7A\u6587\u5B57""

## \u51FA\u529B\u5F62\u5F0F\uFF08JSON\u914D\u5217\uFF09
- fileName: \u30D5\u30A1\u30A4\u30EB\u540D
- workType: \u5DE5\u7A2E\uFF08\u30DE\u30B9\u30BF\u304B\u3089\u9078\u629E\uFF09
- variety: \u7A2E\u5225\uFF08\u30DE\u30B9\u30BF\u304B\u3089\u9078\u629E\uFF09
- detail: \u7D30\u5225\uFF08\u30DE\u30B9\u30BF\u304B\u3089\u9078\u629E\uFF09
- remarks: \u5099\u8003\uFF08\u30DE\u30B9\u30BF\u304B\u3089\u9078\u629E\u3001\u307E\u305F\u306F\u6570\u5024\u306E\u307F\uFF09
- station: \u6E2C\u70B9\uFF08\u9ED2\u677F\u304B\u3089\u8AAD\u307F\u53D6\u308C\u305F\u5834\u5408\uFF09
- description: \u5199\u771F\u306E\u8AAC\u660E
- reasoning: \u5206\u985E\u7406\u7531

\u51FA\u529B\u306FJSON\u914D\u5217\u306E\u307F\u3002\u8AAC\u660E\u4E0D\u8981\u3002
`.trim();
}
function parseJsonResponse(text, expectedCount, onLog) {
  onLog?.(`Raw response (${text.length} chars): ${text.substring(0, 500)}...`, "info");
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    onLog?.("Found JSON code block", "info");
    const parsed = JSON.parse(jsonMatch[1]);
    return Array.isArray(parsed) ? parsed : [parsed];
  }
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    onLog?.("Found JSON array", "info");
    return JSON.parse(arrayMatch[0]);
  }
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    onLog?.("Found JSON object", "info");
    const parsed = JSON.parse(objectMatch[0]);
    return Array.isArray(parsed) ? parsed : [parsed];
  }
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    onLog?.(`JSON parse failed: ${e}`, "error");
    onLog?.(`Full response: ${text}`, "error");
    throw new Error("Invalid JSON response from Claude");
  }
}
function mergeResults(rawData, classified) {
  return rawData.map((raw, index) => {
    const cls = classified.find((c) => c.fileName === raw.fileName) || classified[index] || {};
    return {
      fileName: raw.fileName,
      workType: cls.workType || "",
      variety: cls.variety || "",
      detail: cls.detail || "",
      station: cls.station || "",
      remarks: cls.remarks || "",
      remarksCategory: cls.remarks || "",
      remarksValue: "",
      description: cls.description || raw.sceneDescription,
      measurements: raw.measurements,
      hasBoard: raw.hasBoard,
      detectedText: raw.detectedText,
      reasoning: cls.reasoning || ""
    };
  });
}
async function saveToTempFile(photo) {
  const projectRoot2 = process.cwd();
  const tempDir = path4.join(projectRoot2, "temp-images");
  await fs3.mkdir(tempDir, { recursive: true });
  const tempPath = path4.join(tempDir, `gaspm_${Date.now()}_${photo.fileName}`);
  let base64Data = photo.base64;
  if (base64Data.includes(",")) {
    base64Data = base64Data.split(",")[1];
  }
  await fs3.writeFile(tempPath, Buffer.from(base64Data, "base64"));
  return tempPath;
}
async function cleanupTempFiles(paths) {
  for (const p of paths) {
    try {
      await fs3.unlink(p);
    } catch {
    }
  }
}
async function analyzePhotos(photos, options) {
  const {
    mode = "construction",
    batchSize = 5,
    parallelBatches = 3,
    // Step1を並列実行する数
    onLog,
    onProgress,
    onMetrics,
    shouldAbort,
    hierarchy,
    useYolo = false,
    yoloConfThreshold = 0.5
  } = options;
  const analysisStart = Date.now();
  const batchMetrics = [];
  const imageMetrics = [];
  const rawResponses = [];
  if (useYolo) {
    if (!isYoloAvailable()) {
      onLog?.("YOLO: \u30E2\u30C7\u30EB\u307E\u305F\u306F\u30B9\u30AF\u30EA\u30D7\u30C8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002YOLO\u524D\u51E6\u7406\u3092\u30B9\u30AD\u30C3\u30D7\u3057\u307E\u3059\u3002", "info");
    } else {
      const imagePaths = photos.map((p) => p.filePath).filter(Boolean);
      if (imagePaths.length > 0) {
        onLog?.(`YOLO\u524D\u51E6\u7406\u958B\u59CB: ${imagePaths.length}\u679A`, "info");
        const yoloStart = Date.now();
        try {
          const yoloResults = await runYoloDetection(imagePaths, {
            confThreshold: yoloConfThreshold
          });
          let detectCount = 0;
          for (const photo of photos) {
            if (photo.filePath && yoloResults.has(photo.filePath)) {
              photo.yoloDetections = yoloResults.get(photo.filePath);
              if (photo.yoloDetections && photo.yoloDetections.length > 0) {
                detectCount++;
              }
            }
          }
          const yoloDuration = Date.now() - yoloStart;
          onLog?.(`YOLO\u524D\u51E6\u7406\u5B8C\u4E86: ${formatDuration(yoloDuration)} (\u691C\u51FA\u3042\u308A: ${detectCount}\u679A)`, "success");
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : "Unknown error";
          onLog?.(`YOLO\u524D\u51E6\u7406\u30A8\u30E9\u30FC: ${errMsg}\uFF08\u7D9A\u884C\u3057\u307E\u3059\uFF09`, "error");
        }
      }
    }
  }
  onLog?.(`\u89E3\u6790\u958B\u59CB: ${photos.length}\u679A (${parallelBatches}\u4E26\u5217Step1 + \u7D71\u5408Step2)`, "info");
  onMetrics?.({ type: "analysis_start", totalImages: photos.length, mode });
  const batches = [];
  const numBatches = Math.min(parallelBatches, photos.length);
  const baseSize = Math.floor(photos.length / numBatches);
  const remainder = photos.length % numBatches;
  let offset = 0;
  for (let i = 0; i < numBatches; i++) {
    const size = baseSize + (i < remainder ? 1 : 0);
    batches.push(photos.slice(offset, offset + size));
    offset += size;
  }
  onLog?.(`Step1\u958B\u59CB: ${batches.length}\u30D0\u30C3\u30C1\u3092${parallelBatches}\u4E26\u5217\u3067\u5B9F\u884C`, "info");
  const step1Start = Date.now();
  const allTempPaths = [];
  const step1Tasks = batches.map(async (batch, batchIndex) => {
    checkAbort(shouldAbort, `Step1 \u30D0\u30C3\u30C1 ${batchIndex + 1}`);
    const batchStart = Date.now();
    const imageNames = batch.map((p) => p.fileName);
    onLog?.(`Step1 \u30D0\u30C3\u30C1${batchIndex + 1}/${batches.length} \u958B\u59CB (${batch.length}\u679A)`, "info");
    onMetrics?.({
      type: "batch_start",
      batchIndex,
      totalBatches: batches.length,
      imageCount: batch.length,
      images: imageNames
    });
    const tempPaths = [];
    for (const photo of batch) {
      if (photo.filePath) {
        tempPaths.push(photo.filePath);
      } else {
        const tempPath = await saveToTempFile(photo);
        tempPaths.push(tempPath);
        photo.filePath = tempPath;
      }
    }
    allTempPaths[batchIndex] = tempPaths;
    onMetrics?.({ type: "step_start", step: 1, batchIndex });
    const rawData = await executeStep1WithMetrics(batch, batchIndex, rawResponses, onLog, onMetrics, yoloConfThreshold);
    const duration = Date.now() - batchStart;
    onLog?.(`Step1 \u30D0\u30C3\u30C1${batchIndex + 1} \u5B8C\u4E86: ${formatDuration(duration)}`, "info");
    onMetrics?.({ type: "step_complete", step: 1, batchIndex, duration });
    return { batchIndex, rawData, duration, imageNames, batch };
  });
  const step1Results = await Promise.all(step1Tasks);
  step1Results.sort((a, b) => a.batchIndex - b.batchIndex);
  const step1TotalTime = Date.now() - step1Start;
  onLog?.(`Step1\u5168\u5B8C\u4E86: ${formatDuration(step1TotalTime)} (${batches.length}\u30D0\u30C3\u30C1)`, "success");
  let allResults = [];
  let step2TotalTime = 0;
  const allRawData = step1Results.flatMap((r) => r.rawData);
  if (mode === "construction" && hierarchy) {
    onLog?.(`Step2\u958B\u59CB: ${allRawData.length}\u4EF6\u3092\u4E00\u62EC\u7167\u5408`, "info");
    onMetrics?.({ type: "step_start", step: 2, batchIndex: 0 });
    const step2Start = Date.now();
    const classified = await executeStep2WithMetrics(allRawData, hierarchy, 0, rawResponses, onLog, onMetrics);
    step2TotalTime = Date.now() - step2Start;
    onLog?.(`Step2\u5B8C\u4E86: ${formatDuration(step2TotalTime)}`, "success");
    onMetrics?.({ type: "step_complete", step: 2, batchIndex: 0, duration: step2TotalTime });
    allResults = mergeResults(allRawData, classified);
  } else {
    allResults = allRawData.map((raw) => ({
      fileName: raw.fileName,
      workType: "",
      variety: "",
      detail: "",
      station: "",
      remarks: raw.photoCategory,
      remarksCategory: raw.photoCategory,
      remarksValue: "",
      description: raw.sceneDescription,
      measurements: raw.measurements,
      hasBoard: raw.hasBoard,
      detectedText: raw.detectedText,
      reasoning: ""
    }));
  }
  const analysisEnd = Date.now();
  const totalTime = analysisEnd - analysisStart;
  for (const r of step1Results) {
    const step2PerBatch = step2TotalTime / step1Results.length;
    batchMetrics.push({
      index: r.batchIndex,
      imageCount: r.batch.length,
      startTime: analysisStart,
      endTime: analysisEnd,
      step1Duration: r.duration,
      step2Duration: step2PerBatch,
      images: r.imageNames
    });
    const perImageStep1 = r.duration / r.batch.length;
    const perImageStep2 = step2PerBatch / r.batch.length;
    for (const photo of r.batch) {
      const result = allResults.find((res) => res.fileName === photo.fileName);
      imageMetrics.push({
        fileName: photo.fileName,
        step1Time: perImageStep1,
        step2Time: perImageStep2,
        totalTime: perImageStep1 + perImageStep2,
        status: "success"
      });
      if (result) {
        onMetrics?.({ type: "image_complete", fileName: photo.fileName, result });
        onProgress?.(imageMetrics.length, photos.length, photo.fileName, result);
      }
    }
    onMetrics?.({
      type: "batch_complete",
      batchIndex: r.batchIndex,
      duration: r.duration + step2PerBatch,
      step1Duration: r.duration,
      step2Duration: step2PerBatch
    });
  }
  for (let i = 0; i < allTempPaths.length; i++) {
    const tempPaths = allTempPaths[i];
    const batch = batches[i];
    const toCleanup = tempPaths.filter((p, j) => {
      const original = batch[j];
      return p !== original.filePath || p.includes("gaspm_");
    });
    await cleanupTempFiles(toCleanup);
  }
  const metrics = {
    mode,
    totalImages: photos.length,
    timestamps: { analysisStart, analysisEnd },
    batches: batchMetrics,
    perImage: imageMetrics,
    summary: {
      totalTime,
      avgTimePerImage: totalTime / photos.length,
      imagesPerSecond: photos.length / (totalTime / 1e3),
      successCount: imageMetrics.filter((m) => m.status === "success").length,
      errorCount: imageMetrics.filter((m) => m.status === "error").length,
      step1TotalTime,
      step2TotalTime
    },
    rawResponses
  };
  onLog?.(`\u89E3\u6790\u5B8C\u4E86: ${allResults.length}\u679A, \u5408\u8A08=${formatDuration(totalTime)} (Step1=${formatDuration(step1TotalTime)}, Step2=${formatDuration(step2TotalTime)})`, "success");
  onMetrics?.({ type: "analysis_complete", metrics });
  return allResults;
}
async function executeStep1WithMetrics(photos, batchIndex, rawResponses, onLog, onMetrics, yoloConfThreshold = 0.5) {
  const imagePaths = photos.map((p) => p.filePath).filter(Boolean);
  const prompt = buildStep1Prompt(photos, yoloConfThreshold);
  const start = Date.now();
  const response = runClaudeCode(prompt, imagePaths, onLog);
  const duration = Date.now() - start;
  let parseSuccess = true;
  let result;
  try {
    result = parseJsonResponse(response, photos.length, onLog);
  } catch {
    parseSuccess = false;
    throw new Error("Step1 JSON parse failed");
  }
  rawResponses.push({ step: "step1", batchIndex, response, parseSuccess, duration });
  onMetrics?.({ type: "raw_response", step: 1, batchIndex, response, duration });
  return result;
}
async function executeStep2WithMetrics(rawData, hierarchy, batchIndex, rawResponses, onLog, onMetrics) {
  const prompt = buildStep2Prompt(rawData, hierarchy);
  const start = Date.now();
  const response = runClaudeCode(prompt, void 0, onLog);
  const duration = Date.now() - start;
  let parseSuccess = true;
  let result;
  try {
    result = parseJsonResponse(response, rawData.length, onLog);
  } catch {
    parseSuccess = false;
    throw new Error("Step2 JSON parse failed");
  }
  rawResponses.push({ step: "step2", batchIndex, response, parseSuccess, duration });
  onMetrics?.({ type: "raw_response", step: 2, batchIndex, response, duration });
  return result;
}

// cli/server.ts
import { fileURLToPath } from "url";
var app = express();
var PORT = 3001;
app.use(cors());
app.use(express.json({ limit: "100mb" }));
var __dirname = path5.dirname(fileURLToPath(import.meta.url));
var projectRoot = path5.resolve(__dirname, "..");
app.use(express.static(projectRoot));
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
var sseClients = [];
function broadcastLog(msg, type = "info") {
  const data = JSON.stringify({ type, message: msg, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  sseClients.forEach((client) => {
    client.res.write(`data: ${data}

`);
  });
  console.log(`[API] ${type}: ${msg}`);
}
app.get("/api/logs", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  const clientId = Date.now().toString();
  sseClients.push({ id: clientId, res });
  res.write(`data: ${JSON.stringify({ type: "connected", message: "\u30ED\u30B0\u30B9\u30C8\u30EA\u30FC\u30E0\u63A5\u7D9A" })}

`);
  req.on("close", () => {
    const idx = sseClients.findIndex((c) => c.id === clientId);
    if (idx >= 0) sseClients.splice(idx, 1);
  });
});
app.post("/api/analyze", async (req, res) => {
  const startTime = Date.now();
  const body = req.body;
  broadcastLog(`\u89E3\u6790\u958B\u59CB - mode: ${body.mode || "construction"}`);
  try {
    let photoInputs;
    if (body.folderPath) {
      const folderPath = body.folderPath;
      try {
        const stat3 = await fs4.stat(folderPath);
        if (!stat3.isDirectory()) {
          return res.status(400).json({
            success: false,
            error: `Not a directory: ${folderPath}`
          });
        }
      } catch {
        return res.status(400).json({
          success: false,
          error: `Folder not found: ${folderPath}`
        });
      }
      broadcastLog(`\u30D5\u30A9\u30EB\u30C0\u30B9\u30AD\u30E3\u30F3: ${folderPath}`);
      const imagePaths = await scanFolder(folderPath, { recursive: false });
      if (imagePaths.length === 0) {
        return res.json({
          success: true,
          results: [],
          timing: { total: Date.now() - startTime }
        });
      }
      broadcastLog(`\u753B\u50CF\u51E6\u7406\u4E2D: ${imagePaths.length}\u679A`);
      const imageInfos = await processImages(imagePaths, {});
      photoInputs = imageInfos.map((info, index) => ({
        fileName: info.fileName,
        base64: info.base64,
        mimeType: info.mimeType,
        date: info.date,
        filePath: imagePaths[index]
      }));
    } else if (body.photos && body.photos.length > 0) {
      photoInputs = body.photos.map((p) => ({
        fileName: p.fileName,
        base64: p.base64,
        mimeType: p.mimeType,
        date: p.date
      }));
    } else {
      return res.status(400).json({
        success: false,
        error: "Either folderPath or photos must be provided"
      });
    }
    let hierarchy;
    if (body.mode !== "general") {
      try {
        hierarchy = await getMergedHierarchy();
        broadcastLog("\u5DE5\u7A2E\u30DE\u30B9\u30BF\u8AAD\u307F\u8FBC\u307F\u5B8C\u4E86");
      } catch {
        broadcastLog("\u5DE5\u7A2E\u30DE\u30B9\u30BF\u306A\u3057", "warning");
      }
    }
    broadcastLog(`AI\u89E3\u6790\u958B\u59CB: ${photoInputs.length}\u679A`);
    const results = await analyzePhotos(photoInputs, {
      mode: body.mode || "construction",
      instruction: body.instruction,
      batchSize: body.batchSize || 5,
      hierarchy,
      onLog: (msg, type) => {
        broadcastLog(msg, type);
      }
    });
    const outputData = photoInputs.map((photo, index) => {
      const analysis = results.find((r) => r.fileName === photo.fileName) || results[index];
      return {
        fileName: photo.fileName,
        mimeType: photo.mimeType,
        date: photo.date,
        base64: photo.base64,
        analysis
      };
    });
    const totalTime = Date.now() - startTime;
    broadcastLog(`\u89E3\u6790\u5B8C\u4E86: ${results.length}\u679A (${totalTime}ms)`, "success");
    res.json({
      success: true,
      results: outputData,
      timing: { total: totalTime }
    });
  } catch (error) {
    broadcastLog(`\u30A8\u30E9\u30FC: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});
app.get("/api/folder", async (req, res) => {
  const folderPath = req.query.path;
  if (!folderPath) {
    return res.status(400).json({ error: "path query parameter required" });
  }
  try {
    const entries = await fs4.readdir(folderPath, { withFileTypes: true });
    const items = entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      path: path5.join(folderPath, entry.name)
    }));
    res.json({ items });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to read folder"
    });
  }
});
app.listen(PORT, () => {
  console.log(`
\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
\u2551  GASPhotoAIManager API Server              \u2551
\u2551  http://localhost:${PORT}                     \u2551
\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563
\u2551  Endpoints:                                \u2551
\u2551    GET  /api/health   - Health check       \u2551
\u2551    POST /api/analyze  - Photo analysis     \u2551
\u2551    GET  /api/folder   - List folder        \u2551
\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D
`);
});
