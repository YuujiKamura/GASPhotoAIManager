import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PhotoRecord, AppMode, AIAnalysisResult } from '../types';
import { TRANS } from '../utils/translations';
import { Database, Trash2 } from 'lucide-react';
import { LAYOUT_FIELDS } from '../utils/layoutConfig';

interface Props {
  records: PhotoRecord[];
  appMode: AppMode;
  lang: 'en' | 'ja';
  photosPerPage: 2 | 3;
  onUpdatePhoto: (fileName: string, field: keyof AIAnalysisResult, value: string) => void;
  onDeletePhoto?: (fileName: string) => void;
}

/**
 * A field that is an Input/Textarea on screen (for editing),
 * but becomes a plain Div in PDF mode (for proper text wrapping/rendering).
 */
const EditableField = ({ 
  value, 
  onChange, 
  multiline = false, 
  align = 'left',
  textClass = "text-lg text-gray-900"
}: {
  value: string;
  onChange: (val: string) => void;
  multiline?: boolean;
  align?: 'left' | 'center';
  textClass?: string;
}) => {
  // Unified typography: text-lg, text-gray-900, tight leading
  const baseClass = `w-full h-full bg-transparent border-none outline-none focus:bg-yellow-50 focus:ring-1 focus:ring-amber-300 hover:bg-black/5 rounded-sm transition-colors leading-tight font-normal block ${textClass}`;
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
      <div className={`pdf-visible hidden w-full h-full leading-tight break-words whitespace-pre-wrap font-normal ${alignClass} ${paddingClass} ${textClass}`}>
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
  hideLabel?: boolean; // New prop to toggle label visibility
  textClass?: string;
  children?: React.ReactNode; 
}

const InfoRow: React.FC<InfoRowProps> = ({ label, value, className = "", onChange, align = 'left', multiline = false, readOnly = false, hideLabel = false, textClass, children }) => (
  // Use className for height control
  <div className={`flex border-b border-gray-300 last:border-b-0 box-border w-full ${className}`}>
    {/* Label: Fixed width w-12 (48px) - Only render if not hidden */}
    {!hideLabel && (
      <div className={`w-12 flex justify-center text-lg text-gray-900 font-normal flex-shrink-0 leading-tight px-0.5 text-center select-none bg-gray-50/50 border-r border-gray-300 ${multiline ? 'items-start pt-1' : 'items-center'}`}>
         {label}
      </div>
    )}
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
            align={align as 'left' | 'center'} 
            textClass={textClass}
         />
       )}
    </div>
  </div>
);

type ContextMenuState = {
  x: number;
  y: number;
  targetFileName: string;
} | null;

