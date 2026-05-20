// 推薦分類多選 combobox(Popover + Command,獨立於 favorite Tag 的 TagMultiSelect)
// 配色對齊 RecommendDialog 既有暗色 + pink 系

import { useState } from 'react';
import { Check, ChevronsUpDown, Loader2, Plus, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '../../../components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '../../../components/ui/popover';
import { Badge } from '../../../components/ui/badge';
import { cn } from '../../../components/ui/utils';
import type { Category } from '../types';

interface Props {
    allCategories: Category[];
    selectedIds: string[];
    onChange: (next: string[]) => void;
    onProposeClick: () => void;
    isLoading?: boolean;
    placeholder?: string;
}

export function CategoryMultiSelect({
    allCategories,
    selectedIds,
    onChange,
    onProposeClick,
    isLoading,
    placeholder = '選擇分類…',
}: Props) {
    const [open, setOpen] = useState(false);

    const toggle = (id: string) => {
        onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
    };

    const removeOne = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        onChange(selectedIds.filter(x => x !== id));
    };

    const selected = allCategories.filter(c => selectedIds.includes(c.id));

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between h-auto min-h-9 py-1.5 bg-zinc-900 border-zinc-800 text-zinc-200 hover:bg-zinc-800 hover:text-zinc-100"
                >
                    <div className="flex flex-wrap gap-1 items-center min-h-[20px]">
                        {selected.length > 0 ? (
                            selected.map(cat => (
                                <Badge
                                    key={cat.id}
                                    variant="outline"
                                    className="bg-pink-500/15 text-pink-300 border-pink-500/40 px-1.5 py-0 text-[11px] gap-1"
                                >
                                    {cat.name}
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => removeOne(cat.id, e)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                removeOne(cat.id, e as unknown as React.MouseEvent);
                                            }
                                        }}
                                        className="hover:text-pink-100 cursor-pointer"
                                        aria-label={`移除 ${cat.name}`}
                                    >
                                        <X className="w-3 h-3" />
                                    </span>
                                </Badge>
                            ))
                        ) : (
                            <span className="text-zinc-500 text-xs">{placeholder}</span>
                        )}
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[--radix-popover-trigger-width] p-0 bg-zinc-950 border-zinc-800 text-zinc-200"
                align="start"
            >
                <Command className="bg-zinc-950 text-zinc-200">
                    <CommandInput placeholder="搜尋分類…" className="text-zinc-200 placeholder:text-zinc-500" />
                    <CommandList>
                        {isLoading ? (
                            <div className="flex items-center justify-center py-4 text-zinc-500 text-xs">
                                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                                載入中…
                            </div>
                        ) : (
                            <>
                                <CommandEmpty className="py-4 text-center text-xs text-zinc-500">
                                    找不到符合的分類
                                </CommandEmpty>
                                <CommandGroup>
                                    {allCategories.map(cat => {
                                        const active = selectedIds.includes(cat.id);
                                        return (
                                            <CommandItem
                                                key={cat.id}
                                                value={cat.name}
                                                onSelect={() => toggle(cat.id)}
                                                className={cn(
                                                    'text-zinc-200 aria-selected:bg-zinc-800 aria-selected:text-zinc-100',
                                                    active && 'text-pink-300',
                                                )}
                                            >
                                                <span className="flex-1">{cat.name}</span>
                                                <Check
                                                    className={cn(
                                                        'ml-2 h-4 w-4',
                                                        active ? 'opacity-100 text-pink-400' : 'opacity-0',
                                                    )}
                                                />
                                            </CommandItem>
                                        );
                                    })}
                                </CommandGroup>
                            </>
                        )}
                    </CommandList>
                    <div className="border-t border-zinc-800 p-1">
                        <button
                            type="button"
                            onClick={() => {
                                setOpen(false);
                                onProposeClick();
                            }}
                            className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            找不到?新增分類
                        </button>
                    </div>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
