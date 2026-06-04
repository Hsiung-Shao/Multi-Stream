// 推薦內容 Panel（從 RecommendationsPage 的 <main> 抽出，可複用於探索 hub）
//
// 結構（與原 RecommendationsPage 一致，外觀/className 未改）:
//   - 現正直播 Hero(LiveNowCarousel)
//   - sort tabs(今日熱門 / 全時段 / 最新留言 / 為你推薦)
//   - category filter bar(僅 aggregate 模式)
//   - Top 3 podium + 其餘 grid
//   - 為你推薦分頁(ForYouSection)
//   - loading / error / empty state
//   - RecommendDialog + LoginDialog
//
// 自帶所有 state/hooks，不需 props。

import { useState } from 'react';
import { useAuthContext } from '../../contexts/AuthContext';
import { useRecommendations } from './hooks';
import { RecommendationCard } from './components/RecommendationCard';
import { RecommendDialog } from './components/RecommendDialog';
import { CategoryFilterBar } from './components/CategoryFilterBar';
import { LiveNowCarousel } from './components/LiveNowCarousel';
import { useForYou } from './useForYou';
import { formatRecommendError } from './apiClient';
import { Skeleton } from '../../components/ui/skeleton';
import { LoginDialog } from '../../components/Dialogs/LoginDialog';
import { Trophy, AlertTriangle, Inbox, Flame, Clock, Sparkles, Users } from 'lucide-react';
import type { RecommendSort, RecommendationAggregate, RecommendTarget } from './types';

const TOP_RANKING_COUNT = 3;

export function RecommendationsPanel() {
    const { isLoggedIn } = useAuthContext();

    const [sort, setSort] = useState<RecommendSort | 'for-you'>('all-time');
    const [categorySlug, setCategorySlug] = useState<string | null>(null);
    const [loginOpen, setLoginOpen] = useState(false);
    const [recommendTarget, setRecommendTarget] = useState<RecommendTarget | null>(null);

    const handleRecommendClick = (target: RecommendTarget) => {
        setRecommendTarget(target);
    };

    const isForYou = sort === 'for-you';
    const { data, isLoading, isError, error, refetch } = useRecommendations({
        sort: isForYou ? 'all-time' : sort,
        category: categorySlug,
        limit: 60,
        enabled: !isForYou,
    });
    const forYou = useForYou(isForYou);

    // 只 aggregate 模式有 podium;latest 模式不顯示 podium
    const isAggregate = sort === 'daily' || sort === 'all-time';
    const aggregateItems = isAggregate
        ? ((data?.items as RecommendationAggregate[]) || [])
        : [];

    const topItems = aggregateItems.slice(0, TOP_RANKING_COUNT);
    const restItems = aggregateItems.slice(TOP_RANKING_COUNT);

    return (
        <>
            {/* 背景 blur orb（固定、不擋互動、隨主題用 primary）*/}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div
                    className="absolute left-1/2 -translate-x-1/2 rounded-full bg-primary opacity-[0.12]"
                    style={{ top: -200, width: 900, height: 500, filter: 'blur(140px)' }}
                />
            </div>

            <main className="relative z-[1] max-w-6xl mx-auto px-4 py-6 space-y-6">
                {/* 現正直播 Hero（無直播時自動隱藏，不佔版面） */}
                <LiveNowCarousel />

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
                    <SortTab
                        active={sort === 'for-you'}
                        onClick={() => setSort('for-you')}
                        icon={<Sparkles className="w-3.5 h-3.5" />}
                        label="為你推薦"
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

                {/* Top 3 podium（1.4fr / 1fr / 1fr 不等寬獎台；手機收成 1 欄）*/}
                {isAggregate && !isLoading && topItems.length > 0 && (
                    <section>
                        <SectionHeader
                            icon={<Trophy className="w-[18px] h-[18px] text-[#fbbf24]" />}
                            title={sort === 'daily' ? '今日推薦榜' : '全時段推薦榜'}
                            subtitle="社群推薦次數排行"
                        />
                        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3">
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
                        <SectionHeader
                            icon={<Users className="w-[18px] h-[18px] text-primary" />}
                            title="所有被推薦的 VTuber"
                            subtitle={`共 ${aggregateItems.length} 位 · 排序：推薦次數`}
                        />
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

                {/* 為你推薦分頁 */}
                {isForYou && <ForYouSection forYou={forYou} onRecommendClick={handleRecommendClick} />}

                {/* Latest mode placeholder(V1 簡化:留言流目前只當 admin debug 用) */}
                {sort === 'latest' && (
                    <div className="py-12 text-center text-muted-foreground text-sm">
                        最新留言模式建置中,先看「全時段」吧
                    </div>
                )}

                {/* Loading skeleton */}
                {isLoading && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <Skeleton key={i} className="h-40 rounded-2xl" />
                        ))}
                    </div>
                )}

                {/* Error */}
                {isError && (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/25">
                        <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                        <p className="text-[13px] text-destructive">
                            載入失敗:{formatRecommendError(error)}
                        </p>
                        <button
                            onClick={() => refetch()}
                            className="ml-auto text-destructive hover:opacity-80 transition-opacity text-[12px] underline"
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
        </>
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
            className={`inline-flex items-center gap-1.5 h-[34px] px-3.5 rounded-full text-[13px] font-semibold border transition-colors ${
                active
                    ? 'bg-[rgba(59,130,246,0.18)] text-[#93c5fd] border-[rgba(96,165,250,0.45)]'
                    : 'bg-foreground/4 text-muted-foreground border-foreground/8 hover:bg-foreground/8 hover:text-foreground'
            }`}
        >
            {icon}
            {label}
        </button>
    );
}

// section 標題:icon + 標題 + subtitle（照設計稿 SectionHeader）
function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
    return (
        <div className="flex items-center gap-2.5 mb-3.5">
            {icon}
            <h2 className="text-[17px] font-bold tracking-tight text-foreground">{title}</h2>
            {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        </div>
    );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Inbox className="w-10 h-10 text-muted-foreground/50" />
            <p className="text-sm text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground max-w-sm">{hint}</p>
        </div>
    );
}

// 為你推薦分頁：依本地收藏推薦相似 vtuber（複用 RecommendationCard）
function ForYouSection({
    forYou,
    onRecommendClick,
}: {
    forYou: ReturnType<typeof useForYou>;
    onRecommendClick: (target: RecommendTarget) => void;
}) {
    if (!forYou.hasFavorites) {
        return (
            <EmptyState
                title="先收藏幾位 VTuber 吧"
                hint="把你喜歡的 VTuber 加入收藏,這裡就會推薦風格相似的其他實況主!"
            />
        );
    }
    if (forYou.isLoading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6].map(i => (
                    <Skeleton key={i} className="h-40 rounded-2xl" />
                ))}
            </div>
        );
    }
    if (forYou.isError) {
        return (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/25">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                <p className="text-[13px] text-destructive">載入失敗:{formatRecommendError(forYou.error)}</p>
            </div>
        );
    }
    const items = forYou.data?.items ?? [];
    if (items.length === 0) {
        return (
            <EmptyState
                title="暫時沒有相似推薦"
                hint="你收藏的 VTuber 還沒有足夠的同類資料,多收藏幾位或晚點再來看看!"
            />
        );
    }
    return (
        <section>
            <SectionHeader
                icon={<Sparkles className="w-[18px] h-[18px] text-primary" />}
                title="根據你的收藏推薦"
                subtitle="風格相似的其他實況主"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map(it => (
                    <RecommendationCard key={it.vtuber_id} item={it} onRecommendClick={onRecommendClick} />
                ))}
            </div>
        </section>
    );
}
