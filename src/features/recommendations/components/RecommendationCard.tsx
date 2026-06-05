// 推薦卡片:VTuber 資訊 + 推薦數 + 留言摺疊 + 加收藏按鈕
//
// 用法:在 RecommendationsPage grid 內 render 每個 aggregate
// variant:
//   - 'podium'(rank 1-3,prominent=rank 1 較大):獎台直立佈局
//   - 'card'(預設,rank 4+ / 一般推薦):一般推薦卡

import { useState, useMemo } from 'react';
import { Heart, Star, ChevronDown, Loader2, Radio, Clock, Bookmark, Users } from 'lucide-react';
import { formatRelativeTime } from '../timeFormat';
import type { RecommendationAggregate, RecommendTarget } from '../types';
import { toast } from 'sonner';
import { favoritesService } from '../../favorites/FavoritesService';
import { LANG_LABEL } from '../../../lib/locale';
import { useUIStore } from '../../../store/useUIStore';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from '../../../components/ui/dropdown-menu';

interface Props {
    item: RecommendationAggregate;
    rank?: number;  // 排名(只在 podium 上 1-3 顯示)
    /** 點 Heart 觸發推薦 dialog;不傳就不顯示按鈕 */
    onRecommendClick?: (target: RecommendTarget) => void;
}

// ── 共用:從 VTuberInfo 推 platform / 雙平台 / 收藏 url ──────────────
// （RankingRow 與 RecommendationCard 共用同一套資料映射,避免雙頭維護）
function resolvePlatform(v: RecommendationAggregate['vtuber']): 'twitch' | 'youtube' | null {
    if (!v) return null;
    if (v.twitch_channel_id) return 'twitch';
    if (v.youtube_channel_id) return 'youtube';
    return null;
}

function favoriteUrl(v: NonNullable<RecommendationAggregate['vtuber']>, p: 'twitch' | 'youtube'): string {
    return p === 'twitch'
        ? `https://www.twitch.tv/${v.twitch_channel_id}`
        : `https://www.youtube.com/channel/${v.youtube_channel_id}`;
}

async function addFavoriteAndToast(
    v: NonNullable<RecommendationAggregate['vtuber']>,
    p: 'twitch' | 'youtube',
): Promise<boolean> {
    const label = p === 'twitch' ? 'Twitch' : 'YouTube';
    try {
        const result = await favoritesService.addFavorite(favoriteUrl(v, p), v.name, null);
        if (result.success) {
            toast.success(`已加入 ${label}:${v.name}`);
            return true;
        }
        if (result.message === 'streamAlreadyInFavorites') {
            toast.message(`${v.name}(${label})已在你的收藏內`);
            return true;
        }
        toast.error(result.message || `加入 ${label} 失敗`);
        return false;
    } catch (e) {
        toast.error((e as Error)?.message || `加入 ${p} 失敗`);
        return false;
    }
}

function recommendTargetOf(
    v: NonNullable<RecommendationAggregate['vtuber']>,
    platform: 'twitch' | 'youtube',
): RecommendTarget {
    const primaryChannelId = platform === 'twitch' ? v.twitch_channel_id : v.youtube_channel_id;
    const crossChannelId = platform === 'twitch' ? (v.youtube_channel_id ?? undefined) : (v.twitch_channel_id ?? undefined);
    const url = platform === 'twitch'
        ? `https://www.twitch.tv/${primaryChannelId}`
        : `https://www.youtube.com/channel/${primaryChannelId}`;
    return {
        name: v.name,
        platform,
        channelId: primaryChannelId,
        url,
        imgUrl: v.img_url ?? undefined,
        crossChannelId,
    };
}

function formatNumber(n: number | null | undefined): string {
    if (n == null) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
}

// 金銀銅 rank 漸層(照設計稿 RANK_COLORS):top-3 用漸層底+黑字,其餘用半透明白
const RANK_STYLE: Record<number, { gradient: string; glow: string; orb: string }> = {
    1: { gradient: 'linear-gradient(135deg, #fde68a, #f59e0b)', glow: 'rgba(245,158,11,0.4)', orb: '#fde68a' },
    2: { gradient: 'linear-gradient(135deg, #e5e7eb, #9ca3af)', glow: 'rgba(156,163,175,0.35)', orb: '#e5e7eb' },
    3: { gradient: 'linear-gradient(135deg, #fdba74, #ea580c)', glow: 'rgba(234,88,12,0.35)', orb: '#fdba74' },
};

