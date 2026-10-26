// 歌曲播放清單（/songs）：VTuber 歌回片段連續播放、本地歌單、分享連結。
//
// - 播放器是 YouTube 官方嵌入播放器（useSegmentPlayer），必須可見、不可被任何元素覆蓋：「點此播放」與錯誤提示都放在播放器下方。
// - 目錄來自 /api/songs/catalog（edge 快取 10 分鐘），搜尋在 client 端過濾 VTuber、歌回標題、歌名、原唱。
// - 歌單存在 localStorage（usePlaylistStore）；預渲染時 render 本體不碰 window／localStorage，
//   歌單與播放器都在 mount 之後才讀（mounted 旗標），server 與 client 首輪 render 同形。
// - 分享連結 ?list=code.code… 由 App 在啟動時快照、清掉 query 後以 shareCodes 傳進來；目錄到了才解析成佇列。
// - SEO（WebPage + Breadcrumb）由 App.tsx 統一處理；預渲染只輸出殼層（SSR 的 QueryClient 不抓資料），殼層要有 h1 與各區標題。

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronRight, ListPlus, Loader2, Pause, Play, RefreshCw, Repeat, Repeat1, Search, Shuffle, SkipBack, SkipForward, X } from 'lucide-react';
import { StaticPageHeader } from '../StaticPageHeader';
import { RouteLink } from '../Navigation/RouteLink';
import { SiteFooter } from '../SiteFooter';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { cn } from '../ui/utils';
import {
    resolveCodes, toQueueItem, useSongCatalog, type SongCatalog, type SongEntry, type SongSegment, type SongVideo,
} from '../../features/songs/songsSource';
import { useSegmentPlayer, type SegmentPlayer } from '../../features/songs/hooks/useSegmentPlayer';
import { useMounted } from '../../features/songs/hooks/useMounted';
import { usePlayReporter } from '../../features/songs/hooks/usePlayReporter';
import { usePlaylistStore, type Playlist } from '../../features/songs/store/usePlaylistStore';
import type { RepeatMode } from '../../features/songs/lib/queue';
import { filterCatalog, sortCatalog, type CatalogSort } from '../../features/songs/lib/catalogView';
import { SeekBar } from '../../features/songs/components/console/SeekBar';
import { VolumeControl } from '../../features/songs/components/console/VolumeControl';
import { QueuePanel } from '../../features/songs/components/console/QueuePanel';
import { PlaylistsPanel } from '../../features/songs/components/console/PlaylistsView';
import { VideoCard } from '../../features/songs/components/console/VideoCard';

/** 目錄一次先顯示幾支歌回（其餘按「顯示更多」），避免上千首歌一次渲染 */
const CATALOG_PAGE_SIZE = 20;
const EMPTY_PLAYLISTS: Playlist[] = [];
const REPEAT_NEXT: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' };
const CATALOG_SORTS: CatalogSort[] = ['latest', 'popular'];

interface SongsPageProps {
    /** 分享連結帶進來的歌曲 code（App 啟動時快照）；null = 沒有分享連結 */
    shareCodes?: string[] | null;
    /** 分享連結已處理完（App 清掉暫存，避免切頁回來重複載入） */
    onShareConsumed?: () => void;
}

interface ShareNotice {
    found: string[];
    missing: number;
    saved: boolean;
}

// ---------- 播放器區 ----------

