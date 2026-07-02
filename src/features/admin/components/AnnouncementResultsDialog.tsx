// 公告結果 Dialog
//
// poll → BarChart 顯示各 option 票數 + 總票數
// survey → 各 question 列出:single/multi 用 BarChart;text 列出回應(scrollable)
// announcement → 不該開到此 dialog,顯示提示
//
// 資料來源:GET /api/admin/announcements/:id/responses(限 1000 筆,truncated 旗標會提示)
// 統計邏輯在前端做(對齊 functions/lib/announcements.js 的 summarizePoll / summarizeSurvey)

import { useMemo } from 'react';
import { Loader2, AlertTriangle, Users, BarChart3 as BarChartIcon, MessageSquare } from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '../../../components/ui/dialog';
import { ScrollArea } from '../../../components/ui/scroll-area';
import {
    useAnnouncementResponses,
    formatAdminAnnouncementError,
    type AnnouncementRecord,
    type AnnouncementResponseRecord,
    type PollPayload,
    type SurveyPayload,
    type SurveyQuestion,
} from '../hooks/useAdminAnnouncements';

interface PollSummaryItem {
    id: string;
    label: string;
    count: number;
}
interface PollSummary {
    total: number;
    options: PollSummaryItem[];
}

interface SurveyOptionSummary {
    id: string;
    label: string;
    count: number;
}
interface SurveyQuestionSummary {
    id: string;
    label: string;
    type: 'single' | 'multi' | 'text';
    options?: SurveyOptionSummary[];
    textResponses?: string[]; // type=text 時收集
    textCount?: number;
}
interface SurveySummary {
    total: number;
    questions: SurveyQuestionSummary[];
}

function summarizePoll(
    responses: AnnouncementResponseRecord[],
    options: { id: string; label: string }[],
): PollSummary {
    const counts = new Map<string, number>();
    for (const o of options) counts.set(o.id, 0);
    let total = 0;
    for (const r of responses) {
        const choices = Array.isArray(r.choices) ? r.choices : [];
        if (choices.length === 0) continue;
        total += 1;
        for (const c of choices) {
            const oid = typeof c === 'string' ? c : (c as any)?.option_id;
            if (typeof oid === 'string' && counts.has(oid)) {
                counts.set(oid, (counts.get(oid) ?? 0) + 1);
            }
        }
    }
    return {
        total,
        options: options.map(o => ({ id: o.id, label: o.label, count: counts.get(o.id) ?? 0 })),
    };
}

function summarizeSurvey(
    responses: AnnouncementResponseRecord[],
    questions: SurveyQuestion[],
): SurveySummary {
    const optionCounts = new Map<string, Map<string, number>>();
    const textResponses = new Map<string, string[]>();
    for (const q of questions) {
        if (q.type === 'text') {
            textResponses.set(q.id, []);
        } else {
            const m = new Map<string, number>();
            for (const o of q.options ?? []) m.set(o.id, 0);
            optionCounts.set(q.id, m);
        }
    }
    let total = 0;
    for (const r of responses) {
        const choices = Array.isArray(r.choices) ? r.choices : [];
        const hasOverallText = typeof r.text_response === 'string' && r.text_response.trim().length > 0;
        if (choices.length === 0 && !hasOverallText) continue;
        total += 1;
        for (const c of choices) {
            if (!c || typeof c !== 'object') continue;
            const qId = (c as any).question_id;
            if (typeof qId !== 'string') continue;
            if (textResponses.has(qId)) {
                const text = (c as any).text;
                if (typeof text === 'string' && text.trim()) {
                    textResponses.get(qId)!.push(text);
                }
            } else if (optionCounts.has(qId)) {
                const m = optionCounts.get(qId)!;
                const ids = Array.isArray((c as any).option_ids) ? (c as any).option_ids : [];
                for (const oid of ids) {
                    if (typeof oid === 'string' && m.has(oid)) m.set(oid, (m.get(oid) ?? 0) + 1);
                }
            }
        }
    }
    return {
        total,
        questions: questions.map(q => {
            if (q.type === 'text') {
                const arr = textResponses.get(q.id) ?? [];
                return { id: q.id, label: q.label, type: 'text', textResponses: arr, textCount: arr.length };
            }
            const m = optionCounts.get(q.id) ?? new Map();
            return {
                id: q.id,
                label: q.label,
                type: q.type,
                options: (q.options ?? []).map(o => ({ id: o.id, label: o.label, count: m.get(o.id) ?? 0 })),
            };
        }),
    };
}

