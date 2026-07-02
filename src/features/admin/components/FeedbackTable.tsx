/**
 * 回饋列表:篩選列(類型/狀態/日期/內容關鍵字)+ 列表 + 分頁。
 * 樣式全走語意 token(admin 恆深色由 useAppliedTheme 保證)。
 * hasScore 由呼叫端(RatingsTab)鎖定,本元件的清除篩選不會動它。
 */

import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Input } from '../../../components/ui/input';
import { Skeleton } from '../../../components/ui/skeleton';
import { ChevronLeft, ChevronRight, Clock, Star, MessageSquare, Search } from 'lucide-react';
import type { FeedbackRecord, FeedbackFilter } from '../types';
import { TYPE_CONFIG, STATUS_CONFIG, timeAgo } from './feedbackConfig';

interface FeedbackTableProps {
    data: FeedbackRecord[];
    count: number;
    filter: FeedbackFilter;
    isLoading: boolean;
    onFilterChange: (updates: Partial<FeedbackFilter>) => void;
    onSelect: (record: FeedbackRecord) => void;
}

/** 關鍵字輸入 debounce,避免每個字元都打一次查詢 */
const SEARCH_DEBOUNCE_MS = 400;

export function FeedbackTable({ data, count, filter, isLoading, onFilterChange, onSelect }: FeedbackTableProps) {
    const totalPages = Math.ceil(count / filter.pageSize);
    const hasActiveFilter = !!(filter.feedbackType || filter.status || filter.dateFrom || filter.dateTo || filter.search);

    const [searchInput, setSearchInput] = useState(filter.search ?? '');

    useEffect(() => {
        const trimmed = searchInput.trim();
        const current = filter.search ?? '';
        if (trimmed === current) return;
        const timer = setTimeout(() => {
            onFilterChange({ search: trimmed || undefined, page: 1 });
        }, SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
        // onFilterChange 每次 render 都是新 reference,列入 deps 會讓 debounce 失效
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchInput]);

    const clearFilters = () => {
        setSearchInput('');
        onFilterChange({
            feedbackType: undefined,
            status: undefined,
            dateFrom: undefined,
            dateTo: undefined,
            search: undefined,
            page: 1,
        });
    };

    return (
        <div className="space-y-3">
            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-2">
                <Select
                    value={filter.feedbackType || 'all'}
                    onValueChange={(v: string) => onFilterChange({ feedbackType: v === 'all' ? undefined : v, page: 1 })}
                >
                    <SelectTrigger className="w-[120px] h-8 text-[12px] rounded-md">
                        <SelectValue placeholder="類型" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all" className="text-[12px]">全部類型</SelectItem>
                        <SelectItem value="bug" className="text-[12px]">Bug</SelectItem>
                        <SelectItem value="feature" className="text-[12px]">功能建議</SelectItem>
                        <SelectItem value="ui" className="text-[12px]">UI/UX</SelectItem>
                        <SelectItem value="other" className="text-[12px]">其他</SelectItem>
                    </SelectContent>
                </Select>

                <Select
                    value={filter.status || 'all'}
                    onValueChange={(v: string) => onFilterChange({ status: v === 'all' ? undefined : v, page: 1 })}
                >
                    <SelectTrigger className="w-[120px] h-8 text-[12px] rounded-md">
                        <SelectValue placeholder="狀態" />
                    </SelectTrigger>
                    <SelectContent>
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
                        className="h-8 rounded-md border border-input bg-transparent dark:bg-input/30 px-2.5 text-[12px] text-foreground hover:bg-accent/40 transition-colors"
                    />
                    <span className="text-muted-foreground text-[11px]">—</span>
                    <input
                        type="date"
                        value={filter.dateTo || ''}
                        onChange={e => onFilterChange({ dateTo: e.target.value || undefined, page: 1 })}
                        className="h-8 rounded-md border border-input bg-transparent dark:bg-input/30 px-2.5 text-[12px] text-foreground hover:bg-accent/40 transition-colors"
                    />
                </div>

                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                        value={searchInput}
                        onChange={e => setSearchInput(e.target.value)}
                        placeholder="搜尋內容…"
                        className="h-8 w-[160px] pl-8 text-[12px] rounded-md"
                    />
                </div>

                {hasActiveFilter && (
                    <button
                        onClick={clearFilters}
                        className="h-8 px-2.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                        清除篩選
                    </button>
                )}

                <div className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                    {count} 筆結果
                </div>
            </div>

            {/* Feedback list */}
            <div className="rounded-lg border border-border overflow-hidden">
                {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className={`px-4 py-3.5 bg-card ${i > 0 ? 'border-t border-border' : ''}`}>
                            <Skeleton className="h-4 w-3/4 rounded" />
                            <Skeleton className="h-3 w-1/3 mt-2 rounded" />
                        </div>
                    ))
                ) : data.length === 0 ? (
                    <div className="py-16 text-center">
                        <MessageSquare className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                        <p className="text-[13px] text-muted-foreground">沒有符合條件的回饋</p>
                        {hasActiveFilter && (
                            <button
                                onClick={clearFilters}
                                className="text-[12px] text-muted-foreground hover:text-foreground mt-1 transition-colors"
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
                                    ${i > 0 ? 'border-t border-border' : ''}
                                    ${isUnread ? 'bg-card' : 'bg-transparent'}
                                    hover:bg-accent/40
                                `}
                            >
                                {/* Type icon */}
                                <div className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center bg-muted ${typeConf.color}`}>
                                    <TypeIcon className="w-3.5 h-3.5" />
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${statusConf.bg} ${statusConf.text}`}>
                                            <span className={`w-1 h-1 rounded-full ${statusConf.dot}`} />
                                            {statusConf.label}
                                        </span>
                                        <span className={`text-[11px] ${typeConf.color}`}>{typeConf.label}</span>
                                        {record.admin_notes && (
                                            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                                有備註
                                            </span>
                                        )}
                                    </div>
                                    <p className={`text-[13px] leading-relaxed line-clamp-2 ${isUnread ? 'text-foreground' : 'text-muted-foreground'}`}>
                                        {record.content}
                                    </p>
                                    <div className="flex items-center gap-3 mt-1.5">
                                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                            <Clock className="w-3 h-3" />
                                            {timeAgo(record.created_at)}
                                        </span>
                                        {record.rating != null && (
                                            <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                                                <Star className="w-3 h-3 text-amber-500/60" />
                                                {record.rating}
                                            </span>
                                        )}
                                        {record.nps_score != null && (
                                            <span className="text-[11px] text-muted-foreground">
                                                NPS {record.nps_score}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Hover arrow */}
                                <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground mt-1 flex-shrink-0 transition-colors" />
                            </button>
                        );
                    })
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between pt-1">
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                        第 {filter.page} / {totalPages} 頁
                    </p>
                    <div className="flex gap-1">
                        <button
                            disabled={filter.page <= 1}
                            onClick={() => onFilterChange({ page: filter.page - 1 })}
                            className="w-7 h-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent/40 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                            disabled={filter.page >= totalPages}
                            onClick={() => onFilterChange({ page: filter.page + 1 })}
                            className="w-7 h-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent/40 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
