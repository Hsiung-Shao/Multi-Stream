import { useState, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { TagChip } from './TagChip';
import type { Tag } from '../../features/favorites/types';
import { useTranslation } from 'react-i18next';
import { DEFAULT_TAG_TWITCH_ID, DEFAULT_TAG_YOUTUBE_ID, DEFAULT_TAG_IS_LIVE_ID } from '../../features/favorites/constants';

interface TagFilterLayoutProps {
    tags: Tag[];
    selectedTags: string[];
    onToggleTag: (tagId: string) => void;
    onClear: () => void;
    maxVisibleTags?: number;
}

export function TagFilterLayout({
    tags,
    selectedTags,
    onToggleTag,
    onClear,
    maxVisibleTags = 5
}: TagFilterLayoutProps) {
    const [open, setOpen] = useState(false);
    const { t } = useTranslation('tags');

    // 排序與篩選標籤：平台標籤優先，最多顯示 maxVisibleTags 個
    const visibleTags = useMemo(() => {
        // 複製並排序
        const sorted = [...tags].sort((a, b) => {
            // 1. 直播中標籤最優先
            if (a.id === DEFAULT_TAG_IS_LIVE_ID) return -1;
            if (b.id === DEFAULT_TAG_IS_LIVE_ID) return 1;

            // 2. 平台標籤次優先
            const aIsPlatform = a.id === DEFAULT_TAG_TWITCH_ID || a.id === DEFAULT_TAG_YOUTUBE_ID;
            const bIsPlatform = b.id === DEFAULT_TAG_TWITCH_ID || b.id === DEFAULT_TAG_YOUTUBE_ID;

            if (aIsPlatform && !bIsPlatform) return -1;
            if (!aIsPlatform && bIsPlatform) return 1;

            // 3. 一般標籤按順序
            return (a.order || 0) - (b.order || 0);
        });

        // 只取前 maxVisibleTags 個顯示在單行中
        return sorted.slice(0, maxVisibleTags);
    }, [tags, maxVisibleTags]);

    return (
        <div className="flex items-center justify-between gap-2 w-full">
            {/* 左側：顯示前 5 個標籤 (固定單行) */}
            <div className="flex-1 min-w-0 overflow-hidden flex gap-2 items-center">
                {visibleTags.map(tag => {
                    const isSelected = selectedTags.includes(tag.id);
                    return (
                        <TagChip
                            key={tag.id}
                            tag={tag}
                            onClick={() => onToggleTag(tag.id)}
                            className={`flex-shrink-0 cursor-pointer transition-all ${isSelected
                                ? 'opacity-100'
                                : 'opacity-50 hover:opacity-100'

                                }`}
                        />
                    );
                })}
            </div>

            {/* 右側："所有" 按鈕 - 固定顯示，觸發 Popover */}
            {tags.length > 0 && (
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            className="flex-shrink-0 h-auto px-2 py-1 ml-auto border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:border-gray-700"
                        >
                            <span className="text-xs mr-1">{t('all')}</span>
                            <ChevronDown className="size-3" />
                        </Button>
                    </PopoverTrigger>
                    {/* Popover Content: 限制寬度並使用 Flex Wrap */}
                    <PopoverContent
                        className="p-4 w-[440px] max-w-[90vw] bg-white border-gray-200 dark:bg-gray-900 dark:border-gray-700"
                        align="end"
                    >
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {t('filterTitle')}
                                </span>
                                {selectedTags.length > 0 && (
                                    <span className="bg-purple-600 text-white text-xs px-2 py-0.5 rounded-full">
                                        {selectedTags.length}
                                    </span>
                                )}
                            </div>

                            {/* Flex Wrap Layout for Tags - 自動換行 */}
                            <div className="flex flex-wrap gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                {tags.map(tag => {
                                    const isSelected = selectedTags.includes(tag.id);
                                    return (
                                        <TagChip
                                            key={tag.id}
                                            tag={tag}
                                            onClick={() => onToggleTag(tag.id)}
                                            className={`cursor-pointer transition-all ${isSelected
                                                ? 'opacity-100'
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
                                    className="rounded-full bg-purple-600 hover:bg-purple-700 text-white shadow-none disabled:opacity-50 disabled:bg-gray-200 disabled:text-gray-400 dark:disabled:bg-gray-700 dark:disabled:text-gray-400"
                                >
                                    {t('clearAll')}
                                </Button>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
}
