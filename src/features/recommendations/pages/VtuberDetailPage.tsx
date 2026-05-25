// VTuber 詳情頁
//
// 觸發:RecommendationCard 點卡片 → setSelectedVtuberId(vtuberId) → page 切到此
// 資料:useVtuberById(vtuberId)
// 留言:CommentList(infinite)

import { useState } from 'react';
import { useUIStore } from '../../../store/useUIStore';
import { useVtuberById } from '../useVtuberById';
import { RecommendDialog } from '../components/RecommendDialog';
import { CommentList } from '../components/CommentList';
import { LoginDialog } from '../../../components/Dialogs/LoginDialog';
import { SEO } from '../../../components/SEO';
import { Skeleton } from '../../../components/ui/skeleton';
import { Button } from '../../../components/ui/button';
import { toast } from 'sonner';
import { favoritesService } from '../../favorites/FavoritesService';
import { LANG_LABEL } from '../../../lib/locale';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from '../../../components/ui/dropdown-menu';
import {
    ArrowLeft,
    Heart,
    AlertTriangle,
    Loader2,
    Star,
    ChevronDown,
    Tag,
    MessageSquare,
} from 'lucide-react';
import type { RecommendTarget } from '../types';

function formatNumber(n: number | null | undefined): string {
    if (n == null) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
}

