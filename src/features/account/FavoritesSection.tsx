import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Star, Plus, Search } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { ScrollArea } from '../../components/ui/scroll-area';
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from '../../components/ui/pagination';
import { useUIStore } from '../../store/useUIStore';
import { useFavorites } from '../../hooks/useFavorites';
import { tagsService } from '../favorites/TagsService';
import { favoritesService } from '../favorites/FavoritesService';
import { favoritesLoader } from '../favorites/FavoritesLoader';
import { FavoriteListItem } from '../favorites/components/FavoriteListItem';
import {
    AddFavoriteDialog,
    type AddFavoriteFormValues,
} from '../favorites/components/AddFavoriteDialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { logEvent } from '../../utils/analytics';
import { getPageNumbers } from '../../utils/pagination';
import type { FavoriteStream, Tag } from '../favorites/types';

const PAGE_SIZE = 15;

/**
 * 帳號頁「收藏列表」section（inline 版）
 *
 * 設計：直接在帳號頁內顯示完整收藏列表（取代原本「管理收藏」按鈕開 FavoritesManagerMain
 * dialog 的設計）。提供常用核心操作：搜尋 / 新增 / 編輯 / 刪除 / 載入 / 推薦。
 *
 * 進階功能（分類管理、標籤管理、批量匯入、備份/還原、版本歷史、Layout 管理）
 * 仍保留在 /canvas 的 FavoritesManagerMain dialog；此 section 不引導打開該 dialog。
 */
