import { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent } from '../../../components/ui/dialog';
import { useTranslation } from 'react-i18next';
import { FavoritesSidebar } from './FavoritesSidebar';
import { FavoritesToolbar } from './FavoritesToolbar';
import { FavoriteListItem } from './FavoriteListItem';
import { AddFavoriteDialog, AddFavoriteFormValues } from './AddFavoriteDialog';
import { BatchImportSection } from './BatchImportSection';
import { BackupSection } from './BackupSection';
import { TwitchIntegrationSection } from './TwitchIntegrationSection';
import { SettingsSection } from './SettingsSection';
import { favoritesService } from '../FavoritesService';
import { tagsService } from '../TagsService';
import { favoritesLoader } from '../FavoritesLoader';
import { logEvent } from '../../../utils/analytics';
import { toast } from 'sonner';
import { ScrollArea } from '../../../components/ui/scroll-area';

// Twitch Integration
import { useTwitchAuth } from '../../../hooks/useTwitchAuth';
import { useTwitchUser, FollowedChannel } from '../../../hooks/useTwitchUser';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Edit2, Trash2, Star, Plus } from 'lucide-react';

import type { FavoriteStream, FavoriteCategory as Category, Tag } from '../types';

interface FavoritesManagerMainProps {
    theme: 'light' | 'dark';
    onClose: () => void;
}