export function VtuberDetailPage() {
    const selectedVtuberId = useUIStore(s => s.selectedVtuberId);
    const setPage = useUIStore(s => s.setPage);
    const setSelectedVtuberId = useUIStore(s => s.setSelectedVtuberId);

    const { data: v, isLoading, isError } = useVtuberById(selectedVtuberId);

    const [loginOpen, setLoginOpen] = useState(false);
    const [recommendTarget, setRecommendTarget] = useState<RecommendTarget | null>(null);
    const [favPending, setFavPending] = useState(false);
    const [favAdded, setFavAdded] = useState(false);

    const goBack = () => {
        setSelectedVtuberId(null);
        setPage('recommendations');
    };

    const hasTwitch = !!v?.twitch_channel_id;
    const hasYoutube = !!v?.youtube_channel_id;
    const isDualPlatform = hasTwitch && hasYoutube;

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

    const handleRecommendClick = () => {
        if (!v) return;
        const primaryPlatform: 'twitch' | 'youtube' = hasTwitch ? 'twitch' : 'youtube';
        const primaryChannelId = primaryPlatform === 'twitch' ? v.twitch_channel_id! : v.youtube_channel_id!;
        const crossChannelId = primaryPlatform === 'twitch'
            ? (v.youtube_channel_id ?? undefined)
            : (v.twitch_channel_id ?? undefined);
        const url = primaryPlatform === 'twitch'
            ? `https://www.twitch.tv/${primaryChannelId}`
            : `https://www.youtube.com/channel/${primaryChannelId}`;
        setRecommendTarget({
            name: v.name,
            platform: primaryPlatform,
            channelId: primaryChannelId,
            url,
            imgUrl: v.img_url ?? undefined,
            crossChannelId,
        });
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-200">
            <SEO
                title={v ? `${v.name} - VTuber 推薦` : 'VTuber 詳情 - MultiStream Hub'}
                description={v
                    ? `${v.name} 的社群推薦頁,累積 ${v.recommend_count} 推,看大家為什麼推薦這位 VTuber/實況主。`
                    : '社群推薦的 VTuber / 實況主詳情'}
                keywords={v ? `${v.name}, VTuber 推薦, 實況主推薦` : 'VTuber 推薦, MultiStream'}
                pathWithoutLang="/recommendations"
                image={v?.img_url ?? undefined}
            />

            {/* Header (sticky) */}
            <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/85 backdrop-blur-md">
                <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={goBack}
                        className="text-zinc-400 hover:text-zinc-200 -ml-2"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <h1 className="text-base font-semibold text-zinc-100 truncate flex-1">
                        {v?.name ?? 'VTuber 詳情'}
                    </h1>
                    {v && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-pink-500/10 border border-pink-500/30">
                            <Heart className="w-3.5 h-3.5 text-pink-400 fill-pink-400" />
                            <span className="text-xs font-bold text-pink-300 tabular-nums">
                                {v.recommend_count}
                            </span>
                        </div>
                    )}
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
                {isLoading && (
                    <div className="space-y-4">
                        <Skeleton className="h-32 bg-zinc-900" />
                        <Skeleton className="h-10 bg-zinc-900 w-1/2" />
                        <Skeleton className="h-24 bg-zinc-900" />
                    </div>
                )}

                {isError && (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/25">
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                        <p className="text-[13px] text-red-400">載入失敗</p>
                    </div>
                )}

                {!isLoading && !isError && !v && (
                    <div className="flex flex-col items-center gap-2 py-16 text-center">
                        <AlertTriangle className="w-8 h-8 text-zinc-700" />
                        <p className="text-sm text-zinc-400">找不到此 VTuber</p>
                        <Button variant="ghost" size="sm" onClick={goBack} className="mt-2">
                            返回推薦列表
                        </Button>
                    </div>
                )}

                {v && (
                    <>
                        {/* Hero:avatar + name + meta */}
                        <section className="flex items-start gap-4 sm:gap-6">
                            <div className="shrink-0">
                                {v.img_url ? (
                                    <img
                                        src={v.img_url}
                                        alt={v.name}
                                        width="96"
                                        height="96"
                                        className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-2 border-zinc-800"
                                        loading="eager"
                                        referrerPolicy="no-referrer"
                                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                    />
                                ) : (
                                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500 text-2xl">
                                        {v.name?.[0] ?? '?'}
                                    </div>
                                )}
                            </div>

                            <div className="min-w-0 flex-1 space-y-2">
                                <div className="flex items-baseline gap-2 flex-wrap">
                                    <h2 className="text-xl sm:text-2xl font-bold text-zinc-100 truncate">
                                        {v.name}
                                    </h2>
                                    {hasTwitch && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300">Twitch</span>
                                    )}
                                    {hasYoutube && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-300">YouTube</span>
                                    )}
                                    {isDualPlatform && (
                                        <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-300">雙平台</span>
                                    )}
                                </div>

                                <div className="flex items-center gap-3 text-xs text-zinc-500 flex-wrap">
                                    {v.twitch_follower_count != null && (
                                        <span title={`追隨者 ${v.twitch_follower_count.toLocaleString()}`}>
                                            Twitch 追隨 {formatNumber(v.twitch_follower_count)}
                                        </span>
                                    )}
                                    {v.youtube_subscriber_count != null && (
                                        <span title={`訂閱者 ${v.youtube_subscriber_count.toLocaleString()}`}>
                                            YouTube 訂閱 {formatNumber(v.youtube_subscriber_count)}
                                        </span>
                                    )}
                                    {v.nationality && v.nationality !== 'OTHER' && (
                                        <span>{v.nationality}</span>
                                    )}
                                    {v.activity !== 'active' && (
                                        <span className="text-zinc-600">{v.activity === 'graduate' ? '已畢業' : '準備中'}</span>
                                    )}
                                </div>

                                {/* 語言 chips */}
                                {v.languages && v.languages.length > 0 && (
                                    <div className="flex items-center gap-1 flex-wrap">
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

                                {/* 分類 tags */}
                                {v.categories.length > 0 && (
                                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                                        <Tag className="w-3 h-3 text-zinc-500" />
                                        {v.categories.map(c => (
                                            <span
                                                key={c.id}
                                                className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/12 text-blue-300 border border-blue-500/25"
                                            >
                                                {c.name}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Actions */}
                        <section className="flex items-center gap-2 flex-wrap">
                            <button
                                onClick={handleRecommendClick}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm bg-pink-500/10 text-pink-300 border border-pink-500/30 hover:bg-pink-500/20 transition-colors"
                            >
                                <Heart className="w-4 h-4 fill-pink-400" />
                                推薦這位 VTuber
                            </button>

                            {isDualPlatform ? (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            disabled={favPending || favAdded}
                                            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm transition-colors ${
                                                favAdded
                                                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 cursor-default'
                                                    : 'bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700 disabled:opacity-50'
                                            }`}
                                        >
                                            {favPending ? (
                                                <><Loader2 className="w-4 h-4 animate-spin" /> 加入中</>
                                            ) : favAdded ? (
                                                <><Star className="w-4 h-4 fill-emerald-400" /> 已收藏</>
                                            ) : (
                                                <><Star className="w-4 h-4" /> 加入收藏 <ChevronDown className="w-3.5 h-3.5" /></>
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
                                    disabled={favPending || favAdded || (!hasTwitch && !hasYoutube)}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm transition-colors ${
                                        favAdded
                                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 cursor-default'
                                            : 'bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700 disabled:opacity-50'
                                    }`}
                                >
                                    {favPending ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> 加入中</>
                                    ) : favAdded ? (
                                        <><Star className="w-4 h-4 fill-emerald-400" /> 已收藏</>
                                    ) : (
                                        <><Star className="w-4 h-4" /> 加入收藏</>
                                    )}
                                </button>
                            )}
                        </section>

                        {/* Comments */}
                        <section>
                            <div className="flex items-center gap-2 mb-3">
                                <MessageSquare className="w-4 h-4 text-zinc-400" />
                                <h3 className="text-sm font-semibold text-zinc-200">推薦留言</h3>
                            </div>
                            <CommentList vtuberId={v.id} enabled={true} />
                        </section>
                    </>
                )}
            </main>

            <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} />

            <RecommendDialog
                target={recommendTarget}
                open={!!recommendTarget}
                onOpenChange={(open) => { if (!open) setRecommendTarget(null); }}
                onRequestLogin={() => setLoginOpen(true)}
            />
        </div>
    );
}
