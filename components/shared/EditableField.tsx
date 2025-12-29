import React from 'react';

/**
 * A field that is an Input/Textarea on screen (for editing),
 * but becomes a plain Div in PDF mode (for proper text wrapping/rendering).
 */
export const EditableField = ({
  value,
  onChange,
  multiline = false,
  align = 'left',
  textClass = "text-sm text-gray-900"
}: {
  value: string;
  onChange: (val: string) => void;
  multiline?: boolean;
  align?: 'left' | 'center';
  textClass?: string;
}) => {
  const baseClass = `w-full h-full bg-transparent border-none outline-none focus:bg-yellow-50 focus:ring-1 focus:ring-amber-300 hover:bg-black/5 rounded-sm transition-colors leading-tight font-normal block ${textClass}`;
  const alignClass = align === 'center' ? 'text-center' : 'text-left';
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
  className?: string;
  onChange: (val: string) => void;
  align?: 'left' | 'center';
  multiline?: boolean;
  readOnly?: boolean;
  hideLabel?: boolean;
  textClass?: string;
  children?: React.ReactNode;
}

export const InfoRow: React.FC<InfoRowProps> = ({
  label, value, className = "", onChange, align = 'left',
  multiline = false, readOnly = false, hideLabel = false, textClass, children
}) => (
  <div className={`flex border-b border-gray-300 box-border w-full ${className}`}>
    {!hideLabel && (
      <div className={`w-12 flex justify-center text-sm text-gray-900 font-normal flex-shrink-0 leading-tight px-0.5 text-center select-none bg-gray-50/50 border-r border-gray-300 ${multiline ? 'items-start pt-1' : 'items-center'}`}>
        {label}
      </div>
    )}
    <div className="flex-1 relative min-w-0 bg-white h-full overflow-hidden">
      {readOnly ? (
        <div className="w-full h-full px-1 py-0.5 flex items-center justify-between text-sm text-gray-900 leading-tight font-normal">
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
