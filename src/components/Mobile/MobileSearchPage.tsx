import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, Loader2, Plus, Check } from 'lucide-react';
import { useVTubers } from '../../features/vtuber/hooks/useVTubers';
import { useStreamStore } from '../../store/useStreamStore';
import { cn } from '../ui/utils';
import { toast } from 'sonner';
import type { VTuberRecord } from '../../features/vtuber/types';

interface MobileSearchPageProps {
    /** 加入串流成功後通知外層切回觀看 tab */
    onAddedStream?: () => void;
}

// 手機版「搜尋」：頻道 / VTuber 搜尋（複用 useVTubers，走 ilike name 真實查詢）。
// 也支援直接貼直播網址 → addStream。結果列點「＋」加入觀看串流並切回 watch。
export function MobileSearchPage({ onAddedStream }: MobileSearchPageProps) {
    const { t } = useTranslation();
    const addStream = useStreamStore(s => s.addStream);

    const [input, setInput] = useState('');
    const [query, setQuery] = useState('');
    const [addingId, setAddingId] = useState<string | null>(null);
    const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
    const [urlAdding, setUrlAdding] = useState(false);

    // Debounce 300ms（對齊既有 VTuberSearchInput）
    useEffect(() => {
        const timer = setTimeout(() => setQuery(input.trim()), 300);
        return () => clearTimeout(timer);
    }, [input]);

    // 看起來像網址 → 走 addStream（貼直播網址加流）；否則走 VTuber 名稱查詢
    const looksLikeUrl = /^(https?:\/\/|www\.|twitch\.tv|youtube\.com|youtu\.be)/i.test(query);
    const enabled = query.length >= 1 && !looksLikeUrl;

    // 未啟用查詢（空輸入 / URL 模式）時帶最小 pageSize=1（合法 range），且不讀其結果，
    // 避免 range(0,-1) 非法區間；query key 隨 search 變動，不會誤用快取。
    const { data, isLoading, isFetching } = useVTubers(
        enabled ? { search: query, pageSize: 20 } : { pageSize: 1 },
    );
    const results = enabled ? (data?.data ?? []) : [];

    const platformOf = (v: VTuberRecord): 'twitch' | 'youtube' | null =>
        v.twitch_channel_id ? 'twitch' : v.youtube_channel_id ? 'youtube' : null;

    const channelUrlOf = (v: VTuberRecord, p: 'twitch' | 'youtube'): string =>
        p === 'twitch'
            ? `https://www.twitch.tv/${v.twitch_channel_id}`
            : `https://www.youtube.com/channel/${v.youtube_channel_id}`;

    const handleAddVtuber = async (v: VTuberRecord) => {
        const p = platformOf(v);
        if (!p || addingId) return;
        setAddingId(v.id);
        try {
            const result = await addStream(channelUrlOf(v, p), { withChat: true, withStream: true, displayName: v.name });
            if (result.success) {
                setAddedIds(prev => new Set(prev).add(v.id));
                toast.success(t('mobile.search.added', '已加入觀看：{{name}}', { name: v.name }));
                onAddedStream?.();
            } else {
                toast.error(result.message || t('mobile.search.add_failed', '無法加入串流'));
            }
        } catch {
            toast.error(t('mobile.search.add_failed', '無法加入串流'));
        } finally {
            setAddingId(null);
        }
    };

    const handleAddUrl = async () => {
        if (!query || urlAdding) return;
        setUrlAdding(true);
        try {
            const result = await addStream(query);
            if (result.success) {
                setInput('');
                toast.success(t('mobile.search.url_added', '已加入觀看'));
                onAddedStream?.();
            } else {
                toast.error(result.message || t('mobile.search.add_failed', '無法加入串流'));
            }
        } catch {
            toast.error(t('mobile.search.add_failed', '無法加入串流'));
        } finally {
            setUrlAdding(false);
        }
    };

    return (
        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
            {/* Search input */}
            <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={t('mobile.search.placeholder', '搜尋頻道或貼上直播網址')}
                    className="w-full h-11 pl-9 pr-9 rounded-xl bg-card border border-white/[0.08] text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    onKeyDown={(e) => { if (e.key === 'Enter' && looksLikeUrl) handleAddUrl(); }}
                />
                {input && (
                    <button
                        type="button"
                        onClick={() => setInput('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground"
                        aria-label={t('common.cancel', '清除')}
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* URL 模式：直接加入串流 CTA */}
            {looksLikeUrl && query && (
                <button
                    onClick={handleAddUrl}
                    disabled={urlAdding}
                    className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-primary text-white text-sm font-semibold active:scale-[0.99] transition-transform disabled:opacity-60 mb-4"
                >
                    {urlAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {t('mobile.search.add_from_url', '從網址加入串流')}
                </button>
            )}

            {/* 名稱查詢結果 */}
            {enabled && (
                <>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                        {t('mobile.search.results', '搜尋結果')}
                    </div>

                    {(isLoading || isFetching) && results.length === 0 && (
                        <div className="flex items-center justify-center py-10 text-muted-foreground">
                            <Loader2 className="w-5 h-5 animate-spin" />
                        </div>
                    )}

                    {!isLoading && !isFetching && results.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <Search className="w-8 h-8 text-muted-foreground/40 mb-3" />
                            <p className="text-sm text-foreground">{t('mobile.search.no_results', '找不到符合的頻道')}</p>
                            <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
                                {t('mobile.search.no_results_hint', '試試其他關鍵字，或直接貼上直播網址')}
                            </p>
                        </div>
                    )}

                    <div className="flex flex-col gap-2">
                        {results.map((v) => {
                            const p = platformOf(v);
                            const added = addedIds.has(v.id);
                            const adding = addingId === v.id;
                            return (
                                <div
                                    key={v.id}
                                    className="flex items-center gap-3 p-2.5 rounded-xl bg-card border border-white/[0.06]"
                                >
                                    {v.img_url ? (
                                        <img
                                            src={v.img_url}
                                            alt=""
                                            className="w-9 h-9 rounded-full object-cover shrink-0"
                                            loading="lazy"
                                            referrerPolicy="no-referrer"
                                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
                                        />
                                    ) : (
                                        <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center bg-primary/15 text-primary font-bold text-sm">
                                            {v.name.charAt(0)}
                                        </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-semibold truncate">{v.name}</div>
                                        <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                                            {p && (
                                                <span className={cn(
                                                    'font-semibold uppercase tracking-wide text-[9px]',
                                                    p === 'twitch' ? 'text-[#c084fc]' : 'text-[#fca5a5]'
                                                )}>
                                                    {p}
                                                </span>
                                            )}
                                            <span>· {v.nationality}</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleAddVtuber(v)}
                                        disabled={!p || adding || added}
                                        className={cn(
                                            'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                                            added
                                                ? 'bg-emerald-500/15 text-emerald-300'
                                                : 'bg-primary text-white active:scale-95 disabled:opacity-40'
                                        )}
                                        aria-label={t('mobile.search.add_to_watch', '加入觀看')}
                                    >
                                        {adding ? <Loader2 className="w-4 h-4 animate-spin" />
                                            : added ? <Check className="w-4 h-4" />
                                            : <Plus className="w-4 h-4" />}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {/* 初始空狀態（尚未輸入）*/}
            {!enabled && !looksLikeUrl && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Search className="w-9 h-9 text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-foreground">{t('mobile.search.idle_title', '搜尋 VTuber 頻道')}</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">
                        {t('mobile.search.idle_hint', '輸入頻道名稱搜尋，或直接貼上 Twitch / YouTube 直播網址')}
                    </p>
                </div>
            )}
        </div>
    );
}
