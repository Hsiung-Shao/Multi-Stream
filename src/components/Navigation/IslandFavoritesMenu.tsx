
import { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Filter, Play, Grid2X2, Hash } from 'lucide-react';
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { useLiveStatusCheck } from '../../features/favorites/useLiveStatusCheck';
import { Star } from 'lucide-react';

// Favorites 面板主題色(對齊設計 FN.fav = gold)
const FAV_ACCENT = '#fbbf24';

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
        <Popover open={isOpen} onOpenChange={setIsOpen}>
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

                {/* Filters */}
                <div className="flex items-center gap-2 p-2.5 border-b border-white/10 overflow-x-auto scrollbar-hide">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs rounded-full px-3 gap-1.5 shrink-0"
                        style={showOnlineOnly
                            ? { background: `${FAV_ACCENT}1f`, color: FAV_ACCENT, boxShadow: `inset 0 0 0 1px ${FAV_ACCENT}59` }
                            : { color: 'rgba(255,255,255,0.6)' }}
                        onClick={() => setShowOnlineOnly(!showOnlineOnly)}
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
                    </Button>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs rounded-full px-2.5 gap-1 shrink-0"
                                style={filterCategory
                                    ? { background: `${FAV_ACCENT}1f`, color: FAV_ACCENT, boxShadow: `inset 0 0 0 1px ${FAV_ACCENT}59` }
                                    : { color: 'rgba(255,255,255,0.6)' }}
                            >
                                <Grid2X2 size={12} />
                                {filterCategory ? categories.find(c => c.id === filterCategory)?.name : t('common.category', '分類')}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-slate-900 border-white/10 text-white z-[70]">
                            <DropdownMenuItem onClick={() => setFilterCategory(null)}>
                                {t('common.all', '全部')}
                            </DropdownMenuItem>
                            {categories.map(cat => (
                                <DropdownMenuItem key={cat.id} onClick={() => setFilterCategory(cat.id)}>
                                    {cat.name}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Tags Filter */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs rounded-full px-2.5 gap-1 shrink-0"
                                style={selectedTags.length > 0
                                    ? { background: `${FAV_ACCENT}1f`, color: FAV_ACCENT, boxShadow: `inset 0 0 0 1px ${FAV_ACCENT}59` }
                                    : { color: 'rgba(255,255,255,0.6)' }}
                            >
                                <Hash size={12} />
                                {selectedTags.length > 0 ? `已選 ${selectedTags.length}` : t('tags:tags', '標籤')}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-slate-900 border-white/10 text-white z-[70] w-48">
                            <div className="p-2 space-y-1">
                                {tags.map(tag => (
                                    <div
                                        key={tag.id}
                                        className="flex items-center gap-2 p-1.5 rounded hover:bg-white/10 cursor-pointer"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            setSelectedTags(prev =>
                                                prev.includes(tag.id)
                                                    ? prev.filter(id => id !== tag.id)
                                                    : [...prev, tag.id]
                                            );
                                        }}
                                    >
                                        <Checkbox
                                            checked={selectedTags.includes(tag.id)}
                                            onCheckedChange={(checked: boolean) => {
                                                setSelectedTags(prev =>
                                                    checked
                                                        ? [...prev, tag.id]
                                                        : prev.filter(id => id !== tag.id)
                                                );
                                            }}
                                            className="border-white/30 data-[state=checked]:bg-amber-400 data-[state=checked]:border-amber-400 data-[state=checked]:text-black size-3.5"
                                        />
                                        <div className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />
                                        <span className="text-sm flex-1 truncate">{tag.name}</span>
                                    </div>
                                ))}
                                {tags.length === 0 && (
                                    <div className="text-xs text-white/40 px-2 py-1">{t('tags:noTagsFound', '沒有標籤')}</div>
                                )}
                            </div>
                            {selectedTags.length > 0 && (
                                <div className="p-2 border-t border-white/10">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full h-6 text-xs text-white/50 hover:text-white"
                                        onClick={() => setSelectedTags([])}
                                    >
                                        {t('common.clear', '清除')}
                                    </Button>
                                </div>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Category Quick Load Button (in dropdown maybe?) */}
                </div>

                {/* List */}
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

                {/* Footer Action */}
                {selectedStreams.length > 0 && (
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
                {selectedStreams.length === 0 && filterCategory && (
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