// rank 徽章(top-3 金銀銅漸層;4+ 半透明白)
function RankBadge({ rank, size = 24 }: { rank: number; size?: number }) {
    const s = RANK_STYLE[rank];
    const fontSize = size >= 36 ? 16 : size >= 28 ? 13 : 11;
    if (s) {
        return (
            <div
                className="inline-flex items-center justify-center rounded-full font-extrabold tabular-nums shrink-0 text-[#0c0a09]"
                style={{
                    width: size, height: size, fontSize,
                    background: s.gradient,
                    boxShadow: `0 0 0 2px rgba(0,0,0,0.35), 0 4px 14px -2px ${s.glow}`,
                }}
            >
                {rank}
            </div>
        );
    }
    return (
        <div
            className="inline-flex items-center justify-center rounded-full font-extrabold tabular-nums shrink-0 bg-foreground/6 border border-foreground/10 text-muted-foreground"
            style={{ width: size, height: size, fontSize }}
        >
            {rank}
        </div>
    );
}

// platform 徽章(Twitch 紫 / YouTube 紅 / 雙平台 琥珀)
function PlatformBadge({ kind }: { kind: 'twitch' | 'youtube' | 'duo' }) {
    const map = {
        twitch: 'bg-[rgba(145,70,255,0.15)] text-[#c084fc] border-[rgba(145,70,255,0.3)]',
        youtube: 'bg-[rgba(239,0,0,0.15)] text-[#f87171] border-[rgba(239,0,0,0.3)]',
        duo: 'bg-[rgba(245,158,11,0.18)] text-[#fbbf24] border-[rgba(245,158,11,0.35)]',
    } as const;
    const label = kind === 'twitch' ? 'Twitch' : kind === 'youtube' ? 'YouTube' : '雙平台';
    return (
        <span className={`inline-flex items-center h-[18px] px-[7px] rounded text-[10px] font-semibold border ${map[kind]}`}>
            {label}
        </span>
    );
}

// 名稱衍生的穩定漸層色(真實資料無設計 mock 的 avatarColor,用 hash 取穩定 hue)
function avatarGradient(name: string): string {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    const c = `oklch(0.62 0.2 ${h})`;
    return `linear-gradient(135deg, color-mix(in oklch, ${c} 35%, transparent), ${c})`;
}

