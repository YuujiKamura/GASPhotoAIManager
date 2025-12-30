import React from 'react';
import { Check, MessageCircle } from 'lucide-react';

interface PhotoGridItemProps {
  thumbnail: string | null;
  filename: string;
  selected: boolean;
  onToggleSelect: () => void;
  onInteractiveTest: () => void;
}

export const PhotoGridItem: React.FC<PhotoGridItemProps> = ({
  thumbnail,
  filename,
  selected,
  onToggleSelect,
  onInteractiveTest,
}) => (
  <div
    className={`relative aspect-square rounded border-2 cursor-pointer overflow-hidden group ${
      selected ? 'border-blue-500' : 'border-gray-200 opacity-50'
    }`}
  >
    {thumbnail && (
      <img src={thumbnail} alt="" className="w-full h-full object-cover" />
    )}
    {/* Checkbox */}
    <button
      onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
      className={`absolute top-1 left-1 w-5 h-5 rounded flex items-center justify-center ${
        selected ? 'bg-blue-500 text-white' : 'bg-white/80 border'
      }`}
    >
      {selected && <Check className="w-3 h-3" />}
    </button>
    {/* Interactive button */}
    <button
      onClick={onInteractiveTest}
      className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
    >
      <MessageCircle className="w-6 h-6 text-white drop-shadow" />
    </button>
    {/* Filename */}
    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] px-1 truncate">
      {filename}
    </div>
  </div>
);
