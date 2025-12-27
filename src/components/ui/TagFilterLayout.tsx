import React, { useState } from 'react';
import { ChevronDown, Filter, X } from 'lucide-react';
import { Button as MuiButton } from '@mui/material';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { TagChip } from './TagChip';
import type { Tag } from '../../features/favorites/types';

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
                        <MuiButton
                            variant="outlined"
                            size="small"
                            className="flex-shrink-0"
                            color="secondary"
                            sx={{
                                minWidth: 'auto',
                                padding: '4px 8px',
                                borderColor: theme === 'dark' ? '#374151' : '#d1d5db',
                                color: theme === 'dark' ? '#d1d5db' : '#374151',
                                '&:hover': {
                                    borderColor: theme === 'dark' ? '#374151' : '#d1d5db',
                                    backgroundColor: theme === 'dark' ? '#1f2937' : '#f3f4f6',
                                },
                            }}
                        >
                            <span className="text-xs mr-1">所有</span>
                            <ChevronDown className="size-3" />
                        </MuiButton>
                    </PopoverTrigger>
                    <PopoverContent
                        className={`p-4 ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}`}
                        align="end"
                        style={{ width: 'max-content', maxWidth: '90vw' }}
                    >
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                    選擇標籤
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
                                <MuiButton
                                    onClick={onClear}
                                    size="small"
                                    disabled={selectedTags.length === 0}
                                    variant="contained"
                                    sx={{
                                        borderRadius: '9999px',
                                        bgcolor: '#9333ea',
                                        color: '#ffffff',
                                        boxShadow: 'none',
                                        '&:hover': {
                                            bgcolor: '#7e22ce',
                                            boxShadow: 'none'
                                        },
                                        '&.Mui-disabled': {
                                            bgcolor: theme === 'dark' ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 0.8)',
                                            color: theme === 'dark' ? '#9ca3af' : '#9ca3af',
                                        }
                                    }}
                                >
                                    清除全部
                                </MuiButton>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
}
