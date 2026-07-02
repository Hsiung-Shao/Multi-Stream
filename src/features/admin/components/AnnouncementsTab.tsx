// 推送公告 Tab — 列表 + 編輯 / 刪除 / 查看結果
//
// 注意:
// - 所有 admin 動作（建立 / 編輯 / 刪除）都由後端 ADMIN_API_TOKEN（X-Admin-Token）把關，前端只負責 UI。
// - 編輯「已 published」公告會跳二次確認（避免 user 已看過的內容被改動）。
// - 刪除有 CASCADE 風險（會清掉所有 responses），跳二次確認。

import { useState } from 'react';
import { Megaphone, Plus, Pencil, Trash2, BarChart3, Loader2, AlertTriangle, Inbox, KeyRound, Check } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Skeleton } from '../../../components/ui/skeleton';
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
    useAdminAnnouncements,
    useDeleteAnnouncement,
    formatAdminAnnouncementError,
    getAdminToken,
    setAdminToken,
    clearAdminToken,
    type AnnouncementRecord,
} from '../hooks/useAdminAnnouncements';
import { AnnouncementEditDialog } from './AnnouncementEditDialog';
import { AnnouncementResultsDialog } from './AnnouncementResultsDialog';

const TYPE_LABEL: Record<AnnouncementRecord['type'], string> = {
    announcement: '公告',
    poll: '投票',
    survey: '問卷',
};

const TYPE_COLOR: Record<AnnouncementRecord['type'], string> = {
    announcement: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
    poll: 'bg-violet-500/10 text-violet-400 border-violet-500/25',
    survey: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
};

const STATUS_LABEL: Record<AnnouncementRecord['status'], string> = {
    draft: '草稿',
    published: '已發布',
    archived: '已封存',
};

const STATUS_COLOR: Record<AnnouncementRecord['status'], string> = {
    draft: 'bg-muted text-muted-foreground border-border',
    published: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
    archived: 'bg-muted text-muted-foreground/70 border-border',
};

