#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

// Configuration
const API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyAoCXGQwsAHX8u-UrIQTLrMrW02pLEb7hw';
const TEST_DIR = process.argv[2] || 'H:/マイドライブ/〇東区市道（2工区）舗装補修工事（水防等含）（単価契約）/20251028小山4丁目/着手前、小山4丁目-6';

console.log('========================================');
console.log('Photo Pairing Test Tool');
console.log('========================================');
console.log(`Target Directory: ${TEST_DIR}`);
console.log('');

// Helper function to encode image to base64
function imageToBase64(filePath) {
  const bitmap = fs.readFileSync(filePath);
  return Buffer.from(bitmap).toString('base64');
}

// Helper function to get date from filename or file stats
function getPhotoDate(filePath, fileName) {
  // Try to parse from filename first (e.g., 20251031_150054.jpg)
  const match = fileName.match(/(\d{8})_(\d{6})/);
  if (match) {
    const year = match[1].substr(0, 4);
    const month = match[1].substr(4, 2);
    const day = match[1].substr(6, 2);
    const hour = match[2].substr(0, 2);
    const min = match[2].substr(2, 2);
    const sec = match[2].substr(4, 2);
    return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`).getTime();
  }

  // Fall back to file modified time
  const stats = fs.statSync(filePath);
  return stats.mtime.getTime();
}

// Main function
async function testPairing() {
  try {
    // 1. Read all image files
    console.log('Step 1: Reading image files...');
    const files = fs.readdirSync(TEST_DIR)
      .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
      .slice(0, 10); // Limit to 10 files for testing

    console.log(`Found ${files.length} image files`);

    if (files.length === 0) {
      console.error('No image files found!');
      return;
    }

    // 2. Prepare photo records
    const photos = files.map(fileName => {
      const filePath = path.join(TEST_DIR, fileName);
      return {
        fileName,
        filePath,
        date: getPhotoDate(filePath, fileName),
        base64: `data:image/jpeg;base64,${imageToBase64(filePath)}`,
        mimeType: 'image/jpeg'
      };
    });

    // Sort by date
    photos.sort((a, b) => a.date - b.date);

    console.log('\nPhotos to process:');
    photos.forEach(p => {
      const date = new Date(p.date);
      console.log(`  - ${p.fileName} (${date.toLocaleString('ja-JP')})`);
    });

    // 3. Call Gemini API for scene detection
    console.log('\nStep 2: Calling Gemini API for scene detection...');
    const genAI = new GoogleGenAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
建設現場の定点撮影写真を分析してください。

以下の写真を見て、同じ撮影地点から撮られた写真をグループ化し、
各写真の工事段階（着手前/完了/施工中）を判定してください。

出力形式（JSON）:
{
  "photos": [
    {
      "fileName": "ファイル名",
      "sceneId": "場所ID（同じ場所ならS1, S2など同じIDを付ける）",
      "phase": "before/after/status",
      "description": "簡単な説明"
    }
  ]
}

写真リスト: ${photos.map(p => p.fileName).join(', ')}
`;

    // Prepare image parts for API
    const parts = [{ text: prompt }];
    photos.forEach(p => {
      const base64Data = p.base64.split(',')[1];
      parts.push({
        inlineData: {
          mimeType: p.mimeType,
          data: base64Data
        }
      });
    });

    const result = await model.generateContent(parts);
    const response = await result.response;
    const text = response.text();

    console.log('API Response received');

    // Parse JSON from response
    let analysis;
    try {
      // Extract JSON from response (might be wrapped in ```json...```)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (e) {
      console.error('Failed to parse API response:', e.message);
      console.log('Raw response:', text);
      return;
    }

    // 4. Group photos by scene
    console.log('\nStep 3: Grouping photos by scene...');
    const groups = {};

    analysis.photos.forEach(photo => {
      const sceneId = photo.sceneId || 'UNKNOWN';
      if (!groups[sceneId]) {
        groups[sceneId] = [];
      }

      // Find the original photo data
      const original = photos.find(p => p.fileName === photo.fileName);
      if (original) {
        groups[sceneId].push({
          ...original,
          ...photo
        });
      }
    });

    // 5. Create pairs
    console.log('\nStep 4: Creating before-after pairs...');
    const pairs = [];

    Object.entries(groups).forEach(([sceneId, groupPhotos]) => {
      console.log(`\nScene ${sceneId}: ${groupPhotos.length} photos`);

      if (groupPhotos.length < 2) {
        console.log('  -> Not enough photos for a pair');
        return;
      }

      // Sort by date
      groupPhotos.sort((a, b) => a.date - b.date);

      // Find before and after photos
      let beforePhoto = groupPhotos.find(p => p.phase === 'before') || groupPhotos[0];
      let afterPhoto = groupPhotos.find(p => p.phase === 'after') || groupPhotos[groupPhotos.length - 1];

      if (beforePhoto && afterPhoto && beforePhoto.fileName !== afterPhoto.fileName) {
        pairs.push({
          sceneId,
          before: beforePhoto,
          after: afterPhoto
        });

        console.log(`  -> Pair created:`);
        console.log(`     Before: ${beforePhoto.fileName} (${beforePhoto.description || 'N/A'})`);
        console.log(`     After:  ${afterPhoto.fileName} (${afterPhoto.description || 'N/A'})`);
      } else {
        console.log('  -> Could not create a valid pair');
      }
    });

    // 6. Summary
    console.log('\n========================================');
    console.log('SUMMARY');
    console.log('========================================');
    console.log(`Total photos processed: ${photos.length}`);
    console.log(`Scenes identified: ${Object.keys(groups).length}`);
    console.log(`Pairs created: ${pairs.length}`);

    if (pairs.length > 0) {
      console.log('\nFinal pairs for photo album:');
      pairs.forEach((pair, idx) => {
        console.log(`\nPair ${idx + 1} (Scene ${pair.sceneId}):`);
        console.log(`  [着手前] ${pair.before.fileName}`);
        console.log(`  [竣工]   ${pair.after.fileName}`);
      });
    }

  } catch (error) {
    console.error('\nError:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

// Run the test
testPairing();