const PhotoAlbumView: React.FC<Props> = ({ records, appMode, lang, photosPerPage, onUpdatePhoto, onDeletePhoto }) => {
  const txt = TRANS[lang];
  const totalPages = Math.ceil(records.length / photosPerPage);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    window.addEventListener('click', handleClickOutside);
    window.addEventListener('resize', handleClickOutside); // Close on resize too
    return () => {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('resize', handleClickOutside);
    };
  }, []);

  const handleContextMenu = (e: React.MouseEvent, fileName: string) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      targetFileName: fileName
    });
  };

  const executeDelete = () => {
    if (contextMenu && onDeletePhoto) {
      onDeletePhoto(contextMenu.targetFileName);
      setContextMenu(null);
    }
  };

  const isTwoUp = photosPerPage === 2;

  // Fields Config
  // 3-up: All Fields
  // 2-up: Only Remarks, Station (in that order)
  const visibleFields = isTwoUp
    ? [
        LAYOUT_FIELDS.find(f => f.key === 'remarks')!,
        LAYOUT_FIELDS.find(f => f.key === 'station')!
      ].filter(Boolean)
    : LAYOUT_FIELDS;

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
             {Array.from({ length: photosPerPage }).map((_, slotIndex) => {
               const photoIndex = pageIndex * photosPerPage + slotIndex;
               const record = records[photoIndex];
               
               // Dynamic Layout Classes
               
               // Slot Container
               // 3-up: Row Layout, 33% Height
               // 2-up: Col Layout, 50% Height
               const slotClass = isTwoUp 
                  ? "flex-1 border-b border-gray-300 last:border-b-0 flex flex-col box-border min-h-0 hover:bg-gray-50 transition-colors h-[50%]"
                  : "flex-1 border-b border-gray-300 last:border-b-0 flex flex-row box-border min-h-0 hover:bg-gray-50 transition-colors h-[33.33%]";

               // Image Container
               // 3-up: 65% width, Right Border, Normal Padding
               // 2-up: 100% width, Flex-1 (Takes remaining height), Bottom Border, Minimal Padding (0.5) to maximize image
               const imageContainerClass = isTwoUp
                  ? "w-full flex-1 border-r-0 border-b border-gray-300 flex items-center justify-center bg-white relative overflow-hidden group cursor-context-menu p-0.5"
                  : "w-[65%] border-r border-gray-300 flex items-center justify-center bg-white relative overflow-hidden group cursor-context-menu";

               // Info Container
               // 3-up: 35% width
               // 2-up: 100% width, Auto Height (fits content), minimal padding
               const infoContainerClass = isTwoUp
                  ? "w-full h-auto bg-white flex flex-col justify-center py-0.5 px-4 gap-0"
                  : "w-[35%] flex flex-col h-full bg-white";

               if (!record) {
                 return <div key={`empty-${slotIndex}`} className={slotClass}></div>;
               }

               return (
                 <div 
                    key={record.fileName} 
                    className={slotClass}
                    onContextMenu={(e) => handleContextMenu(e, record.fileName)}
                  >
                   {/* Image Section */}
                   <div className={imageContainerClass}>
                      <img src={record.base64} alt={record.fileName} className="max-w-full max-h-full object-contain" />
                      
                      {record.fromCache && (
                        <div className="absolute top-2 left-2 bg-green-100/90 text-green-800 px-2 py-1 rounded shadow-sm border border-green-300 flex items-center gap-1.5 z-10 pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity">
                          <Database className="w-4 h-4" />
                          <span className="text-xs font-bold font-sans">Cached</span>
                        </div>
                      )}
                   </div>

                   {/* Info Section */}
                   <div className={infoContainerClass}>
                      {visibleFields.map((field) => {
                         // Resolve value
                         let val = "";
                         if (field.key === 'date') {
                            val = record.date 
                             ? new Date(record.date).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) 
                             : '';
                         } else {
                            val = record.analysis ? (record.analysis[field.key as keyof AIAnalysisResult] as string || "") : "";
                         }

                         // Extra UI (Date Cache icon) - Only shows in 3-up since date is hidden in 2-up
                         const extraUI = (!isTwoUp && field.key === 'date' && record.fromCache) ? (
                            <div className="flex items-center gap-1 text-[10px] text-green-600 font-bold bg-green-50 px-1 rounded border border-green-200" title="Restored from local cache">
                               <Database className="w-3 h-3" />
                            </div>
                         ) : null;
                         
                         // Determine height class dynamically
                         let dynamicHeightClass = field.heightClass;
                         let dynamicTextClass = undefined;
                         
                         if (isTwoUp) {
                           // In 2-up vertical mode, minimal height, no borders
                           if (field.key === 'station') {
                             dynamicHeightClass = 'min-h-[20px] border-none';
                             dynamicTextClass = 'text-sm text-gray-500 font-medium';
                           } else { // remarks
                             dynamicHeightClass = 'min-h-[28px] border-none';
                             dynamicTextClass = 'text-base text-gray-900 font-medium';
                           }
                         } else {
                           // 3-up Logic (Original)
                           if (field.key === 'description') {
                              dynamicHeightClass = 'min-h-0 border-b-0 flex-1'; // Fill remaining vertical space
                           } else {
                              dynamicHeightClass = `${field.heightClass} flex-shrink-0`;
                           }
                         }
                         
                         return (
                            <InfoRow 
                               key={field.id}
                               label={txt[field.labelKey as keyof typeof txt] as string}
                               value={val}
                               className={dynamicHeightClass}
                               onChange={(v) => field.key !== 'date' && onUpdatePhoto(record.fileName, field.key as keyof AIAnalysisResult, v)}
                               readOnly={field.readOnly}
                               multiline={field.multiline}
                               hideLabel={isTwoUp} // Hide label in 2-up mode
                               align={isTwoUp ? 'center' : 'left'} // Center text in 2-up mode
                               textClass={dynamicTextClass}
                            >
                               {extraUI}
                            </InfoRow>
                         );
                      })}
                   </div>
                 </div>
               );
             })}
           </div>
         </div>
       ))}

      {/* Custom Context Menu using Portal to escape CSS Transforms */}
      {contextMenu && createPortal(
        <div 
          className="fixed z-[9999] bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[150px] animate-in fade-in zoom-in duration-100"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-gray-100 text-xs text-gray-500 font-bold bg-gray-50">
             {lang === 'ja' ? '操作' : 'Action'}
          </div>
          <button 
            onClick={executeDelete}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            {lang === 'ja' ? '削除する' : 'Delete Photo'}
          </button>
        </div>,
        document.body
      )}

    </div>
  );
};

export default PhotoAlbumView;