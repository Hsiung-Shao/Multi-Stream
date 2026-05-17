import { useState } from 'react';
import { Skeleton } from '../../../components/ui/skeleton';
import { MessageSquare, Inbox, Star, TrendingUp, BarChart3, LogOut, Bug, Lightbulb, Palette, HelpCircle, RefreshCw, Users, CalendarDays, AlertTriangle, Megaphone, Tag } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useFeedbacks, useFeedbackStats } from '../hooks/useFeedbacks';
import { FeedbackTable } from './FeedbackTable';
import { FeedbackDetail } from './FeedbackDetail';
import { VTuberContributionReview } from './VTuberContributionReview';
import { EventReview } from './EventReview';
import { AnnouncementsTab } from './AnnouncementsTab';
import { CategoriesReviewTab } from './CategoriesReviewTab';
import type { FeedbackRecord, FeedbackFilter } from '../types';
import { useQueryClient } from '@tanstack/react-query';

const PIE_COLORS = ['#f87171', '#fbbf24', '#a78bfa', '#71717a'];

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Bug; color: string }> = {
    bug: { label: 'Bug', icon: Bug, color: 'text-red-400' },
    feature: { label: '功能建議', icon: Lightbulb, color: 'text-amber-400' },
    ui: { label: 'UI/UX', icon: Palette, color: 'text-violet-400' },
    other: { label: '其他', icon: HelpCircle, color: 'text-zinc-400' },
};

type AdminTab = 'feedback' | 'vtuber' | 'events' | 'announcements' | 'categories';