export function RecommendationCard({ item, rank, onRecommendClick }: Props) {
    const setSelectedVtuberId = useUIStore(s => s.setSelectedVtuberId);
    const [favPending, setFavPending] = useState(false);
    const [favAdded, setFavAdded] = useState(false);

    const handleCardClick = () => {
        if (!v?.id) return;
        setSelectedVtuberId(v.id);
    };

    const v = item.vtuber;
    // 顯示時優先 Twitch(若兩平台都有);channel_id 跟 follower count 都會用到對應 platform
    const platform = useMemo<'twitch' | 'youtube' | null>(() => {
        if (!v) return null;
        if (v.twitch_channel_id) return 'twitch';
        if (v.youtube_channel_id) return 'youtube';
        return null;
    }, [v]);

    const handleRecommendClick = () => {
        if (!v || !platform || !onRecommendClick) return;
        const primaryChannelId = platform === 'twitch' ? v.twitch_channel_id : v.youtube_channel_id;
        const crossChannelId = platform === 'twitch' ? (v.youtube_channel_id ?? undefined) : (v.twitch_channel_id ?? undefined);
        const url = platform === 'twitch'
            ? `https://www.twitch.tv/${primaryChannelId}`
            : `https://www.youtube.com/channel/${primaryChannelId}`;
        onRecommendClick({
            name: v.name,
            platform,
            channelId: primaryChannelId,
            url,
            imgUrl: v.img_url ?? undefined,
            crossChannelId,
        });
    };

    const hasTwitch = !!v?.twitch_channel_id;
    const hasYoutube = !!v?.youtube_channel_id;
    const isDualPlatform = hasTwitch && hasYoutube;

    const followerCount = platform === 'twitch' ? v?.twitch_follower_count : v?.youtube_subscriber_count;
    const followerLabel = platform === 'twitch' ? '追隨' : '訂閱';
    const primaryDelta = platform === 'twitch' ? v?.twitch_follower_delta : v?.youtube_subscriber_delta;

    // 內部 helper:加單筆收藏,回傳是否成功(給 'both' 模式 short-circuit 用)
    const addOne = async (p: 'twitch' | 'youtube'): Promise<boolean> => {
        if (!v) return false;
        const url = p === 'twitch'
            ? `https://www.twitch.tv/${v.twitch_channel_id}`
            : `https://www.youtube.com/channel/${v.youtube_channel_id}`;
        try {
            const result = await favoritesService.addFavorite(url, v.name, null);
            const label = p === 'twitch' ? 'Twitch' : 'YouTube';
            if (result.success) {
                toast.success(`已加入 ${label}:${v.name}`);
                return true;
            }
            if (result.message === 'streamAlreadyInFavorites') {
                toast.message(`${v.name}(${label})已在你的收藏內`);
                return true;
            }
            toast.error(result.message || `加入 ${label} 失敗`);
            return false;
        } catch (e) {
            toast.error((e as Error)?.message || `加入 ${p} 失敗`);
            return false;
        }
    };

    const handleAdd = async (mode: 'twitch' | 'youtube' | 'both') => {
        if (!v || favPending || favAdded) return;
        setFavPending(true);
        try {
            if (mode === 'both') {
                const okT = await addOne('twitch');
                const okY = await addOne('youtube');
                if (okT && okY) setFavAdded(true);
            } else {
                const ok = await addOne(mode);
                if (ok) setFavAdded(true);
            }
        } finally {
            setFavPending(false);
        }
    };

    const isPodium = !!rank && rank <= 3;
    const prominent = rank === 1;
    const rankStyle = rank ? RANK_STYLE[rank] : undefined;
    const avatarSize = prominent ? 60 : isPodium ? 48 : 44;

    // ── 動作鈕:收藏(雙平台 Dropdown)──────────────────────────────
    const favBtnClass = favAdded
        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 cursor-default'
        : 'bg-foreground/4 text-muted-foreground border-foreground/8 hover:bg-foreground/8 hover:text-foreground disabled:opacity-50';

    const favButton = isDualPlatform ? (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    disabled={favPending || favAdded || !v}
                    className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-medium border transition-colors whitespace-nowrap ${favBtnClass}`}
                >
                    {favPending ? (
                        <><Loader2 className="w-3 h-3 animate-spin" /> 加入中</>
                    ) : favAdded ? (
                        <><Star className="w-3 h-3 fill-emerald-400" /> 已收藏</>
                    ) : (
                        <><Bookmark className="w-3 h-3" /> 收藏 <ChevronDown className="w-2.5 h-2.5" /></>
                    )}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[140px]">
                <DropdownMenuItem onSelect={() => handleAdd('twitch')}>
                    <span className="text-[#c084fc]">加入 Twitch</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleAdd('youtube')}>
                    <span className="text-[#f87171]">加入 YouTube</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleAdd('both')}>
                    <span>兩個都加</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    ) : (
        <button
            onClick={() => handleAdd(hasTwitch ? 'twitch' : 'youtube')}
            disabled={favPending || favAdded || !v || (!hasTwitch && !hasYoutube)}
            className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-medium border transition-colors ${favBtnClass}`}
        >
            {favPending ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> 加入中</>
            ) : favAdded ? (
                <><Star className="w-3 h-3 fill-emerald-400" /> 已收藏</>
            ) : (
                <><Bookmark className="w-3 h-3" /> 收藏</>
            )}
        </button>
    );

    const recommendButton = onRecommendClick && (
        <button
            onClick={handleRecommendClick}
            disabled={!v || !platform}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-semibold border bg-[rgba(236,72,153,0.18)] text-[#f472b6] border-[rgba(236,72,153,0.4)] hover:bg-[rgba(236,72,153,0.28)] transition-colors disabled:opacity-50 whitespace-nowrap"
            title="推薦這位 VTuber"
        >
            <Heart className="w-3 h-3 fill-current" />
            推薦
        </button>
    );

    // ── 頭像(優先真實圖,無則名稱首字漸層圈)────────────────────
    const avatar = (
        <div className="relative shrink-0">
            {v?.img_url ? (
                <img
                    src={v.img_url}
                    alt={v.name}
                    width={avatarSize}
                    height={avatarSize}
                    className="rounded-full object-cover"
                    style={{
                        width: avatarSize,
                        height: avatarSize,
                        boxShadow: '0 0 0 2px rgba(255,255,255,0.08)',
                    }}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
            ) : (
                <div
                    className="rounded-full flex items-center justify-center text-white font-extrabold"
                    style={{
                        width: avatarSize,
                        height: avatarSize,
                        fontSize: prominent ? 24 : isPodium ? 19 : 17,
                        background: avatarGradient(v?.name ?? '?'),
                        boxShadow: '0 0 0 2px rgba(255,255,255,0.08)',
                    }}
                >
                    {v?.name?.[0] ?? '?'}
                </div>
            )}
        </div>
    );

    const heartPill = (
        <span
            className="inline-flex items-center gap-1 px-2.5 py-[3px] rounded-full text-[11px] font-bold tabular-nums border bg-[rgba(236,72,153,0.12)] text-[#f472b6] border-[rgba(236,72,153,0.3)]"
            title={`${item.count} 人推薦`}
        >
            <Heart className="w-2.5 h-2.5 fill-current" /> {item.count}
        </span>
    );

    // ════════════════════════════════════════════════════════════════
    //  PODIUM 版型(rank 1-3,直立佈局)
    // ════════════════════════════════════════════════════════════════
    if (isPodium) {
        return (
            <article
                className="relative flex flex-col gap-2.5 rounded-2xl border bg-card overflow-hidden transition-colors"
                style={{
                    padding: prominent ? 16 : 14,
                    borderColor: rank === 1 ? 'rgba(251,191,36,0.3)' : 'var(--border)',
                }}
            >
                {/* rank 角落 glow */}
                {rankStyle && (
                    <div
                        className="absolute pointer-events-none rounded-full"
                        style={{
                            top: -40, right: -40, width: 160, height: 160,
                            background: rankStyle.orb, opacity: 0.08, filter: 'blur(40px)',
                        }}
                    />
                )}

                {/* rank + 推薦數 */}
                <div className="relative flex items-center gap-2">
                    <RankBadge rank={rank!} size={prominent ? 36 : 28} />
                    <span className="ml-auto">{heartPill}</span>
                </div>

                {/* 頭像 + 名稱 + platform(可點進詳情)*/}
                <div
                    role="button"
                    tabIndex={0}
                    onClick={handleCardClick}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(); } }}
                    className="flex items-center gap-3 mt-1 cursor-pointer group"
                    title={v ? `查看「${v.name}」詳情` : undefined}
                >
                    {avatar}
                    <div className="min-w-0 flex-1">
                        <span
                            className="block truncate font-bold group-hover:text-primary transition-colors"
                            style={{ fontSize: prominent ? 16 : 14 }}
                        >
                            {v?.name ?? '未知 VTuber'}
                        </span>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {platform && <PlatformBadge kind={platform} />}
                            {isDualPlatform && <PlatformBadge kind="duo" />}
                        </div>
                    </div>
                </div>

                {/* stats:追隨數 · 地區 */}
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    {followerCount != null && (
                        <span className="inline-flex items-center gap-1" title={`${followerLabel} ${followerCount.toLocaleString()}`}>
                            <Users className="w-[11px] h-[11px]" /> {formatNumber(followerCount)}
                            {primaryDelta != null && primaryDelta !== 0 && (
                                <span className={primaryDelta > 0 ? 'text-emerald-400' : 'text-red-400'}>
                                    {primaryDelta > 0 ? '↑' : '↓'}{formatNumber(Math.abs(primaryDelta))}
                                </span>
                            )}
                        </span>
                    )}
                    {v?.nationality && v.nationality !== 'OTHER' && (
                        <>
                            <span>·</span>
                            <span>{v.nationality}</span>
                        </>
                    )}
                </div>

                {/* 語言 chips */}
                {v?.languages && v.languages.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                        {v.languages.slice(0, prominent ? 3 : 2).map(code => (
                            <span
                                key={code}
                                className="text-[10px] px-[7px] py-px rounded border bg-[rgba(96,165,250,0.12)] text-[#93c5fd] border-[rgba(96,165,250,0.25)]"
                            >
                                {LANG_LABEL[code]}
                            </span>
                        ))}
                    </div>
                )}

                {/* #34 活躍資訊 */}
                {(v?.last_live_at || item.latest_at) && (
                    <div className="flex items-center gap-2.5 flex-wrap text-[10px] text-muted-foreground">
                        {v?.last_live_at && (
                            <span className="inline-flex items-center gap-0.5" title="上次偵測到直播的時間">
                                <Radio className="w-2.5 h-2.5 text-red-400/70" />
                                {formatRelativeTime(v.last_live_at)}直播
                            </span>
                        )}
                        {item.latest_at && (
                            <span className="inline-flex items-center gap-0.5" title="最近一次被推薦的時間">
                                <Clock className="w-2.5 h-2.5" />
                                {formatRelativeTime(item.latest_at)}推薦
                            </span>
                        )}
                    </div>
                )}

                {/* 動作鈕（收藏 + 推薦，等分卡片寬度） */}
                <div className="flex items-center gap-1 mt-auto pt-1 [&_button]:flex-1 [&_button]:ml-0 [&_button]:justify-center">
                    {favButton}
                    {recommendButton}
                </div>
            </article>
        );
    }

    // ════════════════════════════════════════════════════════════════
    //  CARD 版型(rank 4+ / 一般推薦)
    // ════════════════════════════════════════════════════════════════
    return (
        <article className="group/card relative flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-3.5 transition-all duration-200 hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-10px_rgba(168,85,247,0.2)]">
            {/* Top row:頭像 + 名稱 + platform + 推薦數(可點進詳情)*/}
            <div
                role="button"
                tabIndex={0}
                onClick={handleCardClick}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(); } }}
                className="flex items-center gap-2.5 cursor-pointer group"
                title={v ? `查看「${v.name}」詳情` : undefined}
            >
                {rank && <RankBadge rank={rank} size={24} />}
                {avatar}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-bold truncate group-hover:text-primary transition-colors">
                            {v?.name ?? '未知 VTuber'}
                        </span>
                        {platform && <PlatformBadge kind={platform} />}
                        {isDualPlatform && <PlatformBadge kind="duo" />}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                        {followerCount != null && (
                            <span className="inline-flex items-center gap-1" title={`${followerLabel} ${followerCount.toLocaleString()}`}>
                                {followerLabel} {formatNumber(followerCount)}
                                {primaryDelta != null && primaryDelta !== 0 && (
                                    <span className={primaryDelta > 0 ? 'text-emerald-400' : 'text-red-400'}>
                                        {primaryDelta > 0 ? '↑' : '↓'}{formatNumber(Math.abs(primaryDelta))}
                                    </span>
                                )}
                            </span>
                        )}
                        {v?.nationality && v.nationality !== 'OTHER' && (
                            <>
                                <span>·</span>
                                <span>{v.nationality}</span>
                            </>
                        )}
                    </div>
                </div>
                <span className="self-start">{heartPill}</span>
            </div>

            {/* 語言 chips */}
            {v?.languages && v.languages.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                    {v.languages.map(code => (
                        <span
                            key={code}
                            className="text-[10px] px-[7px] py-px rounded border bg-[rgba(96,165,250,0.12)] text-[#93c5fd] border-[rgba(96,165,250,0.25)]"
                        >
                            {LANG_LABEL[code]}
                        </span>
                    ))}
                </div>
            )}

            {/* #34 活躍資訊 */}
            {(v?.last_live_at || item.latest_at) && (
                <div className="flex items-center gap-2.5 flex-wrap text-[10px] text-muted-foreground">
                    {v?.last_live_at && (
                        <span className="inline-flex items-center gap-0.5" title="上次偵測到直播的時間">
                            <Radio className="w-2.5 h-2.5 text-red-400/70" />
                            {formatRelativeTime(v.last_live_at)}直播
                        </span>
                    )}
                    {item.latest_at && (
                        <span className="inline-flex items-center gap-0.5" title="最近一次被推薦的時間">
                            <Clock className="w-2.5 h-2.5" />
                            {formatRelativeTime(item.latest_at)}推薦
                        </span>
                    )}
                </div>
            )}

            {/* 動作鈕 */}
            <div className="flex items-center gap-1.5 mt-auto pt-0.5">
                {favButton}
                {recommendButton}
            </div>
        </article>
    );
}

