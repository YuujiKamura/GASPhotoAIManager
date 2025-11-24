import React from 'react';
import { PhotoRecord } from '../types';

interface Props {
  records: PhotoRecord[];
}

const PhotoAlbumView: React.FC<Props> = ({ records }) => {
  // Group by 3 for pages
  const chunks = [];
  for (let i = 0; i < records.length; i += 3) {
    chunks.push(records.slice(i, i + 3));
  }

  if (records.length === 0) {
    return (
      <div className="text-center text-gray-500 p-10">
        No photos to display.
      </div>
    );
  }

  return (
    // id="album-content" is targeted by html2pdf in App.tsx
    <div id="album-content" className="w-full flex flex-col items-center bg-transparent">
      {chunks.map((chunk, pageIndex) => (
        // sheet-preview class makes it look like paper on screen
        <div key={pageIndex} className="sheet-preview py-[10mm] px-[10mm] flex flex-col items-center box-border bg-white">
          
          {/* Page Header */}
          <div className="w-full flex justify-between items-end border-b-4 border-gray-800 mb-4 pb-1">
            <h1 className="text-2xl font-black text-gray-900 tracking-wide">
              工事写真帳
            </h1>
            <span className="text-base text-gray-600 font-bold">Page {pageIndex + 1}</span>
          </div>
          
          {/* Photos Container */}
          <div className="flex-1 w-full flex flex-col justify-start gap-4">
            {chunk.map((photo, idx) => (
              // 3 photos per page, fixed height
              <div key={`${pageIndex}-${idx}`} className="flex h-[88mm] w-full box-border avoid-break">
                
                {/* Photo Area (Left) */}
                <div className="w-[72%] h-full flex items-center justify-center relative bg-gray-50 overflow-hidden">
                  <img 
                    src={photo.base64} 
                    alt={photo.fileName} 
                    className="max-w-full max-h-full object-contain" 
                  />
                  {/* Status Indicator */}
                  {photo.status !== 'done' && (
                    <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
                       <span className="bg-white/90 px-3 py-1 rounded text-sm font-semibold shadow text-gray-700 animate-pulse">
                         {photo.status === 'processing' ? 'AI Analyzing...' : 'Waiting...'}
                       </span>
                    </div>
                  )}
                </div>
                
                {/* Metadata Area (Right) */}
                <div className="w-[28%] h-full flex flex-col pl-3 justify-center text-sm">
                  <div className="flex flex-col h-full border border-gray-200 rounded-sm">
                    
                    {/* Work Type */}
                    <div className="flex flex-col border-b border-gray-200">
                      <div className="bg-gray-100 text-xs font-bold text-gray-600 px-2 py-0.5">工種</div>
                      <div className="px-2 py-1 font-bold text-gray-900 leading-tight">
                        {photo.analysis?.workType || "---"}
                      </div>
                    </div>
                    
                    {/* Station */}
                    <div className="flex flex-col border-b border-gray-200">
                      <div className="bg-gray-100 text-xs font-bold text-gray-600 px-2 py-0.5">測点</div>
                      <div className="px-2 py-1 font-bold text-gray-800 font-mono">
                        {photo.analysis?.station || "---"}
                      </div>
                    </div>

                    {/* Remarks (New) */}
                    <div className="flex flex-col border-b border-gray-200 bg-yellow-50/30">
                      <div className="bg-gray-100 text-xs font-bold text-gray-600 px-2 py-0.5">備考</div>
                      <div className="px-2 py-1 text-gray-800 font-medium whitespace-pre-wrap">
                        {photo.analysis?.remarks || "---"}
                      </div>
                    </div>
                    
                    {/* Description */}
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="bg-gray-100 text-xs font-bold text-gray-600 px-2 py-0.5">記事</div>
                      <div className="px-2 py-1 text-gray-700 leading-snug whitespace-pre-wrap break-all overflow-hidden">
                        {photo.analysis?.description || "---"}
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {/* Footer */}
          <div className="absolute bottom-3 right-6 text-[10px] text-gray-400">
             Captions & Classification by AI
          </div>
        </div>
      ))}
    </div>
  );
};

export default PhotoAlbumView;