// 現正直播 carousel — RecommendationsPage 頂部 Hero 區
//
// 設計稿 FeaturedTile（design-ref/ui_kits/multistream-hub/VTuberRecommend.jsx L477-573）：
// 單張 16/7 大圖，每 5 秒自動切換，底部寬度動畫 pager + 左右箭頭，
// hover 暫停，尊重 prefers-reduced-motion，無直播 / 載入中時整區不 render。
//
// 資料源 useLivestreams（/api/livestreams，cron 每 2 分鐘更新）。
// ⚠️ DEV-ONLY：本地 0 筆時注入 __devMockLivestreams 供 UI 驗證（import.meta.env.DEV 守衛，正式 build 不注入）。
// 點「立即觀看」/ 大圖在新分頁開該直播 video_url。

import { useState, useEffect, useRef } from 'react';
import { Radio, Eye, Heart, Gamepad2, Play } from 'lucide-react';
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselPrevious,
    CarouselNext,
    type CarouselApi,
} from '../../../components/ui/carousel';
import { useLivestreams } from '../useLivestreams';
import { DEV_MOCK_LIVESTREAMS, type LivestreamWithDisplay } from '../__devMockLivestreams';

const AUTOPLAY_MS = 5500;

function formatViewers(n: number | null): string | null {
    if (n == null) return null;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
}

// 名稱衍生的穩定漸層色（無 thumbnail / avatarColor 時用 hash 取穩定 hue，
// 對齊 RecommendationCard.avatarGradient 的作法，雙主題皆可讀）
function avatarGradient(name: string): { top: string; bot: string; solid: string } {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return {
        top: `oklch(0.45 0.16 ${h})`,
        bot: `oklch(0.22 0.08 ${(h + 40) % 360})`,
        solid: `oklch(0.62 0.2 ${h})`,
    };
}

// 平台徽章（複用設計稿配色；雙主題下半透明底皆可讀）
function PlatformChip({ platform }: { platform: 'twitch' | 'youtube' }) {
    const cls = platform === 'twitch'
        ? 'bg-[rgba(145,70,255,0.18)] text-[#c084fc] border-[rgba(145,70,255,0.35)]'
        : 'bg-[rgba(239,0,0,0.18)] text-[#f87171] border-[rgba(239,0,0,0.35)]';
    return (
        <span className={`inline-flex items-center h-[18px] px-[7px] rounded text-[10px] font-semibold border backdrop-blur-sm ${cls}`}>
            {platform === 'twitch' ? 'Twitch' : 'YouTube'}
        </span>
    );
}

