import React, { useState, useEffect } from 'react';
import { X, Trash2, Star, Search, Loader2 } from 'lucide-react';
import { AnalysisExample, PhotoCategory } from '../types';
import { getExamples, deleteExample, clearExamples } from '../utils/storage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lang: 'en' | 'ja';
}

const CATEGORIES: PhotoCategory[] = [
  '着手前及び完成写真',
  '施工状況写真',
  '出来形管理写真',
  '安全管理写真',
  '使用材料写真',
  '品質管理写真',
  'その他'
];

const ExamplesModal: React.FC<Props> = ({ isOpen, onClose, lang }) => {
  const [examples, setExamples] = useState<AnalysisExample[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<PhotoCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadExamples();
    }
  }, [isOpen]);

  const loadExamples = async () => {
    setIsLoading(true);
    try {
      const data = await getExamples();
      setExamples(data);
    } catch (e) {
      console.error('Failed to load examples:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(lang === 'ja' ? 'このお手本を削除しますか？' : 'Delete this example?')) {
      return;
    }

    try {
      await deleteExample(id);
      setExamples(prev => prev.filter(ex => ex.id !== id));
    } catch (e) {
      console.error('Failed to delete example:', e);
    }
  };

  const handleClearAll = async () => {
    if (!confirm(lang === 'ja' ? '全てのお手本を削除しますか？' : 'Delete all examples?')) {
      return;
    }

    try {
      await clearExamples();
      setExamples([]);
    } catch (e) {
      console.error('Failed to clear examples:', e);
    }
  };

  // Filter examples
  const filteredExamples = examples.filter(ex => {
    const matchesCategory = selectedCategory === 'all' || ex.category === selectedCategory;
    const matchesSearch = !searchQuery ||
      ex.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ex.analysis.workType?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ex.analysis.remarks?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-t-xl">
          <div className="flex items-center gap-2">
            <Star className="w-6 h-6" />
            <h2 className="text-xl font-bold">
              {lang === 'ja' ? 'お手本管理' : 'Examples Manager'}
            </h2>
            <span className="ml-2 px-2 py-0.5 bg-white/20 rounded text-sm">
              {examples.length}件
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-4 border-b bg-gray-50 flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={lang === 'ja' ? '検索...' : 'Search...'}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as PhotoCategory | 'all')}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500"
          >
            <option value="all">{lang === 'ja' ? '全カテゴリー' : 'All Categories'}</option>
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          {/* Clear All */}
          {examples.length > 0 && (
            <button
              onClick={handleClearAll}
              className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium flex items-center gap-1"
            >
              <Trash2 className="w-4 h-4" />
              {lang === 'ja' ? '全削除' : 'Clear All'}
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            </div>
          ) : filteredExamples.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Star className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">
                {examples.length === 0
                  ? (lang === 'ja' ? 'お手本がありません' : 'No examples yet')
                  : (lang === 'ja' ? '該当するお手本がありません' : 'No matching examples')}
              </p>
              <p className="text-sm mt-2">
                {lang === 'ja'
                  ? '写真を右クリックして「お手本として保存」を選択してください'
                  : 'Right-click on a photo and select "Save as Example"'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredExamples.map(example => (
                <div
                  key={example.id}
                  className="border rounded-lg overflow-hidden hover:shadow-lg transition-shadow bg-white"
                >
                  <div className="flex">
                    {/* Thumbnail */}
                    <div className="w-24 h-24 flex-shrink-0 bg-gray-100">
                      <img
                        src={example.thumbnail}
                        alt={example.name}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 p-3 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-gray-800 truncate" title={example.name}>
                          {example.name}
                        </h3>
                        <button
                          onClick={() => handleDelete(example.id)}
                          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded flex-shrink-0"
                          title={lang === 'ja' ? '削除' : 'Delete'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="mt-1 space-y-0.5 text-xs text-gray-600">
                        {example.analysis.workType && (
                          <div className="truncate">
                            <span className="text-gray-400">工種:</span> {example.analysis.workType}
                          </div>
                        )}
                        {example.analysis.remarks && (
                          <div className="truncate">
                            <span className="text-gray-400">備考:</span> {example.analysis.remarks}
                          </div>
                        )}
                      </div>

                      <div className="mt-2 flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-xs rounded">
                          {example.category}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(example.createdAt).toLocaleDateString('ja-JP')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 rounded-b-xl">
          <p className="text-xs text-gray-500 text-center">
            {lang === 'ja'
              ? 'お手本は次回の解析時にAIへの参考例として使用されます'
              : 'Examples will be used as reference for future AI analysis'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ExamplesModal;
