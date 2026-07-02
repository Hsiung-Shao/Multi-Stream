/**
 * 總覽儀表板:統計卡片 + 近 30 日回饋趨勢 + 類型/狀態分布。
 * 資料來源:useFeedbackStats(全表統計,前端聚合)。
 */

import { MessageSquare, Inbox, CalendarDays, Star, TrendingUp } from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell,
} from 'recharts';
import { Skeleton } from '../../../components/ui/skeleton';
import { useFeedbackStats } from '../hooks/useFeedbacks';
import { TYPE_CONFIG, STATUS_CONFIG } from './feedbackConfig';

/** recharts 的 SVG fill 支援 CSS 變數,直接吃 index.css 的 --chart-* token */
const CHART_COLORS = [
    'var(--chart-1)',
    'var(--chart-2)',
    'var(--chart-3)',
    'var(--chart-4)',
    'var(--chart-5)',
];

/** Tooltip 用語意 token,跟隨主題 */
const TOOLTIP_STYLE: React.CSSProperties = {
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 12,
    padding: '6px 10px',
};

export function OverviewTab() {
    const { data: stats, isLoading, dataUpdatedAt } = useFeedbackStats();

    const typeChartData = stats
        ? Object.entries(stats.byType).map(([key, value]) => ({
            name: TYPE_CONFIG[key]?.label || key,
            value,
        }))
        : [];

    const statusRows = stats
        ? Object.entries(STATUS_CONFIG)
            .map(([key, conf]) => ({ key, conf, count: stats.byStatus[key] || 0 }))
        : [];

    const lastUpdated = dataUpdatedAt
        ? new Date(dataUpdatedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
        : '';

    return (
        <div className="space-y-5">
            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <StatCard
                    label="總回饋數"
                    value={stats?.total}
                    icon={<MessageSquare className="size-3.5" />}
                    loading={isLoading}
                />
                <StatCard
                    label="未讀"
                    value={stats?.unread}
                    icon={<Inbox className="size-3.5" />}
                    accent={!!stats?.unread}
                    loading={isLoading}
                />
                <StatCard
                    label="近 7 日新增"
                    value={stats?.last7Days}
                    icon={<CalendarDays className="size-3.5" />}
                    loading={isLoading}
                />
                <StatCard
                    label="平均評分"
                    value={stats?.avgRating != null ? `${stats.avgRating}` : '—'}
                    suffix="/5"
                    icon={<Star className="size-3.5" />}
                    loading={isLoading}
                />
                <StatCard
                    label="NPS 分數"
                    value={stats?.npsScore != null ? `${stats.npsScore}` : '—'}
                    suffix="(-100~100)"
                    icon={<TrendingUp className="size-3.5" />}
                    loading={isLoading}
                />
            </div>

            {/* 近 30 日趨勢 */}
            <section className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[13px] font-medium">近 30 日回饋趨勢</h3>
                    {lastUpdated && (
                        <span className="text-[11px] text-muted-foreground">{lastUpdated} 更新</span>
                    )}
                </div>
                {isLoading ? (
                    <Skeleton className="h-[180px] w-full rounded" />
                ) : (
                    <div className="h-[180px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats?.byDay ?? []} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                <XAxis
                                    dataKey="date"
                                    tickFormatter={(d: string) => d.slice(5)}
                                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                                    tickLine={false}
                                    axisLine={{ stroke: 'var(--border)' }}
                                    interval={6}
                                />
                                <YAxis
                                    allowDecimals={false}
                                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip
                                    contentStyle={TOOLTIP_STYLE}
                                    cursor={{ fill: 'var(--accent)', opacity: 0.4 }}
                                    formatter={(value) => [`${value} 筆`, '回饋']}
                                />
                                <Bar dataKey="count" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </section>

            {/* 類型分布 + 狀態分布 */}
            <div className="grid md:grid-cols-2 gap-3">
                <section className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-[13px] font-medium mb-3">類型分布</h3>
                    {isLoading ? (
                        <Skeleton className="h-[140px] w-full rounded" />
                    ) : typeChartData.length > 0 ? (
                        <div className="flex items-center gap-4">
                            <div className="w-[120px] h-[120px] flex-shrink-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={typeChartData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={36}
                                            outerRadius={56}
                                            dataKey="value"
                                            strokeWidth={0}
                                        >
                                            {typeChartData.map((_, i) => (
                                                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="flex-1 min-w-0 space-y-1.5">
                                {typeChartData.map((item, i) => (
                                    <div key={item.name} className="flex items-center gap-2">
                                        <span
                                            className="w-2 h-2 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                                        />
                                        <span className="text-[12px] text-muted-foreground truncate">{item.name}</span>
                                        <span className="text-[12px] tabular-nums ml-auto">{item.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="text-[12px] text-muted-foreground text-center py-10">尚無資料</p>
                    )}
                </section>

                <section className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-[13px] font-medium mb-3">狀態分布</h3>
                    {isLoading ? (
                        <Skeleton className="h-[140px] w-full rounded" />
                    ) : (
                        <div className="space-y-2.5">
                            {statusRows.map(({ key, conf, count }) => {
                                const pct = stats && stats.total > 0
                                    ? Math.round((count / stats.total) * 100)
                                    : 0;
                                return (
                                    <div key={key} className="flex items-center gap-2.5">
                                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium w-[64px] justify-center ${conf.bg} ${conf.text}`}>
                                            <span className={`w-1 h-1 rounded-full ${conf.dot}`} />
                                            {conf.label}
                                        </span>
                                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${conf.dot}`}
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                        <span className="text-[12px] tabular-nums text-muted-foreground w-[72px] text-right">
                                            {count}({pct}%)
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>
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
    accent?: boolean;
    loading: boolean;
}) {
    return (
        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{label}</span>
                <span className={accent ? 'text-orange-400' : 'text-muted-foreground'}>{icon}</span>
            </div>
            {loading ? (
                <Skeleton className="h-7 w-12 rounded" />
            ) : (
                <div className="flex items-baseline gap-1">
                    <span className={`text-xl font-semibold tabular-nums ${accent && value ? 'text-orange-400' : 'text-foreground'}`}>
                        {value ?? 0}
                    </span>
                    {suffix && <span className="text-[10px] text-muted-foreground">{suffix}</span>}
                </div>
            )}
        </div>
    );
}