function PlayerPanel({ player, catalog }: { player: SegmentPlayer; catalog: SongCatalog | undefined }) {
    const { t } = useTranslation('songs');
    const { queue, current } = player;
    const entry = current ? catalog?.byCode.get(current.code) : undefined;
    const hasQueue = queue.items.length > 0;
    const repeatLabel = t(`controls.repeat.${queue.repeat}`);

    let notice: string | null = null;
    if (player.playerStatus === 'error') notice = t('player.loadError');
    else if (queue.allFailed) notice = t('player.allFailed');
    else if (player.skipping) notice = t('player.skipping');
    else if (queue.status === 'stopped' && hasQueue) notice = t('player.ended');

    return (
        <section aria-labelledby="songs-player-h" className="min-w-0">
            <h2 id="songs-player-h" className="sr-only">{t('player.label')}</h2>
            {/* 16:9 播放器：桌機寬至少 480、任何寬度高至少 200（YouTube 嵌入政策 200×200，窄手機高度會大於 16:9）；
                最小值多 2px 是扣掉上下／左右 1px 邊框（border-box），量的是裡面的 iframe。
                容器內只有播放器本身，任何提示都放在下方，不覆蓋播放器 */}
            <div className="relative aspect-video min-h-[202px] w-full overflow-hidden rounded-2xl border border-border bg-black md:min-w-[482px]">
                <div ref={player.containerRef} className="absolute inset-0" data-testid="songs-player" />
            </div>
            {!hasQueue && player.playerStatus !== 'error' && (
                <p className="mt-2 text-sm text-muted-foreground">
                    {player.playerStatus === 'loading' ? t('player.loading') : t('player.empty')}
                </p>
            )}

            {player.needsGesture && (
                <Button className="mt-3 w-full" onClick={player.resume}>
                    <Play className="size-4" aria-hidden="true" />
                    {t('player.tapToPlay')}
                </Button>
            )}
            {notice && <p role="status" className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">{notice}</p>}

            <SeekBar player={player} />

            <div className="mt-2 flex flex-wrap items-center gap-3 sm:gap-4">
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="size-10" onClick={player.prev} disabled={!hasQueue} aria-label={t('controls.prev')} title={t('controls.prev')}>
                        <SkipBack className="size-5" aria-hidden="true" />
                    </Button>
                    <Button size="icon" className="size-11 rounded-full" onClick={player.togglePlay} disabled={!hasQueue || queue.allFailed} aria-label={player.isPlaying ? t('controls.pause') : t('controls.play')} title={player.isPlaying ? t('controls.pause') : t('controls.play')}>
                        {player.isPlaying ? <Pause className="size-5" aria-hidden="true" /> : <Play className="size-5" aria-hidden="true" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="size-10" onClick={player.next} disabled={!hasQueue} aria-label={t('controls.next')} title={t('controls.next')}>
                        <SkipForward className="size-5" aria-hidden="true" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn('size-10', queue.repeat !== 'off' && 'text-violet-600 dark:text-violet-300')}
                        onClick={() => player.setRepeat(REPEAT_NEXT[queue.repeat])}
                        aria-label={repeatLabel}
                        title={repeatLabel}
                    >
                        {queue.repeat === 'one' ? <Repeat1 className="size-5" aria-hidden="true" /> : <Repeat className="size-5" aria-hidden="true" />}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn('size-10', queue.shuffle && 'text-violet-600 dark:text-violet-300')}
                        onClick={() => player.setShuffle(!queue.shuffle)}
                        aria-pressed={queue.shuffle}
                        aria-label={t('controls.shuffle')}
                        title={t('controls.shuffle')}
                    >
                        <Shuffle className="size-5" aria-hidden="true" />
                    </Button>
                    <VolumeControl player={player} />
                </div>

                <div className="min-w-0 flex-1" aria-live="polite">
                    {entry ? (
                        <>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('now.label')}</p>
                            <p className="truncate font-bold">{entry.segment.title}</p>
                            <p className="truncate text-[13px] text-muted-foreground">
                                {[entry.segment.artist ? t('now.originalArtist', { artist: entry.segment.artist }) : null, entry.video.vtuber?.name ?? null]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </p>
                        </>
                    ) : (
                        <p className="text-sm text-muted-foreground">{t('now.none')}</p>
                    )}
                </div>
            </div>
        </section>
    );
}

// ---------- 頁面 ----------

