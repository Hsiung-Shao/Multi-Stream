// Admin 分類審核 tab — 列 pending categories + approve/reject 動作
//
// 操作流程:
// 1. user 從推薦頁「+ 提分類」送出 → status='pending'
// 2. admin 看此 tab → 通過(approved 後可被 tag)或拒絕

import { useState } from 'react';
import { Tag, Check, X, Loader2, AlertTriangle, Inbox, Filter } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Skeleton } from '../../../components/ui/skeleton';
import { Textarea } from '../../../components/ui/textarea';
import { Label } from '../../../components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../../../components/ui/table';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import {
    useAdminCategories,
    useReviewCategory,
    formatAdminCategoryError,
    type AdminCategoryRecord,
    type CategoryStatus,
} from '../hooks/useAdminCategories';
import { toast } from 'sonner';

const STATUS_LABEL: Record<CategoryStatus, string> = {
    pending: '審核中',
    approved: '已通過',
    rejected: '已拒絕',
    archived: '已封存',
};

const STATUS_COLOR: Record<CategoryStatus, string> = {
    pending: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
    approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
    rejected: 'bg-red-500/10 text-red-400 border-red-500/25',
    archived: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/15',
};

function formatTime(s: string | null | undefined): string {
    if (!s) return '—';
    try {
        return new Date(s).toLocaleString('zh-TW', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
        });
    } catch { return '—'; }
}

export function CategoriesReviewTab() {
    const [statusFilter, setStatusFilter] = useState<CategoryStatus | 'all'>('pending');
    const { data: categories = [], isLoading, isError, error, refetch } = useAdminCategories(statusFilter);
    const reviewMutation = useReviewCategory();

    const [pending, setPending] = useState<{ record: AdminCategoryRecord; action: 'approve' | 'reject' } | null>(null);
    const [notes, setNotes] = useState('');

    const handleConfirmReview = async () => {
        if (!pending) return;
        try {
            await reviewMutation.mutateAsync({
                id: pending.record.id,
                action: pending.action,
                notes: notes.trim() || undefined,
            });
            toast.success(pending.action === 'approve' ? '已通過分類' : '已拒絕分類');
            setPending(null);
            setNotes('');
        } catch (e) {
            toast.error(formatAdminCategoryError(e));
        }
    };

    return (
        <div className="space-y-4">
            {/* Header row */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-zinc-400" />
                    <span className="text-[13px] text-zinc-300 font-medium">
                        共 {categories.length} 筆({STATUS_LABEL[statusFilter as CategoryStatus] || '全部'})
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <Filter className="w-3.5 h-3.5 text-zinc-500" />
                    {(['pending', 'approved', 'rejected', 'all'] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                                statusFilter === s
                                    ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                            }`}
                        >
                            {s === 'all' ? '全部' : STATUS_LABEL[s]}
                        </button>
                    ))}
                </div>
            </div>

            {/* Error banner */}
            {isError && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/25">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <p className="text-[13px] text-red-400">資料載入失敗:{formatAdminCategoryError(error)}</p>
                    <button onClick={() => refetch()} className="ml-auto text-red-400 hover:text-red-300 text-[12px] underline">
                        重新載入
                    </button>
                </div>
            )}

            {/* Table */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
                {isLoading ? (
                    <div className="p-4 space-y-2">
                        {[1, 2, 3].map(i => (
                            <Skeleton key={i} className="h-12 bg-zinc-800 rounded" />
                        ))}
                    </div>
                ) : categories.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-zinc-500">
                        <Inbox className="w-10 h-10" />
                        <span className="text-sm">沒有{STATUS_LABEL[statusFilter as CategoryStatus] || ''}的分類</span>
                    </div>
                ) : (
                    <Table className="text-zinc-200">
                        <TableHeader>
                            <TableRow className="border-zinc-800 hover:bg-transparent">
                                <TableHead className="text-[11px] text-zinc-500 font-medium">名稱 / slug</TableHead>
                                <TableHead className="text-[11px] text-zinc-500 font-medium w-[90px]">狀態</TableHead>
                                <TableHead className="text-[11px] text-zinc-500 font-medium w-[140px]">提交時間</TableHead>
                                <TableHead className="text-[11px] text-zinc-500 font-medium w-[160px] text-right">動作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {categories.map(c => (
                                <TableRow key={c.id} className="border-zinc-800 hover:bg-zinc-800/40">
                                    <TableCell>
                                        <div className="font-medium text-zinc-100 text-[13px]">{c.name}</div>
                                        <div className="text-[11px] text-zinc-500 font-mono">{c.slug}</div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={`text-[10px] ${STATUS_COLOR[c.status]}`}>
                                            {STATUS_LABEL[c.status]}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-[11px] text-zinc-500 tabular-nums">
                                        {formatTime(c.created_at)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {c.status === 'pending' ? (
                                            <div className="inline-flex items-center gap-1">
                                                <button
                                                    onClick={() => { setPending({ record: c, action: 'approve' }); setNotes(''); }}
                                                    className="w-7 h-7 flex items-center justify-center rounded-md text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                                                    title="通過"
                                                >
                                                    <Check className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => { setPending({ record: c, action: 'reject' }); setNotes(''); }}
                                                    className="w-7 h-7 flex items-center justify-center rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                                    title="拒絕"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-[11px] text-zinc-600">{c.reviewer_notes ? '已留備註' : '已審核'}</span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </div>

            {/* Review confirm dialog */}
            <AlertDialog
                open={!!pending}
                onOpenChange={(v) => { if (!v) { setPending(null); setNotes(''); } }}
            >
                <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-zinc-100">
                            {pending?.action === 'approve' ? '通過此分類?' : '拒絕此分類?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-zinc-400">
                            {pending?.action === 'approve'
                                ? `通過後「${pending?.record.name}」立刻可被使用者用來 tag VTuber。`
                                : `拒絕後「${pending?.record.name}」不會公開,但 user 仍能再次提相同名稱(若 slug 不同)。`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="space-y-1.5 py-2">
                        <Label className="text-xs text-zinc-400">備註(選填,1000 字內)</Label>
                        <Textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            maxLength={1000}
                            placeholder="留給未來自己查歷史用(user 看不到)"
                            className="bg-zinc-950 border-zinc-800 text-zinc-200 min-h-[64px] text-sm"
                        />
                    </div>

                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700">
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmReview}
                            disabled={reviewMutation.isPending}
                            className={pending?.action === 'approve'
                                ? 'bg-emerald-600 hover:bg-emerald-500'
                                : 'bg-red-600 hover:bg-red-500'}
                        >
                            {reviewMutation.isPending ? (
                                <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />處理中</>
                            ) : (pending?.action === 'approve' ? '確認通過' : '確認拒絕')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
