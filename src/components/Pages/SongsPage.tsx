// 歌曲播放清單（/songs）：VTuber 歌回片段連續播放、本地歌單、分享連結。A2 三欄控制台版面。
//
// - 版面：左欄導覽｜中欄畫面（歌回列表／單場曲目表／我的歌單）｜右欄正在播放（播放器、時間軸、接下來），底部播放列。
//   元件在 features/songs/components/console/；這裡是容器：資料、播放器、畫面狀態與 handler。
// - 播放器是 YouTube 官方嵌入播放器（useSegmentPlayer），必須可見、不可被任何元素覆蓋，掛載點整個生命週期只有一個 DOM 節點：
//   不做整棵樹的桌機／手機切換，播放器固定在右欄 aside 的同一個位置。
// - 中欄畫面存在 state，切換時 pushState 到 ?v=／?vtuber=／?view=playlists；popstate 時重新解析，返回鍵回到列表。
//   網址只在 mount 後的 effect 讀，預渲染首輪一律是列表。
// - 目錄來自 /api/songs/catalog（edge 快取 10 分鐘），搜尋在 client 端過濾 VTuber、歌回標題、歌名、原唱。
// - 歌單存在 localStorage（usePlaylistStore）；預渲染時 render 本體不碰 window／localStorage，
//   歌單與播放器都在 mount 之後才讀（mounted 旗標），server 與 client 首輪 render 同形。
// - 分享連結 ?list=code.code… 由 App 在啟動時快照、清掉 query 後以 shareCodes 傳進來；目錄到了才解析成佇列。
// - SEO（WebPage + Breadcrumb）由 App.tsx 統一處理；預渲染只輸出殼層（SSR 的 QueryClient 不抓資料），殼層要有 h1 與各區標題。

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { RouteLink } from '../Navigation/RouteLink';
import { SiteFooter } from '../SiteFooter';
import { ScrollArea } from '../ui/scroll-area';
import {
    resolveCodes, toQueueItem, useSongCatalog, type SongEntry, type SongSegment, type SongVideo,
} from '../../features/songs/songsSource';
import { useSegmentPlayer } from '../../features/songs/hooks/useSegmentPlayer';
import { useMounted } from '../../features/songs/hooks/useMounted';
import { usePlayReporter } from '../../features/songs/hooks/usePlayReporter';
import { usePlaylistStore, type Playlist } from '../../features/songs/store/usePlaylistStore';
import { deriveVtubers, filterByVtuber, filterCatalog, sortCatalog, type CatalogSort } from '../../features/songs/lib/catalogView';
import { LIST_VIEW, parseSongsView, sameSongsView, serializeSongsView, type SongsView } from '../../features/songs/lib/songsView';
import { PAGE_PATHS } from '../../config/routes';
import { ConsoleShell } from '../../features/songs/components/console/ConsoleShell';
import { LeftNav } from '../../features/songs/components/console/LeftNav';
import { CatalogView, type CatalogStatus } from '../../features/songs/components/console/CatalogView';
import { VideoDetailView } from '../../features/songs/components/console/VideoDetailView';
import { PlaylistsView } from '../../features/songs/components/console/PlaylistsView';
import { NowPlayingPanel } from '../../features/songs/components/console/NowPlayingPanel';
import { PlayerBar } from '../../features/songs/components/console/PlayerBar';
import { ShareNotice, type ShareNoticeState } from '../../features/songs/components/console/ShareNotice';

/** 目錄一次先顯示幾支歌回（其餘按「顯示更多」），避免上千首歌一次渲染 */
const CATALOG_PAGE_SIZE = 20;
const EMPTY_PLAYLISTS: Playlist[] = [];

