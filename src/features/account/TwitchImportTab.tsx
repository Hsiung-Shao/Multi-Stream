import type React from 'react';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2, Search, RefreshCw, AlertCircle, Radio } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Checkbox } from '../../components/ui/checkbox';
import { Switch } from '../../components/ui/switch';
import { Label } from '../../components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
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
import { useTwitchAuth } from '../../hooks/useTwitchAuth';
import { useTwitchUser, type FollowedChannel } from '../../hooks/useTwitchUser';
import { favoritesService } from '../favorites/FavoritesService';
import { twitchService } from '../twitch/TwitchService';
import { logEvent } from '../../utils/analytics';
import { getPageNumbers } from '../../utils/pagination';

const PAGE_SIZE = 20;

/**
 * Custom Twitch icon(避免依賴 lucide-react 版本是否含 `Twitch`)
 */
function TwitchIcon({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M21 2H3v16h5v4l4-4h5l4-4V2z" />
            <path d="M11 11V7" />
            <path d="M16 11V7" />
        </svg>
    );
}

/**
 * 帳號頁「Twitch 匯入列表」Tab(升級版)
 *
 * 功能:
 *  - 已登入 Twitch 時自動展開頻道列表,首批 100 筆
 *  - 搜尋(broadcasterName + login)、只看直播中、只看未收藏 兩個 filter
 *  - 多選 + 全選/清空,Set 存 broadcasterLogin
 *  - 「匯入選取」按鈕(N=0 disabled)
 *  - 「一鍵匯入全部」按鈕(AlertDialog 二次確認)
 *  - Shadcn Pagination,每頁 20 筆
 *  - cursor-based「載入下一批 100」按鈕
 *
 * Live 狀態:呼叫 twitchService.checkMultipleChannelsLiveStatus 批次查
 *           頻道清單載入後 in background 拉,在期間「只看直播中」switch 顯示 loading
 */
