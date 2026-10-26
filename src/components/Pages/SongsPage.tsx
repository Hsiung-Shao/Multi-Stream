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
import { Menu } from 'lucide-react';
import { RouteLink } from '../Navigation/RouteLink';
import { SiteFooter } from '../SiteFooter';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '../ui/sheet';
import { cn } from '../ui/utils';
import { useMediaQuery } from '../../hooks/use-media-query';
import {
    resolveCodes, toQueueItem, useSongCatalog, type SongEntry, type SongSegment, type SongVideo,
} from '../../features/songs/songsSource';
import { useSegmentPlayer } from '../../features/songs/hooks/useSegmentPlayer';
import { useMounted } from '../../features/songs/hooks/useMounted';
import { usePlayReporter } from '../../features/songs/hooks/usePlayReporter';
import { usePlaylistStore, type Playlist } from '../../features/songs/store/usePlaylistStore';
import { deriveVtubers, filterByVtuber, filterCatalog, sortCatalog, type CatalogSort } from '../../features/songs/lib/catalogView';
import {
    LIST_VIEW, isBrowseView, parseSongsView, sameSongsView, serializeSongsView, type BrowseView, type SongsView, type VtuberTab,
} from '../../features/songs/lib/songsView';
import { PAGE_PATHS } from '../../config/routes';
import { ConsoleShell } from '../../features/songs/components/console/ConsoleShell';
import { LeftNav } from '../../features/songs/components/console/LeftNav';
import { CatalogView, type CatalogStatus } from '../../features/songs/components/console/CatalogView';
import { VideoDetailView } from '../../features/songs/components/console/VideoDetailView';
import { PlaylistsView } from '../../features/songs/components/console/PlaylistsView';
import { VtuberView } from '../../features/songs/components/console/VtuberView';
import { SongView } from '../../features/songs/components/console/SongView';
import { NowPlayingDetails, NowPlayingPanel } from '../../features/songs/components/console/NowPlayingPanel';
import { MobileNowTabs, type MobileTab } from '../../features/songs/components/console/MobileNowTabs';
import { PlayerBar } from '../../features/songs/components/console/PlayerBar';
import { ShareNotice, type ShareNoticeState } from '../../features/songs/components/console/ShareNotice';

/** 目錄一次先顯示幾支歌回（其餘按「顯示更多」），避免上千首歌一次渲染 */
const CATALOG_PAGE_SIZE = 20;
const EMPTY_PLAYLISTS: Playlist[] = [];
/**
 * 斷點與 Tailwind v4 的 lg（64rem）／xl（80rem）用同一種範圍語法：`width < 64rem` 與 CSS 的 `width >= 64rem` 剛好互補，
 * 小數寬度（例：1023.5、1279.3）也不會出現 JS 與 CSS 都不成立的 1px 空窗。查「窄螢幕」所以預渲染、hydration 首輪與 jsdom 都是桌機版。
 */
/** 手機版（播放器置頂＋分頁＋精簡底部列） */
const NARROW_QUERY = '(width < 64rem)';
/** 左欄收進「選單」抽屜（1024–1279 中欄與右欄維持） */
const COMPACT_QUERY = '(width < 80rem)';
/** 橫向手機這類矮螢幕：頁首與分頁列改跟著內容捲動、底部列壓成一列，內容區才有高度 */
const SHORT_QUERY = '(max-height: 500px)';
/** 手機播放器高度（與 NowPlayingPanel 的 PlayerFrame 同一個算式）：抽屜的遮罩與內容從這裡往下，不蓋到影片 */
const SHEET_BELOW_PLAYER = 'top-[max(202px,min(56.25vw,50dvh))]';
/** 各畫面的 h2（tabIndex=-1）：使用者切換畫面後把焦點移過去，螢幕閱讀器會念出新畫面 */
const VIEW_HEADING_IDS = ['songs-video-h', 'songs-song-h', 'songs-vtuber-h', 'songs-playlists-h', 'songs-catalog-h'];