// ════════════════════════════════════════════════════════════════════════════
//  RANKING ROW 版型（今日推薦榜列表 rows，照設計稿 RankingList / _ref1 左欄）
//  每列：rank 徽章 + 頭像 + 名稱 + LIVE + 平台 badge + 追隨/地區 + 語言 chip
//        + heart 推薦數 + bookmark。共用 RecommendationCard 的資料映射/收藏流程。
// ════════════════════════════════════════════════════════════════════════════

interface RankingRowProps {
    item: RecommendationAggregate;
    rank: number;
    /** 偵測到正在直播的 vtuber id 集合，用來標 LIVE 徽章 */
    liveVtuberIds?: Set<string>;
    /** 點 Heart 觸發推薦 dialog */
    onRecommendClick?: (target: RecommendTarget) => void;
    /** 是否為列表最後一列（控制底線）*/
    last?: boolean;
}

export function RankingRow({ item, rank, liveVtuberIds, onRecommendClick, last }: RankingRowProps) {
    const setSelectedVtuberId = useUIStore(s => s.setSelectedVtuberId);
    const [favPending, setFavPending] = useState(false);
    const [favAdded, setFavAdded] = useState(false);

    const v = item.vtuber;
    const platform = useMemo(() => resolvePlatform(v), [v]);
    const hasTwitch = !!v?.twitch_channel_id;
    const hasYoutube = !!v?.youtube_channel_id;
    const isDualPlatform = hasTwitch && hasYoutube;
    const isLive = !!(v && liveVtuberIds?.has(v.id));

    const followerCount = platform === 'twitch' ? v?.twitch_follower_count : v?.youtube_subscriber_count;

    const handleAdd = async (mode: 'twitch' | 'youtube' | 'both') => {
        if (!v || favPending || favAdded) return;
        setFavPending(true);
        try {
            if (mode === 'both') {
                const okT = await addFavoriteAndToast(v, 'twitch');
                const okY = await addFavoriteAndToast(v, 'youtube');
                if (okT && okY) setFavAdded(true);
            } else {
                const ok = await addFavoriteAndToast(v, mode);
                if (ok) setFavAdded(true);
            }
        } finally {
            setFavPending(false);
        }
    };

    const handleRecommendClick = () => {
        if (!v || !platform || !onRecommendClick) return;
        onRecommendClick(recommendTargetOf(v, platform));
    };

    const handleRowClick = () => {
        if (v?.id) setSelectedVtuberId(v.id);
    };

    const avatarSize = 44;
    const bookmarkBtnClass = favAdded
        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 cursor-default'
        : 'bg-foreground/4 text-muted-foreground border-foreground/8 hover:bg-foreground/8 hover:text-foreground disabled:opacity-50';

    const bookmarkBtn = isDualPlatform ? (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    disabled={favPending || favAdded || !v}
                    title="加入收藏"
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-md border transition-colors ${bookmarkBtnClass}`}
                >
                    {favPending ? <Loader2 className="w-3 h-3 animate-spin" />
                        : favAdded ? <Star className="w-3 h-3 fill-emerald-400" />
                        : <Bookmark className="w-3 h-3" />}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[140px]">
                <DropdownMenuItem onSelect={() => handleAdd('twitch')}>
                    <span className="text-[#c084fc]">加入 Twitch</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleAdd('youtube')}>
                    <span className="text-[#f87171]">加入 YouTube</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleAdd('both')}>
                    <span>兩個都加</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    ) : (
        <button
            onClick={() => handleAdd(hasTwitch ? 'twitch' : 'youtube')}
            disabled={favPending || favAdded || !v || (!hasTwitch && !hasYoutube)}
            title="加入收藏"
            className={`inline-flex items-center justify-center w-7 h-7 rounded-md border transition-colors ${bookmarkBtnClass}`}
        >
            {favPending ? <Loader2 className="w-3 h-3 animate-spin" />
                : favAdded ? <Star className="w-3 h-3 fill-emerald-400" />
                : <Bookmark className="w-3 h-3" />}
        </button>
    );

    return (
        <div
            className={`flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-foreground/[0.025] ${
                last ? '' : 'border-b border-foreground/[0.04]'
            }`}
        >
            <RankBadge rank={rank} size={28} />

            {/* 頭像（點進詳情）*/}
            <button
                type="button"
                onClick={handleRowClick}
                title={v ? `查看「${v.name}」詳情` : undefined}
                className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                {v?.img_url ? (
                    <img
                        src={v.img_url}
                        alt={v.name}
                        width={avatarSize}
                        height={avatarSize}
                        className="rounded-full object-cover"
                        style={{
                            width: avatarSize, height: avatarSize,
                            boxShadow: isLive ? '0 0 0 2px rgba(239,68,68,0.45)' : '0 0 0 2px rgba(255,255,255,0.08)',
                        }}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                ) : (
                    <div
                        className="rounded-full flex items-center justify-center text-white font-extrabold"
                        style={{
                            width: avatarSize, height: avatarSize, fontSize: 17,
                            background: avatarGradient(v?.name ?? '?'),
                            boxShadow: isLive ? '0 0 0 2px rgba(239,68,68,0.45)' : '0 0 0 2px rgba(255,255,255,0.08)',
                        }}
                    >
                        {v?.name?.[0] ?? '?'}
                    </div>
                )}
            </button>

            {/* 名稱 + LIVE + 平台 + 追隨/地區 + 語言 */}
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <button
                        type="button"
                        onClick={handleRowClick}
                        className="text-sm font-bold truncate hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                        title={v ? `查看「${v.name}」詳情` : undefined}
                    >
                        {v?.name ?? '未知 VTuber'}
                    </button>
                    {isLive && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-[3px] bg-red-500 text-white text-[9px] font-bold tracking-[0.04em]">
                            <span className="w-1 h-1 rounded-full bg-white live-pulse" />
                            LIVE
                        </span>
                    )}
                    {platform && <PlatformBadge kind={platform} />}
                    {isDualPlatform && <PlatformBadge kind="duo" />}
                </div>
                <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                    {followerCount != null && (
                        <span className="inline-flex items-center gap-1 tabular-nums">
                            <Users className="w-[11px] h-[11px]" /> {formatNumber(followerCount)}
                        </span>
                    )}
                    {v?.nationality && v.nationality !== 'OTHER' && (
                        <>
                            <span>·</span>
                            <span>{v.nationality}</span>
                        </>
                    )}
                    {v?.languages && v.languages.length > 0 && (
                        <span className="hidden sm:inline-flex gap-1">
                            {v.languages.slice(0, 2).map(code => (
                                <span
                                    key={code}
                                    className="text-[10px] px-[7px] py-px rounded border bg-[rgba(96,165,250,0.12)] text-[#93c5fd] border-[rgba(96,165,250,0.25)]"
                                >
                                    {LANG_LABEL[code]}
                                </span>
                            ))}
                        </span>
                    )}
                </div>
            </div>

            {/* heart 推薦數 + 推薦鈕 + bookmark */}
            <div className="flex items-center gap-2 shrink-0">
                {onRecommendClick && (
                    <button
                        onClick={handleRecommendClick}
                        disabled={!v || !platform}
                        title="推薦這位 VTuber"
                        className="hidden sm:inline-flex items-center gap-1 px-2.5 py-[5px] rounded-full text-[12px] font-bold tabular-nums border bg-[rgba(236,72,153,0.12)] text-[#f472b6] border-[rgba(236,72,153,0.3)] hover:bg-[rgba(236,72,153,0.22)] transition-colors disabled:opacity-50"
                    >
                        <Heart className="w-2.5 h-2.5 fill-current" /> {item.count}
                    </button>
                )}
                <span className="sm:hidden inline-flex items-center gap-1 px-2.5 py-[3px] rounded-full text-[12px] font-bold tabular-nums border bg-[rgba(236,72,153,0.12)] text-[#f472b6] border-[rgba(236,72,153,0.3)]">
                    <Heart className="w-2.5 h-2.5 fill-current" /> {item.count}
                </span>
                {bookmarkBtn}
            </div>
        </div>
    );
}