export function FavoritesSection() {
    const { t } = useTranslation(['account', 'favorites', 'common']);
    const theme = useUIStore((s) => s.theme);
    const themeMode: 'light' | 'dark' = theme === 'dark' ? 'dark' : 'light';

    const { favorites, categories, refresh } = useFavorites();
    const [tags, setTags] = useState<Tag[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [editing, setEditing] = useState<FavoriteStream | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);

    useEffect(() => {
        const reload = () => setTags(tagsService.getAllTags());
        reload();
        // tagsService 觸發的更新事件名稱不可知，favorites refresh 時順便 reload tags
        window.addEventListener('favoritesUpdated', reload);
        return () => window.removeEventListener('favoritesUpdated', reload);
    }, []);

    const filtered = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return favorites;
        return favorites.filter(
            (f) =>
                f.name.toLowerCase().includes(q) ||
                f.url.toLowerCase().includes(q),
        );
    }, [favorites, searchQuery]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

    // 搜尋條件變動或刪除/新增後筆數減少時,若 currentPage 超出範圍 → reset 回最後一頁(或 1)
    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    // 搜尋變動時主動 reset 到第 1 頁(避免「在第 5 頁搜尋 → 看空白」)
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    const paginatedFavorites = useMemo(
        () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
        [filtered, currentPage],
    );

    const liveCount = useMemo(
        () => favorites.filter((f) => f.isLive === true).length,
        [favorites],
    );

    const handleSubmit = (data: AddFavoriteFormValues) => {
        if (editing) {
            favoritesService.updateFavorite(editing.id, {
                name: data.name,
                categoryId:
                    data.categoryId === 'uncategorized' ? null : data.categoryId,
                tagIds: data.tagIds,
            });
            logEvent('Favorites', 'edit_favorite_account_page');
        } else {
            favoritesService.addFavorite(
                data.url,
                data.name || undefined,
                data.categoryId === 'uncategorized' ? null : data.categoryId,
                undefined,
                undefined,
                data.tagIds,
            );
            logEvent('Favorites', 'add_favorite_account_page');
        }
        setIsAddOpen(false);
        setEditing(null);
        refresh();
    };

    const handleLoad = async (id: string) => {
        const fav = favorites.find((f) => f.id === id);
        if (fav) await favoritesLoader.load(fav);
    };

    const confirmDelete = () => {
        if (!deleteId) return;
        favoritesService.removeFavorite(deleteId);
        logEvent('Favorites', 'remove_favorite_account_page');
        setDeleteId(null);
        refresh();
    };

    return (
        <section className="rounded-xl border border-white/10 bg-card/50 p-5 space-y-4">
            <header className="flex items-start gap-3">
                <Star className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
                <div className="flex-1">
                    <h2 className="text-lg font-semibold">
                        {t('favorites.title', '收藏列表')}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                        {t(
                            'favorites.descriptionInline',
                            '管理你的收藏實況主，可從這裡一鍵推薦給 VTuber 探索。進階功能（分類、標籤、批量匯入）仍可在主畫面收藏管理視窗使用。',
                        )}
                    </p>
                </div>
            </header>

            <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-white/10 bg-background/30 p-3">
                    <div className="text-xs text-muted-foreground">
                        {t('favorites.totalLabel', '收藏總數')}
                    </div>
                    <div className="text-2xl font-bold mt-1">{favorites.length}</div>
                </div>
                <div className="rounded-md border border-white/10 bg-background/30 p-3">
                    <div className="text-xs text-muted-foreground">
                        {t('favorites.liveLabel', '直播中')}
                    </div>
                    <div className="text-2xl font-bold mt-1 text-emerald-500">
                        {liveCount}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t('favorites:searchPlaceholder', '搜尋收藏...')}
                        className="pl-9"
                    />
                </div>
                <Button
                    onClick={() => {
                        setEditing(null);
                        setIsAddOpen(true);
                    }}
                    className="gap-2"
                >
                    <Plus className="w-4 h-4" />
                    {t('favorites:add', '新增')}
                </Button>
            </div>

            <div className="rounded-lg border border-white/10 bg-background/30 overflow-hidden">
                <ScrollArea className="h-[420px]">
                    <div className="p-2 space-y-2">
                        {paginatedFavorites.length > 0 ? (
                            paginatedFavorites.map((fav) => (
                                <FavoriteListItem
                                    key={fav.id}
                                    favorite={fav}
                                    categories={categories}
                                    tags={tags}
                                    isSelected={false}
                                    onSelect={() => { /* 帳號頁不支援批次選取 */ }}
                                    onStartEdit={(f) => {
                                        setEditing(f);
                                        setIsAddOpen(true);
                                    }}
                                    onDelete={(id) => setDeleteId(id)}
                                    onLoad={handleLoad}
                                />
                            ))
                        ) : (
                            <div className="h-72 flex flex-col items-center justify-center text-muted-foreground gap-3">
                                <Star className="size-8 opacity-30" />
                                <p className="text-sm">
                                    {searchQuery
                                        ? t('favorites:noMatchingFavorites', '找不到符合的收藏')
                                        : t('favorites:noFavorites', '尚無收藏')}
                                </p>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </div>

            {totalPages > 1 && (
                <Pagination>
                    <PaginationContent>
                        <PaginationItem>
                            <PaginationPrevious
                                href="#"
                                size="default"
                                aria-label={t('favorites.pagination.previous', '上一頁')}
                                aria-disabled={currentPage === 1}
                                tabIndex={currentPage === 1 ? -1 : 0}
                                className={
                                    currentPage === 1
                                        ? 'pointer-events-none opacity-50'
                                        : ''
                                }
                                onClick={(e) => {
                                    e.preventDefault();
                                    if (currentPage > 1) setCurrentPage(currentPage - 1);
                                }}
                            />
                        </PaginationItem>
                        {getPageNumbers(currentPage, totalPages).map((page, idx) =>
                            page === 'ellipsis' ? (
                                <PaginationItem key={`ellipsis-${idx}`}>
                                    <PaginationEllipsis />
                                </PaginationItem>
                            ) : (
                                <PaginationItem key={page}>
                                    <PaginationLink
                                        href="#"
                                        size="icon"
                                        isActive={page === currentPage}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            setCurrentPage(page);
                                        }}
                                    >
                                        {page}
                                    </PaginationLink>
                                </PaginationItem>
                            ),
                        )}
                        <PaginationItem>
                            <PaginationNext
                                href="#"
                                size="default"
                                aria-label={t('favorites.pagination.next', '下一頁')}
                                aria-disabled={currentPage === totalPages}
                                tabIndex={currentPage === totalPages ? -1 : 0}
                                className={
                                    currentPage === totalPages
                                        ? 'pointer-events-none opacity-50'
                                        : ''
                                }
                                onClick={(e) => {
                                    e.preventDefault();
                                    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                                }}
                            />
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
            )}

            <AddFavoriteDialog
                open={isAddOpen}
                onOpenChange={(open) => {
                    setIsAddOpen(open);
                    if (!open) setEditing(null);
                }}
                onSubmit={handleSubmit}
                categories={categories}
                allTags={tags}
                initialData={editing}
                theme={themeMode}
            />

            <AlertDialog
                open={!!deleteId}
                onOpenChange={(open) => !open && setDeleteId(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t('favorites:confirmDelete', '確定要刪除嗎？')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                'favorites:confirmDeleteDesc',
                                '此操作無法復原，將從你的收藏中永久移除這筆資料。',
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {t('common:common.cancel', '取消')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDelete}
                            className="bg-red-500 hover:bg-red-600"
                        >
                            {t('common:common.delete', '刪除')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </section>
    );
}
