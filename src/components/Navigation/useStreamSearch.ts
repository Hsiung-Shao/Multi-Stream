/**
 * 「加入直播」搜尋框的共用邏輯：動態島搜尋框（IslandSearch）與首頁／空畫布的大搜尋框（StreamSearchBox）
 * 用同一份，功能一致（2026-09 使用者要求兩個輸入框要有同等的功能）。
 *
 * - 打字停 0.5 秒自動搜尋：Twitch 即時打 API；YouTube 搜本站資料（vtubers + youtube_channels）
 * - 貼網址（任何平台）→ 直接加入；純文字 Enter → 取目前查詢的第一筆結果，Twitch 沒結果時當頻道 ID 試加入
 * - YouTube 頻道：正在直播就加入；沒直播改加入收藏（沒有可播的影片）
 * - 遞增的請求序號丟棄過期請求：切平台、清空、改成網址時都要作廢，否則晚回來的舊結果會把清單重新打開
 * - 搜尋／收藏／YouTube 服務與 toast（sonner）一律動態 import：首頁 Hero 也用這個 hook，靜態 import 會把它們拉進
 *   首屏 entry（實測 gzip +18 KB，其中 sonner 就佔約 10 KB）；第一次用到時才載入，之後走模組快取
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStreamStore, MAX_STREAMS, MAX_STREAMS_REACHED } from '../../store/useStreamStore';
import { useUIStore } from '../../store/useUIStore';

const loadTwitch = () => import('../../features/twitch/TwitchService').then(m => m.twitchService);
const loadYoutubeSearch = () => import('../../features/youtube/searchYoutubeChannels').then(m => m.searchYoutubeChannels);
const loadYoutubeApi = () => import('../../utils/youtubeApi').then(m => m.youtubeApi);
const loadFavorites = () => import('../../features/favorites/FavoritesService').then(m => m.favoritesService);
const loadToast = () => import('sonner').then(m => m.toast);

export type SearchPlatform = 'twitch' | 'youtube';

export interface StreamSearchResult {
    id: string;
    platform: SearchPlatform;
    displayName: string;
    thumbnailUrl?: string;
    // twitch
    login?: string;
    isLive?: boolean;
    gameName?: string;
    url?: string;
    // youtube
    channelId?: string;
    subscriber?: number | null;
    isVtuber?: boolean;
    nationality?: string | null;
}

export const SEARCH_DEBOUNCE_MS = 500;

export const isStreamUrl = (text: string): boolean => {
    const trimmed = text.trim();
    return trimmed.includes('http://') ||
        trimmed.includes('https://') ||
        trimmed.includes('twitch.tv/') ||
        trimmed.includes('youtube.com') ||
        trimmed.includes('youtu.be/');
};

export function formatSubscribers(n?: number | null): string {
    if (n == null) return '';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return String(n);
}

export interface UseStreamSearchOptions {
    /** 指定要填入的畫布空視窗（空的串流視窗裡直接搜尋／貼網址時用）；不給則照一般新增串流排版 */
    targetWindowId?: string;
    /** 每次送出／選取後回報查詢字（邊緣停靠型動態島用來收起面板） */
    onSearch?: (query: string) => void;
    /** 成功加入畫布後（首頁用來導向 /canvas）；加入收藏不算 */
    onAdded?: () => void;
    /** 加入失敗時的訊息；動態島用 alert，大搜尋框顯示在框下方 */
    onError: (message: string) => void;
    /** 回應全域「聚焦搜尋框」（Ctrl+K）；同頁可能有好幾個搜尋框，只能有一個回應 */
    respondToGlobalFocus?: boolean;
    /** 一開始搜哪個平台（預設 Twitch；週表的退路搜尋用 YouTube，台灣 VTuber 多在 YouTube） */
    initialPlatform?: SearchPlatform;
}