export function SongsPage({ shareCodes = null, onShareConsumed }: SongsPageProps) {
    const { t, i18n } = useTranslation('songs');
    const locale = i18n.language || 'zh-TW';
    const mounted = useMounted();
    const catalogQuery = useSongCatalog();
    const catalog = catalogQuery.data;
    const handlePlayCredited = usePlayReporter();
    const player = useSegmentPlayer({ onPlayCredited: handlePlayCredited });
    const storePlaylists = usePlaylistStore((s) => s.playlists);
    const createPlaylist = usePlaylistStore((s) => s.createPlaylist);
    // 歌單在 localStorage：預渲染與 hydration 首輪一律當空，mount 後才顯示
    const playlists = mounted ? storePlaylists : EMPTY_PLAYLISTS;

    const [query, setQuery] = useState('');
    const deferredQuery = useDeferredValue(query);
    const [visible, setVisible] = useState(CATALOG_PAGE_SIZE);
    const [tab, setTab] = useState('queue');
    const [shareNotice, setShareNotice] = useState<ShareNotice | null>(null);
    const [sort, setSort] = useState<CatalogSort>('latest');

    const filtered = useMemo(
        () => (catalog ? sortCatalog(filterCatalog(catalog.videos, deferredQuery), sort) : []),
        [catalog, deferredQuery, sort],
    );
    useEffect(() => setVisible(CATALOG_PAGE_SIZE), [deferredQuery]);

    const { load, append } = player;

    // 分享連結：目錄到了才解析；找不到的 code 略過並提示數量
    useEffect(() => {
        if (!shareCodes || !catalog) return;
        const { found, missing } = resolveCodes(catalog.byCode, shareCodes);
        if (found.length > 0) load(found.map((e) => toQueueItem(e.segment)), { play: false });
        setShareNotice({ found: found.map((e) => e.segment.code), missing, saved: false });
        setTab('queue');
        onShareConsumed?.();
    }, [shareCodes, catalog, load, onShareConsumed]);

    const playEntries = (entries: SongEntry[], startCode?: string) => {
        if (entries.length === 0) return;
        const start = startCode ? Math.max(0, entries.findIndex((e) => e.segment.code === startCode)) : 0;
        load(entries.map((e) => toQueueItem(e.segment)), { startIndex: start });
    };

    // 目錄卡片是 memo：這三個 handler 要穩定，否則每次播放狀態更新都會重畫整個目錄
    const handlePlaySong = useCallback((video: SongVideo, segment: SongSegment) => {
        // 從這首開始播整支歌回（播完接同一場的下一首）
        const index = video.segments.findIndex((s) => s.code === segment.code);
        load(video.segments.map(toQueueItem), { startIndex: Math.max(0, index) });
    }, [load]);
    const handlePlayAll = useCallback((video: SongVideo) => load(video.segments.map(toQueueItem), { startIndex: 0 }), [load]);
    const handleQueue = useCallback((segment: SongSegment) => {
        append([toQueueItem(segment)]);
        toast.success(t('catalog.queued', { title: segment.title }));
    }, [append, t]);

    const handlePlayPlaylist = (playlist: Playlist, startCode?: string) => {
        if (!catalog) return;
        const { found, missing } = resolveCodes(catalog.byCode, playlist.codes);
        if (found.length === 0) {
            toast.error(t('playlists.nothingPlayable'));
            return;
        }
        playEntries(found, startCode);
        if (missing > 0) toast(t('share.missing', { count: missing }));
    };

    const handleSaveQueue = () => {
        const codes = player.queue.order.map((i) => player.queue.items[i]?.code).filter((c): c is string => !!c);
        if (codes.length === 0) return;
        const name = t('playlists.defaultName', { n: playlists.length + 1 });
        createPlaylist(name, codes);
        toast.success(t('queue.saved', { name }));
        setTab('playlists');
    };

    const handleSaveShare = () => {
        if (!shareNotice || shareNotice.found.length === 0) return;
        createPlaylist(t('share.defaultName'), shareNotice.found);
        setShareNotice({ ...shareNotice, saved: true });
        toast.success(t('share.saved'));
    };

    const h2 = 'text-[19px] font-bold sm:text-[22px]';

    return (
        <div className="relative min-h-screen bg-background text-foreground">
            <StaticPageHeader title={t('title')} analyticsCategory="SongsPage" />

            <main className="mx-auto max-w-[1280px] px-4 pb-24 sm:px-6">
                <nav aria-label="Breadcrumb" className="pt-5 text-[13px] text-muted-foreground">
                    <ol className="flex flex-wrap items-center gap-1.5">
                        <li><RouteLink to="home" className="hover:text-foreground">MultiStream Hub</RouteLink></li>
                        <li aria-hidden="true" className="inline-flex opacity-50"><ChevronRight size={13} /></li>
                        <li aria-current="page" className="font-medium text-foreground">{t('title')}</li>
                    </ol>
                </nav>

                <h1 className="mt-3 text-2xl font-bold sm:text-3xl">{t('hero.title')}</h1>
                <p className="mt-1.5 max-w-[720px] text-sm leading-relaxed text-muted-foreground">{t('hero.subtitle')}</p>

                {shareNotice && (
                    <div role="status" className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/[0.07] px-4 py-3 text-sm">
                        <span className="min-w-0 flex-1">
                            {shareNotice.found.length > 0 ? t('share.loaded', { count: shareNotice.found.length }) : t('share.none')}
                            {shareNotice.missing > 0 && shareNotice.found.length > 0 && <>{' '}{t('share.missing', { count: shareNotice.missing })}</>}
                        </span>
                        {shareNotice.found.length > 0 && (
                            <Button size="sm" variant="outline" className="h-8" onClick={handleSaveShare} disabled={shareNotice.saved}>
                                <ListPlus className="size-3.5" aria-hidden="true" />
                                {shareNotice.saved ? t('share.saved') : t('share.saveAs')}
                            </Button>
                        )}
                        <Button size="icon" variant="ghost" className="size-8" onClick={() => setShareNotice(null)} aria-label={t('share.dismiss')} title={t('share.dismiss')}>
                            <X className="size-3.5" aria-hidden="true" />
                        </Button>
                    </div>
                )}

                <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(480px,1fr)_380px]">
                    <PlayerPanel player={player} catalog={catalog} />

                    <section aria-labelledby="songs-side-h" className="min-w-0">
                        <h2 id="songs-side-h" className="sr-only">{t('side.label')}</h2>
                        <Tabs value={tab} onValueChange={setTab}>
                            <TabsList className="w-full">
                                <TabsTrigger value="queue" className="flex-1">{t('tabs.queue')}</TabsTrigger>
                                <TabsTrigger value="playlists" className="flex-1">{t('tabs.playlists')}</TabsTrigger>
                            </TabsList>
                            <TabsContent value="queue">
                                <QueuePanel player={player} catalog={catalog} onSaveQueue={handleSaveQueue} />
                            </TabsContent>
                            <TabsContent value="playlists">
                                <PlaylistsPanel playlists={playlists} catalog={catalog} onPlay={handlePlayPlaylist} />
                            </TabsContent>
                        </Tabs>
                    </section>
                </div>

                <section aria-labelledby="songs-catalog-h" className="mt-10 sm:mt-12">
                    <p className="mb-3 text-[13px] text-muted-foreground">
                        {t('catalog.submitPrompt')}{' '}
                        <RouteLink to="songsSubmit" className="font-medium text-violet-700 underline-offset-2 hover:underline dark:text-violet-300">
                            {t('catalog.submitLink')}
                        </RouteLink>
                    </p>
                    <div className="mb-4 flex flex-wrap items-center gap-3">
                        <h2 id="songs-catalog-h" className={h2}>{t('catalog.title')}</h2>
                        <div role="group" aria-label={t('catalog.sort.label')} className="inline-flex rounded-lg border border-border p-0.5">
                            {CATALOG_SORTS.map((key) => (
                                <Button
                                    key={key}
                                    type="button"
                                    size="sm"
                                    variant={sort === key ? 'secondary' : 'ghost'}
                                    className="h-8 px-3"
                                    aria-pressed={sort === key}
                                    onClick={() => setSort(key)}
                                >
                                    {t(`catalog.sort.${key}`)}
                                </Button>
                            ))}
                        </div>
                        <div className="relative w-full sm:ml-auto sm:w-80">
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                            <Input
                                type="search"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={t('catalog.search')}
                                aria-label={t('catalog.search')}
                                className="h-10 pl-9"
                            />
                        </div>
                    </div>

                    {catalog ? (
                        catalog.videos.length === 0 ? (
                            <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">{t('catalog.empty')}</p>
                        ) : filtered.length === 0 ? (
                            <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">{t('catalog.noResults', { query: deferredQuery.trim() })}</p>
                        ) : (
                            <>
                                <ul className="grid gap-3 md:grid-cols-2">
                                    {filtered.slice(0, visible).map((video) => (
                                        <VideoCard
                                            key={video.videoId}
                                            video={video}
                                            playlists={playlists}
                                            locale={locale}
                                            onPlaySong={handlePlaySong}
                                            onPlayAll={handlePlayAll}
                                            onQueue={handleQueue}
                                        />
                                    ))}
                                </ul>
                                {filtered.length > visible && (
                                    <div className="mt-4 flex justify-center">
                                        <Button variant="outline" onClick={() => setVisible((v) => v + CATALOG_PAGE_SIZE)}>{t('catalog.showMore')}</Button>
                                    </div>
                                )}
                            </>
                        )
                    ) : catalogQuery.isError ? (
                        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-muted/40 p-6">
                            <p role="alert" className="flex-1 font-bold">{t('catalog.loadError')}</p>
                            <Button variant="outline" onClick={() => void catalogQuery.refetch()} disabled={catalogQuery.isFetching}>
                                <RefreshCw className={cn('size-3.5', catalogQuery.isFetching && 'animate-spin')} aria-hidden="true" />
                                {t('catalog.retry')}
                            </Button>
                        </div>
                    ) : (
                        <p role="status" className="flex min-h-[160px] items-center justify-center gap-2 rounded-2xl border border-border bg-muted/30 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                            {t('catalog.loading')}
                        </p>
                    )}
                </section>

                <section aria-labelledby="songs-about-h" className="mt-14 max-w-[680px] border-t border-border pt-6 text-sm leading-relaxed text-muted-foreground">
                    <h2 id="songs-about-h" className="mb-1.5 text-sm font-bold text-foreground">{t('about.title')}</h2>
                    <p>{t('about.body')}</p>
                </section>
            </main>

            <SiteFooter />
        </div>
    );
}