export function TwitchImportTab() {
    const { t } = useTranslation(['account', 'favorites', 'common']);

    const { token, isLoggedIn, login, logout, clearToken } = useTwitchAuth();
    const {
        user: twitchUser,
        loading: twitchLoading,
        error: twitchError,
        followedChannels,
        hasMore,
        fetchUser,
        fetchFollowedChannels,
        loadMore,
        reset: resetTwitchUser,
    } = useTwitchUser();

    const [searchQuery, setSearchQuery] = useState('');
    const [liveOnly, setLiveOnly] = useState(false);
    const [uncollectedOnly, setUncollectedOnly] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [currentPage, setCurrentPage] = useState(1);

    const [liveStatusMap, setLiveStatusMap] = useState<Record<string, boolean>>({});
    const [liveLoading, setLiveLoading] = useState(false);

    const [confirmImportAll, setConfirmImportAll] = useState(false);
    const [importing, setImporting] = useState(false);

    // --- 1. 已登入 → 自動 fetchUser ---
    useEffect(() => {
        if (token && !twitchUser) {
            fetchUser(token);
        }
    }, [token, twitchUser, fetchUser]);

    // --- 2. 拿到 twitchUser → 預設展開,自動 fetch 第一批 followed channels ---
    useEffect(() => {
        if (token && twitchUser && followedChannels.length === 0 && !twitchLoading && !twitchError) {
            fetchFollowedChannels(token, twitchUser.id);
        }
    }, [token, twitchUser, followedChannels.length, twitchLoading, twitchError, fetchFollowedChannels]);

    // --- 3. followedChannels 變動 → in background 批次查 live status ---
    useEffect(() => {
        const newLogins = followedChannels
            .map((c) => c.broadcasterLogin)
            .filter((l) => !(l in liveStatusMap));
        if (newLogins.length === 0) return;

        let cancelled = false;
        setLiveLoading(true);
        twitchService
            .checkMultipleChannelsLiveStatus(newLogins)
            .then((results) => {
                if (cancelled) return;
                const update: Record<string, boolean> = {};
                for (const login of newLogins) {
                    const r = results[login.toLowerCase()] || results[login];
                    update[login] = r?.isLive === true;
                }
                setLiveStatusMap((prev) => ({ ...prev, ...update }));
            })
            .catch(() => {
                // 容錯:checkMultipleChannelsLiveStatus 對失敗已內建吞錯回 false
                // 若整個 promise reject(理論上不會),也不阻斷 UI
            })
            .finally(() => {
                if (!cancelled) setLiveLoading(false);
            });

        return () => {
            cancelled = true;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [followedChannels]);

    // --- 4. 搜尋 / filter 變動 → 清 selection + 回第 1 頁 ---
    useEffect(() => {
        setSelected(new Set());
        setCurrentPage(1);
    }, [searchQuery, liveOnly, uncollectedOnly]);

    // --- Filter 後的頻道清單 ---
    const filteredChannels = useMemo<FollowedChannel[]>(() => {
        const q = searchQuery.trim().toLowerCase();
        return followedChannels.filter((c) => {
            if (q) {
                const hit =
                    c.broadcasterName.toLowerCase().includes(q) ||
                    c.broadcasterLogin.toLowerCase().includes(q);
                if (!hit) return false;
            }
            if (liveOnly && !liveStatusMap[c.broadcasterLogin]) return false;
            if (uncollectedOnly) {
                const url = `https://www.twitch.tv/${c.broadcasterLogin}`;
                if (favoritesService.isDuplicate(url, c.broadcasterLogin)) return false;
            }
            return true;
        });
    }, [followedChannels, searchQuery, liveOnly, uncollectedOnly, liveStatusMap]);

    // --- Pagination ---
    const totalPages = Math.max(1, Math.ceil(filteredChannels.length / PAGE_SIZE));
    useEffect(() => {
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [currentPage, totalPages]);

    const paginated = useMemo(
        () => filteredChannels.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
        [filteredChannels, currentPage],
    );

    // --- 統計:filtered 中已收藏數量(給 confirm dialog 顯示) ---
    const filteredDuplicateCount = useMemo(() => {
        return filteredChannels.reduce((acc, c) => {
            const url = `https://www.twitch.tv/${c.broadcasterLogin}`;
            return acc + (favoritesService.isDuplicate(url, c.broadcasterLogin) ? 1 : 0);
        }, 0);
    }, [filteredChannels]);

    // --- Selection helpers ---
    const allFilteredSelected =
        filteredChannels.length > 0 &&
        filteredChannels.every((c) => selected.has(c.broadcasterLogin));

    const toggleOne = useCallback((broadcasterLogin: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(broadcasterLogin)) next.delete(broadcasterLogin);
            else next.add(broadcasterLogin);
            return next;
        });
    }, []);

    const handleSelectAll = useCallback(() => {
        if (allFilteredSelected) {
            // 取消全選 — 只清掉 filteredChannels 範圍內
            setSelected((prev) => {
                const next = new Set(prev);
                filteredChannels.forEach((c) => next.delete(c.broadcasterLogin));
                return next;
            });
        } else {
            // 全選 filteredChannels
            setSelected((prev) => {
                const next = new Set(prev);
                filteredChannels.forEach((c) => next.add(c.broadcasterLogin));
                return next;
            });
        }
    }, [allFilteredSelected, filteredChannels]);

    // --- Import 流程 ---
    const performImport = useCallback(
        async (channelsToImport: FollowedChannel[]) => {
            if (channelsToImport.length === 0) return;
            setImporting(true);

            let imported = 0;
            let skipped = 0;
            for (const channel of channelsToImport) {
                const url = `https://www.twitch.tv/${channel.broadcasterLogin}`;
                const result = await favoritesService.addFavorite(url, channel.broadcasterName);
                if (result.success) imported++;
                else skipped++;
            }

            setImporting(false);
            setSelected(new Set());
            logEvent('Favorites', 'twitch_import_account_tab', 'count', imported);

            if (skipped > 0) {
                toast.success(
                    t('twitchImport.toast.importedWithSkip', {
                        imported,
                        skipped,
                        defaultValue: '已匯入 {{imported}} 個頻道,{{skipped}} 個已在收藏中(自動略過)',
                    }),
                );
            } else {
                toast.success(
                    t('twitchImport.toast.imported', {
                        count: imported,
                        defaultValue: '成功匯入 {{count}} 個頻道',
                    }),
                );
            }
        },
        [t],
    );

    const handleImportSelected = useCallback(async () => {
        const list = followedChannels.filter((c) => selected.has(c.broadcasterLogin));
        await performImport(list);
    }, [followedChannels, selected, performImport]);

    const handleConfirmImportAll = useCallback(async () => {
        setConfirmImportAll(false);
        await performImport(filteredChannels);
    }, [filteredChannels, performImport]);

    const handleRetry = useCallback(() => {
        if (token && twitchUser) {
            fetchFollowedChannels(token, twitchUser.id);
        } else if (token) {
            fetchUser(token);
        }
    }, [token, twitchUser, fetchUser, fetchFollowedChannels]);

    const handleLoadMore = useCallback(() => {
        if (token && twitchUser) {
            loadMore(token, twitchUser.id);
        }
    }, [token, twitchUser, loadMore]);

    const handleDisconnect = useCallback(() => {
        logout();
        clearToken();
        resetTwitchUser();
        setSelected(new Set());
        setLiveStatusMap({});
    }, [logout, clearToken, resetTwitchUser]);

    // ============================================================================
    // Render: 未登入 — Connect Twitch CTA
    // ============================================================================
    if (!isLoggedIn) {
        return (
            <section className="rounded-xl border border-white/10 bg-card/50 p-6 space-y-5">
                <header className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
                        <TwitchIcon />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-lg font-semibold">
                            {t('favorites:twitchIntegration', 'Twitch 匯入')}
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            {t('favorites:twitchConnectDescription', '連接您的 Twitch 帳號以快速匯入您追隨的頻道。')}
                        </p>
                    </div>
                </header>

                <Button
                    onClick={login}
                    className="w-full bg-[#9146ff] hover:bg-[#772ce8] text-white h-12 rounded-xl font-bold"
                >
                    {t('favorites:connectTwitch', '連接 Twitch 帳號')}
                </Button>
            </section>
        );
    }

    // ============================================================================
    // Render: 已登入
    // ============================================================================
    return (
        <section className="rounded-xl border border-white/10 bg-card/50 p-6 space-y-5">
            {/* Header:標題 + Twitch user info + 中斷連線 */}
            <header className="flex flex-wrap items-start gap-3 justify-between">
                <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500 shrink-0">
                        <TwitchIcon />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            {t('favorites:twitchIntegration', 'Twitch 匯入')}
                            <Badge className="bg-green-500 hover:bg-green-500 text-white text-xs">
                                {t('twitchImport.connected', 'Connected')}
                            </Badge>
                        </h2>
                        <p className="text-xs text-muted-foreground mt-1">
                            {t(
                                'twitchImport.description',
                                '從你追隨的 Twitch 頻道中挑選並匯入到收藏列表。',
                            )}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {twitchUser?.profileImageUrl && (
                        <Avatar className="size-7">
                            <AvatarImage src={twitchUser.profileImageUrl} />
                            <AvatarFallback>{twitchUser.displayName?.slice(0, 2) || 'TW'}</AvatarFallback>
                        </Avatar>
                    )}
                    <span className="text-sm font-medium truncate max-w-[120px]">
                        {twitchUser?.displayName || '...'}
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDisconnect}
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                    >
                        {t('favorites:disconnectTwitch', '解除連接')}
                    </Button>
                </div>
            </header>

            {/* 搜尋 + filter switches */}
            <div className="space-y-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t(
                            'twitchImport.searchPlaceholder',
                            '搜尋頻道名稱或 ID...',
                        )}
                        className="pl-9"
                    />
                </div>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <div className="flex items-center gap-2">
                        <Switch
                            id="filter-live-only"
                            checked={liveOnly}
                            onCheckedChange={setLiveOnly}
                        />
                        <Label
                            htmlFor="filter-live-only"
                            className="text-sm cursor-pointer flex items-center gap-1.5"
                        >
                            <Radio className={`size-3.5 ${liveOnly ? 'text-red-500' : 'text-muted-foreground'}`} />
                            {t('twitchImport.filter.liveOnly', '只看直播中')}
                            {liveLoading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
                        </Label>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch
                            id="filter-uncollected-only"
                            checked={uncollectedOnly}
                            onCheckedChange={setUncollectedOnly}
                        />
                        <Label htmlFor="filter-uncollected-only" className="text-sm cursor-pointer">
                            {t('twitchImport.filter.uncollectedOnly', '只看未收藏')}
                        </Label>
                    </div>
                </div>
            </div>

            {/* Selection toolbar */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <Checkbox
                        id="select-all"
                        checked={allFilteredSelected}
                        onCheckedChange={handleSelectAll}
                        disabled={filteredChannels.length === 0}
                    />
                    <Label htmlFor="select-all" className="text-sm cursor-pointer select-none">
                        {allFilteredSelected
                            ? t('twitchImport.deselectAll', '取消全選')
                            : t('twitchImport.selectAllFiltered', '全選 ({{count}})', {
                                count: filteredChannels.length,
                            })}
                    </Label>
                </div>
                <span className="text-xs text-muted-foreground">
                    {t('twitchImport.selectedCount', '已選 {{count}}', { count: selected.size })}
                </span>
            </div>

            {/* Channel list */}
            <div className="rounded-lg border border-white/10 bg-background/30 overflow-hidden">
                <ScrollArea className="h-[420px]">
                    <div className="p-2 space-y-1">
                        {twitchLoading && followedChannels.length === 0 ? (
                            <div className="flex items-center justify-center py-12 text-muted-foreground">
                                <Loader2 className="size-5 animate-spin mr-2" />
                                <span className="text-sm">{t('favorites:loading', '載入中...')}</span>
                            </div>
                        ) : twitchError ? (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                                <AlertCircle className="size-8 opacity-50 text-red-400" />
                                <p className="text-sm">
                                    {t('twitchImport.error', '載入失敗,請重試')}
                                </p>
                                <Button variant="outline" size="sm" onClick={handleRetry} className="gap-2">
                                    <RefreshCw className="size-3.5" />
                                    {t('twitchImport.retry', '重試')}
                                </Button>
                            </div>
                        ) : paginated.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                                <TwitchIcon className="size-8 opacity-30" />
                                <p className="text-sm">
                                    {followedChannels.length === 0
                                        ? t('twitchImport.empty.noFollowed', '尚未追隨任何頻道')
                                        : t('favorites:noChannelsFound', '找不到頻道')}
                                </p>
                            </div>
                        ) : (
                            paginated.map((channel) => {
                                const isSelected = selected.has(channel.broadcasterLogin);
                                const isLive = liveStatusMap[channel.broadcasterLogin] === true;
                                const url = `https://www.twitch.tv/${channel.broadcasterLogin}`;
                                const isDuplicate = favoritesService.isDuplicate(url, channel.broadcasterLogin);

                                return (
                                    <div
                                        key={channel.broadcasterId}
                                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                                            isSelected
                                                ? 'bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-500/30'
                                                : 'hover:bg-white/5 border border-transparent'
                                        }`}
                                        onClick={() => toggleOne(channel.broadcasterLogin)}
                                    >
                                        <Checkbox
                                            checked={isSelected}
                                            onCheckedChange={() => toggleOne(channel.broadcasterLogin)}
                                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                            className="data-[state=checked]:bg-purple-600"
                                        />
                                        <Avatar className="size-9 shrink-0">
                                            <AvatarImage src={channel.profileImageUrl} alt={channel.broadcasterName} />
                                            <AvatarFallback>
                                                {channel.broadcasterName.slice(0, 2)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate flex items-center gap-2">
                                                {channel.broadcasterName}
                                                {isLive && (
                                                    <Badge className="bg-red-500 hover:bg-red-500 text-white text-[10px] h-4 px-1.5 gap-1">
                                                        <span className="size-1.5 rounded-full bg-white animate-pulse" />
                                                        LIVE
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="text-xs text-muted-foreground truncate">
                                                {channel.broadcasterLogin}
                                            </div>
                                        </div>
                                        {isDuplicate && (
                                            <Badge
                                                variant="outline"
                                                className="text-[10px] h-5 shrink-0 border-amber-400/40 text-amber-500"
                                            >
                                                {t('twitchImport.alreadyImported', '已收藏')}
                                            </Badge>
                                        )}
                                    </div>
                                );
                            })
                        )}

                        {/* 載入下一批 100(放在列表底部) */}
                        {hasMore && !twitchLoading && followedChannels.length > 0 && (
                            <div className="pt-3 pb-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleLoadMore}
                                    className="w-full text-xs"
                                >
                                    {t('twitchImport.loadNextBatch', '載入下一批 100 個')}
                                </Button>
                            </div>
                        )}
                        {twitchLoading && followedChannels.length > 0 && (
                            <div className="pt-3 pb-1 flex justify-center">
                                <Loader2 className="size-4 animate-spin text-muted-foreground" />
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <Pagination>
                    <PaginationContent>
                        <PaginationItem>
                            <PaginationPrevious
                                href="#"
                                size="default"
                                aria-disabled={currentPage === 1}
                                tabIndex={currentPage === 1 ? -1 : 0}
                                className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''}
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
                                aria-disabled={currentPage === totalPages}
                                tabIndex={currentPage === totalPages ? -1 : 0}
                                className={
                                    currentPage === totalPages ? 'pointer-events-none opacity-50' : ''
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

            {/* Action buttons */}
            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-white/10">
                <Button
                    variant="outline"
                    onClick={() => setConfirmImportAll(true)}
                    disabled={filteredChannels.length === 0 || importing}
                    className="gap-2"
                >
                    {t('twitchImport.importAllFiltered', '一鍵匯入全部 ({{count}})', {
                        count: filteredChannels.length,
                    })}
                </Button>
                <Button
                    onClick={handleImportSelected}
                    disabled={selected.size === 0 || importing}
                    className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
                >
                    {importing && <Loader2 className="size-4 animate-spin" />}
                    {t('twitchImport.importSelected', '匯入選取 ({{count}})', {
                        count: selected.size,
                    })}
                </Button>
            </div>

            {/* 一鍵匯入全部 確認 dialog */}
            <AlertDialog open={confirmImportAll} onOpenChange={setConfirmImportAll}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t('twitchImport.confirmImportAll.title', '確認匯入全部?')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {filteredDuplicateCount > 0
                                ? t('twitchImport.confirmImportAll.descWithDup', {
                                      total: filteredChannels.length,
                                      duplicate: filteredDuplicateCount,
                                      defaultValue:
                                          '將會匯入 {{total}} 個頻道(其中 {{duplicate}} 個已在收藏中會自動略過),確定要繼續嗎?',
                                  })
                                : t('twitchImport.confirmImportAll.desc', {
                                      total: filteredChannels.length,
                                      defaultValue: '將會匯入 {{total}} 個頻道,確定要繼續嗎?',
                                  })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('common:common.cancel', '取消')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmImportAll}
                            className="bg-purple-600 hover:bg-purple-700 text-white"
                        >
                            {t('twitchImport.confirmImportAll.confirm', '確認匯入')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </section>
    );
}