export function useStreamSearch({ targetWindowId, onSearch, onAdded, onError, respondToGlobalFocus = false, initialPlatform = 'twitch' }: UseStreamSearchOptions) {
    const { t } = useTranslation(['common', 'navbar']);
    const [platform, setPlatform] = useState<SearchPlatform>(initialPlatform);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<StreamSearchResult[]>([]);
    const [showResults, setShowResults] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);

    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // 遞增的請求序號：丟棄「較晚 resolve 的過期請求」
    const reqIdRef = useRef(0);
    // 目前結果屬於哪一個查詢字：Enter 只取「這次查詢」的結果，不取還沒更新的上一次結果
    const resultsForRef = useRef('');

    const isSearchFocused = useUIStore(s => s.isSearchFocused);
    const setSearchFocused = useUIStore(s => s.setSearchFocused);
    const storeAddStream = useStreamStore(s => s.addStream);
    // 有指定空視窗時填進那一格（不另外配聊天室：使用者是在這個視窗裡選內容）
    const addStream = useCallback(
        (url: string) => targetWindowId
            ? storeAddStream(url, { withChat: false, withStream: true, displayName: undefined, targetWindowId })
            : storeAddStream(url),
        [storeAddStream, targetWindowId],
    );

    // 從別處觸發 focus（快捷鍵）時把 input 拉到 focus
    useEffect(() => {
        if (!respondToGlobalFocus || !isSearchFocused) return;
        inputRef.current?.focus();
        setSearchFocused(false);
    }, [respondToGlobalFocus, isSearchFocused, setSearchFocused]);

    /** 作廢進行中的搜尋並收起結果 */
    const resetResults = useCallback(() => {
        reqIdRef.current++;
        resultsForRef.current = '';
        setResults([]);
        setShowResults(false);
        setIsSearching(false);
    }, []);

    const runSearch = useCallback(async (q: string, p: SearchPlatform) => {
        const myId = ++reqIdRef.current;
        setIsSearching(true);
        try {
            let mapped: StreamSearchResult[];
            if (p === 'twitch') {
                const found = await (await loadTwitch()).searchChannels(q, 5);
                mapped = (found || []).map((r: any) => ({
                    id: r.id,
                    platform: 'twitch' as const,
                    displayName: r.displayName,
                    thumbnailUrl: r.thumbnailUrl,
                    login: r.login,
                    isLive: r.isLive,
                    gameName: r.gameName,
                    url: r.url,
                }));
            } else {
                const found = await (await loadYoutubeSearch())(q, 8);
                mapped = found.map(r => ({
                    id: r.channelId,
                    platform: 'youtube' as const,
                    displayName: r.title,
                    thumbnailUrl: r.thumbnail || undefined,
                    channelId: r.channelId,
                    subscriber: r.subscriber,
                    isVtuber: r.isVtuber,
                    nationality: r.nationality,
                }));
            }
            if (myId !== reqIdRef.current) return;
            resultsForRef.current = q;
            setResults(mapped);
            setShowResults(true);
            setSelectedIndex(-1);
        } catch {
            if (myId !== reqIdRef.current) return;
            resultsForRef.current = '';
            setResults([]);
            setShowResults(false);
        } finally {
            if (myId === reqIdRef.current) setIsSearching(false);
        }
    }, []);

    useEffect(() => {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        const trimmed = query.trim();
        if (trimmed.length === 0 || isStreamUrl(trimmed)) {
            // 清空或改貼網址：作廢進行中的搜尋，否則晚回來的舊結果會把清單重新打開
            resetResults();
            return;
        }
        searchTimeoutRef.current = setTimeout(() => runSearch(trimmed, platform), SEARCH_DEBOUNCE_MS);
        return () => {
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        };
    }, [query, platform, runSearch, resetResults]);

    // 點外面 → 收起結果（輸入保留）
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowResults(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const togglePlatform = useCallback(() => {
        resetResults(); // 作廢舊平台的請求，避免其結果回填到新平台
        setPlatform(p => (p === 'twitch' ? 'youtube' : 'twitch'));
        setSelectedIndex(-1);
    }, [resetResults]);

    const changeQuery = useCallback((value: string) => {
        setQuery(value);
        setSelectedIndex(-1);
    }, []);

    /** 加入畫布；成功清空輸入並回報 onAdded，失敗回報 onError。回傳是否成功 */
    const addToCanvas = useCallback(async (url: string): Promise<boolean> => {
        setIsSubmitting(true);
        try {
            const res = await addStream(url);
            if (res.success) {
                setQuery('');
                resetResults();
                onAdded?.();
                return true;
            }
            onError(res.message === MAX_STREAMS_REACHED
                ? t('quick_add.max_streams', { max: MAX_STREAMS })
                : res.message || t('quick_add.error_generic', '無法新增串流，請確認網址或頻道名稱'));
            return false;
        } catch {
            onError(t('quick_add.error_generic', '無法新增串流，請確認網址或頻道名稱'));
            return false;
        } finally {
            setIsSubmitting(false);
        }
    }, [addStream, resetResults, onAdded, onError, t]);

    // YouTube 頻道：正在直播 → 加入播放；沒直播 → 加入收藏
    const addYoutubeChannel = useCallback(async (result: StreamSearchResult) => {
        const channelId = result.channelId;
        if (!channelId) return;
        // 模組載入失敗（離線、部署切版瞬間 404）：放棄這次操作，不留 unhandled rejection
        const toast = await loadToast().catch(() => null);
        if (!toast) return;
        const loadingId = toast.loading(t('navbar:resolvingLive'));
        try {
            // 查不到開台狀態（端點逾時或忙碌）就當作沒開台、改加入收藏，不讓整個操作失敗
            const live = await (await loadYoutubeApi()).checkChannelLiveStatus(channelId)
                .catch(() => ({ isLive: false, finalUrl: undefined, liveVideoId: undefined }));
            if (live.isLive) {
                const watchUrl = live.finalUrl
                    || (live.liveVideoId ? `https://www.youtube.com/watch?v=${live.liveVideoId}` : '');
                if (watchUrl) {
                    toast.dismiss(loadingId);
                    if (await addToCanvas(watchUrl)) toast.success(t('navbar:addedToCanvas'));
                    return;
                }
            }
            const res = await (await loadFavorites()).addFavorite(`https://www.youtube.com/channel/${channelId}`, result.displayName, null, channelId);
            toast.dismiss(loadingId);
            if (res.success) toast.success(t('navbar:addedToFavorites'));
            else if (res.message === 'streamAlreadyInFavorites') toast.info(t('navbar:alreadyInFavorites'));
            else toast.error(t('common.error'));
        } catch {
            toast.dismiss(loadingId);
            toast.error(t('common.error'));
        }
    }, [addToCanvas, t]);

    const selectResult = useCallback((result: StreamSearchResult) => {
        setShowResults(false);
        if (result.platform === 'youtube') {
            setQuery('');
            void addYoutubeChannel(result);
            onSearch?.(result.displayName);
            return;
        }
        if (result.url) void addToCanvas(result.url);
        onSearch?.(result.login || result.displayName);
    }, [addYoutubeChannel, addToCanvas, onSearch]);

    const submit = useCallback(async () => {
        const value = query.trim();
        if (!value || isSubmitting) return;

        // 有明確選取 → 選該結果
        if (showResults && selectedIndex >= 0 && results[selectedIndex]) {
            selectResult(results[selectedIndex]);
            return;
        }
        // 貼網址 → 直接加入（任何平台）
        if (isStreamUrl(value)) {
            await addToCanvas(value);
            onSearch?.(value);
            return;
        }
        // 純文字：只取「這次查詢」的結果（還在防抖或搜尋中時，上一次的結果不算）
        if (resultsForRef.current === value && results.length > 0) {
            selectResult(results[0]);
            return;
        }
        if (platform === 'twitch') {
            // Twitch：當頻道 ID 試加入（沒搜到或還沒搜完都走這條，行為同原本的快速新增框）
            await addToCanvas(value);
            onSearch?.(value);
            return;
        }
        // YouTube 沒有可選的結果：立刻搜尋（不等防抖），讓使用者從清單挑
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        void runSearch(value, platform);
    }, [query, isSubmitting, showResults, selectedIndex, results, selectResult, addToCanvas, onSearch, platform, runSearch]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (showResults && results.length > 0) setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (showResults && results.length > 0) setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        } else if (e.key === 'Escape') {
            setShowResults(false);
        }
    }, [showResults, results.length]);

    const clear = useCallback(() => {
        setQuery('');
        resetResults();
        inputRef.current?.focus();
    }, [resetResults]);

    /** 重新聚焦時：若結果仍屬於目前查詢，重新顯示（失焦後再聚焦也看得到） */
    const reopenResults = useCallback(() => {
        if (results.length > 0 && resultsForRef.current === query.trim()) setShowResults(true);
    }, [results.length, query]);

    /** 聚焦時先把搜尋會用到的模組抓下來（不等第一次打字才下載） */
    const warmUp = useCallback(() => {
        void (platform === 'twitch' ? loadTwitch() : loadYoutubeSearch()).catch(() => {});
    }, [platform]);

    return {
        platform, togglePlatform, warmUp,
        query, changeQuery,
        results, showResults, isSearching, isSubmitting,
        selectedIndex, setSelectedIndex,
        selectResult, submit, handleKeyDown, clear, reopenResults,
        inputRef, containerRef,
    };
}
