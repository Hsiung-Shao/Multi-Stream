
import { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Filter, Play, Grid2X2, Hash, Star, ChevronDown, Check, X } from 'lucide-react';
import { useFavorites } from '../../hooks/useFavorites';
import { useStreamStore } from '../../store/useStreamStore';
import { cn } from '../ui/utils';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import { Tag } from '../../features/favorites/types';
import { tagsService } from '../../features/favorites/TagsService';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '../ui/popover';
import { useLiveStatusCheck } from '../../features/favorites/useLiveStatusCheck';

// Favorites 面板主題色(對齊設計 FN.fav = gold)
const FAV_ACCENT = '#fbbf24';

// ---- in-panel chooser style helpers(對齊設計 favRowBtn / favPill / favClearBtn) ----
const favPillStyle = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    height: 28,
    padding: '0 12px',
    borderRadius: 9999,
    border: `1px solid ${active ? `${FAV_ACCENT}59` : 'rgba(255,255,255,0.12)'}`,
    background: active ? `${FAV_ACCENT}1f` : 'transparent',
    color: active ? FAV_ACCENT : 'rgba(255,255,255,0.6)',
    fontSize: 11.5,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    transition: 'all 0.15s',
});

const favRowBtnStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '9px 10px',
    borderRadius: 9,
    cursor: 'pointer',
    textAlign: 'left',
    background: active ? `${FAV_ACCENT}1f` : 'transparent',
    border: `1px solid ${active ? `${FAV_ACCENT}4d` : 'transparent'}`,
    color: active ? 'white' : 'rgba(255,255,255,0.8)',
    transition: 'all 0.15s',
});

const favClearBtnStyle: React.CSSProperties = {
    height: 34,
    padding: '0 14px',
    borderRadius: 9,
    cursor: 'pointer',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: 'var(--foreground)',
    fontSize: 13,
    fontWeight: 500,
};

