// TagWellSelector — 對齊 multistream-hub-design-system 的 AFTagPicker:
// 單一「tag well」combobox(已選 tag 以可移除 pill 顯示在框內,點開下拉搜尋/勾選),
// 取代舊的「pill 按鈕 + Popover + 另一排 chip」三段式。token 化,深淺主題共用。

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Search, Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Tag } from '../types';

type TFn = (key: string, options?: Record<string, unknown>) => string;

interface TagWellSelectorProps {
    allTags: Tag[];
    selectedTagIds: string[];
    onChange: (ids: string[]) => void;
}

export function TagWellSelector({ allTags, selectedTagIds, onChange }: TagWellSelectorProps) {
    const { t } = useTranslation(['favorites', 'tags', 'common']);
    const tx = t as unknown as TFn;

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const wrapRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) {
            setQuery('');
            return;
        }
        const onDoc = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        const tmr = setTimeout(() => searchRef.current?.focus(), 40);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
            clearTimeout(tmr);
        };
    }, [open]);

    const toggle = (id: string) => {
        onChange(selectedTagIds.includes(id)
            ? selectedTagIds.filter(x => x !== id)
            : [...selectedTagIds, id]);
    };

    const selectedTags = allTags.filter(tag => selectedTagIds.includes(tag.id));
    const q = query.trim().toLowerCase();
    const filtered = allTags.filter(tag => !q || tag.name.toLowerCase().includes(q));
    const showSearch = allTags.length > 6;

    return (
        <div ref={wrapRef} className="relative">
            {/* Tag well */}
            <div
                onClick={() => setOpen(o => !o)}
                className="flex flex-wrap items-center gap-[7px] min-h-11 py-1.5 pl-2.5 pr-2 box-border rounded-[10px] cursor-pointer bg-background transition-colors"
                style={{
                    border: `1px solid ${open
                        ? 'var(--primary)'
                        : selectedTags.length
                            ? 'color-mix(in oklab, var(--primary) 40%, transparent)'
                            : 'var(--border)'}`,
                }}
            >
                {selectedTags.length === 0 && (
                    <span className="text-[13.5px] text-muted-foreground pl-0.5">
                        {tx('favorites:tagWellPlaceholder', { defaultValue: '選擇或搜尋標籤…' })}
                    </span>
                )}
                {selectedTags.map(tag => (
                    <span
                        key={tag.id}
                        className="inline-flex items-center gap-1.5 py-1 pl-[9px] pr-[5px] rounded-full text-[12.5px] font-semibold text-foreground"
                        style={{ background: `${tag.color}1f`, border: `1px solid ${tag.color}66` }}
                    >
                        <span className="size-[7px] rounded-full" style={{ background: tag.color, boxShadow: `0 0 5px ${tag.color}` }} />
                        {tag.name}
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggle(tag.id); }}
                            title={tx('common:common.delete', { defaultValue: '移除' })}
                            className="inline-flex items-center justify-center size-[17px] rounded-full border-0 p-0 cursor-pointer bg-foreground/10 text-foreground/60 hover:bg-foreground/20 transition-colors"
                        >
                            <X className="size-[11px]" />
                        </button>
                    </span>
                ))}
                <span
                    className="ml-auto inline-flex items-center pr-1 transition-transform"
                    style={{ color: open ? 'var(--primary)' : 'var(--muted-foreground)', transform: open ? 'rotate(180deg)' : undefined }}
                >
                    <ChevronDown className="size-4" />
                </span>
            </div>

            {/* Dropdown */}
            {open && (
                <div className="absolute left-0 right-0 z-[5] mt-1.5 rounded-xl border border-border bg-popover overflow-hidden shadow-2xl">
                    {showSearch && (
                        <div className="p-2 border-b border-border">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                                <input
                                    ref={searchRef}
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    placeholder={tx('tags:searchTags', { defaultValue: '搜尋標籤…' })}
                                    className="w-full h-9 box-border pl-8 pr-2.5 bg-background border border-border rounded-lg text-foreground outline-none text-[13px] focus-visible:border-primary"
                                />
                            </div>
                        </div>
                    )}
                    <div className="max-h-56 overflow-y-auto p-1.5">
                        {filtered.length === 0 && (
                            <div className="py-4 px-2.5 text-center text-[12.5px] text-muted-foreground">
                                {allTags.length === 0
                                    ? tx('tags:noTags', { defaultValue: '尚無標籤,可到「標籤管理」新增' })
                                    : tx('tags:noTagsFound', { defaultValue: '找不到符合的標籤' })}
                            </div>
                        )}
                        {filtered.map(tag => {
                            const active = selectedTagIds.includes(tag.id);
                            return (
                                <button
                                    key={tag.id}
                                    type="button"
                                    onClick={() => toggle(tag.id)}
                                    className={`flex items-center gap-[11px] w-full text-left py-[9px] px-2.5 rounded-lg border-0 cursor-pointer text-foreground text-[13.5px] transition-colors ${
                                        active ? 'bg-primary/15 font-semibold' : 'bg-transparent hover:bg-accent font-medium'
                                    }`}
                                >
                                    <span className="size-2.5 rounded-full shrink-0" style={{ background: tag.color, boxShadow: `0 0 6px ${tag.color}66` }} />
                                    <span className="flex-1">{tag.name}</span>
                                    {active && <Check className="size-4 text-primary" />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