const SEGMENT_LABEL: Record<AnnouncementRecord['target_segment'], string> = {
    all: '全部',
    authenticated: '已登入',
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

export function AnnouncementsTab() {
    const { data: announcements, isLoading, isError, error, refetch } = useAdminAnnouncements();
    const deleteMutation = useDeleteAnnouncement();

    const [editOpen, setEditOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<AnnouncementRecord | null>(null);

    const [resultsOpen, setResultsOpen] = useState(false);
    const [resultsTarget, setResultsTarget] = useState<AnnouncementRecord | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<AnnouncementRecord | null>(null);

    // 公告 API Token(後端 ADMIN_API_TOKEN 簡易保護;admin 輸入一次,存 localStorage)
    const [tokenInput, setTokenInput] = useState('');
    const [hasToken, setHasToken] = useState(() => getAdminToken().length > 0);

    const handleSaveToken = () => {
        const t = tokenInput.trim();
        if (!t) return;
        setAdminToken(t);
        setHasToken(true);
        setTokenInput('');
        refetch();
    };

    const handleResetToken = () => {
        clearAdminToken();
        setHasToken(false);
    };

    const handleCreate = () => {
        setEditTarget(null);
        setEditOpen(true);
    };

    const handleEdit = (a: AnnouncementRecord) => {
        setEditTarget(a);
        setEditOpen(true);
    };

    const handleViewResults = (a: AnnouncementRecord) => {
        setResultsTarget(a);
        setResultsOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!deleteTarget) return;
        try {
            await deleteMutation.mutateAsync(deleteTarget.id);
            setDeleteTarget(null);
        } catch {
            // mutation 已記在 deleteMutation.error，UI 顯示由下方錯誤橫幅處理
        }
    };

    return (
        <div className="space-y-4">
            {/* Admin API Token 設定列 */}
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-border bg-card">
                <KeyRound className="w-4 h-4 text-muted-foreground shrink-0" />
                {hasToken ? (
                    <>
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-[13px] text-foreground">已設定公告 API Token</span>
                        <button
                            onClick={handleResetToken}
                            className="ml-auto text-[12px] text-muted-foreground hover:text-foreground underline transition-colors"
                        >
                            重設
                        </button>
                    </>
                ) : (
                    <>
                        <span className="text-[13px] text-muted-foreground shrink-0">公告 API Token:</span>
                        <Input
                            type="password"
                            value={tokenInput}
                            onChange={(e) => setTokenInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveToken(); }}
                            placeholder="輸入 ADMIN_API_TOKEN"
                            className="h-8 max-w-xs text-[13px]"
                        />
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={handleSaveToken}
                            disabled={!tokenInput.trim()}
                            className="h-8 text-xs"
                        >
                            儲存
                        </Button>
                    </>
                )}
            </div>

            {/* Header row */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-muted-foreground" />
                    <span className="text-[13px] text-foreground font-medium">
                        共 {announcements?.length ?? 0} 筆
                    </span>
                </div>
                <Button
                    size="sm"
                    onClick={handleCreate}
                    disabled={!hasToken}
                    className="gap-1.5 text-xs h-8"
                >
                    <Plus className="w-3.5 h-3.5" />
                    新增公告
                </Button>
            </div>

            {/* Error banner */}
            {isError && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/25">
                    <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                    <p className="text-[13px] text-destructive">
                        資料載入失敗:{formatAdminAnnouncementError(error)}
                    </p>
                    <button
                        onClick={() => refetch()}
                        className="ml-auto text-destructive hover:text-destructive/80 transition-colors text-[12px] underline"
                    >
                        重新載入
                    </button>
                </div>
            )}

            {deleteMutation.isError && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/25">
                    <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                    <p className="text-[13px] text-destructive">
                        刪除失敗:{formatAdminAnnouncementError(deleteMutation.error)}
                    </p>
                </div>
            )}

            {/* Table */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                {isLoading ? (
                    <div className="p-4 space-y-2">
                        {[1, 2, 3].map(i => (
                            <Skeleton key={i} className="h-12 rounded" />
                        ))}
                    </div>
                ) : !announcements || announcements.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                        <Inbox className="w-10 h-10" />
                        <span className="text-sm">尚未建立任何公告</span>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="text-[11px] text-muted-foreground font-medium">標題</TableHead>
                                <TableHead className="text-[11px] text-muted-foreground font-medium w-[80px]">類型</TableHead>
                                <TableHead className="text-[11px] text-muted-foreground font-medium w-[90px]">狀態</TableHead>
                                <TableHead className="text-[11px] text-muted-foreground font-medium w-[80px]">目標</TableHead>
                                <TableHead className="text-[11px] text-muted-foreground font-medium w-[60px] text-right">優先度</TableHead>
                                <TableHead className="text-[11px] text-muted-foreground font-medium w-[140px]">開始</TableHead>
                                <TableHead className="text-[11px] text-muted-foreground font-medium w-[140px]">結束</TableHead>
                                <TableHead className="text-[11px] text-muted-foreground font-medium w-[160px] text-right">動作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {announcements.map((a) => {
                                const canViewResults = a.type === 'poll' || a.type === 'survey';
                                return (
                                    <TableRow key={a.id} className="hover:bg-accent/40">
                                        <TableCell className="text-[13px] text-foreground font-medium">
                                            <div className="line-clamp-1 max-w-[340px]">{a.title}</div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={`text-[10px] ${TYPE_COLOR[a.type]}`}>
                                                {TYPE_LABEL[a.type]}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={`text-[10px] ${STATUS_COLOR[a.status]}`}>
                                                {STATUS_LABEL[a.status]}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-[12px] text-muted-foreground">
                                            {SEGMENT_LABEL[a.target_segment]}
                                        </TableCell>
                                        <TableCell className="text-[12px] text-muted-foreground text-right tabular-nums">
                                            {a.priority}
                                        </TableCell>
                                        <TableCell className="text-[11px] text-muted-foreground tabular-nums">
                                            {formatTime(a.starts_at)}
                                        </TableCell>
                                        <TableCell className="text-[11px] text-muted-foreground tabular-nums">
                                            {formatTime(a.ends_at)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="inline-flex items-center gap-1">
                                                {canViewResults && (
                                                    <button
                                                        onClick={() => handleViewResults(a)}
                                                        className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                                        title="查看結果"
                                                    >
                                                        <BarChart3 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleEdit(a)}
                                                    className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                                    title="編輯"
                                                >
                                                    <Pencil className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => setDeleteTarget(a)}
                                                    className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                                    title="刪除"
                                                    disabled={deleteMutation.isPending}
                                                >
                                                    {deleteMutation.isPending && deleteTarget?.id === a.id ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    )}
                                                </button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </div>

            {/* Edit / Create Dialog */}
            <AnnouncementEditDialog
                open={editOpen}
                onOpenChange={setEditOpen}
                target={editTarget}
            />

            {/* Results Dialog */}
            <AnnouncementResultsDialog
                open={resultsOpen}
                onOpenChange={setResultsOpen}
                target={resultsTarget}
            />

            {/* Delete confirm */}
            <AlertDialog
                open={!!deleteTarget}
                onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>刪除公告?</AlertDialogTitle>
                        <AlertDialogDescription>
                            確定要刪除「{deleteTarget?.title}」?
                            <br />
                            <span className="text-amber-400">
                                所有相關的使用者回應(投票/問卷)也會一併刪除,且無法復原。
                            </span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmDelete}
                            className="bg-destructive hover:bg-destructive/90 text-white"
                            disabled={deleteMutation.isPending}
                        >
                            {deleteMutation.isPending ? (
                                <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />刪除中</>
                            ) : '確認刪除'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
