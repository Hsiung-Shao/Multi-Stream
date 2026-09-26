import { Loader2, X, Twitch as TwitchIcon, Youtube as YoutubeIcon } from 'lucide-react';
import { useCallback } from 'react';
import { Input } from '../ui/input';
import { useTranslation } from 'react-i18next';
import { FN } from './islandTokens';
import { useStreamSearch } from './useStreamSearch';
import { SearchResultsList } from './SearchResultsList';

// Search 模組主題色(對齊設計 FN.search = blue)
const SEARCH_ACCENT = FN.search.c;
const TWITCH_COLOR = '#9146FF';
const YOUTUBE_COLOR = '#FF0000';

interface IslandSearchProps {
    onSearch?: (query: string) => void;
    // 聚焦/失焦時回報「使用中」,讓動態島在搜尋時不自動隱藏
    onActiveChange?: (active: boolean) => void;
    // 結果彈窗定位:'overlay'(預設)= 絕對定位往上彈出(給固定在畫面下緣的原本動態島用);
    // 'inline' = 文件流內的區塊,渲染在 input 下方,給邊緣停靠這種側邊面板用
    // (面板高度靠量測子元素 offsetHeight 決定,absolute 彈窗不會撐開高度,會被面板的 overflow-hidden 裁掉)。
    resultsPlacement?: 'overlay' | 'inline';
    /** 指定要填入的畫布空視窗（空的串流視窗裡直接搜尋／貼網址時用）；不給則照一般新增串流排版 */
    targetWindowId?: string;
    /** 回應全域「聚焦搜尋框」快捷鍵：同頁有好幾個搜尋框（動態島、空視窗、空畫布中央），只給動態島 */
    respondToGlobalFocus?: boolean;
}

/** 動態島上的小搜尋框；邏輯與首頁／空畫布的大搜尋框共用 useStreamSearch */
export function IslandSearch({ onSearch, onActiveChange, resultsPlacement = 'overlay', targetWindowId, respondToGlobalFocus = false }: IslandSearchProps) {
    const { t } = useTranslation(['common', 'navbar']);
    // 島上空間小，失敗訊息沿用原本的 alert
    const onError = useCallback((message: string) => alert(message), []);
    const s = useStreamSearch({ targetWindowId, onSearch, onError, respondToGlobalFocus });

    const platformColor = s.platform === 'twitch' ? TWITCH_COLOR : YOUTUBE_COLOR;
    const isInline = resultsPlacement === 'inline';
    const hasResults = s.showResults && s.results.length > 0;

    const resultsBoxStyle = {
        background: 'rgba(10,10,14,0.94)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid ${SEARCH_ACCENT}33`,
        boxShadow: `0 20px 40px -12px rgba(0,0,0,0.7), 0 0 0 1px ${SEARCH_ACCENT}14`,
    };
    const resultsList = (
        <SearchResultsList
            results={s.results}
            selectedIndex={s.selectedIndex}
            onSelect={s.selectResult}
            onHover={s.setSelectedIndex}
        />
    );

    return (
        <div
            ref={s.containerRef}
            className={isInline ? "flex flex-col w-64 relative" : "flex items-center w-64 relative"}
        >
            {/* Results popup(overlay:絕對定位往上彈出,給固定在下緣的原本動態島用) */}
            {!isInline && hasResults && (
                <div
                    data-search-results
                    className="absolute bottom-full left-0 w-64 mb-3 rounded-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2"
                    style={resultsBoxStyle}
                >
                    {resultsList}
                </div>
            )}

            <form onSubmit={(e) => { e.preventDefault(); void s.submit(); }} className="flex items-center w-full relative">
                {/* 平台切換按鈕(點擊在 Twitch/YouTube 間切換) */}
                <button
                    type="button"
                    onClick={s.togglePlatform}
                    data-search-platform
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 z-10 w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                    title={s.platform === 'twitch' ? t('navbar:twitch') : t('navbar:youtube')}
                    aria-label={s.platform === 'twitch' ? t('navbar:twitch') : t('navbar:youtube')}
                >
                    {s.platform === 'twitch'
                        ? <TwitchIcon size={15} style={{ color: TWITCH_COLOR }} />
                        : <YoutubeIcon size={15} style={{ color: YOUTUBE_COLOR }} />}
                </button>

                <Input
                    ref={s.inputRef}
                    type="text"
                    placeholder={s.platform === 'twitch'
                        ? (t('common.search_placeholder') || 'Search...')
                        : t('navbar:searchYoutubePlaceholder')}
                    value={s.query}
                    onChange={(e) => s.changeQuery(e.target.value)}
                    onFocus={() => {
                        onActiveChange?.(true);
                        s.reopenResults();
                    }}
                    onBlur={() => onActiveChange?.(false)}
                    onKeyDown={s.handleKeyDown}
                    className="h-8 pl-9 pr-9 bg-white/5 border border-white/10 text-white placeholder:text-white/50 focus-visible:ring-1 focus-visible:ring-offset-0 rounded-full"
                    style={{ ['--tw-ring-color' as any]: `${platformColor}55` }}
                />

                {/* Right side:loading spinner OR clear button */}
                {s.isSearching || s.isSubmitting ? (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <Loader2 className="animate-spin text-white/50" size={14} />
                    </div>
                ) : s.query.length > 0 ? (
                    <button
                        type="button"
                        onClick={s.clear}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                        title={t('common.clear', '清除')}
                    >
                        <X size={12} />
                    </button>
                ) : null}
            </form>

            {/* Results popup(inline:文件流內區塊,渲染在 input 下方,給邊緣停靠這種側邊面板用) */}
            {isInline && hasResults && (
                <div
                    data-search-results
                    className="w-64 mt-2 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-top-2"
                    style={resultsBoxStyle}
                >
                    {resultsList}
                </div>
            )}
        </div>
    );
}
