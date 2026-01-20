import React, { useRef, useEffect, ReactNode } from 'react';
import { MoreVertical, GitCompare, MousePointer, ArrowUpDown, Wand2, Star, Settings, RefreshCw, Github, Layers, Download, Upload } from 'lucide-react';

// Grouped action props
interface PairingActions {
  onAutoPair: () => void;
  onManualPair: () => void;
}

interface EditActions {
  onEnterReorderMode: () => void;
  onRefine: () => void;
  onOpenBulkEditor?: () => void;
}

interface SettingsActions {
  onShowHistory: () => void;
  onOpenMasterEditor?: () => void;
  onApplyAliases?: () => { modifiedCount: number };
  onOpenGitHubSync?: () => void;
}

interface DataActions {
  onExportJson?: () => void;
  onImportJson?: () => void;
}

// Combined props interface
interface PreviewToolsMenuProps {
  lang: 'en' | 'ja';
  isProcessing: boolean;
  pairingActions: PairingActions;
  editActions: EditActions;
  settingsActions: SettingsActions;
  dataActions: DataActions;
}

// Legacy props interface for backwards compatibility
export interface LegacyPreviewToolsMenuProps {
  lang: 'en' | 'ja';
  isProcessing: boolean;
  onAutoPair: () => void;
  onManualPair: () => void;
  onEnterReorderMode: () => void;
  onRefine: () => void;
  onShowHistory: () => void;
  onOpenBulkEditor?: () => void;
  onOpenMasterEditor?: () => void;
  onApplyAliases?: () => { modifiedCount: number };
  onOpenGitHubSync?: () => void;
  onExportJson?: () => void;
  onImportJson?: () => void;
}

interface MenuSection {
  label: { ja: string; en: string };
  items: MenuItem[];
}

interface MenuItem {
  icon: ReactNode;
  hoverBg: string;
  label: { ja: string; en: string };
  onClick: () => void;
  show?: boolean;
  title?: { ja: string; en: string };
}

