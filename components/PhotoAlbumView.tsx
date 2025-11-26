
import React from 'react';
import { PhotoRecord, AppMode, AIAnalysisResult } from '../types';
import { TRANS } from '../utils/translations';
import { Database } from 'lucide-react';

interface Props {
  records: PhotoRecord[];
  appMode: AppMode;
  lang: 'en' | 'ja';
  onUpdatePhoto: (fileName: string, field: keyof AIAnalysisResult, value: string) => void;
}

/**
 * A field that is an Input/Textarea on screen (for editing),
 * but becomes a plain Div in PDF mode (for proper text wrapping/rendering).
 */
const EditableField = ({ 
  value, 
  onChange, 
  multiline = false, 
  align = 'left' 
}: {
  value: string;
  onChange: (val: string) => void;
  multiline?: boolean;
  align?: 'left' | 'center';
}) => {
  // Unified typography: text-lg, text-gray-900, tight leading
  const baseClass = "w-full h-full bg-transparent border-none outline-none focus:bg-yellow-50 focus:ring-1 focus:ring-amber-300 text-gray-900 hover:bg-black/5 rounded-sm transition-colors text-lg leading-tight font-normal block";
  const alignClass = align === 'center' ? 'text-center' : 'text-left';
  // Minimal padding to fit text-lg in h-[28px] rows
  const paddingClass = multiline ? 'p-1' : 'px-1 py-0.5'; 
  
  return (
    <div className="relative w-full h-full group overflow-hidden">
      {/* Screen Mode: Editable Input */}
      <div className="pdf-hidden w-full h-full">
        {multiline ? (
          <textarea 
            value={value} 
            onChange={(e) => onChange(e.target.value)}
            className={`${baseClass} resize-none [&::-webkit-scrollbar]:hidden ${alignClass} ${paddingClass}`}
          />
        ) : (
          <input 
            type="text" 
            value={value} 
            onChange={(e) => onChange(e.target.value)}
            className={`${baseClass} ${alignClass} ${paddingClass}`}
          />
        )}
      </div>

      {/* PDF/Print Mode: Static Text */}
      <div className={`pdf-visible hidden w-full h-full text-lg text-gray-900 leading-tight break-words whitespace-pre-wrap font-normal ${alignClass} ${paddingClass}`}>
        {value}
      </div>
    </div>
  );
};

interface InfoRowProps {
  label: string;
  value: string;
  className?: string; // Handles height and borders
  onChange: (val: string) => void;
  align?: 'left' | 'center';
  multiline?: boolean;
  readOnly?: boolean;
  children?: React.ReactNode; 
}

const InfoRow = ({ label, value, className = "", onChange, align, multiline = false, readOnly = false, children }: InfoRowProps) => (
  // Use className for height control
  <div className={`flex border-b border-gray-300 last:border-b-0 box-border w-full ${className}`}>
    {/* Label: Fixed width w-12 (48px) - Just enough for 2 chars */}
    <div className={`w-12 flex justify-center text-lg text-gray-900 font-normal flex-shrink-0 leading-tight px-0.5 text-center select-none bg-gray-50/50 border-r border-gray-300 ${multiline ? 'items-start pt-1' : 'items-center'}`}>
       {label}
    </div>
    {/* Content Area */}
    <div className="flex-1 relative min-w-0 bg-white h-full overflow-hidden">
       {readOnly ? (
         <div className="w-full h-full px-1 py-0.5 flex items-center justify-between text-lg text-gray-900 leading-tight font-normal">
           <span className="truncate">{value}</span>
           {children}
         </div>
       ) : (
         <EditableField 
            value={value} 
            onChange={onChange} 
            multiline={multiline} 
            align={align} 
         />
       )}
    </div>
  </div>
);

