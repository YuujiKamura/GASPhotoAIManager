import React from 'react';

interface CustomLayerProps {
  customInstruction: string;
  saveCustomInstruction: (value: string) => void;
}

export const CustomLayer: React.FC<CustomLayerProps> = ({ customInstruction, saveCustomInstruction }) => (
  <div className="space-y-2">
    <textarea
      value={customInstruction}
      onChange={(e) => saveCustomInstruction(e.target.value)}
      placeholder="追加の指示を入力（例: 北区桜町の写真です。測点をNo.1からNo.10としてください。）"
      className="w-full h-32 text-sm border rounded p-2 resize-none"
    />
    <div className="text-xs text-gray-500">この指示は全ての解析に適用されます</div>
  </div>
);
