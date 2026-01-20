import React from 'react';
import { TemplateLayout } from '../types';
import { getAllTemplates } from '../utils/layoutConfig';

interface Props {
  currentTemplateId: string;
  onSelectTemplate: (templateId: string) => void;
}

/**
 * テンプレートのミニプレビューアイコン
 */
const TemplateIcon: React.FC<{ template: TemplateLayout; isSelected: boolean }> = ({ template, isSelected }) => {
  const { captionPosition, blocksPerPage } = template;

  // レイアウトに応じたCSS
  const isHorizontal = captionPosition === 'left' || captionPosition === 'right';
  const isCaptionFirst = captionPosition === 'left' || captionPosition === 'top';

  const containerClass = isHorizontal ? 'flex flex-row' : 'flex flex-col';

  // 写真とキャプションのサイズ比率
  const photoSize = isHorizontal ? 'w-2/3 h-full' : 'w-full h-2/3';
  const captionSize = isHorizontal ? 'w-1/3 h-full' : 'w-full h-1/3';

  const photoBox = (
    <div className={`${photoSize} bg-blue-200 border border-blue-300`} />
  );
  const captionBox = (
    <div className={`${captionSize} bg-gray-100 border border-gray-300 flex items-center justify-center`}>
      <div className="w-2/3 h-0.5 bg-gray-400" />
    </div>
  );

  return (
    <div className={`w-12 h-16 border-2 rounded ${isSelected ? 'border-amber-500 bg-amber-50' : 'border-gray-300 bg-white'} p-0.5 flex flex-col gap-0.5`}>
      {Array.from({ length: blocksPerPage }).map((_, i) => (
        <div key={i} className={`flex-1 ${containerClass} gap-px overflow-hidden`}>
          {isCaptionFirst ? (
            <>
              {captionBox}
              {photoBox}
            </>
          ) : (
            <>
              {photoBox}
              {captionBox}
            </>
          )}
        </div>
      ))}
    </div>
  );
};

/**
 * テンプレート選択UI
 */
const TemplateSelector: React.FC<Props> = ({ currentTemplateId, onSelectTemplate }) => {
  const templates = getAllTemplates();

  return (
    <div className="flex items-center gap-1 bg-slate-700 rounded-lg p-1">
      {templates.map((template) => (
        <button
          key={template.id}
          onClick={() => onSelectTemplate(template.id)}
          className={`p-1 rounded transition-colors ${
            currentTemplateId === template.id
              ? 'bg-amber-500'
              : 'hover:bg-slate-600'
          }`}
          title={template.name}
        >
          <TemplateIcon template={template} isSelected={currentTemplateId === template.id} />
        </button>
      ))}
    </div>
  );
};

export default TemplateSelector;
