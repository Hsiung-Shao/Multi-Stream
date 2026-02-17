import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Skeleton } from '../../../components/ui/skeleton';
import { ChevronLeft, ChevronRight, Bug, Lightbulb, Palette, HelpCircle, Clock, Star, MessageSquare } from 'lucide-react';
import type { FeedbackRecord, FeedbackFilter } from '../types';

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Bug; color: string; dotColor: string }> = {
    bug: { label: 'Bug', icon: Bug, color: 'text-red-400', dotColor: 'bg-red-400' },
    feature: { label: '功能建議', icon: Lightbulb, color: 'text-amber-400', dotColor: 'bg-amber-400' },
    ui: { label: 'UI/UX', icon: Palette, color: 'text-violet-400', dotColor: 'bg-violet-400' },
    other: { label: '其他', icon: HelpCircle, color: 'text-zinc-400', dotColor: 'bg-zinc-400' },
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
    unread: { label: '未讀', bg: 'bg-orange-500/10', text: 'text-orange-400', dot: 'bg-orange-400' },
    read: { label: '已讀', bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-400' },
    processed: { label: '已處理', bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
    archived: { label: '封存', bg: 'bg-zinc-500/10', text: 'text-zinc-500', dot: 'bg-zinc-500' },
};

interface FeedbackTableProps {
    data: FeedbackRecord[];
    count: number;
    filter: FeedbackFilter;
    isLoading: boolean;
    onFilterChange: (updates: Partial<FeedbackFilter>) => void;
    onSelect: (record: FeedbackRecord) => void;
}

function timeAgo(dateStr: string): string {
    const now = Date.now();
    const date = new Date(dateStr).getTime();
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '剛剛';
    if (mins < 60) return `${mins} 分鐘前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小時前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} 天前`;
    return new Date(dateStr).toLocaleDateString('zh-TW');
}

export function FeedbackTable({ data, count, filter, isLoading, onFilterChange, onSelect }: FeedbackTableProps) {
    const totalPages = Math.ceil(count / filter.pageSize);
    const hasActiveFilter = !!(filter.feedbackType || filter.status || filter.dateFrom || filter.dateTo);

    return (
        <div className="space-y-3">
            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-2">
                <Select
                    value={filter.feedbackType || 'all'}
                    onValueChange={v => onFilterChange({ feedbackType: v === 'all' ? undefined : v, page: 1 })}
                >
                    <SelectTrigger className="w-[130px] h-8 bg-white/[0.03] border-white/[0.06] text-zinc-300 text-[12px] rounded-md hover:bg-white/[0.06] transition-colors">
                        <SelectValue placeholder="類型" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                        <SelectItem value="all" className="text-[12px]">全部類型</SelectItem>
                        <SelectItem value="bug" className="text-[12px]">Bug</SelectItem>
                        <SelectItem value="feature" className="text-[12px]">功能建議</SelectItem>
                        <SelectItem value="ui" className="text-[12px]">UI/UX</SelectItem>
                        <SelectItem value="other" className="text-[12px]">其他</SelectItem>
                    </SelectContent>
                </Select>

                <Select
                    value={filter.status || 'all'}
                    onValueChange={v => onFilterChange({ status: v === 'all' ? undefined : v, page: 1 })}
                >
                    <SelectTrigger className="w-[130px] h-8 bg-white/[0.03] border-white/[0.06] text-zinc-300 text-[12px] rounded-md hover:bg-white/[0.06] transition-colors">
                        <SelectValue placeholder="狀態" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                        <SelectItem value="all" className="text-[12px]">全部狀態</SelectItem>
                        <SelectItem value="unread" className="text-[12px]">未讀</SelectItem>
                        <SelectItem value="read" className="text-[12px]">已讀</SelectItem>
                        <SelectItem value="processed" className="text-[12px]">已處理</SelectItem>
                        <SelectItem value="archived" className="text-[12px]">封存</SelectItem>
                    </SelectContent>
                </Select>

                <div className="flex items-center gap-1.5">
                    <input
                        type="date"
                        value={filter.dateFrom || ''}
                        onChange={e => onFilterChange({ dateFrom: e.target.value || undefined, page: 1 })}
                        className="h-8 rounded-md border border-white/[0.06] bg-white/[0.03] px-2.5 text-[12px] text-zinc-300 hover:bg-white/[0.06] transition-colors"
                    />
                    <span className="text-zinc-600 text-[11px]">—</span>
                    <input
                        type="date"
                        value={filter.dateTo || ''}
                        onChange={e => onFilterChange({ dateTo: e.target.value || undefined, page: 1 })}
                        className="h-8 rounded-md border border-white/[0.06] bg-white/[0.03] px-2.5 text-[12px] text-zinc-300 hover:bg-white/[0.06] transition-colors"
                    />
                </div>

                {hasActiveFilter && (
                    <button
                        onClick={() => onFilterChange({ feedbackType: undefined, status: undefined, dateFrom: undefined, dateTo: undefined, page: 1 })}
                        className="h-8 px-2.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        清除篩選
                    </button>
                )}

                <div className="ml-auto text-[11px] text-zinc-600 tabular-nums">
                    {count} 筆結果
                </div>
            </div>

            {/* Feedback list */}
            <div className="space-y-px rounded-lg border border-white/[0.06] overflow-hidden">
                {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="px-4 py-3.5 bg-white/[0.02]">
                            <Skeleton className="h-4 w-3/4 bg-white/[0.04] rounded" />
                            <Skeleton className="h-3 w-1/3 mt-2 bg-white/[0.03] rounded" />
                        </div>
                    ))
                ) : data.length === 0 ? (
                    <div className="py-16 text-center">
                        <MessageSquare className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                        <p className="text-[13px] text-zinc-500">沒有符合條件的回饋</p>
                        {hasActiveFilter && (
                            <button
                                onClick={() => onFilterChange({ feedbackType: undefined, status: undefined, dateFrom: undefined, dateTo: undefined, page: 1 })}
                                className="text-[12px] text-zinc-600 hover:text-zinc-400 mt-1 transition-colors"
                            >
                                清除篩選條件
                            </button>
                        )}
                    </div>
                ) : (
                    data.map((record, i) => {
                        const typeConf = TYPE_CONFIG[record.feedback_type] || TYPE_CONFIG.other;
                        const statusConf = STATUS_CONFIG[record.status] || STATUS_CONFIG.unread;
                        const TypeIcon = typeConf.icon;
                        const isUnread = record.status === 'unread';

                        return (
                            <button
                                key={record.id}
                                onClick={() => onSelect(record)}
                                className={`
                                    w-full text-left px-4 py-3 flex items-start gap-3 transition-colors group
                                    ${i > 0 ? 'border-t border-white/[0.04]' : ''}
                                    ${isUnread ? 'bg-white/[0.02]' : 'bg-transparent'}
                                    hover:bg-white/[0.04]
                                `}
                            >
                                {/* Type icon */}
                                <div className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center bg-white/[0.04] ${typeConf.color}`}>
                                    <TypeIcon className="w-3.5 h-3.5" />
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        {/* Status badge */}
                                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${statusConf.bg} ${statusConf.text}`}>
                                            <span className={`w-1 h-1 rounded-full ${statusConf.dot}`} />
                                            {statusConf.label}
                                        </span>
                                        <span className={`text-[11px] ${typeConf.color}`}>{typeConf.label}</span>
                                        {record.admin_notes && (
                                            <span className="text-[10px] text-zinc-600 bg-white/[0.04] px-1.5 py-0.5 rounded">
                                                有備註
                                            </span>
                                        )}
                                    </div>
                                    <p className={`text-[13px] leading-relaxed line-clamp-2 ${isUnread ? 'text-zinc-200' : 'text-zinc-400'}`}>
                                        {record.content}
                                    </p>
                                    <div className="flex items-center gap-3 mt-1.5">
                                        <span className="flex items-center gap-1 text-[11px] text-zinc-600">
                                            <Clock className="w-3 h-3" />
                                            {timeAgo(record.created_at)}
                                        </span>
                                        {record.rating != null && (
                                            <span className="flex items-center gap-0.5 text-[11px] text-zinc-600">
                                                <Star className="w-3 h-3 text-amber-500/60" />
                                                {record.rating}
                                            </span>
                                        )}
                                        {record.nps_score != null && (
                                            <span className="text-[11px] text-zinc-600">
                                                NPS {record.nps_score}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Hover arrow */}
                                <ChevronRight className="w-4 h-4 text-zinc-700 group-hover:text-zinc-500 mt-1 flex-shrink-0 transition-colors" />
                            </button>
                        );
                    })
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between pt-1">
                    <p className="text-[11px] text-zinc-600 tabular-nums">
                        第 {filter.page} / {totalPages} 頁
                    </p>
                    <div className="flex gap-1">
                        <button
                            disabled={filter.page <= 1}
                            onClick={() => onFilterChange({ page: filter.page - 1 })}
                            className="w-7 h-7 flex items-center justify-center rounded-md border border-white/[0.06] text-zinc-400 hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                            disabled={filter.page >= totalPages}
                            onClick={() => onFilterChange({ page: filter.page + 1 })}
                            className="w-7 h-7 flex items-center justify-center rounded-md border border-white/[0.06] text-zinc-400 hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
