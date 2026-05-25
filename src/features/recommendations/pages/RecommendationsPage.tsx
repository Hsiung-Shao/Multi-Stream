// /recommendations 主頁
//
// 結構:
//   - 上方:單日 Top 排行(前 3 podium + 其餘)
//   - 中間:filter bar(category) + sort 切換
//   - 下方:推薦清單 grid
//
// 用 useRecommendations 抓資料(預設 daily)。

import { useState } from 'react';
import { useUIStore } from '../../../store/useUIStore';
import { useAuthContext } from '../../../contexts/AuthContext';
import { useRecommendations } from '../hooks';
import { RecommendationCard } from '../components/RecommendationCard';
import { RecommendDialog } from '../components/RecommendDialog';
import { CategoryFilterBar } from '../components/CategoryFilterBar';
import { formatRecommendError } from '../apiClient';
import { Button } from '../../../components/ui/button';
import { Skeleton } from '../../../components/ui/skeleton';
import { LoginDialog } from '../../../components/Dialogs/LoginDialog';
import { SEO } from '../../../components/SEO';
import { ArrowLeft, Heart, Trophy, AlertTriangle, Inbox, Flame, Clock, Star } from 'lucide-react';
import type { RecommendSort, RecommendationAggregate, RecommendTarget } from '../types';

const TOP_RANKING_COUNT = 3;

export function RecommendationsPage() {
    const setPage = useUIStore(s => s.setPage);
    const openModal = useUIStore(s => s.openModal);
    const { isLoggedIn } = useAuthContext();

    const [sort, setSort] = useState<RecommendSort>('daily');
    const [categorySlug, setCategorySlug] = useState<string | null>(null);
    const [loginOpen, setLoginOpen] = useState(false);
    const [recommendTarget, setRecommendTarget] = useState<RecommendTarget | null>(null);

    const handleRecommendClick = (target: RecommendTarget) => {
        setRecommendTarget(target);
    };

    const { data, isLoading, isError, error, refetch } = useRecommendations({
        sort,
        category: categorySlug,
        limit: 60,
    });

    // 只 aggregate 模式有 podium;latest 模式不顯示 podium
    const isAggregate = sort === 'daily' || sort === 'all-time';
    const aggregateItems = isAggregate
        ? ((data?.items as RecommendationAggregate[]) || [])
        : [];

    const topItems = aggregateItems.slice(0, TOP_RANKING_COUNT);
    const restItems = aggregateItems.slice(TOP_RANKING_COUNT);

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-200">
            <SEO
                title="VTuber 推薦 - MultiStream Hub"
                description="社群推薦的 VTuber / 實況主排行榜。從你的收藏一鍵推薦,留言交流。"
                keywords="VTuber 推薦, 實況主推薦, 直播主排行, MultiStream"
                pathWithoutLang="/recommendations"
            />

            {/* Header */}
            <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/85 backdrop-blur-md">
                <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPage('home')}
                        className="text-zinc-400 hover:text-zinc-200 -ml-2"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <div className="flex items-center gap-2">
                        <Heart className="w-5 h-5 text-pink-400 fill-pink-400/30" />
                        <h1 className="text-base font-semibold text-zinc-100">VTuber 推薦</h1>
                    </div>
                    {/* #5 快捷鈕:打開我的收藏(FavoritesManagerMain Dialog) */}
                    <button
                        onClick={() => openModal('favorites')}
                        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-zinc-300 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
                        title="打開我的收藏"
                    >
                        <Star className="w-3.5 h-3.5" />
                        我的收藏
                    </button>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
                {/* Sort tabs */}
                <div className="flex items-center gap-2 flex-wrap">
                    <SortTab
                        active={sort === 'daily'}
                        onClick={() => setSort('daily')}
                        icon={<Flame className="w-3.5 h-3.5" />}
                        label="今日熱門"
                    />
                    <SortTab
                        active={sort === 'all-time'}
                        onClick={() => setSort('all-time')}
                        icon={<Trophy className="w-3.5 h-3.5" />}
                        label="全時段"
                    />
                    <SortTab
                        active={sort === 'latest'}
                        onClick={() => setSort('latest')}
                        icon={<Clock className="w-3.5 h-3.5" />}
                        label="最新留言"
                    />
                </div>

                {/* Category filter(latest 模式不顯示,因為 latest 是 row-level 不是 vtuber-level) */}
                {isAggregate && (
                    <CategoryFilterBar
                        activeSlug={categorySlug}
                        onChange={setCategorySlug}
                        isLoggedIn={isLoggedIn}
                        onRequestLogin={() => setLoginOpen(true)}
                    />
                )}

                {/* Top 3 podium */}
                {isAggregate && !isLoading && topItems.length > 0 && (
                    <section>
                        <div className="flex items-center gap-2 mb-3">
                            <Trophy className="w-4 h-4 text-amber-400" />
                            <h2 className="text-sm font-semibold text-zinc-200">
                                {sort === 'daily' ? '今日推薦榜' : '全時段推薦榜'}
                            </h2>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {topItems.map((it, idx) => (
                                <RecommendationCard
                                    key={it.vtuber_id}
                                    item={it}
                                    rank={idx + 1}
                                    onRecommendClick={handleRecommendClick}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {/* Rest grid */}
                {isAggregate && !isLoading && restItems.length > 0 && (
                    <section>
                        <h2 className="text-sm font-semibold text-zinc-400 mb-3">其他推薦</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {restItems.map(it => (
                                <RecommendationCard
                                    key={it.vtuber_id}
                                    item={it}
                                    onRecommendClick={handleRecommendClick}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {/* Latest mode placeholder(V1 簡化:留言流目前只當 admin debug 用) */}
                {!isAggregate && (
                    <div className="py-12 text-center text-zinc-500 text-sm">
                        最新留言模式建置中,先看「今日熱門」吧
                    </div>
                )}

                {/* Loading skeleton */}
                {isLoading && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <Skeleton key={i} className="h-32 bg-zinc-900" />
                        ))}
                    </div>
                )}

                {/* Error */}
                {isError && (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/25">
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                        <p className="text-[13px] text-red-400">
                            載入失敗:{formatRecommendError(error)}
                        </p>
                        <button
                            onClick={() => refetch()}
                            className="ml-auto text-red-400 hover:text-red-300 transition-colors text-[12px] underline"
                        >
                            重新載入
                        </button>
                    </div>
                )}

                {/* Empty state */}
                {!isLoading && !isError && isAggregate && aggregateItems.length === 0 && (
                    <EmptyState
                        title={categorySlug ? '此分類目前還沒有推薦' : (sort === 'daily' ? '今天還沒有人推薦' : '目前還沒有推薦')}
                        hint="去你的收藏列表按「推薦」按鈕,讓更多人看到你喜歡的 VTuber!"
                    />
                )}
            </main>

            <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} />

            {/* #3 推薦頁本身的 RecommendDialog(從 Card Heart 觸發) */}
            <RecommendDialog
                target={recommendTarget}
                open={!!recommendTarget}
                onOpenChange={(v) => { if (!v) setRecommendTarget(null); }}
                onRequestLogin={() => setLoginOpen(true)}
            />
        </div>
    );
}

interface SortTabProps {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
}

function SortTab({ active, onClick, icon, label }: SortTabProps) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                active
                    ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                    : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
        >
            {icon}
            {label}
        </button>
    );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Inbox className="w-10 h-10 text-zinc-700" />
            <p className="text-sm text-zinc-300">{title}</p>
            <p className="text-xs text-zinc-500 max-w-sm">{hint}</p>
        </div>
    );
}
