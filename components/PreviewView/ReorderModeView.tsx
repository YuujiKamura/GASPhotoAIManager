import React from 'react';
import { ArrowUpDown } from 'lucide-react';
import { PhotoRecord } from '../../types';
import { PhotoGroup } from '../../hooks/useReorderMode';

interface ReorderModeViewProps {
  lang: 'en' | 'ja';
  reorderType: 'group' | 'single';
  reorderedGroups: PhotoGroup[];
  reorderedSinglePhotos: PhotoRecord[];
  draggedGroupIndex: number | null;
  draggedPhotoIndex: number | null;
  setReorderType: (type: 'group' | 'single') => void;
  onGroupDragStart: (index: number) => void;
  onGroupDragOver: (e: React.DragEvent, index: number) => void;
  onGroupDragEnd: () => void;
  onPhotoDragStart: (index: number) => void;
  onPhotoDragOver: (e: React.DragEvent, index: number) => void;
  onPhotoDragEnd: () => void;
}

const ReorderModeView: React.FC<ReorderModeViewProps> = ({
  lang,
  reorderType,
  reorderedGroups,
  reorderedSinglePhotos,
  draggedGroupIndex,
  draggedPhotoIndex,
  setReorderType,
  onGroupDragStart,
  onGroupDragOver,
  onGroupDragEnd,
  onPhotoDragStart,
  onPhotoDragOver,
  onPhotoDragEnd
}) => {
  return (
    <div className="w-full max-w-4xl">
      {/* Mode Toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setReorderType('group')}
          className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
            reorderType === 'group'
              ? 'bg-orange-500 text-white'
              : 'bg-white text-gray-600 hover:bg-orange-100'
          }`}
        >
          {lang === 'ja' ? '細別グループ' : 'By Group'}
        </button>
        <button
          onClick={() => setReorderType('single')}
          className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
            reorderType === 'single'
              ? 'bg-blue-500 text-white'
              : 'bg-white text-gray-600 hover:bg-blue-100'
          }`}
        >
          {lang === 'ja' ? '1枚ずつ' : 'Individual'}
        </button>
      </div>

      {/* Instructions */}
      <div className={`rounded-lg p-3 mb-4 text-sm ${
        reorderType === 'group' ? 'bg-orange-100 border border-orange-300 text-orange-800' : 'bg-blue-100 border border-blue-300 text-blue-800'
      }`}>
        <ArrowUpDown className="w-4 h-4 inline mr-2" />
        {reorderType === 'group'
          ? (lang === 'ja' ? '細別グループをドラッグして並べ替え' : 'Drag groups to reorder')
          : (lang === 'ja' ? '写真を1枚ずつドラッグして並べ替え' : 'Drag individual photos to reorder')}
      </div>

      {reorderType === 'group' ? (
        <GroupReorderList
          groups={reorderedGroups}
          draggedIndex={draggedGroupIndex}
          onDragStart={onGroupDragStart}
          onDragOver={onGroupDragOver}
          onDragEnd={onGroupDragEnd}
        />
      ) : (
        <PhotoReorderGrid
          photos={reorderedSinglePhotos}
          draggedIndex={draggedPhotoIndex}
          onDragStart={onPhotoDragStart}
          onDragOver={onPhotoDragOver}
          onDragEnd={onPhotoDragEnd}
        />
      )}
    </div>
  );
};

interface GroupReorderListProps {
  groups: PhotoGroup[];
  draggedIndex: number | null;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
}

const GroupReorderList: React.FC<GroupReorderListProps> = ({
  groups,
  draggedIndex,
  onDragStart,
  onDragOver,
  onDragEnd
}) => (
  <div className="flex flex-col gap-2">
    {groups.map((group, index) => (
      <div
        key={group.detail}
        draggable
        onDragStart={() => onDragStart(index)}
        onDragOver={(e) => onDragOver(e, index)}
        onDragEnd={onDragEnd}
        className={`bg-white rounded-lg shadow-md overflow-hidden cursor-grab active:cursor-grabbing transition-all flex items-center ${
          draggedIndex === index ? 'ring-2 ring-orange-500 scale-[1.02] opacity-75' : 'hover:shadow-lg'
        }`}
      >
        <div className="w-12 h-full bg-orange-500 text-white flex items-center justify-center font-bold text-lg flex-shrink-0">
          {index + 1}
        </div>
        <div className="w-24 h-16 flex-shrink-0 grid grid-cols-2 grid-rows-2 gap-0.5 p-1 bg-gray-100">
          {group.photos.slice(0, 4).map((photo) => (
            <img key={photo.fileName} src={photo.base64} alt="" className="w-full h-full object-cover pointer-events-none" />
          ))}
        </div>
        <div className="flex-1 px-4 py-2">
          <div className="font-bold text-gray-800 text-base">{group.detail}</div>
          <div className="text-gray-500 text-sm">{group.photos.length}枚</div>
        </div>
        <div className="px-4 text-gray-400">
          <ArrowUpDown className="w-5 h-5" />
        </div>
      </div>
    ))}
  </div>
);

interface PhotoReorderGridProps {
  photos: PhotoRecord[];
  draggedIndex: number | null;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
}

const PhotoReorderGrid: React.FC<PhotoReorderGridProps> = ({
  photos,
  draggedIndex,
  onDragStart,
  onDragOver,
  onDragEnd
}) => (
  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
    {photos.map((photo, index) => (
      <div
        key={photo.fileName}
        draggable
        onDragStart={() => onDragStart(index)}
        onDragOver={(e) => onDragOver(e, index)}
        onDragEnd={onDragEnd}
        className={`relative bg-white rounded-lg shadow-md overflow-hidden cursor-grab active:cursor-grabbing transition-all ${
          draggedIndex === index ? 'ring-2 ring-blue-500 scale-105 opacity-75' : 'hover:shadow-lg hover:scale-[1.02]'
        }`}
      >
        <div className="absolute top-1 left-1 bg-blue-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow">
          {index + 1}
        </div>
        <img src={photo.base64} alt={photo.fileName} className="w-full aspect-square object-cover pointer-events-none" />
        <div className="p-1 text-xs truncate text-gray-600 bg-gray-50">
          {photo.analysis?.detail || photo.analysis?.remarks || photo.fileName}
        </div>
      </div>
    ))}
  </div>
);

export default ReorderModeView;
