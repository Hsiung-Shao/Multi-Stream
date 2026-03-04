import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Skeleton } from '../../../components/ui/skeleton';
import { ChevronLeft, ChevronRight, Bug, Lightbulb, Palette, HelpCircle, Clock, Star, MessageSquare, X } from 'lucide-react';
import type { FeedbackRecord, FeedbackFilter } from '../types';

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Bug; color: string; bg: string }> = {
    bug: { label: 'Bug', icon: Bug, color: 'text-red-400', bg: 'bg-red-500/10' },
    feature: { label: '功能建議', icon: Lightbulb, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    ui: { label: 'UI/UX', icon: Palette, color: 'text-violet-400', bg: 'bg-violet-500/10' },
    other: { label: '其他', icon: HelpCircle, color: 'text-zinc-400', bg: 'bg-zinc-500/10' },
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string; border: string }> = {
    unread: { label: '未讀', bg: 'bg-blue-500/15', text: 'text-blue-400', dot: 'bg-blue-400', border: 'border-blue-500/25' },
    read: { label: '已讀', bg: 'bg-zinc-500/15', text: 'text-zinc-400', dot: 'bg-zinc-400', border: 'border-zinc-500/25' },
    processed: { label: '已處理', bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400', border: 'border-emerald-500/25' },
    archived: { label: '封存', bg: 'bg-zinc-500/10', text: 'text-zinc-500', dot: 'bg-zinc-500', border: 'border-zinc-500/20' },
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
                    <SelectTrigger className="w-[130px] h-9 bg-zinc-900 border-zinc-800 text-zinc-300 text-[13px] rounded-lg hover:bg-zinc-800/80 transition-colors">
                        <SelectValue placeholder="類型" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                        <SelectItem value="all" className="text-[13px]">全部類型</SelectItem>
                        <SelectItem value="bug" className="text-[13px]">Bug</SelectItem>
                        <SelectItem value="feature" className="text-[13px]">功能建議</SelectItem>
                        <SelectItem value="ui" className="text-[13px]">UI/UX</SelectItem>
                        <SelectItem value="other" className="text-[13px]">其他</SelectItem>
                    </SelectContent>
                </Select>

                <Select
                    value={filter.status || 'all'}
                    onValueChange={v => onFilterChange({ status: v === 'all' ? undefined : v, page: 1 })}
                >
                    <SelectTrigger className="w-[130px] h-9 bg-zinc-900 border-zinc-800 text-zinc-300 text-[13px] rounded-lg hover:bg-zinc-800/80 transition-colors">
                        <SelectValue placeholder="狀態" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                        <SelectItem value="all" className="text-[13px]">全部狀態</SelectItem>
                        <SelectItem value="unread" className="text-[13px]">未讀</SelectItem>
                        <SelectItem value="read" className="text-[13px]">已讀</SelectItem>
                        <SelectItem value="processed" className="text-[13px]">已處理</SelectItem>
                        <SelectItem value="archived" className="text-[13px]">封存</SelectItem>
                    </SelectContent>
                </Select>

                <div className="flex items-center gap-1.5">
                    <input
                        type="date"
                        value={filter.dateFrom || ''}
                        onChange={e => onFilterChange({ dateFrom: e.target.value || undefined, page: 1 })}
                        className="h-9 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 text-[13px] text-zinc-300 hover:bg-zinc-800/80 transition-colors"
                    />
                    <span className="text-zinc-500 text-[12px]">—</span>
                    <input
                        type="date"
                        value={filter.dateTo || ''}
                        onChange={e => onFilterChange({ dateTo: e.target.value || undefined, page: 1 })}
                        className="h-9 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 text-[13px] text-zinc-300 hover:bg-zinc-800/80 transition-colors"
                    />
                </div>

                {hasActiveFilter && (
                    <button
                        onClick={() => onFilterChange({ feedbackType: undefined, status: undefined, dateFrom: undefined, dateTo: undefined, page: 1 })}
                        className="h-9 px-3 flex items-center gap-1.5 text-[12px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
                    >
                        <X className="w-3 h-3" />
                        清除篩選
                    </button>
                )}

                <div className="ml-auto text-[12px] text-zinc-400 tabular-nums">
                    {count} 筆結果
                </div>
            </div>

            {/* Feedback list */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
                {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className={`px-4 py-4 ${i > 0 ? 'border-t border-zinc-800/60' : ''}`}>
                            <Skeleton className="h-4 w-3/4 bg-zinc-800 rounded" />
                            <Skeleton className="h-3 w-1/3 mt-2.5 bg-zinc-800/60 rounded" />
                        </div>
                    ))
                ) : data.length === 0 ? (
                    <div className="py-20 text-center">
                        <MessageSquare className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                        <p className="text-[14px] text-zinc-400">沒有符合條件的回饋</p>
                        {hasActiveFilter && (
                            <button
                                onClick={() => onFilterChange({ feedbackType: undefined, status: undefined, dateFrom: undefined, dateTo: undefined, page: 1 })}
                                className="text-[13px] text-zinc-500 hover:text-zinc-300 mt-2 transition-colors"
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
                                    w-full text-left px-4 py-4 flex items-start gap-3 transition-colors group
                                    ${i > 0 ? 'border-t border-zinc-800/60' : ''}
                                    hover:bg-zinc-800/40
                                `}
                            >
                                {/* Type icon */}
                                <div className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${typeConf.bg} ${typeConf.color}`}>
                                    <TypeIcon className="w-4 h-4" />
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        {/* Status badge */}
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[12px] font-medium border ${statusConf.bg} ${statusConf.text} ${statusConf.border}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${statusConf.dot}`} />
                                            {statusConf.label}
                                        </span>
                                        <span className={`text-[12px] ${typeConf.color}`}>{typeConf.label}</span>
                                        {record.admin_notes && (
                                            <span className="text-[12px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-md">
                                                有備註
                                            </span>
                                        )}
                                    </div>
                                    <p className={`text-[13px] leading-relaxed line-clamp-2 ${isUnread ? 'text-zinc-100 font-medium' : 'text-zinc-300'}`}>
                                        {record.content}
                                    </p>
                                    <div className="flex items-center gap-3 mt-2">
                                        <span className="flex items-center gap-1 text-[12px] text-zinc-500">
                                            <Clock className="w-3 h-3" />
                                            {timeAgo(record.created_at)}
                                        </span>
                                        {record.rating != null && (
                                            <span className="flex items-center gap-0.5 text-[12px] text-zinc-500">
                                                <Star className="w-3 h-3 text-amber-500/80" />
                                                {record.rating}
                                            </span>
                                        )}
                                        {record.nps_score != null && (
                                            <span className="text-[12px] text-zinc-500">
                                                NPS {record.nps_score}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Hover arrow */}
                                <ChevronRight className="w-4 h-4 text-zinc-700 group-hover:text-zinc-400 group-hover:translate-x-0.5 mt-1 flex-shrink-0 transition-all" />
                            </button>
                        );
                    })
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between pt-1">
                    <p className="text-[12px] text-zinc-400 tabular-nums">
                        第 {filter.page} / {totalPages} 頁
                    </p>
                    <div className="flex gap-1">
                        <button
                            disabled={filter.page <= 1}
                            onClick={() => onFilterChange({ page: filter.page - 1 })}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                            disabled={filter.page >= totalPages}
                            onClick={() => onFilterChange({ page: filter.page + 1 })}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
