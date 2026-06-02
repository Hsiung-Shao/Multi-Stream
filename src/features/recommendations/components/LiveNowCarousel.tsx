// 現正直播 carousel — RecommendationsPage 頂部 Hero 區
//
// 大圖幻燈片式水平輪播：一次聚焦一張大圖（露出下一張邊緣），每 5 秒自動切換，
// 底部指示點 + 左右箭頭，hover 暫停，尊重 prefers-reduced-motion。
//
// 資料源 useLivestreams（/api/livestreams，cron 每 2 分鐘更新）。
// 無直播 / 載入中 → 整個區塊不 render（空狀態降級，不佔版面）。
// 點擊大圖在新分頁開該直播 video_url。

import { useState, useEffect, useRef } from 'react';
import { Radio, Eye } from 'lucide-react';
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselPrevious,
    CarouselNext,
    type CarouselApi,
} from '../../../components/ui/carousel';
import { useLivestreams } from '../useLivestreams';
import type { Livestream } from '../types';

const AUTOPLAY_MS = 5000;

function formatViewers(n: number | null): string | null {
    if (n == null) return null;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
}

export function LiveNowCarousel() {
    const { data: streams, isLoading } = useLivestreams();
    const [api, setApi] = useState<CarouselApi>();
    const [selected, setSelected] = useState(0);
    const [snaps, setSnaps] = useState<number[]>([]);
    const pausedRef = useRef(false);

    // 同步 selected index + snap 點（給指示點用）
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
    if (isLoading || !streams || streams.length === 0) return null;

    return (
        <section aria-label="現正直播">
            <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-red-500 live-pulse" />
                <h2 className="text-sm font-semibold text-zinc-100">現正直播</h2>
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-300 tabular-nums">
                    {streams.length}
                </span>
            </div>

            <Carousel
                opts={{ align: 'start', loop: streams.length > 1 }}
                setApi={setApi}
                onMouseEnter={() => { pausedRef.current = true; }}
                onMouseLeave={() => { pausedRef.current = false; }}
            >
                <CarouselContent className="-ml-3">
                    {streams.map(s => (
                        <CarouselItem key={s.id} className="pl-3 basis-[88%] sm:basis-[78%] lg:basis-[68%]">
                            <LiveHeroCard stream={s} />
                        </CarouselItem>
                    ))}
                </CarouselContent>
                {streams.length > 1 && (
                    <>
                        <CarouselPrevious className="left-3 size-9 bg-black/50 border-zinc-700 text-white hover:bg-black/70 hover:text-white" />
                        <CarouselNext className="right-3 size-9 bg-black/50 border-zinc-700 text-white hover:bg-black/70 hover:text-white" />
                    </>
                )}
            </Carousel>

            {/* 指示點 */}
            {snaps.length > 1 && (
                <div className="flex justify-center items-center gap-1.5 mt-3">
                    {snaps.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => api?.scrollTo(i)}
                            className={`h-1.5 rounded-full transition-all ${
                                i === selected ? 'w-5 bg-red-400' : 'w-1.5 bg-zinc-700 hover:bg-zinc-600'
                            }`}
                            aria-label={`跳到第 ${i + 1} 個直播`}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}

function LiveHeroCard({ stream }: { stream: Livestream }) {
    const v = stream.vtuber;
    const viewers = formatViewers(stream.viewer_count);
    const isTwitch = stream.platform === 'twitch';

    return (
        <a
            href={stream.video_url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block relative aspect-video rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900"
            title={stream.title || v?.name || '觀看直播'}
        >
            {/* 大縮圖 */}
            {stream.thumbnail_url ? (
                <img
                    src={stream.thumbnail_url}
                    alt={stream.title || v?.name || ''}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
                />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-700">
                    <Radio className="w-12 h-12" />
                </div>
            )}

            {/* 底部漸層遮罩（讓疊字可讀） */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

            {/* 左上：LIVE + 平台 */}
            <div className="absolute top-3 left-3 flex items-center gap-2">
                <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-600 text-white text-xs font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-white live-pulse" />
                    LIVE
                </div>
                <span className={`text-xs px-2 py-0.5 rounded font-medium text-white ${
                    isTwitch ? 'bg-violet-600/90' : 'bg-red-600/90'
                }`}>
                    {isTwitch ? 'Twitch' : 'YouTube'}
                </span>
            </div>

            {/* 右上：觀看數（Twitch 有，YouTube 無） */}
            {viewers && (
                <span className="absolute top-3 right-3 flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-black/70 text-white tabular-nums">
                    <Eye className="w-3 h-3" />
                    {viewers}
                </span>
            )}

            {/* 底部：頭像 + 名稱 + 標題 */}
            <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end gap-3">
                {v?.img_url ? (
                    <img
                        src={v.img_url}
                        alt={v.name}
                        width="40"
                        height="40"
                        className="w-10 h-10 rounded-full object-cover border-2 border-white/20 shrink-0"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                ) : (
                    <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-300 text-sm font-semibold shrink-0 border-2 border-white/20">
                        {v?.name?.[0] ?? '?'}
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white truncate drop-shadow">{v?.name ?? '未知'}</p>
                    {stream.title && (
                        <p className="text-xs text-zinc-200 truncate mt-0.5 drop-shadow">{stream.title}</p>
                    )}
                </div>
            </div>
        </a>
    );
}