export function FavoritesManagerMain({ theme, onClose }: FavoritesManagerMainProps) {
    const { t } = useTranslation(['favorites', 'common', 'tags']);

    // --- State ---
    const [activeTab, setActiveTab] = useState('favorites'); // favorites, twitch_import, global_settings, tags, categories, backup, batch
    const [activeFilter, setActiveFilter] = useState('all'); // all, live, categoryId, or tag:tagId
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [favorites, setFavorites] = useState<FavoriteStream[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [tags, setTags] = useState<Tag[]>([]);

    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [editingFavorite, setEditingFavorite] = useState<FavoriteStream | null>(null);

    // --- Tag Editing State ---
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState('#3b82f6');

    // --- Category Editing State ---
    const [newCategoryName, setNewCategoryName] = useState('');

    // --- Twitch State ---
    const { token, isLoggedIn, login, logout, shouldOpenSettings, clearPendingFlag } = useTwitchAuth();
    const {
        user: twitchUser,
        loading: twitchLoading,
        followedChannels,
        hasMore: twitchHasMore,
        fetchUser,
        fetchFollowedChannels,
        loadMore: loadMoreChannels,
        reset: resetTwitchUser
    } = useTwitchUser();

    // --- Data Loading ---
    const loadData = useCallback(() => {
        setFavorites(favoritesService.getFavorites());
        setCategories(favoritesService.getCategories());
        setTags(tagsService.getAllTags());
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // --- Twitch Effects ---
    useEffect(() => {
        if (shouldOpenSettings) {
            setActiveTab('twitch_import'); // Redirect to Twitch Import tab
            clearPendingFlag();
        }
    }, [shouldOpenSettings, clearPendingFlag]);

    useEffect(() => {
        if (token && !twitchUser) {
            fetchUser(token);
        }
    }, [token, twitchUser, fetchUser]);

    // --- Filtering Logic ---
    const filteredFavorites = useMemo(() => {
        let result = favorites;

        // Filter by Tab/Category/Tag
        if (activeFilter === 'live') {
            result = result.filter(f => f.isLive);
        } else if (activeFilter.startsWith('tag:')) {
            const tagId = activeFilter.split(':')[1];
            result = result.filter(f => f.tagIds?.includes(tagId));
        } else if (activeFilter !== 'all') {
            result = result.filter(f => f.categoryId === activeFilter);
        }

        // Filter by Search
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(f =>
                f.name.toLowerCase().includes(q) ||
                f.url.toLowerCase().includes(q)
            );
        }

        return result;
    }, [favorites, activeFilter, searchQuery]);

    // --- Handlers ---
    const handleSelect = (id: string, checked: boolean) => {
        const next = new Set(selectedIds);
        if (checked) next.add(id);
        else next.delete(id);
        setSelectedIds(next);
    };

    const handleSelectAll = () => {
        setSelectedIds(new Set(filteredFavorites.map(f => f.id)));
    };

    const handleDeselectAll = () => {
        setSelectedIds(new Set());
    };

    const handleDelete = (id: string) => {
        if (confirm(t('confirmDelete') || '確定要刪除嗎？')) {
            favoritesService.removeFavorite(id);
            loadData();
            logEvent('Favorites', 'remove_favorite', 'single');
        }
    };

    const handleBatchDelete = () => {
        if (confirm(t('confirmDeleteCount', { count: selectedIds.size }) || `確定要刪除選定的 ${selectedIds.size} 項嗎？`)) {
            selectedIds.forEach(id => favoritesService.removeFavorite(id));
            setSelectedIds(new Set());
            loadData();
            logEvent('Favorites', 'batch_delete', 'selection', selectedIds.size);
        }
    };

    const handleLoad = async (id: string) => {
        const fav = favorites.find(f => f.id === id);
        if (fav) {
            await favoritesLoader.load(fav);
        }
    };

    const handleBatchLoad = async () => {
        const selected = favorites.filter(f => selectedIds.has(f.id));
        await favoritesLoader.loadMultiple(selected);
    };

    const handleAddOrEditSubmit = (data: AddFavoriteFormValues) => {
        if (editingFavorite) {
            favoritesService.updateFavorite(editingFavorite.id, {
                name: data.name,
                categoryId: data.categoryId === 'uncategorized' ? null : data.categoryId,
                tagIds: data.tagIds
            });
        } else {
            favoritesService.addFavorite(
                data.url,
                data.name || undefined,
                data.categoryId === 'uncategorized' ? null : data.categoryId,
                undefined,
                undefined,
                data.tagIds
            );
        }
        setIsAddDialogOpen(false);
        setEditingFavorite(null);
        loadData();
    };

    // --- Category Handlers ---
    const handleAddCategory = () => {
        if (!newCategoryName.trim()) return;
        favoritesService.addCategory(newCategoryName.trim());
        setNewCategoryName('');
        loadData();
        toast.success(t('addCategorySuccess') || '分類已新增');
    };

    const handleDeleteCategory = (id: string) => {
        if (confirm(t('confirmDelete') || '確定要刪除嗎？')) {
            favoritesService.removeCategory(id);
            loadData();
            if (activeFilter === id) setActiveFilter('all');
            toast.info('分類已刪除');
        }
    };

    // --- Tag Handlers ---
    const handleAddTag = () => {
        if (!newTagName.trim()) return;
        tagsService.addTag(newTagName.trim(), newTagColor);
        setNewTagName('');
        loadData();
        toast.success('標籤已新增');
    };

    const handleDeleteTag = (tagId: string) => {
        if (confirm(t('confirmDelete') || '確定要刪除嗎？')) {
            tagsService.removeTag(tagId);
            loadData();
            toast.info('標籤已刪除');
        }
    };

    // --- Twitch Handlers ---
    const handleImportTwitchChannels = async (channels: FollowedChannel[]) => {
        let imported = 0;
        for (const channel of channels) {
            const url = `https://www.twitch.tv/${channel.broadcasterLogin}`;
            const result = await favoritesService.addFavorite(url, channel.broadcasterName);
            if (result.success) imported++;
        }
        loadData();
        setActiveTab('favorites');
        toast.success(`成功匯入 ${imported} 個頻道`);
    };

    return (
        <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className={`sm:max-w-5xl w-full h-[80vh] flex flex-col p-0 gap-0 overflow-hidden ${theme === 'dark' ? 'bg-gray-950 border-gray-800' : 'bg-white'
                }`}>
                <div className="flex flex-1 min-h-0">
                    {/* Sidebar */}
                    <FavoritesSidebar
                        theme={theme}
                        categories={categories}
                        tags={tags}
                        favoritesCount={favorites.length}
                        activeFilter={activeFilter}
                        onFilterChange={setActiveFilter}
                        onNavigate={setActiveTab}
                        activeTab={activeTab}
                        onAddCategory={() => setActiveTab('categories')}
                    />

                    {/* Main Area */}
                    <div className="flex-1 flex flex-col p-8 overflow-hidden">
                        {activeTab === 'favorites' && (
                            <>
                                <FavoritesToolbar
                                    theme={theme}
                                    searchQuery={searchQuery}
                                    onSearchChange={setSearchQuery}
                                    selectedCount={selectedIds.size}
                                    onSelectAll={handleSelectAll}
                                    onDeselectAll={handleDeselectAll}
                                    onBatchDelete={handleBatchDelete}
                                    onBatchLoad={handleBatchLoad}
                                    onAddNew={() => {
                                        setEditingFavorite(null);
                                        setIsAddDialogOpen(true);
                                    }}
                                />

                                <div className="flex-1 min-h-0 mt-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 overflow-hidden">
                                    <ScrollArea className="h-full">
                                        <div className="p-2 space-y-2">
                                            {filteredFavorites.length > 0 ? (
                                                filteredFavorites.map(fav => (
                                                    <FavoriteListItem
                                                        key={fav.id}
                                                        favorite={fav}
                                                        categories={categories}
                                                        tags={tags}
                                                        theme={theme}
                                                        isSelected={selectedIds.has(fav.id)}
                                                        onSelect={handleSelect}
                                                        onStartEdit={(f) => {
                                                            setEditingFavorite(f);
                                                            setIsAddDialogOpen(true);
                                                        }}
                                                        onDelete={handleDelete}
                                                        onLoad={handleLoad}
                                                    />
                                                ))
                                            ) : (
                                                <div className="h-64 flex flex-col items-center justify-center text-gray-400 gap-4">
                                                    <div className="size-16 rounded-3xl bg-gray-50 dark:bg-gray-900 border border-dashed border-gray-200 dark:border-gray-800 flex items-center justify-center">
                                                        <Star className="size-8 opacity-20" />
                                                    </div>
                                                    <p className="text-sm font-medium">{t('noFavorites')}</p>
                                                </div>
                                            )}
                                        </div>
                                    </ScrollArea>
                                </div>
                            </>
                        )}

                        {activeTab === 'batch' && (
                            <BatchImportSection
                                theme={theme}
                                categories={categories}
                                onSuccess={() => {
                                    loadData();
                                    setActiveTab('favorites');
                                    toast.success('批量匯入完成');
                                }}
                            />
                        )}

                        {activeTab === 'twitch_import' && (
                            <div className="flex-1 flex flex-col gap-8 max-w-4xl mx-auto w-full py-4 overflow-hidden">
                                <ScrollArea className="h-full pr-4">
                                    <TwitchIntegrationSection
                                        theme={theme}
                                        isLoggedIn={isLoggedIn}
                                        login={login}
                                        logout={logout}
                                        resetTwitchUser={resetTwitchUser}
                                        twitchUser={twitchUser}
                                        channels={followedChannels}
                                        loading={twitchLoading}
                                        hasMore={twitchHasMore}
                                        onLoadMore={() => token && twitchUser && loadMoreChannels(token, twitchUser.id)}
                                        onImport={handleImportTwitchChannels}
                                        onFetchChannels={() => token && twitchUser && fetchFollowedChannels(token, twitchUser.id)}
                                    />
                                </ScrollArea>
                            </div>
                        )}

                        {activeTab === 'global_settings' && (
                            <SettingsSection
                                theme={theme}
                                currentTheme={theme}
                                onThemeChange={(val) => { console.log('Theme changed to', val); }}
                            />
                        )}

                        {activeTab === 'categories' && (
                            <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                                <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'}`}>
                                    <h3 className="text-lg font-bold mb-4 font-normal">{t('addCategory') || '新增分類'}</h3>
                                    <div className="flex gap-4 items-end">
                                        <div className="flex-1 space-y-2">
                                            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t('categoryName') || '分類名稱'}</label>
                                            <Input
                                                value={newCategoryName}
                                                onChange={(e) => setNewCategoryName(e.target.value)}
                                                placeholder="例如: 遊戲實況, 音樂台..."
                                                className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}
                                                onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                                            />
                                        </div>
                                        <Button onClick={handleAddCategory} className="bg-purple-600 hover:bg-purple-700 text-white h-10 rounded-lg px-6">
                                            <Plus className="size-4 mr-2" />
                                            {t('create') || '新增'}
                                        </Button>
                                    </div>
                                </div>

                                <div className="flex-1 min-h-0 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 overflow-hidden">
                                    <ScrollArea className="h-full">
                                        <div className="p-2 space-y-2">
                                            {categories.map(cat => (
                                                <div key={cat.id} className={`p-4 rounded-xl border flex items-center justify-between group transition-all duration-200 ${theme === 'dark' ? 'bg-gray-950 border-gray-800 hover:border-gray-600' : 'bg-white border-gray-200 hover:border-gray-400 font-normal'
                                                    }`}>
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500">
                                                            <Folder className="size-4" />
                                                        </div>
                                                        <span className="font-medium text-sm">{cat.name}</span>
                                                    </div>
                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="size-8 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                                                            onClick={() => handleDeleteCategory(cat.id)}
                                                        >
                                                            <Trash2 className="size-3.5" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                            {categories.length === 0 && (
                                                <div className="p-8 text-center text-gray-400 text-sm">
                                                    {t('noCategories')}
                                                </div>
                                            )}
                                        </div>
                                    </ScrollArea>
                                </div>
                            </div>
                        )}

                        {activeTab === 'tags' && (
                            <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                                <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'}`}>
                                    <h3 className="text-lg font-bold mb-4 font-normal">{t('tags:addTag')}</h3>
                                    <div className="flex gap-4 items-end">
                                        <div className="flex-1 space-y-2">
                                            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t('tags:tagName')}</label>
                                            <Input
                                                value={newTagName}
                                                onChange={(e) => setNewTagName(e.target.value)}
                                                placeholder="例如: 最愛, 遊戲, 音樂..."
                                                className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white'}
                                                onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t('tags:color')}</label>
                                            <div className="flex items-center gap-3 h-10 px-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800">
                                                <input
                                                    type="color"
                                                    value={newTagColor}
                                                    onChange={(e) => setNewTagColor(e.target.value)}
                                                    className="size-6 p-0 border-0 bg-transparent cursor-pointer rounded overflow-hidden"
                                                />
                                                <span className="text-xs font-mono uppercase text-gray-500">{newTagColor}</span>
                                            </div>
                                        </div>
                                        <Button onClick={handleAddTag} className="bg-purple-600 hover:bg-purple-700 text-white h-10 rounded-lg px-6">
                                            <Plus className="size-4 mr-2" />
                                            {t('create') || '新增'}
                                        </Button>
                                    </div>
                                </div>

                                <div className="flex-1 min-h-0 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 overflow-hidden">
                                    <ScrollArea className="h-full">
                                        <div className="p-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {tags.map(tag => (
                                                <div key={tag.id} className={`p-4 rounded-xl border flex items-center justify-between group transition-all duration-200 ${theme === 'dark' ? 'bg-gray-950 border-gray-800 hover:border-gray-600' : 'bg-white border-gray-200 hover:border-gray-400 font-normal'
                                                    }`}>
                                                    <div className="flex items-center gap-3">
                                                        <div className="size-3 rounded-full" style={{ backgroundColor: tag.color }} />
                                                        <span className="font-medium text-sm">{tag.name}</span>
                                                    </div>
                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button size="icon" variant="ghost" className="size-8">
                                                            <Edit2 className="size-3.5" />
                                                        </Button>
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="size-8 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                                                            onClick={() => handleDeleteTag(tag.id)}
                                                        >
                                                            <Trash2 className="size-3.5" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </div>
                            </div>
                        )}

                        {activeTab === 'backup' && (
                            <BackupSection
                                theme={theme}
                                onSuccess={(msg) => toast.success(msg)}
                                onError={(msg) => toast.error(msg)}
                            />
                        )}
                    </div>
                </div>

                <AddFavoriteDialog
                    open={isAddDialogOpen}
                    onOpenChange={setIsAddDialogOpen}
                    onSubmit={handleAddOrEditSubmit}
                    categories={categories}
                    allTags={tags}
                    initialData={editingFavorite}
                    theme={theme}
                />
            </DialogContent>
        </Dialog>
    );
}
