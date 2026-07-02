/**
 * 評分/NPS 分頁:評分 1-5 與 NPS 0-10 分布直方圖 + 有評分的回饋列表。
 * 列表重用 FeedbackTable(hasScore 鎖定為 true,只顯示有 rating 或 nps_score 的回饋)。
 */

import { useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Skeleton } from '../../../components/ui/skeleton';
import { useFeedbacks, useFeedbackStats } from '../hooks/useFeedbacks';
import { FeedbackTable } from './FeedbackTable';
import { FeedbackDetail } from './FeedbackDetail';
import type { FeedbackRecord, FeedbackFilter } from '../types';
import { TOOLTIP_STYLE, AXIS_TICK } from './chartTheme';

/** NPS 依區段配色:批評者(0-6)紅、中立者(7-8)黃、推薦者(9-10)綠 */
function npsColor(score: number): string {
    if (score <= 6) return 'var(--chart-5)';
    if (score <= 8) return 'var(--chart-4)';
    return 'var(--chart-2)';
}

export function RatingsTab() {
    const [filter, setFilter] = useState<FeedbackFilter>({ page: 1, pageSize: 20, hasScore: true });
    const [selectedRecord, setSelectedRecord] = useState<FeedbackRecord | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);

    const { data, isLoading } = useFeedbacks(filter);
    const { data: stats, isLoading: statsLoading } = useFeedbackStats();

    const ratingData = (stats?.ratingDist ?? []).map((count, i) => ({ label: `${i + 1} 星`, count }));
    const npsData = (stats?.npsDist ?? []).map((count, i) => ({ label: `${i}`, score: i, count }));

    const handleFilterChange = (updates: Partial<FeedbackFilter>) => {
        // hasScore 是本分頁的固定條件,不允許被清除
        setFilter(prev => ({ ...prev, ...updates, hasScore: true }));
    };

    const handleSelect = (record: FeedbackRecord) => {
        setSelectedRecord(record);
        setDetailOpen(true);
    };

    const handleDetailClose = () => {
        setDetailOpen(false);
        setSelectedRecord(null);
    };

    return (
        <div className="space-y-5">
            {/* 分布直方圖 */}
            <div className="grid md:grid-cols-2 gap-3">
                <section className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-[13px] font-medium mb-1">滿意度評分分布</h3>
                    <p className="text-[11px] text-muted-foreground mb-3">
                        平均 {stats?.avgRating != null ? `${stats.avgRating} / 5` : '—'}
                    </p>
                    {statsLoading ? (
                        <Skeleton className="h-[160px] w-full rounded" />
                    ) : (
                        <div className="h-[160px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={ratingData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                    <XAxis
                                        dataKey="label"
                                        tick={AXIS_TICK}
                                        tickLine={false}
                                        axisLine={{ stroke: 'var(--border)' }}
                                    />
                                    <YAxis
                                        allowDecimals={false}
                                        tick={AXIS_TICK}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <Tooltip
                                        contentStyle={TOOLTIP_STYLE}
                                        cursor={{ fill: 'var(--accent)', opacity: 0.4 }}
                                        formatter={(value) => [`${value} 筆`, '回饋']}
                                    />
                                    <Bar dataKey="count" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={40} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </section>

                <section className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-[13px] font-medium mb-1">NPS 分布</h3>
                    <p className="text-[11px] text-muted-foreground mb-3">
                        平均 {stats?.avgNps != null ? `${stats.avgNps} / 10` : '—'}.
                        NPS 分數 {stats?.npsScore != null ? stats.npsScore : '—'}
                        (批評者 0-6.中立 7-8.推薦者 9-10)
                    </p>
                    {statsLoading ? (
                        <Skeleton className="h-[160px] w-full rounded" />
                    ) : (
                        <div className="h-[160px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={npsData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                    <XAxis
                                        dataKey="label"
                                        tick={AXIS_TICK}
                                        tickLine={false}
                                        axisLine={{ stroke: 'var(--border)' }}
                                    />
                                    <YAxis
                                        allowDecimals={false}
                                        tick={AXIS_TICK}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <Tooltip
                                        contentStyle={TOOLTIP_STYLE}
                                        cursor={{ fill: 'var(--accent)', opacity: 0.4 }}
                                        formatter={(value) => [`${value} 筆`, '回饋']}
                                    />
                                    <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={24}>
                                        {npsData.map((d) => (
                                            <Cell key={d.score} fill={npsColor(d.score)} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </section>
            </div>

            {/* 有評分的回饋列表 */}
            <section className="space-y-2">
                <h3 className="text-[13px] font-medium">有評分的回饋</h3>
                <FeedbackTable
                    data={data?.data ?? []}
                    count={data?.count ?? 0}
                    filter={filter}
                    isLoading={isLoading}
                    onFilterChange={handleFilterChange}
                    onSelect={handleSelect}
                />
            </section>

            <FeedbackDetail
                record={selectedRecord}
                open={detailOpen}
                onClose={handleDetailClose}
            />
        </div>
    );
}
