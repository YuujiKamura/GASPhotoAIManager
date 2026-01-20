import React from 'react';
import { PhotoRecord, AppMode, AIAnalysisResult } from '../types';
import { TRANS } from '../utils/translations';
import { LAYOUT_FIELDS, getPreviewLayout } from '../utils/layoutConfig';
import { InfoRow } from './shared/EditableField';
import { ContextMenu } from './PhotoAlbumView/ContextMenu';
import { ReasoningModal } from './PhotoAlbumView/ReasoningModal';
import { IssueReportModal } from './PhotoAlbumView/IssueReportModal';
import { usePhotoContextMenu } from '../hooks/usePhotoContextMenu';

// layoutConfigから取得
const previewLayout = getPreviewLayout();

interface Props {
  records: PhotoRecord[];
  appMode: AppMode;
  lang: 'en' | 'ja';
  photosPerPage: 2 | 3;
  onUpdatePhoto: (fileName: string, field: keyof AIAnalysisResult, value: string) => void;
  onDeletePhoto?: (fileName: string) => void;
  onReanalyzePhoto?: (fileName: string) => void;
}

const PhotoAlbumView: React.FC<Props> = ({ records, appMode, lang, photosPerPage, onUpdatePhoto, onDeletePhoto, onReanalyzePhoto }) => {
  const txt = TRANS[lang];
  const totalPages = Math.ceil(records.length / photosPerPage);
  const isTwoUp = photosPerPage === 2;

  const {
    contextMenu, handleContextMenu, closeContextMenu, executeDelete, executeReanalyze,
    executeSaveAsExample, executeShowReasoning, executeReportIssue, isSavingExample,
    reasoningModal, setReasoningModal, issueModal, setIssueModal,
    issueDescription, setIssueDescription, issueType, setIssueType, isSavingIssue, handleSaveIssue,
  } = usePhotoContextMenu({ records, lang, onDeletePhoto, onReanalyzePhoto, txt });

  const getVisibleFields = () => {
    if (isTwoUp) {
      return [
        LAYOUT_FIELDS.find(f => f.key === 'remarks')!,
        LAYOUT_FIELDS.find(f => f.key === 'station')!
      ].filter(Boolean);
    }
    return LAYOUT_FIELDS;
  };

  const getDynamicClasses = (field: { key: string; heightClass: string }) => {
    let dynamicHeightClass = field.heightClass;
    let dynamicTextClass: string | undefined;

    if (isTwoUp) {
      if (field.key === 'remarks') {
        dynamicHeightClass = 'flex-1 min-h-[60px] border-none';
        dynamicTextClass = 'text-sm text-gray-900 font-medium text-center';
      } else {
        dynamicHeightClass = 'h-[28px] flex-shrink-0 border-none';
        dynamicTextClass = 'text-sm text-gray-900 font-medium text-center';
      }
    } else {
      dynamicHeightClass = field.key === 'measurements'
        ? 'min-h-0 border-b-0 flex-1'
        : `${field.heightClass} flex-shrink-0`;
    }
    return { dynamicHeightClass, dynamicTextClass };
  };

  // Layout classes
  const slotClass = isTwoUp
    ? "flex-1 border-b border-gray-300 last:border-b-0 flex flex-col box-border min-h-0 hover:bg-gray-50 transition-colors h-[50%]"
    : "flex-1 border-b border-gray-300 last:border-b-0 flex flex-row box-border min-h-0 hover:bg-gray-50 transition-colors h-[33.33%]";

  // layoutConfigから取得した比率を使用
  const imageWidthStyle = { width: `${previewLayout.imageWidthPercent}%` };
  const infoWidthStyle = { width: `${previewLayout.infoWidthPercent}%` };

  const imageContainerClass = isTwoUp
    ? "w-full flex-1 border-r-0 border-b border-gray-300 flex items-center justify-center bg-white relative overflow-hidden group cursor-context-menu p-0.5"
    : "border-r border-gray-300 flex items-center justify-center bg-white relative overflow-hidden group cursor-context-menu";

  const infoContainerClass = isTwoUp
    ? "w-full h-[20%] bg-white flex flex-col justify-start py-1 px-4"
    : "flex flex-col h-full bg-white";

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

          {/* Main Content */}
          <div className="flex flex-col flex-1 border border-gray-400 bg-white min-h-0">
            {Array.from({ length: photosPerPage }).map((_, slotIndex) => {
              const photoIndex = pageIndex * photosPerPage + slotIndex;
              const record = records[photoIndex];

              if (!record) {
                return <div key={`empty-${slotIndex}`} className={slotClass}></div>;
              }

              return (
                <div key={record.fileName} className={slotClass} onContextMenu={(e) => handleContextMenu(e, record.fileName)}>
                  <div className={imageContainerClass} style={isTwoUp ? undefined : imageWidthStyle}>
                    <img src={record.base64} alt={record.fileName} className="max-w-full max-h-full object-contain" />
                  </div>
                  <div className={infoContainerClass} style={isTwoUp ? undefined : infoWidthStyle}>
                    {getVisibleFields().map((field) => {
                      let val = "";
                      if (field.key === 'date') {
                        val = record.date
                          ? new Date(record.date).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                          : '';
                      } else {
                        val = record.analysis ? (record.analysis[field.key as keyof AIAnalysisResult] as string || "") : "";
                      }
                      const { dynamicHeightClass, dynamicTextClass } = getDynamicClasses(field);

                      return (
                        <InfoRow
                          key={field.id}
                          label={txt[field.labelKey as keyof typeof txt] as string}
                          value={val}
                          className={dynamicHeightClass}
                          onChange={(v) => field.key !== 'date' && onUpdatePhoto(record.fileName, field.key as keyof AIAnalysisResult, v)}
                          readOnly={field.readOnly}
                          multiline={field.multiline}
                          hideLabel={isTwoUp}
                          align={isTwoUp ? 'center' : 'left'}
                          textClass={dynamicTextClass}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <ContextMenu
        contextMenu={contextMenu}
        lang={lang}
        isSavingExample={isSavingExample}
        onClose={closeContextMenu}
        onReanalyze={executeReanalyze}
        onShowReasoning={executeShowReasoning}
        onSaveAsExample={executeSaveAsExample}
        onReportIssue={executeReportIssue}
        onDelete={executeDelete}
        txt={{ showReasoning: txt.showReasoning, reportIssue: txt.reportIssue }}
      />

      <ReasoningModal
        modal={reasoningModal}
        onClose={() => setReasoningModal(null)}
        lang={lang}
        txt={{
          reasoningTitle: txt.reasoningTitle,
          labelWorkType: txt.labelWorkType,
          labelVariety: txt.labelVariety,
          labelDetail: txt.labelDetail,
          labelRemarks: txt.labelRemarks,
          labelMeasurements: txt.labelMeasurements,
          labelStation: txt.labelStation,
          noReasoning: txt.noReasoning,
          changeLogTitle: txt.changeLogTitle,
          changedFrom: txt.changedFrom,
          noChanges: txt.noChanges,
          closeBtn: txt.closeBtn,
        }}
      />

      <IssueReportModal
        modal={issueModal}
        onClose={() => setIssueModal(null)}
        lang={lang}
        issueType={issueType}
        setIssueType={setIssueType}
        issueDescription={issueDescription}
        setIssueDescription={setIssueDescription}
        isSaving={isSavingIssue}
        onSave={handleSaveIssue}
        txt={{
          issueTitle: txt.issueTitle,
          labelWorkType: txt.labelWorkType,
          labelRemarks: txt.labelRemarks,
          issueTypeLabel: txt.issueTypeLabel,
          issueTypes: txt.issueTypes,
          issueDescPlaceholder: txt.issueDescPlaceholder,
          closeBtn: txt.closeBtn,
          saveIssue: txt.saveIssue,
        }}
      />
    </div>
  );
};

export default PhotoAlbumView;
