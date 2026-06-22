import { useState } from 'react';
import { Skeleton } from '../../../components/ui/skeleton';
import { MessageSquare, Inbox, Star, TrendingUp, BarChart3, LogOut, Bug, Lightbulb, Palette, HelpCircle, RefreshCw, Megaphone } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useFeedbacks, useFeedbackStats } from '../hooks/useFeedbacks';
import { FeedbackTable } from './FeedbackTable';
import { FeedbackDetail } from './FeedbackDetail';
import type { FeedbackRecord, FeedbackFilter } from '../types';
import { useQueryClient } from '@tanstack/react-query';
import { AnnouncementsTab } from './AnnouncementsTab';

const PIE_COLORS = ['#f87171', '#fbbf24', '#a78bfa', '#71717a'];

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Bug; color: string }> = {
    bug: { label: 'Bug', icon: Bug, color: 'text-red-400' },
    feature: { label: '功能建議', icon: Lightbulb, color: 'text-amber-400' },
    ui: { label: 'UI/UX', icon: Palette, color: 'text-violet-400' },
    other: { label: '其他', icon: HelpCircle, color: 'text-zinc-400' },
};

export function AdminDashboard({ onLogout }: { onLogout: () => void }) {
    const [filter, setFilter] = useState<FeedbackFilter>({
        page: 1,
        pageSize: 20,
    });
    const [selectedRecord, setSelectedRecord] = useState<FeedbackRecord | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'feedback' | 'announcements'>('feedback');
    const queryClient = useQueryClient();

    const { data: feedbackData, isLoading: listLoading } = useFeedbacks(filter);
    const { data: stats, isLoading: statsLoading, dataUpdatedAt } = useFeedbackStats();

    const handleFilterChange = (updates: Partial<FeedbackFilter>) => {
        setFilter(prev => ({ ...prev, ...updates }));
    };

    const handleSelect = (record: FeedbackRecord) => {
        setSelectedRecord(record);
        setDetailOpen(true);
    };

    const handleDetailClose = () => {
        setDetailOpen(false);
        setSelectedRecord(null);
    };

    const handleRefresh = () => {
        queryClient.invalidateQueries();
    };

    // Chart data
    const typeChartData = stats
        ? Object.entries(stats.byType).map(([key, value]) => ({
            name: TYPE_CONFIG[key]?.label || key,
            value,
        }))
        : [];

    const lastUpdated = dataUpdatedAt
        ? new Date(dataUpdatedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
        : '';

    return (
        <div className="min-h-screen bg-[#09090b] text-white">
            {/* Header */}
            <header className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#09090b]/80 backdrop-blur-xl">
                <div className="max-w-6xl mx-auto px-5 h-12 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setActiveTab('feedback')}
                            className={`flex items-center gap-1.5 px-2.5 h-8 rounded-md text-[13px] font-medium transition-colors ${activeTab === 'feedback' ? 'text-zinc-100 bg-white/[0.06]' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]'}`}
                        >
                            <BarChart3 className="w-3.5 h-3.5" />
                            Feedback
                        </button>
                        <button
                            onClick={() => setActiveTab('announcements')}
                            className={`flex items-center gap-1.5 px-2.5 h-8 rounded-md text-[13px] font-medium transition-colors ${activeTab === 'announcements' ? 'text-zinc-100 bg-white/[0.06]' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]'}`}
                        >
                            <Megaphone className="w-3.5 h-3.5" />
                            推送公告
                        </button>
                        {activeTab === 'feedback' && lastUpdated && (
                            <span className="text-[11px] text-zinc-600 ml-2">
                                {lastUpdated} 更新
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleRefresh}
                            className="w-8 h-8 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors"
                            title="重新整理"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={onLogout}
                            className="w-8 h-8 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors"
                            title="登出"
                        >
                            <LogOut className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-5 py-5 space-y-5">
                {activeTab === 'announcements' ? (
                    <AnnouncementsTab />
                ) : (
                <>
                {/* Stats row */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    {/* Stat cards */}
                    <StatCard
                        label="總計"
                        value={stats?.total}
                        icon={<MessageSquare className="w-3.5 h-3.5" />}
                        loading={statsLoading}
                    />
                    <StatCard
                        label="未讀"
                        value={stats?.unread}
                        icon={<Inbox className="w-3.5 h-3.5" />}
                        accent={stats?.unread ? 'orange' : undefined}
                        loading={statsLoading}
                    />
                    <StatCard
                        label="平均評分"
                        value={stats?.avgRating != null ? `${stats.avgRating}` : '—'}
                        suffix="/5"
                        icon={<Star className="w-3.5 h-3.5" />}
                        loading={statsLoading}
                    />
                    <StatCard
                        label="平均 NPS"
                        value={stats?.avgNps != null ? `${stats.avgNps}` : '—'}
                        suffix="/10"
                        icon={<TrendingUp className="w-3.5 h-3.5" />}
                        loading={statsLoading}
                    />

                    {/* Mini pie chart card */}
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 flex items-center gap-3">
                        {statsLoading ? (
                            <Skeleton className="w-full h-10 bg-white/[0.04] rounded" />
                        ) : typeChartData.length > 0 ? (
                            <>
                                <div className="w-10 h-10 flex-shrink-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={typeChartData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={12}
                                                outerRadius={20}
                                                dataKey="value"
                                                strokeWidth={0}
                                            >
                                                {typeChartData.map((_, i) => (
                                                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                                ))}
                                            </Pie>
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="flex-1 min-w-0 space-y-0.5">
                                    {typeChartData.map((item, i) => (
                                        <div key={item.name} className="flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                                            <span className="text-[10px] text-zinc-500 truncate">{item.name}</span>
                                            <span className="text-[10px] text-zinc-400 ml-auto tabular-nums">{item.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <span className="text-[11px] text-zinc-600 w-full text-center">尚無資料</span>
                        )}
                    </div>
                </div>

                {/* Feedback list */}
                <FeedbackTable
                    data={feedbackData?.data ?? []}
                    count={feedbackData?.count ?? 0}
                    filter={filter}
                    isLoading={listLoading}
                    onFilterChange={handleFilterChange}
                    onSelect={handleSelect}
                />
                </>
                )}
            </main>

            {/* Detail sheet */}
            <FeedbackDetail
                record={selectedRecord}
                open={detailOpen}
                onClose={handleDetailClose}
            />
        </div>
    );
}

function StatCard({
    label,
    value,
    suffix,
    icon,
    accent,
    loading,
}: {
    label: string;
    value?: string | number | null;
    suffix?: string;
    icon: React.ReactNode;
    accent?: 'orange';
    loading: boolean;
}) {
    const accentColor = accent === 'orange' ? 'text-orange-400' : 'text-zinc-500';

    return (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-[11px] text-zinc-500">{label}</span>
                <span className={accentColor}>{icon}</span>
            </div>
            {loading ? (
                <Skeleton className="h-7 w-12 bg-white/[0.04] rounded" />
            ) : (
                <div className="flex items-baseline gap-0.5">
                    <span className={`text-xl font-semibold tabular-nums ${accent === 'orange' && value ? 'text-orange-400' : 'text-zinc-100'}`}>
                        {value ?? 0}
                    </span>
                    {suffix && <span className="text-[11px] text-zinc-600">{suffix}</span>}
                </div>
            )}
        </div>
    );
}