/** 中欄捲動區的 viewport（Radix ScrollArea 不轉發 viewport ref） */
const viewportOf = (root: HTMLDivElement | null): HTMLElement | null =>
    root?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]') ?? null;

/** 從瀏覽型畫面（列表、個人頁、單曲頁）推進單場或單曲頁時 pushState 帶的標記：上一筆歷史就是頁內畫面，返回鈕改用 history.back() */
interface SongsHistoryState {
    songsFrom: string;
}
const isSongsHistoryState = (state: unknown): state is SongsHistoryState =>
    typeof state === 'object' && state !== null && typeof (state as { songsFrom?: unknown }).songsFrom === 'string';

/** 離開瀏覽型畫面時保存的狀態（key＝該畫面網址）：瀏覽器返回或 history.back() 回到同一個畫面時一起還原 */
interface ListSnapshot {
    visible: number;
    scrollTop: number;
}

function focusViewHeading(): void {
    for (const id of VIEW_HEADING_IDS) {
        const el = document.getElementById(id);
        if (el) {
            el.focus({ preventScroll: true });
            return;
        }
    }
}

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
    // 最近一次的瀏覽型畫面（列表、個人頁、單曲頁）：直接開單場網址時，「返回歌回列表」導回它
    const [lastBrowse, setLastBrowse] = useState<BrowseView>(LIST_VIEW);
    if (isBrowseView(view) && !sameSongsView(view, lastBrowse)) setLastBrowse(view);
    const [query, setQuery] = useState('');
    const deferredQuery = useDeferredValue(query);
    const [visible, setVisible] = useState(CATALOG_PAGE_SIZE);
    const [shareNotice, setShareNotice] = useState<ShareNoticeState | null>(null);
    const [sort, setSort] = useState<CatalogSort>('latest');
    const scrollRef = useRef<HTMLDivElement>(null);
    // matchMedia 只在 effect 裡讀（useMediaQuery 初值 false）
    const narrow = useMediaQuery(NARROW_QUERY);
    const short = useMediaQuery(SHORT_QUERY) && narrow;
    // 窄螢幕一定也收左欄（不依賴兩個查詢同時更新）
    const compact = useMediaQuery(COMPACT_QUERY) || narrow;
    const [sheetOpen, setSheetOpen] = useState(false);
    const [mobileTab, setMobileTab] = useState<MobileTab>('browse');
    const mobileTabRef = useRef<MobileTab>('browse');
    /** 手機兩個分頁共用一個捲動區：各自記住 scrollTop，切回來時還原（第一次進「正在播放」從頂端開始） */
    const tabScrollRef = useRef<Record<MobileTab, number>>({ browse: 0, now: 0 });
    /** 使用者切換了畫面、等新畫面畫好後要移焦點（popstate 與展開歌單不移） */
    const pendingFocusRef = useRef(false);
    /** 這次切換是從抽屜點的：等抽屜關閉時再移焦點，否則會被抽屜的焦點鎖拉回去或被還給「選單」鈕 */
    const viaSheetRef = useRef(false);

    const viewRef = useRef(view);
    useEffect(() => {
        viewRef.current = view;
    }, [view]);
    const visibleRef = useRef(visible);
    useEffect(() => {
        visibleRef.current = visible;
    }, [visible]);
    const listSnapshotsRef = useRef(new Map<string, ListSnapshot>());
    /** 這次換畫面要還原的捲動位置；null＝明確切換，回到頂端 */
    const restoreScrollRef = useRef<number | null>(null);

    /** 換分頁前先記住目前分頁的捲動位置（DOM 還是舊分頁時才讀得到） */
    const switchTab = useCallback((next: MobileTab) => {
        const cur = mobileTabRef.current;
        if (cur === next) return;
        const viewport = viewportOf(scrollRef.current);
        if (viewport) tabScrollRef.current[cur] = viewport.scrollTop;
        mobileTabRef.current = next;
        setMobileTab(next);
    }, []);

    /** 離開瀏覽型畫面前呼叫：DOM 換成新畫面後 scrollTop 會被新內容的高度截斷，所以要在換之前記。
        手機在「正在播放」分頁時，捲動區顯示的不是這個畫面，改記「瀏覽」分頁存下的位置 */
    const rememberList = useCallback(() => {
        const cur = viewRef.current;
        if (!isBrowseView(cur)) return;
        const viewport = viewportOf(scrollRef.current);
        const scrollTop = mobileTabRef.current === 'browse' ? (viewport?.scrollTop ?? 0) : tabScrollRef.current.browse;
        listSnapshotsRef.current.set(serializeSongsView(cur), { visible: visibleRef.current, scrollTop });
    }, []);

    // 網址 → 畫面：mount 時讀一次（?list= 已由 App 清掉），之後跟著瀏覽器上一頁／下一頁。
    // 回到記過的列表時，顯示筆數與捲動位置一起還原；分頁切回「瀏覽」
    useEffect(() => {
        const sync = () => {
            rememberList();
            switchTab('browse');
            const next = parseSongsView(window.location.search);
            const snapshot = isBrowseView(next) ? listSnapshotsRef.current.get(serializeSongsView(next)) : undefined;
            restoreScrollRef.current = snapshot?.scrollTop ?? null;
            if (snapshot) setVisible(snapshot.visible);
            setView(next);
        };
        sync();
        window.addEventListener('popstate', sync);
        return () => window.removeEventListener('popstate', sync);
    }, [rememberList, switchTab]);

    /** 畫面 → 網址（明確切換：瀏覽型畫面從頭開始顯示、回到頂端）；replace＝只改網址不新增歷史（展開／收合歌單、個人頁切分頁） */
    const navigate = useCallback((next: SongsView, opts?: { replace?: boolean }) => {
        const prev = viewRef.current;
        if (!sameSongsView(prev, next)) {
            rememberList();
            if (isBrowseView(next)) setVisible(CATALOG_PAGE_SIZE);
        }
        restoreScrollRef.current = null;
        setView((cur) => (sameSongsView(cur, next) ? cur : next));
        switchTab('browse');
        const url = PAGE_PATHS.songs + serializeSongsView(next);
        if (window.location.pathname + window.location.search === url) return;
        if (opts?.replace) {
            window.history.replaceState(null, '', url);
        } else {
            const state: SongsHistoryState | null = isBrowseView(prev) && (next.kind === 'video' || next.kind === 'song')
                ? { songsFrom: PAGE_PATHS.songs + serializeSongsView(prev) }
                : null;
            window.history.pushState(state, '', url);
            pendingFocusRef.current = true;
        }
    }, [rememberList, switchTab]);

    // 變寬成桌機版時沒有分頁：回到「瀏覽」，列表捲動位置才不會去讀「正在播放」分頁存的值
    useEffect(() => {
        if (!narrow) switchTab('browse');
    }, [narrow, switchTab]);

    /**
     * 手機分頁的捲動還原要等「分頁內容真的掛上 DOM」才做：Radix TabsContent 包在 Presence 裡，切分頁的那次 commit
     * 新分頁的 Presence 還是 unmounted（只在 layout effect 裡 send('MOUNT')，下一次 commit 才渲染內容），舊分頁內容還在。
     * 注意 TabsContent 的 tabpanel 外框一直都在（Presence 用 render prop 時強制渲染外框，只以 hidden 與是否渲染 children 區分），
     * 所以「內容掛上了沒」要看外框有沒有 hidden，不能只看外框存不存在。
     * 若在 useEffect 裡設 scrollTop，點擊是離散事件，React 會在下一次 commit 之前同步跑完 passive effect，
     * 這時捲動區裡只有另一個分頁的短內容，瀏覽器把 scrollTop 夾成 0。所以改由分頁內容掛上時的 layout effect（onPanelMount）還原。
     */
    /** 換畫面時「瀏覽」分頁內容還沒掛上（手機從「正在播放」切回來的同一次更新）：先記著，掛上時套用 */
    const pendingBrowseScrollRef = useRef<number | null>(null);
    const handlePanelMount = useCallback((tab: MobileTab) => {
        const viewport = viewportOf(scrollRef.current);
        const pending = tab === 'browse' ? pendingBrowseScrollRef.current : null;
        if (tab === 'browse') pendingBrowseScrollRef.current = null;
        if (viewport) viewport.scrollTop = pending ?? tabScrollRef.current[tab];
    }, []);

    // 換畫面時中欄捲回頂端；瀏覽器返回到記過的列表時捲回原處（展開／收合歌單不算換畫面）
    const viewKey = serializeSongsView(view);
    const scrollKey = view.kind === 'playlists' ? 'playlists' : viewKey;
    useEffect(() => {
        const target = restoreScrollRef.current ?? 0;
        restoreScrollRef.current = null;
        // 換畫面一律回到「瀏覽」分頁：它記住的位置跟著換成新畫面的，日後重掛（旋轉跨斷點）才不會套到過期的位置
        tabScrollRef.current.browse = target;
        const root = scrollRef.current;
        // 手機分頁的「瀏覽」內容還沒掛上（外框仍 hidden、children 下一次 commit 才渲染）：交給 handlePanelMount，現在設會被空內容夾成 0
        if (root?.querySelector('[data-songs-panel="browse"]')?.hasAttribute('hidden')) {
            pendingBrowseScrollRef.current = target;
            return;
        }
        const viewport = viewportOf(root);
        if (viewport) viewport.scrollTop = target;
    }, [scrollKey]);
    useEffect(() => {
        if (!pendingFocusRef.current || viaSheetRef.current) return;
        pendingFocusRef.current = false;
        focusViewHeading();
    }, [viewKey]);

    const vtubers = useMemo(() => (catalog ? deriveVtubers(catalog.videos) : []), [catalog]);
    const filtered = useMemo(
        () => (catalog ? sortCatalog(filterCatalog(catalog.videos, deferredQuery), sort) : []),
        [catalog, deferredQuery, sort],
    );
    // 改搜尋字從頭顯示；換畫面由 navigate／popstate 決定（明確切換從頭、返回還原）
    useEffect(() => setVisible(CATALOG_PAGE_SIZE), [deferredQuery]);
    // 個人頁：這位的歌回（目錄排序，不套列表的搜尋字）與左欄清單裡的摘要
    const profileKey = view.kind === 'vtuber' ? view.vtuber : null;
    const profileVideos = useMemo(
        () => (catalog && profileKey !== null ? filterByVtuber(sortCatalog(catalog.videos, sort), profileKey) : []),
        [catalog, profileKey, sort],
    );
    const profileSummary = profileKey === null ? undefined : vtubers.find((v) => v.key === profileKey);
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

    /** 播放一組歌曲（歌單、個人頁歌單、單曲頁版本），從 startCode 那首開始 */
    const playEntries = useCallback((entries: SongEntry[], startCode?: string) => {
        if (entries.length === 0) return;
        const start = startCode ? Math.max(0, entries.findIndex((e) => e.segment.code === startCode)) : 0;
        load(entries.map((e) => toQueueItem(e.segment)), { startIndex: start });
    }, [load]);

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
    /** 上一筆歷史就是頁內的瀏覽型畫面：history.back()，畫面由 popstate 的 sync 還原（分頁、筆數、捲動）；回傳是否已處理 */
    const backInPage = useCallback((): boolean => {
        if (!isSongsHistoryState(window.history.state)) return false;
        pendingFocusRef.current = true;
        window.history.back();
        return true;
    }, []);
    // 單場：直接開 ?v= 進來（沒有頁內上一筆）時推一筆最近的瀏覽型畫面（預設列表）
    const handleBackToList = useCallback(() => {
        if (!backInPage()) navigate(lastBrowse);
    }, [backInPage, navigate, lastBrowse]);
    // 單曲頁：直接開網址時，有 from 回該位的個人頁，否則回列表
    const songFrom = view.kind === 'song' ? view.from : null;
    const handleBackFromSong = useCallback(() => {
        if (backInPage()) return;
        navigate(songFrom ? { kind: 'vtuber', vtuber: songFrom, tab: 'songs' } : LIST_VIEW);
    }, [backInPage, navigate, songFrom]);
    const handleOpenSong = useCallback((songId: number, from: string | null) => navigate({ kind: 'song', songId, from }), [navigate]);
    const handleVtuberTab = useCallback((tab: VtuberTab) => {
        const cur = viewRef.current;
        if (cur.kind === 'vtuber') navigate({ kind: 'vtuber', vtuber: cur.vtuber, tab }, { replace: true });
    }, [navigate]);
    const handleShowMore = useCallback(() => setVisible((v) => v + CATALOG_PAGE_SIZE), []);
    const { refetch: refetchCatalog } = catalogQuery;
    const handleRetryCatalog = useCallback(() => void refetchCatalog(), [refetchCatalog]);
    const handleSelectVtuber = useCallback((key: string) => navigate({ kind: 'vtuber', vtuber: key, tab: 'songs' }), [navigate]);
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
    // 抽屜裡的導覽：點任何項目先收起抽屜
    const sheetHandlers = useMemo(() => {
        const close = () => {
            viaSheetRef.current = true;
            setSheetOpen(false);
        };
        return {
            onGoList: () => { close(); handleGoList(); },
            onSelectVtuber: (key: string) => { close(); handleSelectVtuber(key); },
            onOpenPlaylist: (id: string) => { close(); handleOpenPlaylist(id); },
            onNewPlaylist: () => { close(); handleNewPlaylist(); },
        };
    }, [handleGoList, handleSelectVtuber, handleOpenPlaylist, handleNewPlaylist]);

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

    const catalogLoaded = !!catalog;
    const catalogTotal = catalog?.videos.length ?? 0;
    const { isError: catalogError, isFetching: catalogFetching } = catalogQuery;
    // 個人頁、單曲頁是 memo：狀態物件要穩定，否則播放進度每秒更新都會重畫
    const catalogStatus = useMemo<CatalogStatus>(() => ({
        loaded: catalogLoaded,
        totalCount: catalogTotal,
        isError: catalogError,
        isFetching: catalogFetching,
        refetch: handleRetryCatalog,
    }), [catalogLoaded, catalogTotal, catalogError, catalogFetching, handleRetryCatalog]);
    const songIndex = catalog?.songs ?? null;
    const currentCode = player.current?.code ?? null;

    let centerView;
    if (view.kind === 'video') {
        centerView = (
            <VideoDetailView
                video={detailVideo}
                loading={!catalog && !catalogQuery.isError}
                loadError={!catalog && catalogQuery.isError}
                retrying={catalogQuery.isFetching}
                onRetry={handleRetryCatalog}
                currentCode={currentCode}
                playlists={playlists}
                locale={locale}
                songIndex={songIndex}
                onBack={handleBackToList}
                onPlayAll={handlePlayAll}
                onPlaySong={handlePlaySong}
                onQueue={handleQueue}
                onOpenSong={handleOpenSong}
            />
        );
    } else if (view.kind === 'vtuber') {
        centerView = (
            <VtuberView
                vtuberKey={view.vtuber}
                tab={view.tab}
                summary={profileSummary}
                songIndex={songIndex}
                status={catalogStatus}
                videos={profileVideos}
                visible={visible}
                onShowMore={handleShowMore}
                sort={sort}
                onSortChange={setSort}
                playlists={playlists}
                locale={locale}
                currentCode={currentCode}
                onTabChange={handleVtuberTab}
                onGoList={handleGoList}
                onPlayEntries={playEntries}
                onQueue={handleQueue}
                onOpenSong={handleOpenSong}
                onPlaySong={handlePlaySong}
                onPlayAll={handlePlayAll}
                onOpenVideo={handleOpenVideo}
            />
        );
    } else if (view.kind === 'song') {
        centerView = (
            <SongView
                songId={view.songId}
                from={view.from}
                songIndex={songIndex}
                status={catalogStatus}
                playlists={playlists}
                locale={locale}
                currentCode={currentCode}
                onBack={handleBackFromSong}
                onGoList={handleGoList}
                onPlayEntries={playEntries}
                onQueue={handleQueue}
                onOpenVideo={handleOpenVideo}
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
                    onShowMore={handleShowMore}
                    search={{ query, onQueryChange: setQuery, deferredQuery }}
                    sort={sort}
                    onSortChange={setSort}
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

    // 左欄：≥1280 放在左欄（預渲染首輪也是，較窄的寬度由 CSS 先藏起來）；較窄時改放「選單」抽屜
    const nav = !compact && (
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

    const body = (
        <>
            <div className="flex flex-col gap-6 px-4 py-5 sm:px-7">
                {centerView}
            </div>
            {view.kind === 'list' && <SiteFooter />}
        </>
    );

    const header = (
        <header className="flex items-center gap-2 px-4 pt-3 sm:px-7 lg:pt-5">
            {compact && (
                // 用 SheetTrigger：抽屜關閉（Esc、點遮罩、X）時 Radix 才知道要把焦點還給這顆鈕
                <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="-ml-2 size-9 shrink-0 rounded-full" aria-label={t('nav.menu')} title={t('nav.menu')}>
                        <Menu className="size-5" aria-hidden="true" />
                    </Button>
                </SheetTrigger>
            )}
            <h1 className="min-w-0 flex-1 truncate text-base font-black sm:text-xl">{t('hero.title')}</h1>
        </header>
    );
    const notice = shareNotice && (
        <div className="px-4 pt-3 sm:px-7">
            <ShareNotice notice={shareNotice} onSave={handleSaveShare} onDismiss={() => setShareNotice(null)} />
        </div>
    );

    // Sheet root 不產生 DOM，永遠掛著：頁首的 SheetTrigger 與抽屜內容才在同一個 context 裡
    const main = (
        <main className="flex min-h-0 min-w-0 flex-1 flex-col lg:overflow-hidden lg:rounded-xl lg:bg-card">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                {!short && header}
                {!short && notice}
                {narrow ? (
                    <MobileNowTabs
                        value={mobileTab}
                        onValueChange={switchTab}
                    onPanelMount={handlePanelMount}
                        queueCount={player.queue.items.length}
                        lead={short ? <>{header}{notice}</> : null}
                        browse={body}
                        now={<NowPlayingDetails player={player} catalog={catalog} onSaveQueue={handleSaveQueue} />}
                        scrollRef={scrollRef}
                    />
                ) : (
                    <ScrollArea ref={scrollRef} className="min-h-0 flex-1 [&>div>div]:!block">{body}</ScrollArea>
                )}
                {compact && (
                    <SheetContent
                        side="left"
                        aria-describedby={undefined}
                        onCloseAutoFocus={(e: Event) => {
                            if (!viaSheetRef.current) return;
                            viaSheetRef.current = false;
                            if (!pendingFocusRef.current) return;
                            e.preventDefault();
                            pendingFocusRef.current = false;
                            focusViewHeading();
                        }}
                        // 遮罩不可蓋到播放器：手機從播放器下緣開始；1024–1279 右欄（含 8px 外距）不罩
                        overlayClassName={narrow ? SHEET_BELOW_PLAYER : 'right-[408px]'}
                        className={cn('songs-console gap-0 bg-card px-3.5 py-5', narrow && cn(SHEET_BELOW_PLAYER, 'h-auto'))}
                    >
                        <SheetTitle className="sr-only">{t('nav.menu')}</SheetTitle>
                        <LeftNav
                            view={view}
                            playlists={playlists}
                            vtubers={vtubers}
                            {...sheetHandlers}
                            idPrefix="songs-sheet-nav"
                            className="flex-1"
                        />
                    </SheetContent>
                )}
            </Sheet>
        </main>
    );

    return (
        <ConsoleShell
            nav={nav}
            main={main}
            aside={<NowPlayingPanel player={player} catalog={catalog} narrow={narrow} onSaveQueue={handleSaveQueue} />}
            bar={<PlayerBar player={player} catalog={catalog} playlists={playlists} narrow={narrow} short={short} />}
        />
    );
}
