import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Layout, Search, Filter, RotateCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { useFavorites } from '../../hooks/useFavorites';
import { favoritesLoader } from '../../features/favorites/FavoritesLoader';
import { FavoriteListItem } from '../../features/favorites/components/FavoriteListItem';
import { useLiveStatusCheck } from '../../features/favorites/useLiveStatusCheck';
import { tagsService } from '../../features/favorites/TagsService';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '../ui/select';
import { useUIStore } from '../../store/useUIStore';
import { toast } from 'sonner';
import { cn } from '../ui/utils';
import { TagFilterLayout } from '../ui/TagFilterLayout';
import { DEFAULT_TAG_IS_LIVE_ID } from '../../features/favorites/constants';
import type { Tag } from '../../features/favorites/types';

const ITEMS_PER_PAGE = 7;

export const FavoritesWidget = () => {
    const { t } = useTranslation(['common', 'favorites', 'welcome', 'tags']);
    const { favorites, categories } = useFavorites();
    const openModal = useUIStore(s => s.openModal);
    const { checkNow, isRefreshing } = useLiveStatusCheck();

    // State
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const tags = useMemo(() => tagsService.getAllTags(), []);

    // Create display tags including "Live" tag
    const displayTags = useMemo(() => {
        const isLiveTag: Tag = {
            id: DEFAULT_TAG_IS_LIVE_ID,
            name: t('tags:isLive') || '直播中',
            color: '#ef4444', // Red-500
            order: -100
        };
        return [isLiveTag, ...tags];
    }, [tags, t]);

    // Handlers
    const handleRefresh = async () => {
        await checkNow();
    };

    const handleSelect = (id: string, checked: boolean) => {
        const next = new Set(selectedIds);
        if (checked) next.add(id);
        else next.delete(id);
        setSelectedIds(next);
    };

    const handleBatchLoad = async () => {
        const selected = favorites.filter(f => selectedIds.has(f.id));
        if (selected.length === 0) return;

        toast.promise(favoritesLoader.loadMultiple(selected), {
            loading: t('common:common.loading'),
            success: t('favorites:loadSuccess'),
            error: t('favorites:loadError')
        });
        setSelectedIds(new Set());
    };

    // Filter Logic
    const filteredItems = useMemo(() => {
        return favorites.filter(f => {
            // 1. Category Filter
            if (selectedCategory !== 'all') {
                if (f.categoryId !== selectedCategory) return false;
            }

            // 2. Tags Filter (AND logic)
            if (selectedTags.length > 0) {
                const matchAllTags = selectedTags.every(tagId => {
                    if (tagId === DEFAULT_TAG_IS_LIVE_ID) return f.isLive === true;
                    return f.tagIds?.includes(tagId);
                });
                if (!matchAllTags) return false;
            }

            // 3. Search Filter
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                return (
                    f.name.toLowerCase().includes(q) ||
                    f.url.toLowerCase().includes(q)
                );
            }

            return true;
        });
    }, [favorites, selectedCategory, selectedTags, searchQuery]);

    // Pagination Logic
    const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
    const currentItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredItems.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredItems, currentPage, ITEMS_PER_PAGE]);

    // Reset pagination when filter changes
    useMemo(() => {
        setCurrentPage(1);
    }, [selectedCategory, selectedTags, searchQuery]);

    return (
        <div className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 shadow-xl backdrop-blur-sm transition-all hover:shadow-2xl h-full flex flex-col group">
            <div className="absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-purple-500/10 blur-3xl group-hover:bg-purple-500/20 transition-all duration-500" />

            {/* Header */}
            <div className="flex flex-col gap-3 mb-4 relative z-10">
                <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Layout className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                        {t('favorites:myFavorites') || 'My Favorites'}
                        <Badge variant="secondary" className="bg-gray-100 text-gray-900 dark:bg-white/10 dark:text-white border-0">
                            {filteredItems.length}
                        </Badge>
                    </h3>
                    <div className="flex items-center gap-2">
                        {selectedIds.size > 0 && (
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={handleBatchLoad}
                                className="h-8 bg-purple-500/20 text-purple-300 hover:bg-purple-500 hover:text-white"
                            >
                                {t('favorites:load')} ({selectedIds.size})
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleRefresh}
                            className="h-8 w-8 text-gray-500 hover:text-gray-900 dark:text-white/40 dark:hover:text-white"
                        >
                            <RotateCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                        </Button>
                    </div>
                </div>

                {/* Filters Row: Search + Category Select */}
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 dark:text-white/40" />
                        <Input
                            placeholder={t('favorites:searchPlaceholder') || 'Search...'}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 bg-gray-50 dark:bg-black/20 border-gray-200 dark:border-white/10 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 h-9"
                        />
                    </div>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                        <SelectTrigger className="w-[140px] bg-gray-50 dark:bg-black/20 border-gray-200 dark:border-white/10 text-gray-900 dark:text-white h-9">
                            <Filter className="w-3.5 h-3.5 mr-2 opacity-50" />
                            <SelectValue placeholder="All Categories" />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                            <SelectItem value="all">{t('common:common.all')}</SelectItem>
                            <SelectGroup>
                                <SelectLabel className="px-2 py-1.5 text-xs font-semibold text-gray-500 dark:text-white/50">Categories</SelectLabel>
                                {categories.map(cat => (
                                    <SelectItem key={cat.id} value={cat.id} className="text-gray-900 dark:text-white focus:bg-gray-100 dark:focus:bg-gray-800">{cat.name}</SelectItem>
                                ))}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                </div>

                {/* Horizontal Tag Filters */}
                {displayTags.length > 0 && (
                    <div className="w-full">
                        <TagFilterLayout
                            tags={displayTags}
                            selectedTags={selectedTags}
                            onToggleTag={(tagId) => {
                                setSelectedTags(prev =>
                                    prev.includes(tagId)
                                        ? prev.filter(id => id !== tagId)
                                        : [...prev, tagId]
                                );
                            }}
                            onClear={() => setSelectedTags([])}
                            // theme="dark"  <-- Removed
                            maxVisibleTags={15}
                        />
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 relative z-10 flex flex-col">
                <ScrollArea className="flex-1 h-full pr-2">
                    <div className="space-y-2 pb-2">
                        {currentItems.length > 0 ? (
                            currentItems.map(fav => (
                                <FavoriteListItem
                                    key={fav.id}
                                    favorite={fav}
                                    categories={categories}
                                    tags={tags}
                                    // theme="dark" // Using responsive classes inside FavoriteListItem
                                    isSelected={selectedIds.has(fav.id)}
                                    onSelect={handleSelect}
                                    onStartEdit={() => {
                                        openModal('favorites', 'favorites');
                                    }}
                                    onDelete={() => {
                                        openModal('favorites', 'favorites');
                                    }}
                                    onLoad={() => favoritesLoader.load(fav)}
                                />
                            ))
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-white/30">
                                <Search className="h-8 w-8 mb-2 opacity-50" />
                                <p className="text-sm">{t('favorites:noFavorites')}</p>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-white/10 relative z-10">
                    <div className="text-xs text-gray-500 dark:text-white/40">
                        {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)} of {filteredItems.length}
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(p => p - 1)}
                            className="h-7 w-7 text-gray-500 hover:text-gray-900 dark:text-white/60 dark:hover:text-white"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(p => p + 1)}
                            className="h-7 w-7 text-gray-500 hover:text-gray-900 dark:text-white/60 dark:hover:text-white"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};
