// 完整推薦排行頁(store-only page)
//
// 觸發:RecommendationsPanel 的「查看完整排行」CTA → openFullRanking(sort) → page 切到此。
// 內容:某排序(今日熱門 / 全時段)下的完整推薦名次(上限 60),以 RankingRow 逐列渲染。
//       支援 daily/all-time 切換與分類篩選;進入時的初始排序取自 store.fullRankingSort。

import { useMemo, useState } from 'react';
import { ArrowLeft, Trophy, Flame, AlertTriangle, Inbox } from 'lucide-react';
import { useUIStore } from '../../../store/useUIStore';
import { useAuthContext } from '../../../contexts/AuthContext';
import { useRecommendations } from '../hooks';
import { RankingRow } from '../components/RecommendationCard';
import { CategoryFilterBar } from '../components/CategoryFilterBar';
import { RecommendDialog } from '../components/RecommendDialog';
import { useVTuberLivestreams } from '../../vtuber/hooks/useVTubers';
import { formatRecommendError } from '../apiClient';
import { Skeleton } from '../../../components/ui/skeleton';
import { LoginDialog } from '../../../components/Dialogs/LoginDialog';
import { Button } from '../../../components/ui/button';
import type { RecommendationAggregate, RecommendTarget } from '../types';

export function RecommendationsRankingPage() {
    const setPage = useUIStore((s) => s.setPage);
    const initialSort = useUIStore((s) => s.fullRankingSort);
    const { isLoggedIn } = useAuthContext();

    const [sort, setSort] = useState<'daily' | 'all-time'>(initialSort);
    const [categorySlug, setCategorySlug] = useState<string | null>(null);
    const [loginOpen, setLoginOpen] = useState(false);
    const [recommendTarget, setRecommendTarget] = useState<RecommendTarget | null>(null);

    const { data, isLoading, isError, error, refetch } = useRecommendations({
        sort,
        category: categorySlug,
        limit: 60,
    });

    // 正在直播的 vtuber id 集合（供列表標 LIVE，消費既有 hook）
    const { data: livestreams = [] } = useVTuberLivestreams();
    const liveVtuberIds = useMemo(
        () => new Set(livestreams.map((ls) => ls.vtuber_id)),
        [livestreams],
    );

    const items = (data?.items as RecommendationAggregate[]) ?? [];

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col">
            {/* Header（精簡：返回 + 標題） */}
            <header className="sticky top-0 w-full z-50 border-b border-white/10 bg-background/80 backdrop-blur-md">
                <div className="max-w-5xl mx-auto px-4 h-[60px] flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setPage('recommendations')}
                        className="hover:bg-primary/10"
                        title="返回探索"
                    >
                        <ArrowLeft className="w-[18px] h-[18px]" />
                    </Button>
                    <div className="flex items-center gap-2 pl-0.5">
                        <Trophy className="w-[18px] h-[18px] text-[#fbbf24]" />
                        <h1 className="text-[17px] font-bold tracking-tight">完整推薦排行</h1>
                    </div>
                </div>
            </header>

            <main className="relative z-[1] w-full max-w-5xl mx-auto px-4 py-6 space-y-5">
                {/* sort tabs */}
                <div className="flex items-center gap-2 flex-wrap">
                    <RankSortTab
                        active={sort === 'daily'}
                        onClick={() => setSort('daily')}
                        icon={<Flame className="w-3.5 h-3.5" />}
                        label="今日熱門"
                    />
                    <RankSortTab
                        active={sort === 'all-time'}
                        onClick={() => setSort('all-time')}
                        icon={<Trophy className="w-3.5 h-3.5" />}
                        label="全時段"
                    />
                </div>

                {/* category filter */}
                <CategoryFilterBar
                    activeSlug={categorySlug}
                    onChange={setCategorySlug}
                    isLoggedIn={isLoggedIn}
                    onRequestLogin={() => setLoginOpen(true)}
                />

                {/* loading */}
                {isLoading && (
                    <div className="space-y-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                            <Skeleton key={i} className="h-[68px] rounded-2xl" />
                        ))}
                    </div>
                )}

                {/* error */}
                {isError && (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/25">
                        <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                        <p className="text-[13px] text-destructive">載入失敗:{formatRecommendError(error)}</p>
                        <button
                            onClick={() => refetch()}
                            className="ml-auto text-destructive hover:opacity-80 transition-opacity text-[12px] underline"
                        >
                            重新載入
                        </button>
                    </div>
                )}

                {/* empty */}
                {!isLoading && !isError && items.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                        <Inbox className="w-10 h-10 text-muted-foreground/50" />
                        <p className="text-sm text-foreground">
                            {categorySlug ? '此分類目前還沒有推薦' : sort === 'daily' ? '今天還沒有人推薦' : '目前還沒有推薦'}
                        </p>
                        <p className="text-xs text-muted-foreground max-w-sm">
                            去你的收藏列表按「推薦」按鈕,讓更多人看到你喜歡的 VTuber!
                        </p>
                    </div>
                )}

                {/* full ranking list */}
                {!isLoading && !isError && items.length > 0 && (
                    <div className="rounded-2xl bg-card border border-foreground/[0.06] overflow-hidden">
                        {items.map((it, idx) => (
                            <RankingRow
                                key={it.vtuber_id}
                                item={it}
                                rank={idx + 1}
                                liveVtuberIds={liveVtuberIds}
                                onRecommendClick={setRecommendTarget}
                                last={idx === items.length - 1}
                            />
                        ))}
                    </div>
                )}
            </main>

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

interface RankSortTabProps {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
}

function RankSortTab({ active, onClick, icon, label }: RankSortTabProps) {
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
