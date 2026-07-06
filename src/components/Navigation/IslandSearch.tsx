import { Plus, Loader2, X, Twitch as TwitchIcon, Youtube as YoutubeIcon } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Input } from '../ui/input';
import { useTranslation } from 'react-i18next';
import { cn } from '../ui/utils';
import { ScrollArea } from '../ui/scroll-area';

import { useStreamStore } from '../../store/useStreamStore';
import { useUIStore } from '../../store/useUIStore';
import { twitchService } from '../../features/twitch/TwitchService';
import { youtubeApi } from '../../utils/youtubeApi';
import { favoritesService } from '../../features/favorites/FavoritesService';
import { searchYoutubeChannels } from '../../features/youtube/searchYoutubeChannels';
import { FN } from './islandTokens';

// Search 模組主題色(對齊設計 FN.search = blue)
const SEARCH_ACCENT = FN.search.c;
const TWITCH_COLOR = '#9146FF';
const YOUTUBE_COLOR = '#FF0000';

type Platform = 'twitch' | 'youtube';

interface SearchResult {
    id: string;
    platform: Platform;
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

function formatSubscribers(n?: number | null): string {
    if (n == null) return '';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return String(n);
}

interface IslandSearchProps {
    onSearch?: (query: string) => void;
    // 聚焦/失焦時回報「使用中」,讓動態島在搜尋時不自動隱藏
    onActiveChange?: (active: boolean) => void;
    // 結果彈窗定位:'overlay'(預設)= 絕對定位往上彈出(給固定在畫面下緣的原本動態島用);
    // 'inline' = 文件流內的區塊,渲染在 input 下方,給邊緣停靠這種側邊面板用
    // (面板高度靠量測子元素 offsetHeight 決定,absolute 彈窗不會撐開高度,會被面板的 overflow-hidden 裁掉)。
    resultsPlacement?: 'overlay' | 'inline';
}

export function IslandSearch({ onSearch, onActiveChange, resultsPlacement = 'overlay' }: IslandSearchProps) {
    const { t } = useTranslation(['common', 'navbar']);
    const [platform, setPlatform] = useState<Platform>('twitch');
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [showResults, setShowResults] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);

    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    // 遞增的請求序號:丟棄「較晚 resolve 的過期請求」,避免切平台/快速輸入時舊結果覆蓋新結果
    const reqIdRef = useRef(0);

    const { isSearchFocused, setSearchFocused } = useUIStore();
    const addStream = useStreamStore(s => s.addStream);

    // 從別處觸發 focus(例如 hotkey)時把 input 拉到 focus
    useEffect(() => {
        if (isSearchFocused) {
            inputRef.current?.focus();
            setSearchFocused(false); // Reset trigger
        }
    }, [isSearchFocused, setSearchFocused]);

    const isUrl = (text: string): boolean => {
        const trimmed = text.trim();
        return trimmed.includes('http://') ||
            trimmed.includes('https://') ||
            trimmed.includes('twitch.tv/') ||
            trimmed.includes('youtube.com') ||
            trimmed.includes('youtu.be/');
    };

