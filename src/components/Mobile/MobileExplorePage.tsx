import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Compass, Trophy, Inbox, AlertTriangle, Plus } from 'lucide-react';
import { useUIStore } from '../../store/useUIStore';
import { useRecommendations } from '../../features/recommendations/hooks';
import { useForYou } from '../../features/recommendations/useForYou';
import { RankingRow } from '../../features/recommendations/components/RecommendationCard';
import { RecommendDialog } from '../../features/recommendations/components/RecommendDialog';
import { LiveNowCarousel } from '../../features/recommendations/components/LiveNowCarousel';
import { LoginDialog } from '../Dialogs/LoginDialog';
import { useVTuberLivestreams } from '../../features/vtuber/hooks/useVTubers';
import { formatRecommendError } from '../../features/recommendations/apiClient';
import { Skeleton } from '../ui/skeleton';
import type { RecommendSort, RecommendationAggregate, RecommendTarget } from '../../features/recommendations/types';

// 手機版「探索」hub：featured 直播（複用 LiveNowCarousel，<lg 已單欄）
//   + 篩選膠囊（今日熱門 / 全時段 / 為你推薦）+ 推薦榜列表（複用 RankingRow）。
// 接真實資料：useRecommendations / useVTuberLivestreams / useForYou / useLivestreams。
// DEV 無資料時 LiveNowCarousel 自帶 mock；推薦榜空則顯示空狀態。
export function MobileExplorePage() {
    const { t } = useTranslation();
    const openModal = useUIStore(s => s.openModal);

    const [sort, setSort] = useState<RecommendSort | 'for-you'>('daily');
    const [loginOpen, setLoginOpen] = useState(false);
    const [recommendTarget, setRecommendTarget] = useState<RecommendTarget | null>(null);

    const isForYou = sort === 'for-you';
    const { data, isLoading, isError, error, refetch } = useRecommendations({
        sort: isForYou ? 'all-time' : sort,
        limit: 30,
        enabled: !isForYou,
    });
    const forYou = useForYou(isForYou);

    // 正在直播的 vtuber id 集合（供推薦榜標 LIVE）
    const { data: livestreams = [] } = useVTuberLivestreams();
    const liveVtuberIds = useMemo(
        () => new Set(livestreams.map((ls) => ls.vtuber_id)),
        [livestreams],
    );

    const aggregateItems = isForYou
        ? (forYou.data?.items ?? [])
        : ((data?.items as RecommendationAggregate[]) || []);
    const rankingItems = aggregateItems.slice(0, 15);

    const filters: { id: RecommendSort | 'for-you'; label: string }[] = [
        { id: 'daily', label: t('mobile.explore.filter_daily', '今日熱門') },
        { id: 'all-time', label: t('mobile.explore.filter_all', '全時段') },
        { id: 'for-you', label: t('mobile.explore.filter_foryou', '為你推薦') },
    ];

    const showLoading = isForYou ? forYou.isLoading : isLoading;
    const showError = isForYou ? forYou.isError : isError;
    const errObj = isForYou ? forYou.error : error;

    return (
        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
            {/* Title row */}
            <div className="flex items-center justify-between mb-3.5">
                <div className="flex items-center gap-2">
                    <Compass className="w-5 h-5 text-[#ec4899]" />
                    <h1 className="text-[22px] font-bold tracking-tight">{t('mobile.explore.title', '探索')}</h1>
                    <span className="px-1.5 py-px text-[9px] font-bold uppercase tracking-wider rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        Beta
                    </span>
                </div>
                <button
                    onClick={() => openModal('favorites')}
                    className="inline-flex items-center gap-1.5 h-[30px] px-3 rounded-full bg-primary text-white text-xs font-semibold active:scale-95 transition-transform"
                >
                    <Plus className="w-3.5 h-3.5" /> {t('mobile.explore.recommend', '推薦')}
                </button>
            </div>

            {/* Featured live（複用桌機 LiveNowCarousel；無直播自動隱藏，DEV 自帶 mock）*/}
            <div className="mb-4">
                <LiveNowCarousel />
            </div>

            {/* Filter pills */}
            <div className="flex gap-1.5 mb-4 overflow-x-auto scrollbar-none pb-0.5">
                {filters.map((ff) => {
                    const on = sort === ff.id;
                    return (
                        <button
                            key={ff.id}
                            onClick={() => setSort(ff.id)}
                            className={`shrink-0 inline-flex items-center h-[30px] px-3 rounded-full text-xs font-semibold border transition-colors ${
                                on
                                    ? 'bg-[rgba(59,130,246,0.18)] text-[#93c5fd] border-[rgba(96,165,250,0.45)]'
                                    : 'bg-white/[0.04] text-muted-foreground border-white/[0.08]'
                            }`}
                        >
                            {ff.label}
                        </button>
                    );
                })}
            </div>

            {/* Ranking header */}
            <div className="flex items-center gap-2 mb-2.5">
                <Trophy className="w-4 h-4 text-[#fbbf24]" />
                <h2 className="text-[15px] font-bold">
                    {isForYou
                        ? t('mobile.explore.foryou_heading', '根據你的收藏推薦')
                        : t('mobile.explore.ranking_heading', '今日推薦榜')}
                </h2>
            </div>

            {/* Loading */}
            {showLoading && (
                <div className="flex flex-col gap-2">
                    {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-[66px] rounded-xl" />)}
                </div>
            )}

            {/* Error */}
            {!showLoading && showError && (
                <div className="flex items-center gap-2 px-3 py-3 rounded-lg bg-destructive/10 border border-destructive/25">
                    <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                    <p className="text-[13px] text-destructive flex-1">
                        {t('mobile.explore.load_failed', '載入失敗')}：{formatRecommendError(errObj)}
                    </p>
                    {!isForYou && (
                        <button onClick={() => refetch()} className="text-destructive underline text-xs">
                            {t('mobile.explore.retry', '重試')}
                        </button>
                    )}
                </div>
            )}

            {/* Ranking list（複用 RankingRow，含 LIVE 標記 / 加收藏 / 推薦 dialog）*/}
            {!showLoading && !showError && rankingItems.length > 0 && (
                <div className="rounded-2xl bg-card border border-white/[0.06] overflow-hidden">
                    {rankingItems.map((it, idx) => (
                        <RankingRow
                            key={it.vtuber_id}
                            item={it}
                            rank={idx + 1}
                            liveVtuberIds={liveVtuberIds}
                            onRecommendClick={setRecommendTarget}
                            last={idx === rankingItems.length - 1}
                        />
                    ))}
                </div>
            )}

            {/* Empty */}
            {!showLoading && !showError && rankingItems.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2.5 py-14 text-center">
                    <Inbox className="w-9 h-9 text-muted-foreground/50" />
                    <p className="text-sm text-foreground">
                        {isForYou && !forYou.hasFavorites
                            ? t('mobile.explore.empty_foryou', '先收藏幾位 VTuber 吧')
                            : t('mobile.explore.empty_title', '目前還沒有推薦')}
                    </p>
                    <p className="text-xs text-muted-foreground max-w-[260px]">
                        {isForYou && !forYou.hasFavorites
                            ? t('mobile.explore.empty_foryou_hint', '把喜歡的 VTuber 加入收藏，這裡就會推薦風格相似的實況主')
                            : t('mobile.explore.empty_hint', '去收藏列表按「推薦」，讓更多人看到你喜歡的 VTuber')}
                    </p>
                </div>
            )}

            <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} />
            <RecommendDialog
                target={recommendTarget}
                open={!!recommendTarget}
                onOpenChange={(v) => { if (!v) setRecommendTarget(null); }}
                onRequestLogin={() => setLoginOpen(true)}
            />
        </div>
    );
}