export function AdminDashboard({ onLogout }: { onLogout: () => void }) {
    const [activeTab, setActiveTab] = useState<AdminTab>('feedback');
    const [filter, setFilter] = useState<FeedbackFilter>({
        page: 1,
        pageSize: 20,
    });
    const [selectedRecord, setSelectedRecord] = useState<FeedbackRecord | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const queryClient = useQueryClient();

    const { data: feedbackData, isLoading: listLoading, isError: listError } = useFeedbacks(filter);
    const { data: stats, isLoading: statsLoading, isError: statsError, dataUpdatedAt } = useFeedbackStats();

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
        <div className="min-h-screen bg-zinc-950 text-white">
            {/* Header */}
            <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-xl">
                <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        {/* Brand */}
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/20 flex items-center justify-center">
                                <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
                            </div>
                            <span className="text-[14px] font-semibold text-zinc-200 tracking-tight">Admin</span>
                        </div>

                        {/* Tab navigation */}
                        <nav className="flex items-center gap-1 h-14">
                            <button
                                onClick={() => setActiveTab('feedback')}
                                className={`relative flex items-center gap-1.5 px-3 h-full text-[13px] font-medium transition-colors ${
                                    activeTab === 'feedback'
                                        ? 'text-zinc-100'
                                        : 'text-zinc-400 hover:text-zinc-200'
                                }`}
                            >
                                <MessageSquare className="w-3.5 h-3.5" />
                                Feedback
                                {activeTab === 'feedback' && (
                                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-blue-500 rounded-full" />
                                )}
                            </button>
                            <button
                                onClick={() => setActiveTab('vtuber')}
                                className={`relative flex items-center gap-1.5 px-3 h-full text-[13px] font-medium transition-colors ${
                                    activeTab === 'vtuber'
                                        ? 'text-zinc-100'
                                        : 'text-zinc-400 hover:text-zinc-200'
                                }`}
                            >
                                <Users className="w-3.5 h-3.5" />
                                VTuber 審核
                                {activeTab === 'vtuber' && (
                                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-blue-500 rounded-full" />
                                )}
                            </button>
                            <button
                                onClick={() => setActiveTab('events')}
                                className={`relative flex items-center gap-1.5 px-3 h-full text-[13px] font-medium transition-colors ${
                                    activeTab === 'events'
                                        ? 'text-zinc-100'
                                        : 'text-zinc-400 hover:text-zinc-200'
                                }`}
                            >
                                <CalendarDays className="w-3.5 h-3.5" />
                                活動審核
                                {activeTab === 'events' && (
                                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-blue-500 rounded-full" />
                                )}
                            </button>
                            <button
                                onClick={() => setActiveTab('announcements')}
                                className={`relative flex items-center gap-1.5 px-3 h-full text-[13px] font-medium transition-colors ${
                                    activeTab === 'announcements'
                                        ? 'text-zinc-100'
                                        : 'text-zinc-400 hover:text-zinc-200'
                                }`}
                            >
                                <Megaphone className="w-3.5 h-3.5" />
                                推送公告
                                {activeTab === 'announcements' && (
                                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-blue-500 rounded-full" />
                                )}
                            </button>
                            <button
                                onClick={() => setActiveTab('categories')}
                                className={`relative flex items-center gap-1.5 px-3 h-full text-[13px] font-medium transition-colors ${
                                    activeTab === 'categories'
                                        ? 'text-zinc-100'
                                        : 'text-zinc-400 hover:text-zinc-200'
                                }`}
                            >
                                <Tag className="w-3.5 h-3.5" />
                                分類審核
                                {activeTab === 'categories' && (
                                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-blue-500 rounded-full" />
                                )}
                            </button>
                        </nav>

                        {activeTab === 'feedback' && lastUpdated && (
                            <span className="text-[12px] text-zinc-500">
                                {lastUpdated} 更新
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleRefresh}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                            title="重新整理"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={onLogout}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                            title="登出"
                        >
                            <LogOut className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-5 py-6 space-y-6">
                {activeTab === 'feedback' ? (
                    <>
                        {/* Query error banner */}
                        {(statsError || listError) && (
                            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/25">
                                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                                <p className="text-[13px] text-red-400">資料載入失敗，請檢查網路連線或重新整理</p>
                                <button onClick={handleRefresh} className="ml-auto text-red-400 hover:text-red-300 transition-colors">
                                    <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                        {/* Stats row */}
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                            <StatCard
                                label="總計"
                                value={stats?.total}
                                icon={<MessageSquare className="w-4 h-4" />}
                                iconBg="bg-zinc-800 text-zinc-400"
                                loading={statsLoading}
                            />
                            <StatCard
                                label="未讀"
                                value={stats?.unread}
                                icon={<Inbox className="w-4 h-4" />}
                                iconBg="bg-amber-500/10 text-amber-400"
                                accent={!!stats?.unread}
                                loading={statsLoading}
                            />
                            <StatCard
                                label="平均評分"
                                value={stats?.avgRating != null ? `${stats.avgRating}` : '—'}
                                suffix="/5"
                                icon={<Star className="w-4 h-4" />}
                                iconBg="bg-yellow-500/10 text-yellow-400"
                                loading={statsLoading}
                            />
                            <StatCard
                                label="平均 NPS"
                                value={stats?.avgNps != null ? `${stats.avgNps}` : '—'}
                                suffix="/10"
                                icon={<TrendingUp className="w-4 h-4" />}
                                iconBg="bg-emerald-500/10 text-emerald-400"
                                loading={statsLoading}
                            />

                            {/* Mini pie chart card */}
                            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex items-center gap-3">
                                {statsLoading ? (
                                    <Skeleton className="w-full h-10 bg-zinc-800 rounded" />
                                ) : typeChartData.length > 0 ? (
                                    <>
                                        <div className="w-11 h-11 flex-shrink-0">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={typeChartData}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={13}
                                                        outerRadius={22}
                                                        dataKey="value"
                                                        strokeWidth={0}
                                                    >
                                                        {typeChartData.map((_, i) => (
                                                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip
                                                        contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8, fontSize: 12 }}
                                                        itemStyle={{ color: '#d4d4d8' }}
                                                    />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <div className="flex-1 min-w-0 space-y-1">
                                            {typeChartData.map((item, i) => (
                                                <div key={item.name} className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                                                    <span className="text-[12px] text-zinc-400 truncate">{item.name}</span>
                                                    <span className="text-[12px] text-zinc-200 ml-auto tabular-nums font-medium">{item.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <span className="text-[12px] text-zinc-500 w-full text-center">尚無資料</span>
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
                ) : activeTab === 'vtuber' ? (
                    <VTuberContributionReview />
                ) : activeTab === 'events' ? (
                    <EventReview />
                ) : activeTab === 'announcements' ? (
                    <AnnouncementsTab />
                ) : (
                    <CategoriesReviewTab />
                )}
            </main>

            {/* Detail sheet (feedback) */}
            {activeTab === 'feedback' && (
                <FeedbackDetail
                    record={selectedRecord}
                    open={detailOpen}
                    onClose={handleDetailClose}
                />
            )}
        </div>
    );
}

function StatCard({
    label,
    value,
    suffix,
    icon,
    iconBg,
    accent,
    loading,
}: {
    label: string;
    value?: string | number | null;
    suffix?: string;
    icon: React.ReactNode;
    iconBg: string;
    accent?: boolean;
    loading: boolean;
}) {
    return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-[12px] text-zinc-400 font-medium">{label}</span>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg}`}>
                    {icon}
                </div>
            </div>
            {loading ? (
                <Skeleton className="h-8 w-14 bg-zinc-800 rounded" />
            ) : (
                <div className="flex items-baseline gap-0.5">
                    <span className={`text-2xl font-bold tabular-nums ${accent ? 'text-amber-400' : 'text-zinc-50'}`}>
                        {value ?? 0}
                    </span>
                    {suffix && <span className="text-[12px] text-zinc-500 ml-0.5">{suffix}</span>}
                </div>
            )}
        </div>
    );
}
