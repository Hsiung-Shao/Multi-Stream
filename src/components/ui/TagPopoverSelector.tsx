import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { Button } from '@mui/material';
import { Tag } from '../../features/favorites/types';
import { TagChip } from './TagChip';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from './command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from './popover';
import { useI18n } from '../../i18n/index';

interface TagPopoverSelectorProps {
    allTags: Tag[];
    selectedTagIds: string[];
    onChange: (newSelectedIds: string[]) => void;
    theme: 'light' | 'dark';
    showSelectedChips?: boolean; // New prop
}

export function TagPopoverSelector({ allTags, selectedTagIds, onChange, theme, showSelectedChips = true }: TagPopoverSelectorProps) {
    const [open, setOpen] = useState(false);
    const [searchValue, setSearchValue] = useState('');
    const { t } = useI18n();

    const selectedTags = useMemo(() => {
        return allTags.filter(tag => selectedTagIds.includes(tag.id));
    }, [allTags, selectedTagIds]);

    const toggleTag = (tagId: string) => {
        if (selectedTagIds.includes(tagId)) {
            onChange(selectedTagIds.filter(id => id !== tagId));
        } else {
            onChange([...selectedTagIds, tagId]);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            {/* 顯示已選擇的標籤 (Chips) - Controllable via prop */}
            {showSelectedChips && selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-1">
                    {selectedTags.map(tag => (
                        <TagChip
                            key={tag.id}
                            tag={tag}
                            onDelete={() => toggleTag(tag.id)}
                            className="cursor-pointer"
                        />
                    ))}
                </div>
            )}

            {/* Popover 選擇器 */}
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outlined"
                        size="small"
                        sx={{
                            borderColor: theme === 'dark' ? '#374151' : '#d1d5db',
                            color: theme === 'dark' ? '#d1d5db' : '#374151',
                            justifyContent: 'space-between',
                            textTransform: 'none',
                            minWidth: '120px',
                            height: '40px',
                            '&:hover': {
                                borderColor: theme === 'dark' ? '#9ca3af' : '#9ca3af',
                                backgroundColor: theme === 'dark' ? '#1f2937' : '#f3f4f6',
                            }
                        }}
                    >
                        <div className="flex items-center gap-2">
                            <Plus className="size-4" />
                            {selectedTags.length > 0
                                ? t('tags.selectedTags', { count: selectedTags.length })
                                : t('tags.addTag')}
                        </div>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className={`p-0 w-[240px] ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}`} align="start">
                    <Command className={theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white text-black'}>
                        <CommandInput
                            placeholder={t('tags.searchTags')}
                            value={searchValue}
                            onValueChange={setSearchValue}
                            className={theme === 'dark' ? 'border-gray-700' : ''}
                        />
                        <CommandList>
                            <CommandEmpty className="py-2 text-center text-sm text-gray-400">{t('tags.noTagsFound')}</CommandEmpty>
                            <CommandGroup>
                                {allTags.map((tag) => {
                                    const isSelected = selectedTagIds.includes(tag.id);
                                    return (
                                        <CommandItem
                                            key={tag.id}
                                            onSelect={() => toggleTag(tag.id)}
                                            className={`cursor-pointer ${theme === 'dark'
                                                ? (isSelected ? 'bg-purple-900/50 aria-selected:bg-purple-900/70 border-l-2 border-purple-500' : 'aria-selected:bg-gray-700')
                                                : (isSelected ? 'bg-purple-100 aria-selected:bg-purple-200 border-l-2 border-purple-500' : 'aria-selected:bg-gray-100')
                                                }`}
                                        >
                                            <div className="flex items-center gap-2 w-full">
                                                <Check
                                                    className={`mr-2 h-4 w-4 ${isSelected ? "opacity-100 text-purple-500" : "opacity-0"
                                                        }`}
                                                />
                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tag.color }} />
                                                <span className={isSelected ? "font-bold" : ""}>{tag.name}</span>
                                            </div>
                                        </CommandItem>
                                    )
                                })}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
}
