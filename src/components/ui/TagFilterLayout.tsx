import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { TagChip } from './TagChip';
import type { Tag } from '../../features/favorites/types';
import { useI18n } from '../../i18n/index';

interface TagFilterLayoutProps {
    tags: Tag[];
    selectedTags: string[];
    onToggleTag: (tagId: string) => void;
    onClear: () => void;
    theme: 'light' | 'dark';
    columns?: number;
}

export function TagFilterLayout({
    tags,
    selectedTags,
    onToggleTag,
    onClear,
    theme,
    columns = 6 // Default to 6 if not specified
}: TagFilterLayoutProps) {
    const [open, setOpen] = useState(false);
    const { t } = useI18n();

    return (
        <div className="flex items-center justify-between gap-2 w-full">
            {/* 水平捲動列表 - 顯示部分標籤 */}
            <div className="flex-1 min-w-0 overflow-hidden flex gap-2 items-center">
                {tags.map(tag => {
                    const isSelected = selectedTags.includes(tag.id);
                    return (
                        <TagChip
                            key={tag.id}
                            tag={tag}
                            onClick={() => onToggleTag(tag.id)}
                            className={`flex-shrink-0 cursor-pointer transition-all ${isSelected
                                ? 'ring-2 ring-offset-2 ring-purple-500 opacity-100'
                                : 'opacity-50 hover:opacity-100'
                                }`}
                        />
                    );
                })}
            </div>

            {/* "所有" 按鈕 - 觸發 Popover */}
            {tags.length > 0 && (
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            className={`flex-shrink-0 h-auto px-2 py-1 ${theme === 'dark' ? 'border-gray-700 text-gray-300 hover:bg-gray-800 hover:border-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-300'}`}
                        >
                            <span className="text-xs mr-1">{t('tags.all')}</span>
                            <ChevronDown className="size-3" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent
                        className={`p-4 ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}`}
                        align="end"
                        style={{ width: 'max-content', maxWidth: '90vw' }}
                    >
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                    {t('tags.filterTitle')}
                                </span>
                                {selectedTags.length > 0 && (
                                    <span className="bg-purple-600 text-white text-xs px-2 py-0.5 rounded-full">
                                        {selectedTags.length}
                                    </span>
                                )}
                            </div>

                            {/* Grid Layout for Tags */}
                            <div
                                className="grid gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar"
                                style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                            >
                                {tags.map(tag => {
                                    const isSelected = selectedTags.includes(tag.id);
                                    return (
                                        <TagChip
                                            key={tag.id}
                                            tag={tag}
                                            onClick={() => onToggleTag(tag.id)}
                                            className={`cursor-pointer transition-all w-full justify-center ${isSelected
                                                ? 'ring-2 ring-offset-2 ring-purple-500 opacity-100'
                                                : 'opacity-50 hover:opacity-100'
                                                }`}
                                        />
                                    )
                                })}
                            </div>

                            <div className="pt-2 border-t border-gray-700/50 flex justify-end items-center">
                                <Button
                                    onClick={onClear}
                                    size="sm"
                                    disabled={selectedTags.length === 0}
                                    className={`rounded-full bg-purple-600 hover:bg-purple-700 text-white shadow-none disabled:opacity-50 ${theme === 'dark' ? 'disabled:bg-gray-700 disabled:text-gray-400' : 'disabled:bg-gray-200 disabled:text-gray-400'}`}
                                >
                                    {t('tags.clearAll')}
                                </Button>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
}