const PhotoAlbumView: React.FC<Props> = ({ records, appMode, lang, onUpdatePhoto }) => {
  const txt = TRANS[lang];
  const PHOTOS_PER_PAGE = 3;
  const totalPages = Math.ceil(records.length / PHOTOS_PER_PAGE);

  return (
    <div id="album-content" className="w-full">
       {Array.from({ length: totalPages }).map((_, pageIndex) => (
         <div key={pageIndex} className="sheet-preview px-12 py-6 mb-8 relative flex flex-col box-border h-[297mm]">
           
           {/* Page Header */}
           <div className="flex justify-between items-end mb-2 w-full flex-shrink-0">
             <h1 className="text-xl font-bold text-gray-900 border-b-2 border-gray-900 leading-none pb-1 px-1">
               {appMode === 'construction' ? '工事写真帳' : 'Photo Album'}
             </h1>
             <div className="text-sm font-bold text-gray-800">
               Page <span className="text-lg">{pageIndex + 1}</span>
             </div>
           </div>

           {/* Main Content Border Box - Flex 1 ensures it fills the page */}
           <div className="flex flex-col flex-1 border border-gray-400 bg-white min-h-0">
             {Array.from({ length: PHOTOS_PER_PAGE }).map((_, slotIndex) => {
               const photoIndex = pageIndex * PHOTOS_PER_PAGE + slotIndex;
               const record = records[photoIndex];
               
               if (!record) {
                 return <div key={`empty-${slotIndex}`} className="flex-1 border-b border-gray-300 last:border-b-0 flex"></div>;
               }

               const dateStr = record.date 
                 ? new Date(record.date).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) 
                 : '';

               return (
                 <div key={record.fileName} className="flex-1 border-b border-gray-300 last:border-b-0 flex h-[33.33%] box-border min-h-0">
                   {/* Left: Image (65%) */}
                   <div className="w-[65%] border-r border-gray-300 flex items-center justify-center bg-white relative overflow-hidden group">
                      <img src={record.base64} alt={record.fileName} className="max-w-full max-h-full object-contain" />
                      
                      {record.fromCache && (
                        <div className="absolute top-2 left-2 bg-green-100/90 text-green-800 px-2 py-1 rounded shadow-sm border border-green-300 flex items-center gap-1.5 z-10 pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity">
                          <Database className="w-4 h-4" />
                          <span className="text-xs font-bold font-sans">Cached</span>
                        </div>
                      )}
                   </div>

                   {/* Right: Info (35%) - Flex Column */}
                   <div className="w-[35%] flex flex-col h-full bg-white">
                      
                      {/* 1. Date (Top) - Ultra Compact 28px */}
                      <InfoRow 
                         label={txt.labelDate} 
                         value={dateStr} 
                         className="h-[28px] flex-shrink-0"
                         onChange={() => {}} 
                         readOnly
                      >
                         {record.fromCache && (
                            <div className="flex items-center gap-1 text-[10px] text-green-600 font-bold bg-green-50 px-1 rounded border border-green-200" title="Restored from local cache">
                               <Database className="w-3 h-3" />
                            </div>
                         )}
                      </InfoRow>

                      {/* 2. Work Type */}
                      <InfoRow 
                         label={txt.labelWorkType} 
                         value={record.analysis?.workType || ''} 
                         className="h-[28px] flex-shrink-0"
                         onChange={(v) => onUpdatePhoto(record.fileName, 'workType', v)}
                      />
                      {/* 3. Variety */}
                      <InfoRow 
                         label={txt.labelVariety} 
                         value={record.analysis?.variety || ''} 
                         className="h-[28px] flex-shrink-0"
                         onChange={(v) => onUpdatePhoto(record.fileName, 'variety', v)}
                      />
                      {/* 4. Detail */}
                      <InfoRow 
                         label={txt.labelDetail} 
                         value={record.analysis?.detail || ''} 
                         className="h-[28px] flex-shrink-0"
                         onChange={(v) => onUpdatePhoto(record.fileName, 'detail', v)}
                      />
                      {/* 5. Station */}
                      <InfoRow 
                         label={txt.labelStation} 
                         value={record.analysis?.station || ''} 
                         className="h-[28px] flex-shrink-0"
                         onChange={(v) => onUpdatePhoto(record.fileName, 'station', v)}
                      />
                      
                      {/* 6. Remarks - Expanded to 64px (approx 3 lines) */}
                      <InfoRow 
                         label={txt.labelRemarks} 
                         value={record.analysis?.remarks || ''} 
                         className="h-[64px] flex-shrink-0"
                         onChange={(v) => onUpdatePhoto(record.fileName, 'remarks', v)}
                         multiline
                      />
                      
                      {/* 7. Description - Takes ALL remaining space (approx 150px+) */}
                      <InfoRow 
                         label={txt.labelDescription} 
                         value={record.analysis?.description || ''} 
                         className="flex-1 min-h-0 border-b-0"
                         onChange={(v) => onUpdatePhoto(record.fileName, 'description', v)}
                         multiline
                      />
                   </div>
                 </div>
               );
             })}
           </div>
         </div>
       ))}
    </div>
  );
};

export default PhotoAlbumView;
