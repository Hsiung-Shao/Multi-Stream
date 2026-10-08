// 已知問題 Tab — 列表 + 新增／編輯／刪除（公開頁 /status 的資料來源）
//
// 由後端 ADMIN_API_TOKEN（X-Admin-Token）把關，token 與公告、投稿、回報分頁共用。

import { useState } from 'react';
import { Plus, Pencil, Trash2, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
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
import { cn } from '../../../components/ui/utils';
import { AdminTokenInline, useAdminTokenPresent } from './AdminTokenInline';
import { KnownIssueEditDialog } from './KnownIssueEditDialog';
import {
    ISSUE_AREA_LABEL,
    ISSUE_STATUS_LABEL,
    formatKnownIssueError,
    useAdminKnownIssues,
    useDeleteKnownIssue,
    type KnownIssueRecord,
} from '../hooks/useAdminKnownIssues';
import { isUnauthorized } from '../hooks/useAdminSubmissions';

const FILTERS = { open: '未解決', resolved: '已修復', all: '全部' } as const;
type Filter = keyof typeof FILTERS;

function formatTime(s: string | null | undefined): string {
    if (!s) return '—';
    return new Date(s).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function KnownIssuesTab() {
    const hasToken = useAdminTokenPresent();
    const query = useAdminKnownIssues();
    const del = useDeleteKnownIssue();
    const needToken = !hasToken || isUnauthorized(query.error);

    const [filter, setFilter] = useState<Filter>('open');
    const [editOpen, setEditOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<KnownIssueRecord | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<KnownIssueRecord | null>(null);

    const issues = (query.data ?? []).filter((i) =>
        filter === 'all' ? true : filter === 'resolved' ? i.status === 'resolved' : i.status !== 'resolved');

    const openEditor = (target: KnownIssueRecord | null) => {
        setEditTarget(target);
        setEditOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!deleteTarget) return;
        const id = deleteTarget.id;
        try {
            await del.mutateAsync(id);
            // 只關掉「還是這一筆」的確認框：A 的刪除卡住、取消後改刪 B，A 晚到成功時不能把 B 的確認框關掉
            setDeleteTarget((cur) => (cur?.id === id ? null : cur));
        } catch {
            // 錯誤顯示在 del.error
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-semibold">已知問題</h2>
                <Select value={filter} onValueChange={(v: string) => setFilter(v as Filter)}>
                    <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {(Object.keys(FILTERS) as Filter[]).map((f) => <SelectItem key={f} value={f}>{FILTERS[f]}</SelectItem>)}
                    </SelectContent>
                </Select>
                {query.data && <span className="text-[12px] text-muted-foreground">{issues.length} 筆</span>}
                <a href="/status" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
                    查看公開頁 <ExternalLink className="size-3" aria-hidden="true" />
                </a>
                <Button size="sm" className="ml-auto" onClick={() => openEditor(null)} disabled={needToken}>
                    <Plus className="size-3.5" />
                    新增
                </Button>
            </div>

            {needToken && <AdminTokenInline />}

            {query.isLoading ? (
                <p className="text-sm text-muted-foreground">載入中…</p>
            ) : query.isError ? (
                needToken ? null : <p role="alert" className="text-sm text-destructive">{formatKnownIssueError(query.error)}</p>
            ) : issues.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">沒有符合的已知問題</p>
            ) : (
                <ul className="space-y-2">
                    {issues.map((issue) => (
                        <li key={issue.id} className="rounded-lg border border-border bg-card p-3.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className={cn(
                                    'rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
                                    issue.status === 'resolved' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400' : 'border-amber-500/25 bg-amber-500/10 text-amber-400',
                                )}>
                                    {ISSUE_STATUS_LABEL[issue.status]}
                                </span>
                                {issue.severity === 'major' && <span className="rounded-md border border-red-500/25 bg-red-500/10 px-1.5 py-0.5 text-[11px] font-medium text-red-400">影響較大</span>}
                                <span className={cn('inline-flex items-center gap-1 text-[11px]', issue.is_public ? 'text-foreground' : 'text-muted-foreground')}>
                                    {issue.is_public ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                                    {issue.is_public ? '公開中' : '未公開'}
                                </span>
                                {issue.areas.map((a) => <span key={a} className="text-[11px] text-muted-foreground">#{ISSUE_AREA_LABEL[a]}</span>)}
                                <span className="ml-auto text-[11px] text-muted-foreground">更新 {formatTime(issue.updated_at)}</span>
                            </div>
                            <div className="mt-1.5 flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium">{issue.title}</p>
                                    {issue.body && <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-[13px] text-muted-foreground">{issue.body}</p>}
                                </div>
                                <Button variant="ghost" size="icon" className="size-8" title="編輯" aria-label={`編輯「${issue.title}」`} onClick={() => openEditor(issue)}>
                                    <Pencil className="size-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" title="刪除" aria-label={`刪除「${issue.title}」`} onClick={() => setDeleteTarget(issue)}>
                                    <Trash2 className="size-3.5" />
                                </Button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <KnownIssueEditDialog open={editOpen} onOpenChange={setEditOpen} target={editTarget} />

            <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); del.reset(); } }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>刪除這個已知問題？</AlertDialogTitle>
                        <AlertDialogDescription>
                            「{deleteTarget?.title}」會從後台與公開頁移除，無法復原。若問題已解決，建議改成「已修復」保留紀錄。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {del.error && <p role="alert" className="text-[13px] text-destructive">{formatKnownIssueError(del.error)}</p>}
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={del.isPending}
                            onClick={(e) => { e.preventDefault(); void handleConfirmDelete(); }}
                            className="bg-destructive text-white hover:bg-destructive/90"
                        >
                            刪除
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