// Inner component with grouped props
const PreviewToolsMenuInner: React.FC<PreviewToolsMenuProps> = ({
  lang,
  isProcessing,
  pairingActions,
  editActions,
  settingsActions,
  dataActions
}) => {
  const [showMenu, setShowMenu] = React.useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const handleApplyAliases = () => {
    if (settingsActions.onApplyAliases) {
      const result = settingsActions.onApplyAliases();
      setShowMenu(false);
      if (result.modifiedCount === 0) {
        alert(lang === 'ja'
          ? 'エイリアスの適用対象がありませんでした。\n設定でエイリアスを有効にし、変換ルールを追加してください。'
          : 'No aliases to apply. Enable aliases and add mappings in settings.');
      }
    }
  };

  const menuSections: MenuSection[] = [
    {
      label: { ja: 'ペアリング', en: 'Pairing' },
      items: [
        {
          icon: <GitCompare className="w-4 h-4 text-blue-400" />,
          hoverBg: 'hover:bg-blue-600',
          label: { ja: 'AIペアリング', en: 'AI Pairing' },
          onClick: () => { pairingActions.onAutoPair(); setShowMenu(false); }
        },
        {
          icon: <MousePointer className="w-4 h-4 text-amber-400" />,
          hoverBg: 'hover:bg-amber-600',
          label: { ja: '手動ペアリング', en: 'Manual Pairing' },
          onClick: () => { pairingActions.onManualPair(); setShowMenu(false); }
        }
      ]
    },
    {
      label: { ja: '編集', en: 'Edit' },
      items: [
        {
          icon: <ArrowUpDown className="w-4 h-4 text-orange-400" />,
          hoverBg: 'hover:bg-orange-600',
          label: { ja: '並べ替え', en: 'Reorder' },
          onClick: () => { editActions.onEnterReorderMode(); setShowMenu(false); }
        },
        {
          icon: <Layers className="w-4 h-4 text-green-400" />,
          hoverBg: 'hover:bg-green-600',
          label: { ja: '一括編集', en: 'Bulk Edit' },
          title: { ja: '複数写真の項目を一括編集', en: 'Edit multiple photo fields at once' },
          onClick: () => { editActions.onOpenBulkEditor?.(); setShowMenu(false); },
          show: !!editActions.onOpenBulkEditor
        },
        {
          icon: <Wand2 className="w-4 h-4 text-purple-400" />,
          hoverBg: 'hover:bg-purple-600',
          label: { ja: '再解析', en: 'Refine' },
          onClick: () => { editActions.onRefine(); setShowMenu(false); }
        }
      ]
    },
    {
      label: { ja: '設定', en: 'Settings' },
      items: [
        {
          icon: <Star className="w-4 h-4 text-amber-400" />,
          hoverBg: 'hover:bg-amber-600',
          label: { ja: '履歴・お手本管理', en: 'History & Examples' },
          onClick: () => { settingsActions.onShowHistory(); setShowMenu(false); }
        },
        {
          icon: <Settings className="w-4 h-4 text-slate-400" />,
          hoverBg: 'hover:bg-slate-600',
          label: { ja: 'マスタ管理', en: 'Master Data' },
          onClick: () => { settingsActions.onOpenMasterEditor?.(); setShowMenu(false); },
          show: !!settingsActions.onOpenMasterEditor
        },
        {
          icon: <RefreshCw className="w-4 h-4 text-cyan-400" />,
          hoverBg: 'hover:bg-cyan-600',
          label: { ja: 'エイリアス適用', en: 'Apply Aliases' },
          title: { ja: '設定済みのエイリアスを適用します', en: 'Apply configured aliases' },
          onClick: handleApplyAliases,
          show: !!settingsActions.onApplyAliases
        },
        {
          icon: <Github className="w-4 h-4 text-purple-400" />,
          hoverBg: 'hover:bg-purple-600',
          label: { ja: 'GitHub同期', en: 'GitHub Sync' },
          title: { ja: '学習データをGitHubと同期', en: 'Sync learned data with GitHub' },
          onClick: () => { settingsActions.onOpenGitHubSync?.(); setShowMenu(false); },
          show: !!settingsActions.onOpenGitHubSync
        }
      ]
    },
    {
      label: { ja: 'データ', en: 'Data' },
      items: [
        {
          icon: <Download className="w-4 h-4 text-emerald-400" />,
          hoverBg: 'hover:bg-emerald-600',
          label: { ja: 'JSON保存', en: 'Export JSON' },
          title: { ja: '写真データをJSONファイルとして保存', en: 'Save photo data as JSON file' },
          onClick: () => { dataActions.onExportJson?.(); setShowMenu(false); },
          show: !!dataActions.onExportJson
        },
        {
          icon: <Upload className="w-4 h-4 text-sky-400" />,
          hoverBg: 'hover:bg-sky-600',
          label: { ja: 'JSON読込', en: 'Import JSON' },
          title: { ja: 'JSONファイルから写真データを読み込み', en: 'Load photo data from JSON file' },
          onClick: () => { dataActions.onImportJson?.(); setShowMenu(false); },
          show: !!dataActions.onImportJson
        }
      ]
    }
  ];

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className={`p-2 rounded text-sm font-medium flex items-center gap-1 transition-colors ${
          showMenu ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
        }`}
        disabled={isProcessing}
        title={lang === 'ja' ? 'ツール' : 'Tools'}
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {showMenu && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-slate-800 rounded-lg shadow-xl border border-slate-600 py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          {menuSections.map((section, sectionIndex) => (
            <React.Fragment key={section.label.en}>
              <div className={`px-3 py-1.5 text-xs text-slate-400 uppercase tracking-wide border-b border-slate-700 ${sectionIndex > 0 ? 'border-t mt-1' : ''}`}>
                {section.label[lang]}
              </div>
              {section.items.filter(item => item.show !== false).map((item) => (
                <button
                  key={item.label.en}
                  onClick={item.onClick}
                  className={`w-full px-3 py-2 text-sm text-left text-slate-200 ${item.hoverBg} flex items-center gap-2 transition-colors`}
                  title={item.title?.[lang]}
                >
                  {item.icon}
                  {item.label[lang]}
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};

// Wrapper for backwards compatibility with legacy individual props
const PreviewToolsMenu: React.FC<LegacyPreviewToolsMenuProps> = ({
  lang,
  isProcessing,
  onAutoPair,
  onManualPair,
  onEnterReorderMode,
  onRefine,
  onShowHistory,
  onOpenBulkEditor,
  onOpenMasterEditor,
  onApplyAliases,
  onOpenGitHubSync,
  onExportJson,
  onImportJson
}) => (
  <PreviewToolsMenuInner
    lang={lang}
    isProcessing={isProcessing}
    pairingActions={{ onAutoPair, onManualPair }}
    editActions={{ onEnterReorderMode, onRefine, onOpenBulkEditor }}
    settingsActions={{ onShowHistory, onOpenMasterEditor, onApplyAliases, onOpenGitHubSync }}
    dataActions={{ onExportJson, onImportJson }}
  />
);

export default PreviewToolsMenu;