    // 依平台搜尋:Twitch 即時打 API;YouTube 搜本站資料(vtubers + youtube_channels)
    const runSearch = useCallback(async (q: string, p: Platform) => {
        if (!q || q.trim().length === 0 || isUrl(q)) {
            setSearchResults([]);
            setShowResults(false);
            return;
        }
        const myId = ++reqIdRef.current;
        setIsSearching(true);
        try {
            let mapped: SearchResult[];
            if (p === 'twitch') {
                const results = await twitchService.searchChannels(q, 5);
                mapped = (results || []).map((r: any) => ({
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
                const results = await searchYoutubeChannels(q, 8);
                mapped = results.map(r => ({
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
            // 過期請求(已被更新的搜尋/切平台取代)→ 丟棄,避免覆蓋新結果
            if (myId !== reqIdRef.current) return;
            setSearchResults(mapped);
            setShowResults(true);
            setSelectedIndex(-1);
        } catch {
            if (myId !== reqIdRef.current) return;
            setSearchResults([]);
            setShowResults(false);
        } finally {
            if (myId === reqIdRef.current) setIsSearching(false);
        }
    }, []);

    useEffect(() => {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        const trimmed = query.trim();
        if (trimmed.length === 0 || isUrl(trimmed)) {
            setSearchResults([]);
            setShowResults(false);
            return;
        }
        searchTimeoutRef.current = setTimeout(() => {
            runSearch(trimmed, platform);
        }, 500);
        return () => {
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        };
    }, [query, platform, runSearch]);

    // Click outside → close results popup(input 保留)
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowResults(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const togglePlatform = () => {
        reqIdRef.current++; // 作廢任何 in-flight 舊平台請求,避免其結果回填到新平台
        setPlatform(p => (p === 'twitch' ? 'youtube' : 'twitch'));
        setSearchResults([]);
        setSelectedIndex(-1);
    };

    // YouTube 頻道:正在直播→加入播放;沒直播→加入收藏(YouTube 頻道沒直播即無可播影片)
    const addYoutubeChannel = async (result: SearchResult) => {
        const channelId = result.channelId;
        if (!channelId) return;
        const loadingId = toast.loading(t('navbar:resolvingLive'));
        try {
            const live = await youtubeApi.checkChannelLiveStatus(channelId);
            if (live.isLive) {
                const watchUrl = live.finalUrl
                    || (live.liveVideoId ? `https://www.youtube.com/watch?v=${live.liveVideoId}` : '');
                if (watchUrl) {
                    const res = await addStream(watchUrl);
                    toast.dismiss(loadingId);
                    if (res.success) toast.success(t('navbar:addedToCanvas'));
                    else toast.error(res.message || t('common.error'));
                    return;
                }
            }
            // 沒直播 → 加入收藏
            const channelUrl = `https://www.youtube.com/channel/${channelId}`;
            const res = await favoritesService.addFavorite(channelUrl, result.displayName, null, channelId);
            toast.dismiss(loadingId);
            if (res.success) {
                toast.success(t('navbar:addedToFavorites'));
            } else if (res.message === 'streamAlreadyInFavorites') {
                toast.info(t('navbar:alreadyInFavorites'));
            } else {
                toast.error(t('common.error'));
            }
        } catch {
            toast.dismiss(loadingId);
            toast.error(t('common.error'));
        }
    };

    const handleSelectResult = (result: SearchResult) => {
        setQuery('');
        setShowResults(false);
        if (result.platform === 'youtube') {
            void addYoutubeChannel(result);
            if (onSearch) onSearch(result.displayName);
            return;
        }
        // Twitch:URL 直接加入播放
        if (result.url) addStream(result.url);
        if (onSearch) onSearch(result.login || result.displayName);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const value = query.trim();
        if (!value) return;

        // 有明確選取 → 選該結果
        if (showResults && selectedIndex >= 0 && searchResults[selectedIndex]) {
            handleSelectResult(searchResults[selectedIndex]);
            return;
        }
        // 貼 URL → 直接加入播放(任何平台)
        if (isUrl(value)) {
            const res = await addStream(value);
            if (res.success) {
                setQuery('');
                setShowResults(false);
            } else {
                alert(res.message || t('common.error'));
            }
            if (onSearch) onSearch(value);
            return;
        }
        // 純文字、無選取 → 選第一個結果(若有)
        if (searchResults.length > 0) {
            handleSelectResult(searchResults[0]);
            return;
        }
        // Twitch:純文字當 channel 名嘗試加入(失敗則提示)
        if (platform === 'twitch') {
            const res = await addStream(value);
            if (res.success) {
                setQuery('');
                setShowResults(false);
            } else {
                alert(res.message || t('common.error'));
            }
            if (onSearch) onSearch(value);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (showResults && searchResults.length > 0) {
                setSelectedIndex(prev => (prev < searchResults.length - 1 ? prev + 1 : prev));
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (showResults && searchResults.length > 0) {
                setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
            }
        } else if (e.key === 'Escape') {
            setShowResults(false);
        }
    };

    const handleClear = () => {
        reqIdRef.current++; // 作廢 in-flight 請求,避免清空後舊結果又被填回
        setQuery('');
        setSearchResults([]);
        setShowResults(false);
        inputRef.current?.focus();
    };

    const platformColor = platform === 'twitch' ? TWITCH_COLOR : YOUTUBE_COLOR;
    const isInline = resultsPlacement === 'inline';

    const resultsListNode = (
        <ScrollArea className="h-60 p-1">
            {searchResults.map((result, index) => (
                <div
                    key={result.id}
                    className={cn(
                        "flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors",
                        selectedIndex === index ? "bg-white/20" : "hover:bg-white/10"
                    )}
                    onMouseDown={() => handleSelectResult(result)}
                    onMouseEnter={() => setSelectedIndex(index)}
                >
                    {result.thumbnailUrl ? (
                        <img src={result.thumbnailUrl} alt={result.displayName} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                            <span className="text-xs font-bold text-white">{result.displayName.charAt(0)}</span>
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">{result.displayName}</div>
                        {result.platform === 'twitch' ? (
                            <div className="text-xs text-white/60 flex items-center gap-1">
                                {result.isLive && <span className="w-2 h-2 rounded-full bg-green-500 block" />}
                                <span className="truncate">{result.gameName || 'Twitch'}</span>
                            </div>
                        ) : (
                            <div className="text-xs text-white/60 flex items-center gap-1.5">
                                {result.isVtuber && (
                                    <span className="px-1 rounded bg-pink-500/20 text-pink-300 text-[10px] leading-tight">
                                        {t('navbar:vtuberBadge')}
                                    </span>
                                )}
                                {result.subscriber != null && (
                                    <span>{formatSubscribers(result.subscriber)}</span>
                                )}
                                {result.nationality && (
                                    <span className="opacity-70 truncate">{result.nationality}</span>
                                )}
                            </div>
                        )}
                    </div>
                    <Plus size={14} className="text-white/40" />
                </div>
            ))}
        </ScrollArea>
    );

    const resultsBoxStyle = {
        background: 'rgba(10,10,14,0.94)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid ${SEARCH_ACCENT}33`,
        boxShadow: `0 20px 40px -12px rgba(0,0,0,0.7), 0 0 0 1px ${SEARCH_ACCENT}14`,
    };

    return (
        <div
            ref={containerRef}
            className={isInline ? "flex flex-col w-64 relative" : "flex items-center w-64 relative"}
        >
            {/* Results popup(overlay:絕對定位往上彈出,給固定在下緣的原本動態島用) */}
            {!isInline && showResults && searchResults.length > 0 && (
                <div
                    className="absolute bottom-full left-0 w-64 mb-3 rounded-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2"
                    style={resultsBoxStyle}
                >
                    {resultsListNode}
                </div>
            )}

            <form onSubmit={handleSubmit} className="flex items-center w-full relative">
                {/* 平台切換按鈕(取代純圖示;點擊在 Twitch/YouTube 間切換) */}
                <button
                    type="button"
                    onClick={togglePlatform}
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 z-10 w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                    title={platform === 'twitch' ? t('navbar:twitch') : t('navbar:youtube')}
                    aria-label={platform === 'twitch' ? t('navbar:twitch') : t('navbar:youtube')}
                >
                    {platform === 'twitch'
                        ? <TwitchIcon size={15} style={{ color: TWITCH_COLOR }} />
                        : <YoutubeIcon size={15} style={{ color: YOUTUBE_COLOR }} />}
                </button>

                <Input
                    ref={inputRef}
                    type="text"
                    placeholder={platform === 'twitch'
                        ? (t('common.search_placeholder') || 'Search...')
                        : t('navbar:searchYoutubePlaceholder')}
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setSelectedIndex(-1);
                    }}
                    onFocus={() => {
                        onActiveChange?.(true);
                        // 重新聚焦時:若已有結果且 query 仍有效,重新顯示(失焦後再聚焦也看得到)
                        if (searchResults.length > 0 && query.trim() && !isUrl(query)) {
                            setShowResults(true);
                        }
                    }}
                    onBlur={() => onActiveChange?.(false)}
                    onKeyDown={handleKeyDown}
                    className="h-8 pl-9 pr-9 bg-white/5 border border-white/10 text-white placeholder:text-white/50 focus-visible:ring-1 focus-visible:ring-offset-0 rounded-full"
                    style={{ ['--tw-ring-color' as any]: `${platformColor}55` }}
                />

                {/* Right side:loading spinner OR clear button */}
                {isSearching ? (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <Loader2 className="animate-spin text-white/50" size={14} />
                    </div>
                ) : query.length > 0 ? (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                        title="清除"
                    >
                        <X size={12} />
                    </button>
                ) : null}
            </form>

            {/* Results popup(inline:文件流內區塊,渲染在 input 下方,給邊緣停靠這種側邊面板用) */}
            {isInline && showResults && searchResults.length > 0 && (
                <div
                    className="w-64 mt-2 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-top-2"
                    style={resultsBoxStyle}
                >
                    {resultsListNode}
                </div>
            )}
        </div>
    );
}
