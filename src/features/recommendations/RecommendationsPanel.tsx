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

import { useMemo, useState } from 'react';
import { useAuthContext } from '../../contexts/AuthContext';
import { useRecommendations } from './hooks';
import { RecommendationCard, RankingRow } from './components/RecommendationCard';
import { RecommendDialog } from './components/RecommendDialog';
import { CategoryFilterBar } from './components/CategoryFilterBar';
import { LiveNowCarousel } from './components/LiveNowCarousel';
import { EventScheduleView } from '../vtuber/components/EventScheduleView';
import { useVTuberLivestreams } from '../vtuber/hooks/useVTubers';
import { useForYou } from './useForYou';
import { formatRecommendError } from './apiClient';
import { Skeleton } from '../../components/ui/skeleton';
import { LoginDialog } from '../../components/Dialogs/LoginDialog';
import { Trophy, AlertTriangle, Inbox, Flame, Sparkles, Users, ArrowRight } from 'lucide-react';
import { useUIStore } from '../../store/useUIStore';
import type { RecommendSort, RecommendationAggregate, RecommendTarget } from './types';

interface RecommendationsPanelProps {
    /** 側欄行程表空狀態的「建立活動」CTA → 開既有的建立活動流程 */
    onCreateEvent?: () => void;
}

export function RecommendationsPanel({ onCreateEvent }: RecommendationsPanelProps = {}) {
    const { isLoggedIn } = useAuthContext();
    const openFullRanking = useUIStore((s) => s.openFullRanking);

    const [sort, setSort] = useState<RecommendSort | 'for-you'>('all-time');
    const [categorySlug, setCategorySlug] = useState<string | null>(null);
    const [loginOpen, setLoginOpen] = useState(false);
    const [recommendTarget, setRecommendTarget] = useState<RecommendTarget | null>(null);

    const handleRecommendClick = (target: RecommendTarget) => {
        setRecommendTarget(target);
    };

    const isForYou = sort === 'for-you';
    // 只有 aggregate 模式(daily / all-time)需要打推薦列表 API;
    // for-you 走 useForYou,不該空打推薦 API。
    const isAggregate = sort === 'daily' || sort === 'all-time';
    const { data, isLoading, isError, error, refetch } = useRecommendations({
        sort: isAggregate ? sort : 'all-time',
        category: categorySlug,
        limit: 60,
        enabled: isAggregate,
    });
    const forYou = useForYou(isForYou);

    // 正在直播的 vtuber id 集合（供推薦榜列表標 LIVE；消費既有 hook，不改資料抓取）
    const { data: livestreams = [] } = useVTuberLivestreams();
    const liveVtuberIds = useMemo(
        () => new Set(livestreams.map((ls) => ls.vtuber_id)),
        [livestreams],
    );

    // 只 aggregate 模式有排行榜;latest 模式不顯示
    const aggregateItems = isAggregate
        ? ((data?.items as RecommendationAggregate[]) || [])
        : [];

    // 今日推薦榜（podium 版型）:取前 10 名;top-3 上獎台、4-10 排成列。
    // 卡片 grid 另顯示全部被推薦的 VTuber。
    const rankingItems = aggregateItems.slice(0, 10);
    const podiumItems = rankingItems.slice(0, 3);   // top-3 → PodiumCard
    const restRanking = rankingItems.slice(3);      // 4-N → RankingRow

    return (
        <>
            {/* 背景 blur orb（固定、不擋互動、隨主題用 primary）*/}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div
                    className="absolute left-1/2 -translate-x-1/2 rounded-full bg-primary opacity-[0.12]"
                    style={{ top: -200, width: 900, height: 500, filter: 'blur(140px)' }}
                />
            </div>

            <main className="relative z-[1] max-w-7xl mx-auto px-4 py-6 space-y-6">
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

                {/* 兩欄：左 = 推薦榜 + 卡片 grid；右 = 活動行程表側欄（手機收單欄、側欄堆到下方）*/}
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
                    {/* ── 左欄 ── */}
                    <div className="min-w-0 space-y-8">
                        {/* 今日推薦榜（podium 版型）：top-3 獎台 + 4-N 列 */}
                        {isAggregate && !isLoading && rankingItems.length > 0 && (
                            <section>
                                <SectionHeader
                                    icon={<Trophy className="w-[18px] h-[18px] text-[#fbbf24]" />}
                                    title={sort === 'daily' ? '今日推薦榜' : '全時段推薦榜'}
                                    subtitle="社群推薦次數 · 即時更新"
                                    right={
                                        <button
                                            onClick={() => openFullRanking(sort === 'daily' ? 'daily' : 'all-time')}
                                            className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                                        >
                                            查看完整排行 <ArrowRight className="w-[11px] h-[11px]" />
                                        </button>
                                    }
                                />

                                {/* top-3 獎台：#1 prominent（1.4fr），#2/#3 一般（1fr）；手機/平板單欄堆疊 */}
                                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 items-stretch">
                                    {podiumItems.map((it, idx) => (
                                        <RecommendationCard
                                            key={it.vtuber_id}
                                            item={it}
                                            rank={idx + 1}
                                            onRecommendClick={handleRecommendClick}
                                        />
                                    ))}
                                </div>

                                {/* 4-N 列：包在 rounded-2xl border 容器，列間細分隔線 */}
                                {restRanking.length > 0 && (
                                    <div className="mt-3.5 rounded-2xl bg-card border border-foreground/[0.06] overflow-hidden">
                                        {restRanking.map((it, idx) => (
                                            <RankingRow
                                                key={it.vtuber_id}
                                                item={it}
                                                rank={idx + 4}
                                                liveVtuberIds={liveVtuberIds}
                                                onRecommendClick={handleRecommendClick}
                                                last={idx === restRanking.length - 1}
                                            />
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}

                        {/* 所有被推薦的 VTuber（卡片 grid）*/}
                        {isAggregate && !isLoading && aggregateItems.length > 0 && (
                            <section>
                                <SectionHeader
                                    icon={<Users className="w-[18px] h-[18px] text-primary" />}
                                    title="所有被推薦的 VTuber"
                                    subtitle={`共 ${aggregateItems.length} 位 · 排序：推薦次數`}
                                />
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {aggregateItems.map(it => (
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

                        {/* Loading skeleton */}
                        {isLoading && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    </div>

                    {/* ── 右欄：活動行程表側欄（sticky timeline）── */}
                    <EventScheduleView variant="sidebar" onCreateEvent={onCreateEvent} />
                </div>
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

// section 標題:icon + 標題 + subtitle + 右側 slot（照設計稿 SectionHeader）
function SectionHeader({ icon, title, subtitle, right }: { icon: React.ReactNode; title: string; subtitle?: string; right?: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3 mb-3.5">
            <div className="flex items-center gap-2.5 min-w-0">
                {icon}
                <h2 className="text-[17px] font-bold tracking-tight text-foreground whitespace-nowrap">{title}</h2>
                {subtitle && <span className="text-xs text-muted-foreground truncate hidden sm:inline">{subtitle}</span>}
            </div>
            {right}
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