// 圖表色走 index.css 的 CSS 變數,跟隨主題
const CHART_COLOR = 'var(--chart-1)';
const CHART_GRID = 'var(--border)';
const CHART_AXIS = 'var(--muted-foreground)';

function ChartTooltipContent({ active, payload }: any) {
    if (!active || !payload || !payload[0]) return null;
    return (
        <div className="bg-popover border border-border rounded-md px-2 py-1 text-xs text-popover-foreground">
            <div className="font-medium">{payload[0].payload.label}</div>
            <div className="text-muted-foreground tabular-nums">{payload[0].value} 票</div>
        </div>
    );
}

/** poll / survey 共用的橫向計票長條圖;compact 給 survey 單題用(較小字級與高度) */
function ResultsBarChart({ items, compact = false }: { items: { label: string; count: number }[]; compact?: boolean }) {
    const fontSize = compact ? 10 : 11;
    return (
        <ResponsiveContainer
            width="100%"
            height={compact ? Math.max(140, items.length * 30 + 40) : Math.max(180, items.length * 36 + 60)}
        >
            <BarChart
                data={items}
                layout="vertical"
                margin={compact ? { top: 4, right: 24, left: 8, bottom: 4 } : { top: 8, right: 24, left: 8, bottom: 8 }}
            >
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis type="number" stroke={CHART_AXIS} fontSize={fontSize} allowDecimals={false} />
                <YAxis
                    type="category"
                    dataKey="label"
                    stroke={CHART_AXIS}
                    fontSize={fontSize}
                    width={compact ? 120 : 140}
                    interval={0}
                />
                <Tooltip content={<ChartTooltipContent />} cursor={{ fill: 'var(--accent)', opacity: 0.4 }} />
                <Bar dataKey="count" fill={CHART_COLOR} radius={[0, 4, 4, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
}

interface Props {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    target: AnnouncementRecord | null;
}

export function AnnouncementResultsDialog({ open, onOpenChange, target }: Props) {
    const { data, isLoading, isError, error } = useAnnouncementResponses(
        target?.id ?? null,
        open && !!target,
    );

    const isAnnouncement = target?.type === 'announcement';
    const isPoll = target?.type === 'poll';
    const isSurvey = target?.type === 'survey';

    const pollSummary = useMemo<PollSummary | null>(() => {
        if (!isPoll || !data) return null;
        const payload = (target?.payload ?? null) as PollPayload | null;
        const options = payload?.options ?? [];
        return summarizePoll(data.responses, options);
    }, [isPoll, data, target]);

    const surveySummary = useMemo<SurveySummary | null>(() => {
        if (!isSurvey || !data) return null;
        const payload = (target?.payload ?? null) as SurveyPayload | null;
        const questions = payload?.questions ?? [];
        return summarizeSurvey(data.responses, questions);
    }, [isSurvey, data, target]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <BarChartIcon className="w-4 h-4 text-violet-400" />
                        結果統計
                    </DialogTitle>
                    <DialogDescription className="text-sm">
                        {target?.title}
                    </DialogDescription>
                </DialogHeader>

                {isAnnouncement && (
                    <div className="py-8 flex flex-col items-center gap-2 text-muted-foreground">
                        <MessageSquare className="w-10 h-10" />
                        <p className="text-sm">「公告」類型不收集使用者回應,沒有結果可顯示。</p>
                    </div>
                )}

                {!isAnnouncement && (
                    <ScrollArea className="flex-1 min-h-0 -mr-3 pr-3">
                        {isLoading && (
                            <div className="py-12 flex flex-col items-center gap-2 text-muted-foreground">
                                <Loader2 className="w-6 h-6 animate-spin" />
                                <p className="text-sm">載入中...</p>
                            </div>
                        )}

                        {isError && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/25">
                                <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                                <p className="text-[13px] text-destructive">
                                    讀取失敗:{formatAdminAnnouncementError(error)}
                                </p>
                            </div>
                        )}

                        {data && (
                            <div className="space-y-4">
                                {/* Header: total */}
                                <div className="flex items-center gap-4 px-3 py-2 rounded-md bg-card border border-border">
                                    <Users className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-sm text-foreground">
                                        總回應數:<span className="font-semibold tabular-nums">{data.total}</span>
                                    </span>
                                    {data.truncated && (
                                        <span className="text-[11px] text-amber-400 ml-auto">
                                            (顯示前 {data.limit} 筆;統計可能不完整)
                                        </span>
                                    )}
                                </div>

                                {/* Poll result */}
                                {isPoll && pollSummary && (
                                    <div className="space-y-2">
                                        {pollSummary.options.length === 0 ? (
                                            <p className="text-sm text-muted-foreground text-center py-8">
                                                此投票沒有設定選項
                                            </p>
                                        ) : (
                                            <div className="rounded-lg border border-border bg-card p-4">
                                                <ResultsBarChart
                                                    items={pollSummary.options.map(o => ({
                                                        label: o.label || `(無標籤)`,
                                                        count: o.count,
                                                    }))}
                                                />
                                                <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                                                    {pollSummary.options.map(o => {
                                                        const pct = pollSummary.total > 0
                                                            ? Math.round((o.count / pollSummary.total) * 1000) / 10
                                                            : 0;
                                                        return (
                                                            <div key={o.id} className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-muted/60">
                                                                <span className="text-foreground truncate">{o.label || '(無標籤)'}</span>
                                                                <span className="text-muted-foreground tabular-nums shrink-0">
                                                                    {o.count} / {pct}%
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Survey result */}
                                {isSurvey && surveySummary && (
                                    <div className="space-y-3">
                                        {surveySummary.questions.length === 0 ? (
                                            <p className="text-sm text-muted-foreground text-center py-8">
                                                此問卷沒有設定題目
                                            </p>
                                        ) : (
                                            surveySummary.questions.map((q, qi) => (
                                                <div key={q.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                                                    <div className="flex items-baseline justify-between">
                                                        <h4 className="text-sm font-medium text-foreground">
                                                            Q{qi + 1}. {q.label}
                                                        </h4>
                                                        <span className="text-[11px] text-muted-foreground capitalize">{q.type}</span>
                                                    </div>

                                                    {(q.type === 'single' || q.type === 'multi') && q.options && (
                                                        q.options.length === 0 ? (
                                                            <p className="text-xs text-muted-foreground">沒有設定選項</p>
                                                        ) : (
                                                            <ResultsBarChart
                                                                compact
                                                                items={q.options.map(o => ({
                                                                    label: o.label || `(無標籤)`,
                                                                    count: o.count,
                                                                }))}
                                                            />
                                                        )
                                                    )}

                                                    {q.type === 'text' && (
                                                        <div className="space-y-1">
                                                            <p className="text-[11px] text-muted-foreground">
                                                                共 {q.textCount ?? 0} 則文字回應
                                                            </p>
                                                            {(q.textResponses?.length ?? 0) === 0 ? (
                                                                <p className="text-xs text-muted-foreground italic">尚無文字回應</p>
                                                            ) : (
                                                                // max-h 下在 viewport(Root auto 高度時 h-full 解析不到)
                                                                <ScrollArea className="[&>[data-radix-scroll-area-viewport]]:max-h-48 pr-1">
                                                                    <div className="space-y-1">
                                                                        {q.textResponses!.map((t, ti) => (
                                                                            <div
                                                                                key={ti}
                                                                                className="text-xs text-foreground px-2 py-1.5 rounded bg-background border border-border whitespace-pre-wrap break-words"
                                                                            >
                                                                                {t}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </ScrollArea>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </ScrollArea>
                )}
            </DialogContent>
        </Dialog>
    );
}
