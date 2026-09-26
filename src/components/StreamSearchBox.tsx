// 首頁 Hero 與 /canvas 空狀態的大搜尋框（取代原本只能貼網址的 StreamUrlQuickAdd）。
// 功能與動態島搜尋框一致（2026-09 使用者要求）：貼網址、打頻道名稱即時搜尋、Twitch／YouTube 切換，
// 邏輯共用 useStreamSearch。首頁是 SSG 預渲染頁：render 內不碰 window，搜尋與事件都在 effect／handler 裡。
import { lazy, Suspense, useCallback, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Loader2, X, Twitch as TwitchIcon, Youtube as YoutubeIcon } from 'lucide-react';
import { useUIStore } from '../store/useUIStore';
import { cn } from './ui/utils';
import { useStreamSearch } from './Navigation/useStreamSearch';

// 結果清單（含 Radix ScrollArea）只在有結果時才需要：lazy 載入，不進首頁首屏 entry；聚焦時預先下載
const loadResultsList = () => import('./Navigation/SearchResultsList').then(m => ({ default: m.SearchResultsList }));
const SearchResultsList = lazy(loadResultsList);

const TWITCH_COLOR = '#9146FF';
const YOUTUBE_COLOR = '#FF0000';

interface StreamSearchBoxProps {
    /** lg = 首頁 Hero 尺寸；md = canvas 空狀態尺寸 */
    size?: 'lg' | 'md';
    /** 加入成功後導向 /canvas（首頁用） */
    navigateToCanvas?: boolean;
    className?: string;
}

export function StreamSearchBox({ size = 'md', navigateToCanvas = false, className }: StreamSearchBoxProps) {
    const { t } = useTranslation(['common', 'navbar']);
    const setPage = useUIStore((s) => s.setPage);
    const [error, setError] = useState('');
    const id = useId();
    const inputId = `stream-search-${id}`;
    const errorId = `${inputId}-error`;

    const onAdded = useCallback(() => { if (navigateToCanvas) setPage('canvas'); }, [navigateToCanvas, setPage]);
    const s = useStreamSearch({ onAdded, onError: setError });
    const isLg = size === 'lg';
    const iconSize = isLg ? 18 : 16;

    return (
        <div ref={s.containerRef} className={cn('relative w-full', isLg ? 'max-w-xl' : 'max-w-lg', className)}>
            <form
                onSubmit={(e) => { e.preventDefault(); void s.submit(); }}
                className="w-full"
                noValidate
            >
                <label htmlFor={inputId} className="sr-only">
                    {t('quick_add.label', '新增直播串流')}
                </label>
                <div
                    className={cn(
                        'flex items-center gap-2 rounded-full border border-border bg-card/80 backdrop-blur',
                        'focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 transition-colors',
                        isLg ? 'p-1.5 pl-2' : 'p-1 pl-1.5',
                    )}
                >
                    {/* 平台切換：決定打字時搜 Twitch 還是 YouTube（貼網址兩個平台都吃） */}
                    <button
                        type="button"
                        onClick={s.togglePlatform}
                        data-search-platform
                        className={cn('shrink-0 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors', isLg ? 'w-9 h-9' : 'w-8 h-8')}
                        title={s.platform === 'twitch' ? t('navbar:twitch') : t('navbar:youtube')}
                        aria-label={s.platform === 'twitch' ? t('navbar:twitch') : t('navbar:youtube')}
                    >
                        {s.platform === 'twitch'
                            ? <TwitchIcon size={iconSize} style={{ color: TWITCH_COLOR }} />
                            : <YoutubeIcon size={iconSize} style={{ color: YOUTUBE_COLOR }} />}
                    </button>
                    <input
                        ref={s.inputRef}
                        id={inputId}
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        value={s.query}
                        onChange={(e) => {
                            s.changeQuery(e.target.value);
                            if (error) setError('');
                        }}
                        onFocus={() => {
                            s.warmUp();
                            void loadResultsList().catch(() => {});
                            s.reopenResults();
                        }}
                        onKeyDown={s.handleKeyDown}
                        placeholder={s.platform === 'twitch'
                            ? t('quick_add.placeholder_twitch', '貼上網址，或搜尋 Twitch 頻道')
                            : t('quick_add.placeholder_youtube', '貼上網址，或搜尋 VTuber／YouTube 頻道')}
                        aria-invalid={!!error}
                        aria-describedby={error ? errorId : undefined}
                        aria-autocomplete="list"
                        className={cn(
                            'flex-1 min-w-0 bg-transparent outline-none text-foreground placeholder:text-muted-foreground/70',
                            isLg ? 'text-base h-11' : 'text-sm h-9',
                        )}
                    />
                    {s.isSearching ? (
                        <Loader2 className="w-4 h-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                    ) : s.query.length > 0 ? (
                        <button
                            type="button"
                            onClick={s.clear}
                            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10"
                            title={t('common.clear', '清除')}
                            aria-label={t('common.clear', '清除')}
                        >
                            <X size={14} />
                        </button>
                    ) : null}
                    <button
                        type="submit"
                        disabled={s.isSubmitting || !s.query.trim()}
                        className={cn(
                            'inline-flex items-center justify-center gap-1.5 rounded-full font-semibold shrink-0',
                            'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
                            'disabled:opacity-50 disabled:pointer-events-none',
                            isLg ? 'h-11 px-6 text-base' : 'h-9 px-4 text-sm',
                        )}
                    >
                        {s.isSubmitting ? <Loader2 className={cn(isLg ? 'w-5 h-5' : 'w-4 h-4', 'animate-spin')} /> : <Play className={isLg ? 'w-5 h-5' : 'w-4 h-4'} />}
                        {t('quick_add.button', '開始觀看')}
                    </button>
                </div>
            </form>
            {error && (
                <p id={errorId} role="alert" className="mt-2 px-4 text-left text-sm text-red-400">
                    {error}
                </p>
            )}
            {/* 結果清單在框下方展開（首頁與空畫布的框都在畫面上半部） */}
            {s.showResults && s.results.length > 0 && (
                <div
                    data-search-results
                    className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[rgba(10,10,14,0.96)] shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2"
                >
                    <Suspense fallback={null}>
                    <SearchResultsList
                        results={s.results}
                        selectedIndex={s.selectedIndex}
                        onSelect={s.selectResult}
                        onHover={s.setSelectedIndex}
                        // 高度隨結果數；限高要下在 viewport（下在 Root 不會捲動，見 error 庫 Radix ScrollArea 陷阱）
                        heightClass="[&>[data-radix-scroll-area-viewport]]:max-h-72"
                    />
                    </Suspense>
                </div>
            )}
        </div>
    );
}
