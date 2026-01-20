import React from 'react';
import { getAllTemplates } from '../utils/layoutConfig';

interface Props {
  currentTemplateId: string;
  onSelectTemplate: (templateId: string) => void;
}

/**
 * シンプルなテンプレート選択UI（2枚/3枚）
 */
const TemplateSelector: React.FC<Props> = ({ currentTemplateId, onSelectTemplate }) => {
  const templates = getAllTemplates();

  return (
    <div className="flex items-center gap-1 bg-slate-700 rounded-lg px-1">
      {templates.map((template) => (
        <button
          key={template.id}
          onClick={() => onSelectTemplate(template.id)}
          className={`px-2 py-1.5 text-xs font-medium rounded transition-colors ${
            currentTemplateId === template.id
              ? 'bg-amber-500 text-white'
              : 'text-slate-300 hover:bg-slate-600'
          }`}
          title={template.name}
        >
          {template.blocksPerPage}枚
        </button>
      ))}
    </div>
  );
};

export default TemplateSelector;
