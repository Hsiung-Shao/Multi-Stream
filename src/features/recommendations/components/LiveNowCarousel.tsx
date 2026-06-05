// 現正直播 carousel — RecommendationsPage 頂部 Hero 區（split 變體）
//
// 設計稿 CarouselHero split=true 分支（design-ref/ui_kits/multistream-hub/VTuberRecommend.jsx L413）
// ＋ SideMiniRow（L586）：版面 grid「1fr / 320px」，左 = 大圖 FeaturedTile，
// 右 = 側欄迷你列表（標題「其他正在直播」+ 每筆 SideMiniRow，active 高亮 violet，
// 點擊把該筆設為大圖 featured）。split 模式無 pager dots / 左右箭頭，
// 改由右側列表點選切換；自動輪播仍每 5.5s 換 featured（右側 active 跟著移動），
// hover 暫停、尊重 prefers-reduced-motion，無直播 / 載入中時整區不 render。
// 手機（<lg）側欄堆到大圖下方。
//
// 資料源 useLivestreams（/api/livestreams，cron 每 2 分鐘更新）。
// ⚠️ DEV-ONLY：本地 0 筆時注入 __devMockLivestreams 供 UI 驗證（import.meta.env.DEV 守衛，正式 build 不注入）。
// 點「立即觀看」/ 大圖在新分頁開該直播 video_url。