// in-panel chooser 殼:header(金色 uppercase 標題 + X 返回)+ body(scroll)+ footer
const FavChooser = ({
    title,
    onClose,
    footer,
    children,
}: {
    title: string;
    onClose: () => void;
    footer?: React.ReactNode;
    children: React.ReactNode;
}) => (
    <div>
        <div className="flex items-center justify-between" style={{ padding: '10px 12px 6px' }}>
            <span
                className="uppercase"
                style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: FAV_ACCENT }}
            >
                {title}
            </span>
            <button
                type="button"
                onClick={onClose}
                title="返回"
                aria-label="返回"
                className="inline-flex items-center justify-center"
                style={{ width: 24, height: 24, borderRadius: 7, border: 0, background: 'transparent', color: 'rgba(255,255,255,0.55)', cursor: 'pointer' }}
            >
                <X size={14} />
            </button>
        </div>
        <div
            className="flex flex-col"
            style={{ maxHeight: 220, overflowY: 'auto', padding: '0 8px 4px', gap: 2 }}
        >
            {children}
        </div>
        {footer && <div style={{ padding: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>{footer}</div>}
    </div>
);

export const IslandFavoritesMenu = ({ children }: { children: React.ReactNode }) => {
    const { t } = useTranslation(['common', 'favorites']);
    const { favorites, categories, refresh } = useFavorites();
    // const addEmptyGroup = useStreamStore(s => s.addEmptyGroup);
    // const addCanvasItem = useStreamStore(s => s.addCanvasItem); // unused
    const addStream = useStreamStore(s => s.addStream);

    const { checkNow, isRefreshing } = useLiveStatusCheck();

    const [isOpen, setIsOpen] = useState(false);
    const [selectedStreams, setSelectedStreams] = useState<string[]>([]);
    const [filterCategory, setFilterCategory] = useState<string | null>(null);
    const [showOnlineOnly, setShowOnlineOnly] = useState(true);

    // in-panel chooser 視圖:'cat' | 'tag' | null(取代列表,不另開 dropdown)
    const [menu, setMenu] = useState<'cat' | 'tag' | null>(null);

    // Tags State
    const [tags, setTags] = useState<Tag[]>([]);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    // Sync Tags
    useEffect(() => {
        const loadTags = () => setTags(tagsService.getAllTags());
        loadTags();
        window.addEventListener('tagsUpdated', loadTags);
        return () => window.removeEventListener('tagsUpdated', loadTags);
    }, []);

    // Filter Logic
    const filteredFavorites = useMemo(() => {
        let result = favorites;

        if (showOnlineOnly) {
            result = result.filter(f => f.isLive);
        }

        if (filterCategory) {
            result = result.filter(f => {
                // If category ID is provided, check straight match
                // We might need to dereference category names but for now assuming ID
                return f.categoryId === filterCategory;
            });
        }

        if (selectedTags.length > 0) {
            result = result.filter(f => {
                if (!f.tagIds || f.tagIds.length === 0) return false;
                // OR Logic: Stream has at least one of the selected tags
                return f.tagIds.some(tId => selectedTags.includes(tId));
            });
        }

        return result;
    }, [favorites, showOnlineOnly, filterCategory, selectedTags]);

    // Handlers
    const handleRefresh = async () => {
        await checkNow();
        refresh();
    };

    const handleSelect = (id: string) => {
        setSelectedStreams(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleBulkLoad = async () => {
        if (selectedStreams.length === 0) return;

        const chunks = favorites.filter(f => selectedStreams.includes(f.id));

        // Add all selected streams
        // We probably need to position them or just add them sequentially
        // `addStream` adds to the list. `SimpleCanvas` will auto-layout NEW items if logic exists,
        // or we might need to manually place them.
        // The store's `addStream` usually handles layout.

        let addedCount = 0;
        for (const fav of chunks) {
            try {
                // Use liveUrl if available to skip resolution
                const urlToAdd = (fav as any).liveUrl || fav.url;
                await addStream(urlToAdd, {
                    withChat: true,
                    withStream: true,
                    displayName: fav.name
                });
                addedCount++;
            } catch (e) {
                console.error(`Failed to add ${fav.name}`, e);
            }
        }

        toast.success(t('favorites:added_count', { count: addedCount }) || `已載入 ${addedCount} 個頻道`);
        setSelectedStreams([]);
        setIsOpen(false);
    };

    const handleLoadCategory = async (catId: string) => {
        const catStreams = favorites.filter(f => f.categoryId === catId);
        if (catStreams.length === 0) {
            toast.error(t('favorites:no_streams_in_category') || '分類中沒有頻道');
            return;
        }

        // Limit to avoid overload?
        if (catStreams.length > 9) {
            if (!confirm(t('favorites:confirm_load_large', { count: catStreams.length }) || `確定要載入 ${catStreams.length} 個頻道嗎？可能會造成卡頓`)) {
                return;
            }
        }

        let addedCount = 0;
        for (const fav of catStreams) {
            // Use liveUrl if available
            const urlToAdd = (fav as any).liveUrl || fav.url;
            await addStream(urlToAdd, {
                withChat: true,
                withStream: true,
                displayName: fav.name
            });
            addedCount++;
        }
        toast.success(t('favorites:added_count', { count: addedCount }) || `已載入 ${addedCount} 個頻道`);
        setIsOpen(false);
    };

    return (
        <Popover open={isOpen} onOpenChange={(open: boolean) => { setIsOpen(open); if (!open) setMenu(null); }}>
            <PopoverTrigger asChild>
                {children}
            </PopoverTrigger>
            <PopoverContent
                className="w-[320px] p-0 text-white"
                side="top"
                align="center"
                sideOffset={16}
                style={{
                    background: 'rgba(12,12,17,0.92)',
                    backdropFilter: 'blur(22px)',
                    WebkitBackdropFilter: 'blur(22px)',
                    borderRadius: 20,
                    border: '1px solid rgba(255,255,255,0.12)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 30px 60px -18px rgba(0,0,0,0.75)',
                }}
            >

                {/* Header(gold icon chip) */}
                <div className="flex items-center justify-between" style={{ padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <span className="font-semibold text-sm flex items-center gap-2.5">
                        <span
                            className="flex items-center justify-center"
                            style={{
                                width: 30,
                                height: 30,
                                borderRadius: 9,
                                background: `${FAV_ACCENT}1f`,
                                color: FAV_ACCENT,
                                boxShadow: `inset 0 0 0 1px ${FAV_ACCENT}40`,
                            }}
                        >
                            <Star size={16} fill="currentColor" />
                        </span>
                        {t('favorites:favorites_menu', '收藏直播')}
                    </span>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg hover:bg-white/10"
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            title={t('common.refresh', '重新整理')}
                        >
                            <RefreshCw size={13} className={cn(isRefreshing && "animate-spin")} />
                        </Button>
                    </div>
                </div>

                {/* Filters(in-panel chooser pills,點下切 menu 視圖,不另開 dropdown) */}
                <div className="flex items-center gap-1.5 p-2.5 border-b border-white/10 overflow-x-auto scrollbar-hide">
                    <button
                        type="button"
                        onClick={() => setShowOnlineOnly(!showOnlineOnly)}
                        style={favPillStyle(showOnlineOnly)}
                    >
                        <span
                            className="inline-block rounded-full"
                            style={{
                                width: 6,
                                height: 6,
                                background: showOnlineOnly ? '#10b981' : 'rgba(255,255,255,0.4)',
                                boxShadow: showOnlineOnly ? '0 0 5px #10b981' : 'none',
                            }}
                        />
                        {t('favorites:online_only', '僅顯示直播中')}
                    </button>

                    <button
                        type="button"
                        onClick={() => setMenu(menu === 'cat' ? null : 'cat')}
                        style={favPillStyle(!!filterCategory || menu === 'cat')}
                    >
                        <Grid2X2 size={11} />
                        {filterCategory ? categories.find(c => c.id === filterCategory)?.name : t('common.category', '分類')}
                        <ChevronDown size={11} />
                    </button>

                    <button
                        type="button"
                        onClick={() => setMenu(menu === 'tag' ? null : 'tag')}
                        style={favPillStyle(selectedTags.length > 0 || menu === 'tag')}
                    >
                        <Hash size={11} />
                        {t('tags:tags', '標籤')}{selectedTags.length > 0 ? ` · ${selectedTags.length}` : ''}
                        <ChevronDown size={11} />
                    </button>
                </div>

                {/* Body: chooser 視圖(分類 / 標籤)取代列表,或顯示列表 */}
                {menu === 'cat' ? (
                    <FavChooser
                        title={t('favorites:select_category', '選擇分類')}
                        onClose={() => setMenu(null)}
                        footer={
                            <button
                                type="button"
                                onClick={() => { setFilterCategory(null); setMenu(null); }}
                                style={favClearBtnStyle}
                            >
                                {t('favorites:all_categories', '全部分類')}
                            </button>
                        }
                    >
                        {categories.length === 0 ? (
                            <div className="text-xs text-white/40 px-2 py-3 text-center">
                                {t('favorites:no_categories', '沒有分類')}
                            </div>
                        ) : (
                            categories.map(cat => {
                                const active = filterCategory === cat.id;
                                const n = favorites.filter(f => f.categoryId === cat.id).length;
                                return (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => { setFilterCategory(cat.id); setMenu(null); }}
                                        style={favRowBtnStyle(active)}
                                    >
                                        <span className="flex items-center" style={{ gap: 9 }}>
                                            <Grid2X2 size={13} style={{ color: active ? FAV_ACCENT : 'rgba(255,255,255,0.5)' }} />
                                            <span style={{ fontSize: 13, fontWeight: 500 }}>{cat.name}</span>
                                        </span>
                                        <span className="flex items-center" style={{ gap: 8 }}>
                                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{n}</span>
                                            {active && <Check size={14} style={{ color: FAV_ACCENT }} />}
                                        </span>
                                    </button>
                                );
                            })
                        )}
                    </FavChooser>
                ) : menu === 'tag' ? (
                    <FavChooser
                        title={t('favorites:select_tags_multi', '選擇標籤(可多選)')}
                        onClose={() => setMenu(null)}
                        footer={
                            <div className="flex" style={{ gap: 8 }}>
                                <button type="button" onClick={() => setSelectedTags([])} style={favClearBtnStyle}>
                                    {t('common.clear', '清除')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMenu(null)}
                                    style={{ ...favClearBtnStyle, flex: 1, background: FAV_ACCENT, color: '#1a1206', border: 0, fontWeight: 700 }}
                                >
                                    {t('common.done', '完成')}{selectedTags.length > 0 ? ` (${selectedTags.length})` : ''}
                                </button>
                            </div>
                        }
                    >
                        {tags.length === 0 ? (
                            <div className="text-xs text-white/40 px-2 py-3 text-center">
                                {t('tags:noTagsFound', '沒有標籤')}
                            </div>
                        ) : (
                            <div className="flex flex-wrap" style={{ gap: 8, padding: '2px 2px 6px' }}>
                                {tags.map(tag => {
                                    const active = selectedTags.includes(tag.id);
                                    return (
                                        <button
                                            key={tag.id}
                                            type="button"
                                            onClick={() => setSelectedTags(prev =>
                                                prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                                            )}
                                            className="inline-flex items-center"
                                            style={{
                                                gap: 7,
                                                padding: '7px 12px',
                                                borderRadius: 9999,
                                                cursor: 'pointer',
                                                fontSize: 12.5,
                                                fontWeight: 600,
                                                background: active ? `${tag.color}26` : 'rgba(255,255,255,0.04)',
                                                border: `1px solid ${active ? tag.color : 'rgba(255,255,255,0.1)'}`,
                                                color: active ? 'white' : 'rgba(255,255,255,0.65)',
                                                transition: 'all 0.15s',
                                            }}
                                        >
                                            <span
                                                className="rounded-full"
                                                style={{ width: 8, height: 8, background: tag.color, boxShadow: active ? `0 0 6px ${tag.color}` : 'none' }}
                                            />
                                            {tag.name}
                                            {active && <Check size={12} className="text-white" />}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </FavChooser>
                ) : (
                <ScrollArea className="h-[280px]">
                    <div className="p-1 space-y-1">
                        {filteredFavorites.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 text-white/30 text-xs">
                                <Filter size={24} className="mb-2 opacity-50" />
                                {t('common.no_data', '沒有符合的資料')}
                            </div>
                        ) : (
                            filteredFavorites.map(fav => (
                                <div
                                    key={fav.id}
                                    className="flex items-center gap-3 p-2 rounded-lg transition-colors cursor-pointer group"
                                    style={selectedStreams.includes(fav.id)
                                        ? { background: `${FAV_ACCENT}1f`, boxShadow: `inset 0 0 0 1px ${FAV_ACCENT}4d` }
                                        : undefined}
                                    onMouseEnter={(e) => { if (!selectedStreams.includes(fav.id)) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                                    onMouseLeave={(e) => { if (!selectedStreams.includes(fav.id)) e.currentTarget.style.background = ''; }}
                                    onClick={() => handleSelect(fav.id)}
                                >
                                    <Checkbox
                                        checked={selectedStreams.includes(fav.id)}
                                        onCheckedChange={() => handleSelect(fav.id)}
                                        className="border-white/30 data-[state=checked]:bg-amber-400 data-[state=checked]:border-amber-400 data-[state=checked]:text-black"
                                    />

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium truncate text-white/90 group-hover:text-white">
                                                {fav.name}
                                            </span>
                                            {fav.isLive && (
                                                <Badge variant="outline" className="h-4 px-1 text-[9px] border-red-500/50 text-red-400 bg-red-500/10">LIVE</Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] text-white/50">
                                            <span className={cn(
                                                "uppercase font-bold tracking-wider",
                                                fav.platform === 'twitch' ? "text-purple-400" : "text-red-400"
                                            )}>
                                                {fav.platform}
                                            </span>
                                            {fav.categoryId && (
                                                <span className="px-1.5 py-0.5 rounded-sm bg-white/10">
                                                    {categories.find(c => c.id === fav.categoryId)?.name}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>
                )}

                {/* Footer Action */}
                {menu === null && selectedStreams.length > 0 && (
                    <div className="p-3 border-t border-white/10 bg-black/50">
                        <Button
                            className="w-full gap-2 font-semibold hover:brightness-110"
                            style={{ background: FAV_ACCENT, color: '#1a1206', boxShadow: `0 8px 20px -8px ${FAV_ACCENT}` }}
                            onClick={handleBulkLoad}
                            size="sm"
                        >
                            <Play size={14} className="fill-current" />
                            {t('favorites:load_selected_count', { count: selectedStreams.length }) || `載入 ${selectedStreams.length} 個頻道`}
                        </Button>
                    </div>
                )}

                {/* Category Quick Actions if no selection */}
                {menu === null && selectedStreams.length === 0 && filterCategory && (
                    <div className="p-3 border-t border-white/10 bg-black/50">
                        <Button
                            variant="secondary"
                            className="w-full gap-2 text-xs"
                            onClick={() => handleLoadCategory(filterCategory)}
                            size="sm"
                        >
                            <Grid2X2 size={14} />
                            {t('favorites:load_category_all', '載入此分類所有頻道')}
                        </Button>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
};