export function LiveNowCarousel() {
    const { data, isLoading } = useLivestreams();
    const [api, setApi] = useState<CarouselApi>();
    const [selected, setSelected] = useState(0);
    const [snaps, setSnaps] = useState<number[]>([]);
    const [scope, setScope] = useState<'today' | 'all'>('today'); // 純前端切換
    const pausedRef = useRef(false);

    // DEV-ONLY：本地空資料時注入 mock，讓 Hero 能渲染驗證；正式 build 不會用到
    const streams: LivestreamWithDisplay[] =
        (import.meta.env.DEV && (!data || data.length === 0))
            ? DEV_MOCK_LIVESTREAMS
            : (data ?? []);

    // TODO(scope)：真實資料目前不分 today / all，toggle 暫不過濾，兩者顯示同一份。

    // 同步 selected index + snap 點（給 pager 用）
    useEffect(() => {
        if (!api) return;
        const sync = () => {
            setSnaps(api.scrollSnapList());
            setSelected(api.selectedScrollSnap());
        };
        sync();
        api.on('select', sync);
        api.on('reInit', sync);
        return () => { api.off('select', sync); api.off('reInit', sync); };
    }, [api]);

    // 自動播放（hover 暫停、尊重 reduced-motion）
    useEffect(() => {
        if (!api) return;
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return;
        const id = window.setInterval(() => {
            if (!pausedRef.current) api.scrollNext();
        }, AUTOPLAY_MS);
        return () => window.clearInterval(id);
    }, [api]);

    // 載入中或無直播 → 不佔版面（降級）
    if (isLoading || streams.length === 0) return null;

    return (
        <section aria-label="正在直播的推薦 VTuber">
            {/* Section header + scope toggle */}
            <div className="flex items-center justify-between gap-3 mb-3.5">
                <div className="flex items-center gap-2.5">
                    <Radio className="w-[18px] h-[18px] text-red-500" aria-hidden />
                    <h2 className="text-[17px] font-bold tracking-tight text-foreground">正在直播的推薦 VTuber</h2>
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 tabular-nums">
                        {streams.length}
                    </span>
                </div>
                <ScopeToggle scope={scope} setScope={setScope} />
            </div>

            <Carousel
                opts={{ align: 'start', loop: streams.length > 1 }}
                setApi={setApi}
                onMouseEnter={() => { pausedRef.current = true; }}
                onMouseLeave={() => { pausedRef.current = false; }}
                className="rounded-[18px] border border-border bg-card overflow-hidden"
            >
                <CarouselContent className="ml-0">
                    {streams.map(s => (
                        <CarouselItem key={s.id} className="pl-0 basis-full">
                            <FeaturedTile stream={s} />
                        </CarouselItem>
                    ))}
                </CarouselContent>
                {streams.length > 1 && (
                    <>
                        <CarouselPrevious className="left-4 size-8 bg-black/40 border-white/10 text-white hover:bg-black/60 hover:text-white" />
                        <CarouselNext className="right-4 size-8 bg-black/40 border-white/10 text-white hover:bg-black/60 hover:text-white" />
                    </>
                )}
            </Carousel>

            {/* Pager dots（設計版寬度動畫） */}
            {snaps.length > 1 && (
                <div className="flex justify-start items-center gap-1.5 mt-3">
                    {snaps.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => api?.scrollTo(i)}
                            className={`h-2 rounded-full transition-all duration-300 ${
                                i === selected ? 'w-6 bg-primary' : 'w-2 bg-foreground/15 hover:bg-foreground/30'
                            }`}
                            aria-label={`跳到第 ${i + 1} 個直播`}
                            aria-current={i === selected}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}

function ScopeToggle({ scope, setScope }: { scope: 'today' | 'all'; setScope: (s: 'today' | 'all') => void }) {
    const opts = [
        { id: 'today' as const, label: '今日推薦' },
        { id: 'all' as const, label: '全時段推薦' },
    ];
    return (
        <div className="inline-flex p-[3px] rounded-full bg-foreground/[0.04] border border-border">
            {opts.map(o => (
                <button
                    key={o.id}
                    onClick={() => setScope(o.id)}
                    aria-pressed={scope === o.id}
                    className={`px-3.5 py-[5px] rounded-full text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        scope === o.id
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

function FeaturedTile({ stream }: { stream: LivestreamWithDisplay }) {
    const v = stream.vtuber;
    const name = v?.name ?? '未知 VTuber';
    const viewers = formatViewers(stream.viewer_count);
    const grad = avatarGradient(name);
    const hasThumb = !!stream.thumbnail_url;

    return (
        <a
            href={stream.video_url}
            target="_blank"
            rel="noopener noreferrer"
            title={stream.title || name || '觀看直播'}
            className="group block relative w-full aspect-[16/7] overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            style={
                hasThumb
                    ? undefined
                    : { background: `linear-gradient(155deg, ${grad.top} 0%, ${grad.bot} 100%)` }
            }
        >
            {/* 底：真實縮圖（有則用，無則上面 inline 漸層底） */}
            {hasThumb && (
                <img
                    src={stream.thumbnail_url!}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
                />
            )}

            {/* 裝飾光暈 + 底部加深漸層（讓疊字可讀） */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: `radial-gradient(800px circle at 18% 28%, ${grad.solid}22 0%, transparent 55%)` }}
            />
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

            {/* 左上：LIVE + 觀看數 */}
            <div className="absolute top-4 left-4 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded bg-red-600 text-white text-[10px] font-bold tracking-[0.04em]">
                    <span className="w-1.5 h-1.5 rounded-full bg-white live-pulse" />
                    LIVE
                </span>
                {viewers && (
                    <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded bg-black/55 text-white text-[11px] font-semibold tabular-nums backdrop-blur-sm">
                        <Eye className="w-[11px] h-[11px]" /> {viewers} 觀看
                    </span>
                )}
            </div>

            {/* 右上：平台徽章 */}
            <div className="absolute top-4 right-4 flex items-center gap-1.5">
                <PlatformChip platform={stream.platform} />
            </div>

            {/* 中右：大頭像 splash（真實有 img_url 用圖；無則字母漸層球） */}
            <div className="absolute top-1/2 -translate-y-1/2 right-7 hidden sm:flex items-center justify-center">
                <div
                    className="absolute right-[-37px] w-[200px] h-[200px] rounded-full opacity-70 blur-[2px] pointer-events-none"
                    style={{ background: `linear-gradient(135deg, ${grad.solid}55, ${grad.solid})` }}
                />
                {v?.img_url ? (
                    <img
                        src={v.img_url}
                        alt={name}
                        className="relative w-[110px] h-[110px] rounded-full object-cover border-4 border-white/10 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.5)]"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                ) : (
                    <div
                        className="relative w-[110px] h-[110px] rounded-full flex items-center justify-center text-white font-extrabold text-5xl border-4 border-white/[0.08]"
                        style={{
                            background: `linear-gradient(135deg, ${grad.solid}, color-mix(in oklch, ${grad.solid} 80%, black))`,
                            boxShadow: `0 20px 60px -10px ${grad.solid}66`,
                        }}
                    >
                        {name[0] ?? '?'}
                    </div>
                )}
            </div>

            {/* 底部：game/region + 標題 + 名稱 + 被推薦 + 立即觀看 */}
            <div className="absolute inset-x-0 bottom-0 p-5 flex flex-col justify-end">
                <div className="relative max-w-[68%]">
                    {/* game 膠囊 + region（有才顯示） */}
                    {(stream.game || stream.region) && (
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                            {stream.game && (
                                <span className="inline-flex items-center gap-1.5 px-2 py-[2px] rounded text-[11px] font-semibold text-white bg-white/10 border border-white/15 backdrop-blur-sm">
                                    <Gamepad2 className="w-[11px] h-[11px]" /> {stream.game}
                                </span>
                            )}
                            {stream.region && (
                                <span className="text-[11px] text-white/60">· {stream.region}</span>
                            )}
                        </div>
                    )}

                    {/* 大標題 */}
                    {stream.title && (
                        <h3 className="text-lg sm:text-[22px] font-bold leading-snug tracking-tight text-white line-clamp-2 [text-shadow:0_2px_12px_rgba(0,0,0,0.5)]">
                            {stream.title}
                        </h3>
                    )}

                    {/* 名稱 + 被推薦 + 立即觀看 */}
                    <div className="flex items-center gap-2 sm:gap-3 mt-3 flex-wrap">
                        <span className="text-sm font-semibold text-white">{name}</span>
                        {stream.recCount != null && (
                            <>
                                <span className="hidden sm:inline-block w-px h-3.5 bg-white/20" />
                                <span className="inline-flex items-center gap-1 text-xs text-white/70">
                                    <Heart className="w-[11px] h-[11px] fill-[#f472b6] text-[#f472b6]" />
                                    被推薦 {stream.recCount} 次
                                </span>
                            </>
                        )}
                        <span
                            className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-[0_8px_24px_-6px] shadow-primary/50 group-hover:brightness-110 transition"
                        >
                            <Play className="w-3 h-3 fill-current" /> 立即觀看
                        </span>
                    </div>
                </div>
            </div>
        </a>
    );
}