import { useState, useEffect, useRef, useMemo } from 'react';
import { Radio, Eye, Heart, Gamepad2, Play } from 'lucide-react';
import { useLivestreams } from '../useLivestreams';
import { useRecommendations } from '../hooks';
import type { RecommendationAggregate } from '../types';
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
    const [selected, setSelected] = useState(0);
    const [scope, setScope] = useState<'today' | 'all'>('all'); // 預設全時段
    const pausedRef = useRef(false);

    // DEV-ONLY：本地空資料時注入 mock，讓 Hero 能渲染驗證；正式 build 不會用到
    const allStreams: LivestreamWithDisplay[] =
        (import.meta.env.DEV && (!data || data.length === 0))
            ? DEV_MOCK_LIVESTREAMS
            : (data ?? []);

    // 「今日推薦」集合：近 24h 內被推薦過的 vtuber_id（daily 榜，與推薦榜共用同一 query cache）
    const { data: dailyRec } = useRecommendations({ sort: 'daily', limit: 60 });
    const todayIds = useMemo(
        () => new Set(((dailyRec?.items as RecommendationAggregate[] | undefined) ?? []).map((it) => it.vtuber_id)),
        [dailyRec],
    );

    // scope 過濾：all = 全部正在直播的被推薦 VTuber；today = 其中今天被推薦過的
    const streams = useMemo(
        () => (scope === 'all' ? allStreams : allStreams.filter((s) => s.vtuber && todayIds.has(s.vtuber.id))),
        [scope, allStreams, todayIds],
    );

    const count = streams.length;

    // 資料筆數變動時，避免 selected 越界（例如 cron 更新後筆數變少）
    useEffect(() => {
        if (selected >= count && count > 0) setSelected(0);
    }, [count, selected]);

    // 自動輪播：每 5.5s 推進 featured（split 模式右側 active 跟著移動）
    // hover 暫停、尊重 prefers-reduced-motion、單筆不輪播
    useEffect(() => {
        if (count <= 1) return;
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return;
        const id = window.setInterval(() => {
            if (!pausedRef.current) setSelected(prev => (prev + 1) % count);
        }, AUTOPLAY_MS);
        return () => window.clearInterval(id);
    }, [count]);

    // 載入中或完全沒有任何直播 → 不佔版面（降級）
    if (isLoading || allStreams.length === 0) return null;

    // scope 過濾後可能為空（例如今日尚無被推薦者正在直播）→ 仍顯示區塊，內容改空提示
    const featured = count > 0 ? streams[Math.min(selected, count - 1)] : null;

    return (
        <section aria-label="正在直播的推薦 VTuber">
            {/* Section header + scope toggle */}
            <div className="flex items-center justify-between gap-3 mb-3.5">
                <div className="flex items-center gap-2.5">
                    <Radio className="w-[18px] h-[18px] text-red-500" aria-hidden />
                    <h2 className="text-[17px] font-bold tracking-tight text-foreground">正在直播的推薦 VTuber</h2>
                    {count > 0 && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 tabular-nums">
                            {count}
                        </span>
                    )}
                </div>
                <ScopeToggle scope={scope} setScope={setScope} />
            </div>

            {featured ? (
                /* split 版面：左大圖 + 右側欄迷你列表（手機 <lg 堆疊單欄） */
                <div
                    className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-0 rounded-[18px] border border-border bg-card overflow-hidden"
                    onMouseEnter={() => { pausedRef.current = true; }}
                    onMouseLeave={() => { pausedRef.current = false; }}
                >
                    {/* 左：featured 大圖 */}
                    <FeaturedTile stream={featured} />

                    {/* 右：其他正在直播（側欄迷你列表） */}
                    {count > 1 && (
                        <div className="flex flex-col gap-2 p-3 bg-black/25 border-t lg:border-t-0 lg:border-l border-white/[0.06]">
                            <div className="px-1.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                其他正在直播
                            </div>
                            {streams.map((s, i) => (
                                <SideMiniRow
                                    key={s.id}
                                    stream={s}
                                    active={i === Math.min(selected, count - 1)}
                                    onSelect={() => setSelected(i)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                /* 今日過濾後無正在直播者 → 空提示（不整塊消失） */
                <div className="rounded-[18px] border border-border bg-card px-6 py-10 text-center">
                    <p className="text-sm text-muted-foreground">
                        今天還沒有被推薦的 VTuber 正在直播,切到「全時段推薦」看看吧
                    </p>
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
            className="group block relative w-full aspect-[16/7] lg:aspect-auto lg:h-full lg:min-h-[260px] overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
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

// 側欄迷你列（設計稿 SideMiniRow L586）：頭像漸層方塊 + LiveDot + 名稱 + game·觀看數。
// active 高亮 violet；點擊把該筆設為大圖 featured。
function SideMiniRow({
    stream,
    active,
    onSelect,
}: {
    stream: LivestreamWithDisplay;
    active: boolean;
    onSelect: () => void;
}) {
    const v = stream.vtuber;
    const name = v?.name ?? '未知 VTuber';
    const grad = avatarGradient(name);
    const viewers = formatViewers(stream.viewer_count);
    // game · 觀看數（兩者皆可能缺；缺值優雅省略）
    const meta = [stream.game, viewers && `${viewers} 觀看`].filter(Boolean).join(' · ');

    return (
        <button
            type="button"
            onClick={onSelect}
            aria-pressed={active}
            aria-label={`切換到 ${name} 的直播`}
            className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-[10px] text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active
                    ? 'bg-[rgba(168,85,247,0.12)] border border-[rgba(168,85,247,0.3)]'
                    : 'border border-transparent hover:bg-foreground/[0.04]'
            }`}
        >
            {/* 頭像漸層方塊（真實有圖用圖，無則名稱首字） */}
            {v?.img_url ? (
                <img
                    src={v.img_url}
                    alt=""
                    className="w-10 h-10 rounded-lg object-cover shrink-0"
                    style={{ boxShadow: active ? `0 0 0 2px ${grad.solid}` : undefined }}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
            ) : (
                <div
                    className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-white text-base font-bold"
                    style={{
                        background: `linear-gradient(135deg, ${grad.solid}66, ${grad.solid})`,
                        boxShadow: active ? `0 0 0 2px ${grad.solid}99` : undefined,
                    }}
                >
                    {name[0] ?? '?'}
                </div>
            )}

            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className="w-[5px] h-[5px] rounded-full bg-red-500 live-pulse shrink-0" />
                    <span className={`text-xs font-semibold truncate ${active ? 'text-foreground' : 'text-foreground'}`}>
                        {name}
                    </span>
                </div>
                {meta && (
                    <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{meta}</div>
                )}
            </div>
        </button>
    );
}