interface SongsPageProps {
    /** 分享連結帶進來的歌曲 code（App 啟動時快照）；null = 沒有分享連結 */
    shareCodes?: string[] | null;
    /** 分享連結已處理完（App 清掉暫存，避免切頁回來重複載入） */
    onShareConsumed?: () => void;
}

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

    const [view, setView] = useState<SongsView>(LIST_VIEW);
    const [query, setQuery] = useState('');
    const deferredQuery = useDeferredValue(query);
    const [visible, setVisible] = useState(CATALOG_PAGE_SIZE);
    const [shareNotice, setShareNotice] = useState<ShareNoticeState | null>(null);
    const [sort, setSort] = useState<CatalogSort>('latest');
    const scrollRef = useRef<HTMLDivElement>(null);

    // 網址 → 畫面：mount 時讀一次（?list= 已由 App 清掉），之後跟著瀏覽器上一頁／下一頁
    useEffect(() => {
        const sync = () => setView(parseSongsView(window.location.search));
        sync();
        window.addEventListener('popstate', sync);
        return () => window.removeEventListener('popstate', sync);
    }, []);

    /** 畫面 → 網址：replace＝只改網址不新增歷史（例如展開／收合歌單） */
    const navigate = useCallback((next: SongsView, opts?: { replace?: boolean }) => {
        setView((prev) => (sameSongsView(prev, next) ? prev : next));
        const url = PAGE_PATHS.songs + serializeSongsView(next);
        if (window.location.pathname + window.location.search === url) return;
        if (opts?.replace) window.history.replaceState(null, '', url);
        else window.history.pushState(null, '', url);
    }, []);

    // 換畫面時中欄捲回頂端
    const viewKey = serializeSongsView(view);
    useEffect(() => {
        const viewport = scrollRef.current?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]');
        if (viewport) viewport.scrollTop = 0;
    }, [viewKey]);

    const vtuberFilter = view.kind === 'list' ? view.vtuber : null;
    const vtubers = useMemo(() => (catalog ? deriveVtubers(catalog.videos) : []), [catalog]);
    const filtered = useMemo(
        () => (catalog ? filterByVtuber(sortCatalog(filterCatalog(catalog.videos, deferredQuery), sort), vtuberFilter) : []),
        [catalog, deferredQuery, sort, vtuberFilter],
    );
    useEffect(() => setVisible(CATALOG_PAGE_SIZE), [deferredQuery, vtuberFilter]);
    const filterName = vtuberFilter === null
        ? null
        : (vtubers.find((v) => v.key === vtuberFilter)?.name ?? vtuberFilter.replace(/^name:/, ''));
    const detailVideo = useMemo(
        () => (view.kind === 'video' ? catalog?.videos.find((v) => v.videoId === view.videoId) : undefined),
        [catalog, view],
    );

    const { load, append } = player;

    // 分享連結：目錄到了才解析；找不到的 code 略過並提示數量
    useEffect(() => {
        if (!shareCodes || !catalog) return;
        const { found, missing } = resolveCodes(catalog.byCode, shareCodes);
        if (found.length > 0) load(found.map((e) => toQueueItem(e.segment)), { play: false });
        setShareNotice({ found: found.map((e) => e.segment.code), missing, saved: false });
        onShareConsumed?.();
    }, [shareCodes, catalog, load, onShareConsumed]);

    const playEntries = (entries: SongEntry[], startCode?: string) => {
        if (entries.length === 0) return;
        const start = startCode ? Math.max(0, entries.findIndex((e) => e.segment.code === startCode)) : 0;
        load(entries.map((e) => toQueueItem(e.segment)), { startIndex: start });
    };

    // 目錄卡片、曲目表、左欄都是 memo：handler 要穩定，否則每次播放狀態更新都會重畫整個目錄
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
    const handleOpenVideo = useCallback((video: SongVideo) => navigate({ kind: 'video', videoId: video.videoId }), [navigate]);
    const handleGoList = useCallback(() => navigate(LIST_VIEW), [navigate]);
    const handleSelectVtuber = useCallback((key: string) => navigate({ kind: 'list', vtuber: key }), [navigate]);
    const handleOpenPlaylist = useCallback((id: string) => navigate({ kind: 'playlists', playlistId: id }), [navigate]);
    const handlePlaylistToggle = useCallback(
        (id: string | null) => navigate({ kind: 'playlists', playlistId: id }, { replace: true }),
        [navigate],
    );
    const playlistCount = playlists.length;
    const handleNewPlaylist = useCallback(() => {
        const id = createPlaylist(t('playlists.defaultName', { n: playlistCount + 1 }));
        navigate({ kind: 'playlists', playlistId: id });
    }, [createPlaylist, navigate, playlistCount, t]);

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
    };

    const handleSaveShare = () => {
        if (!shareNotice || shareNotice.found.length === 0) return;
        createPlaylist(t('share.defaultName'), shareNotice.found);
        setShareNotice({ ...shareNotice, saved: true });
        toast.success(t('share.saved'));
    };

    const catalogStatus: CatalogStatus = {
        loaded: !!catalog,
        totalCount: catalog?.videos.length ?? 0,
        isError: catalogQuery.isError,
        isFetching: catalogQuery.isFetching,
        refetch: () => void catalogQuery.refetch(),
    };
    const currentCode = player.current?.code ?? null;

    let centerView;
    if (view.kind === 'video') {
        centerView = (
            <VideoDetailView
                video={detailVideo}
                loading={!catalog && !catalogQuery.isError}
                currentCode={currentCode}
                playlists={playlists}
                locale={locale}
                onBack={handleGoList}
                onPlayAll={handlePlayAll}
                onPlaySong={handlePlaySong}
                onQueue={handleQueue}
            />
        );
    } else if (view.kind === 'playlists') {
        centerView = (
            <PlaylistsView
                playlists={playlists}
                catalog={catalog}
                onPlay={handlePlayPlaylist}
                openId={view.playlistId}
                onOpenIdChange={handlePlaylistToggle}
            />
        );
    } else {
        centerView = (
            <>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                    {t('hero.subtitle')}{' '}
                    {t('catalog.submitPrompt')}{' '}
                    <RouteLink to="songsSubmit" className="font-medium text-primary underline-offset-2 hover:underline">
                        {t('catalog.submitLink')}
                    </RouteLink>
                </p>
                <CatalogView
                    status={catalogStatus}
                    videos={filtered}
                    visible={visible}
                    onShowMore={() => setVisible((v) => v + CATALOG_PAGE_SIZE)}
                    query={query}
                    onQueryChange={setQuery}
                    deferredQuery={deferredQuery}
                    sort={sort}
                    onSortChange={setSort}
                    filterName={filterName}
                    onClearFilter={handleGoList}
                    playlists={playlists}
                    locale={locale}
                    onPlaySong={handlePlaySong}
                    onPlayAll={handlePlayAll}
                    onQueue={handleQueue}
                    onOpen={handleOpenVideo}
                />
                <section aria-labelledby="songs-about-h" className="max-w-[680px] border-t border-border pt-6 text-sm leading-relaxed text-muted-foreground">
                    <h2 id="songs-about-h" className="mb-1.5 text-sm font-bold text-foreground">{t('about.title')}</h2>
                    <p>{t('about.body')}</p>
                </section>
            </>
        );
    }

    const nav = (
        <aside className="hidden min-h-0 overflow-hidden rounded-xl bg-card px-3.5 py-5 xl:flex">
            <LeftNav
                view={view}
                playlists={playlists}
                vtubers={vtubers}
                onGoList={handleGoList}
                onSelectVtuber={handleSelectVtuber}
                onOpenPlaylist={handleOpenPlaylist}
                onNewPlaylist={handleNewPlaylist}
                idPrefix="songs-nav"
                className="flex-1"
            />
        </aside>
    );

    const main = (
        <main className="flex min-h-0 min-w-0 flex-1 flex-col lg:overflow-hidden lg:rounded-xl lg:bg-card">
            <header className="flex items-center gap-3 px-4 pt-4 sm:px-7 sm:pt-5">
                <h1 className="min-w-0 flex-1 truncate text-lg font-black sm:text-xl">{t('hero.title')}</h1>
            </header>
            {shareNotice && (
                <div className="px-4 pt-3 sm:px-7">
                    <ShareNotice notice={shareNotice} onSave={handleSaveShare} onDismiss={() => setShareNotice(null)} />
                </div>
            )}
            <ScrollArea ref={scrollRef} className="min-h-0 flex-1 [&>div>div]:!block">
                <div className="flex flex-col gap-6 px-4 py-5 sm:px-7">
                    {centerView}
                </div>
                {view.kind === 'list' && <SiteFooter />}
            </ScrollArea>
        </main>
    );

    return (
        <ConsoleShell
            nav={nav}
            main={main}
            aside={<NowPlayingPanel player={player} catalog={catalog} narrow={false} onSaveQueue={handleSaveQueue} />}
            bar={<PlayerBar player={player} catalog={catalog} playlists={playlists} narrow={false} />}
        />
    );
}
