import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface ExpandableSectionProps {
  id: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  gradient?: string;
  children: React.ReactNode;
}

export const ExpandableSection: React.FC<ExpandableSectionProps> = ({
  title, subtitle, icon, badge, expanded, onToggle, gradient, children,
}) => {
  const baseClass = gradient
    ? `rounded-2xl border-2 overflow-hidden ${gradient}`
    : '';

  return (
    <section className={baseClass}>
      <button onClick={onToggle} className={`w-full flex items-center justify-between p-5 text-left ${gradient ? 'hover:bg-white/30' : ''}`}>
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
            {icon} {title}
          </h2>
          {subtitle && <p className="text-sm text-gray-600 mt-1 ml-7">{subtitle}</p>}
        </div>
        {badge}
      </button>
      {expanded && <div className="p-5 pt-0">{children}</div>}
    </section>
  );
};

interface SimpleSectionProps {
  title: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export const SimpleSection: React.FC<SimpleSectionProps> = ({ title, expanded, onToggle, children }) => (
  <section>
    <button onClick={onToggle} className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-4 hover:text-blue-600 transition-colors">
      {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
      {title}
    </button>
    {expanded && children}
  </section>
);
