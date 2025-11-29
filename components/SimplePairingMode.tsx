import React, { useState } from 'react';
import { Upload, Camera } from 'lucide-react';

interface SimplePairingModeProps {
  onPairingComplete: (pairs: any[]) => void;
}

/**
 * シンプルなペアリング専用モード
 * 個別解析をスキップして、直接ペアリング処理を行う
 */
const SimplePairingMode: React.FC<SimplePairingModeProps> = ({ onPairingComplete }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setUploadedFiles(prev => [...prev, ...files]);
  };

  const handleDirectPairing = async () => {
    setIsProcessing(true);

    try {
      // 1. 画像を準備（base64エンコード）
      const photoData = await Promise.all(
        uploadedFiles.map(async (file) => {
          const base64 = await fileToBase64(file);
          return {
            fileName: file.name,
            base64,
            mimeType: file.type,
            date: file.lastModified
          };
        })
      );

      // 2. 一括でペアリング処理
      // シーン識別と着手前/完了の判定を同時に行う
      const response = await fetch('/api/pairing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photos: photoData,
          mode: 'construction_pairing'
        })
      });

      const pairs = await response.json();

      // 3. ペアリング結果を返す
      onPairingComplete(pairs);

    } catch (error) {
      console.error('Pairing failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">
        工事写真ペアリングモード
      </h2>

      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        <Camera className="w-16 h-16 mx-auto mb-4 text-gray-400" />

        <p className="mb-4 text-gray-600">
          着手前と完了後の写真をまとめてアップロードしてください
        </p>

        <label className="cursor-pointer">
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <div className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            <Upload className="w-5 h-5 mr-2" />
            写真を選択
          </div>
        </label>
      </div>

      {uploadedFiles.length > 0 && (
        <div className="mt-4">
          <p className="text-sm text-gray-600 mb-2">
            {uploadedFiles.length}枚の写真がアップロードされました
          </p>

          <button
            onClick={handleDirectPairing}
            disabled={isProcessing}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            {isProcessing ? 'ペアリング中...' : 'ペアリングを開始'}
          </button>
        </div>
      )}

      {isProcessing && (
        <div className="mt-4 p-4 bg-blue-50 rounded">
          <p className="text-blue-800">
            写真を解析してペアを作成しています...
          </p>
          <p className="text-sm text-blue-600 mt-2">
            • 同じ場所の識別
            • 着手前/完了の判定
            • ペアの作成
          </p>
        </div>
      )}
    </div>
  );
};

export default SimplePairingMode;