// 推薦卡片:VTuber 資訊 + 推薦數 + 留言摺疊 + 加收藏按鈕
//
// 用法:在 RecommendationsPage grid 內 render 每個 aggregate

import { useState, useMemo } from 'react';
import { Heart, MessageSquare, Star, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { CommentList } from './CommentList';
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

function formatNumber(n: number | null | undefined): string {
    if (n == null) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
}

export function RecommendationCard({ item, rank, onRecommendClick }: Props) {
    const setSelectedVtuberId = useUIStore(s => s.setSelectedVtuberId);
    const [expanded, setExpanded] = useState(false);
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

    return (
        <article className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden hover:border-zinc-700 transition-colors">
            {/* Header(clickable → 進詳情頁)*/}
            <div
                role="button"
                tabIndex={0}
                onClick={handleCardClick}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(); } }}
                className="p-3 flex items-start gap-3 cursor-pointer hover:bg-zinc-900/40 transition-colors"
                title={v ? `查看「${v.name}」詳情` : undefined}
            >
                {/* Avatar */}
                <div className="relative shrink-0">
                    {v?.img_url ? (
                        <img
                            src={v.img_url}
                            alt={v.name}
                            width="56"
                            height="56"
                            className="w-14 h-14 rounded-full object-cover border border-zinc-800"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                    ) : (
                        <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500 text-xl">
                            {v?.name?.[0] ?? '?'}
                        </div>
                    )}
                    {/* Rank badge for top 3 */}
                    {rank && rank <= 3 && (
                        <div
                            className={`absolute -top-1 -left-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                rank === 1 ? 'bg-yellow-400 text-zinc-950' :
                                rank === 2 ? 'bg-zinc-300 text-zinc-950' :
                                'bg-amber-700 text-zinc-100'
                            }`}
                        >
                            {rank}
                        </div>
                    )}
                </div>

                {/* Main info */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-zinc-100 truncate">
                            {v?.name ?? '未知 VTuber'}
                        </h3>
                        {platform && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                platform === 'twitch'
                                    ? 'bg-violet-500/15 text-violet-300'
                                    : 'bg-red-500/15 text-red-300'
                            }`}>
                                {platform === 'twitch' ? 'Twitch' : 'YouTube'}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-zinc-500 mt-1 flex-wrap">
                        {followerCount != null && (
                            <span title={`${followerLabel} ${followerCount.toLocaleString()}`}>
                                {followerLabel} {formatNumber(followerCount)}
                            </span>
                        )}
                        {v?.nationality && v.nationality !== 'OTHER' && (
                            <span>{v.nationality}</span>
                        )}
                        {/* 跨平台徽章:同 VTuber 兩個平台都有就顯示兩個 */}
                        {v?.twitch_channel_id && v?.youtube_channel_id && (
                            <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-300">雙平台</span>
                        )}
                    </div>
                    {/* 語言 chips */}
                    {v?.languages && v.languages.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap mt-1.5">
                            {v.languages.map(code => (
                                <span
                                    key={code}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/12 text-indigo-300 border border-indigo-500/25"
                                >
                                    {LANG_LABEL[code]}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Recommend count */}
                <div
                    className="flex flex-col items-center justify-center px-2.5 py-1 rounded-md bg-pink-500/10 border border-pink-500/30 shrink-0"
                    title={`${item.count} 人推薦`}
                >
                    <Heart className="w-3.5 h-3.5 text-pink-400 fill-pink-400" />
                    <span className="text-xs font-bold text-pink-300 tabular-nums mt-0.5">{item.count}</span>
                </div>
            </div>

            {/* Comment preview(摺疊狀態顯示前 1 條,展開顯示全部) */}
            {item.comments_preview.length > 0 && !expanded && (
                <div className="px-3 pb-2">
                    <p className="text-[12px] text-zinc-400 italic line-clamp-2">
                        「{item.comments_preview[0].comment}」
                    </p>
                </div>
            )}

            {/* Actions */}
            <div className="px-3 pb-3 flex items-center gap-2">
                {isDualPlatform ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                disabled={favPending || favAdded || !v}
                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                                    favAdded
                                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 cursor-default'
                                        : 'bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700 disabled:opacity-50'
                                }`}
                            >
                                {favPending ? (
                                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 加入中</>
                                ) : favAdded ? (
                                    <><Star className="w-3.5 h-3.5 fill-emerald-400" /> 已收藏</>
                                ) : (
                                    <><Star className="w-3.5 h-3.5" /> 加入收藏 <ChevronDown className="w-3 h-3" /></>
                                )}
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="min-w-[140px]">
                            <DropdownMenuItem onSelect={() => handleAdd('twitch')}>
                                <span className="text-violet-300">加入 Twitch</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => handleAdd('youtube')}>
                                <span className="text-red-300">加入 YouTube</span>
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
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                            favAdded
                                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 cursor-default'
                                : 'bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700 disabled:opacity-50'
                        }`}
                    >
                        {favPending ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 加入中</>
                        ) : favAdded ? (
                            <><Star className="w-3.5 h-3.5 fill-emerald-400" /> 已收藏</>
                        ) : (
                            <><Star className="w-3.5 h-3.5" /> 加入收藏</>
                        )}
                    </button>
                )}

                {onRecommendClick && (
                    <button
                        onClick={handleRecommendClick}
                        disabled={!v || !platform}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs bg-pink-500/10 text-pink-300 border border-pink-500/30 hover:bg-pink-500/20 transition-colors disabled:opacity-50"
                        title="推薦這位 VTuber"
                    >
                        <Heart className="w-3.5 h-3.5 fill-pink-400" />
                        推薦
                    </button>
                )}

                <button
                    onClick={() => setExpanded(v => !v)}
                    className="flex items-center gap-1 ml-auto px-2.5 py-1.5 rounded-md text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
                >
                    <MessageSquare className="w-3.5 h-3.5" />
                    {expanded ? '收起' : `留言`}
                    {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
            </div>

            {/* Comment list(展開時 fetch) */}
            {expanded && v && (
                <div className="px-3 pb-3 border-t border-zinc-800/60 pt-3">
                    <CommentList vtuberId={v.id} enabled={expanded} />
                </div>
            )}
        </article>
    );
}
