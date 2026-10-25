// 歌回 Tab — 歌回影片列表 + 新增／編輯（SongVideoEditor）／刪除（公開頁 /songs 的資料來源）
//
// 由後端 ADMIN_API_TOKEN（X-Admin-Token）把關，token 與其他後台分頁共用。
// active：這個分頁目前是否顯示。AdminDashboard 的分頁都 forceMount，編輯器裡的 YouTube 播放器只能在 active 時掛載。

import { useState } from 'react';
import { ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
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
import { SongVideoEditor } from './SongVideoEditor';
import {
    SONG_STATUS_LABEL,
    formatSongError,
    useAdminSongVideos,
    useDeleteSongVideo,
    useVtuberNames,
    type SongVideoListItem,
} from '../hooks/useAdminSongs';
import { isUnauthorized } from '../hooks/useAdminSubmissions';

function formatDate(s: string | null | undefined): string {
    if (!s) return '—';
    return new Date(s).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function AdminSongsTab({ active }: { active: boolean }) {
    const hasToken = useAdminTokenPresent();
    const query = useAdminSongVideos();
    const del = useDeleteSongVideo();
    const needToken = !hasToken || isUnauthorized(query.error);
    const videos = query.data ?? [];
    const names = useVtuberNames(videos.map((v) => v.vtuber_id).filter((id): id is string => !!id));

    /** null = 列表；{ id: null } = 新增；session 讓每次開編輯器都是全新 state */
    const [editing, setEditing] = useState<{ id: string | null; session: number } | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<SongVideoListItem | null>(null);

    const openEditor = (id: string | null) => setEditing((cur) => ({ id, session: (cur?.session ?? 0) + 1 }));

    const handleConfirmDelete = async () => {
        if (!deleteTarget) return;
        const id = deleteTarget.id;
        try {
            await del.mutateAsync(id);
            setDeleteTarget((cur) => (cur?.id === id ? null : cur));
        } catch {
            // 錯誤顯示在 del.error
        }
    };

    if (editing) {
        return (
            <SongVideoEditor
                key={editing.session}
                id={editing.id}
                playerEnabled={active}
                onClose={() => setEditing(null)}
                onSaved={(id) => setEditing((cur) => (cur ? { ...cur, id } : cur))}
            />
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-semibold">歌回</h2>
                {query.data && <span className="text-[12px] text-muted-foreground">{videos.length} 支</span>}
                <a href="/songs" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
                    查看公開頁 <ExternalLink className="size-3" aria-hidden="true" />
                </a>
                <span className="text-[12px] text-muted-foreground">公開目錄有 10 分鐘快取，發布後最晚 10 分鐘出現。</span>
                <Button size="sm" className="ml-auto" onClick={() => openEditor(null)} disabled={needToken}>
                    <Plus className="size-3.5" />
                    新增歌回
                </Button>
            </div>

            {needToken && <AdminTokenInline />}

            {query.isLoading ? (
                <p className="text-sm text-muted-foreground">載入中…</p>
            ) : query.isError ? (
                needToken ? null : <p role="alert" className="text-sm text-destructive">{formatSongError(query.error)}</p>
            ) : videos.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">還沒有歌回，按「新增歌回」開始</p>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full min-w-[720px] text-sm">
                        <thead className="bg-muted/40 text-[12px] text-muted-foreground">
                            <tr>
                                <th className="px-3 py-2 text-left font-medium">影片標題</th>
                                <th className="px-3 py-2 text-left font-medium">VTuber</th>
                                <th className="px-3 py-2 text-left font-medium">狀態</th>
                                <th className="px-3 py-2 text-right font-medium">片段</th>
                                <th className="px-3 py-2 text-left font-medium">開台時間</th>
                                <th className="w-24 px-3 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {videos.map((v) => (
                                <tr key={v.id} className="border-t border-border">
                                    <td className="max-w-[320px] px-3 py-2">
                                        <p className="truncate font-medium">{v.title}</p>
                                        <p className="font-mono text-[11px] text-muted-foreground">{v.video_id}</p>
                                    </td>
                                    <td className="px-3 py-2 text-[13px]">{v.vtuber_id ? (names.data?.get(v.vtuber_id)?.name ?? '…') : '—'}</td>
                                    <td className="px-3 py-2">
                                        <span className={cn(
                                            'rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
                                            v.status === 'published' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400' : 'border-border bg-muted text-muted-foreground',
                                        )}>
                                            {SONG_STATUS_LABEL[v.status]}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums">{v.segment_count}</td>
                                    <td className="px-3 py-2 text-[12px] text-muted-foreground">{formatDate(v.streamed_at)}</td>
                                    <td className="px-3 py-2">
                                        <div className="flex justify-end gap-0.5">
                                            <Button variant="ghost" size="icon" className="size-8" title="編輯" aria-label={`編輯「${v.title}」`} onClick={() => openEditor(v.id)}>
                                                <Pencil className="size-3.5" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" title="刪除" aria-label={`刪除「${v.title}」`} onClick={() => setDeleteTarget(v)}>
                                                <Trash2 className="size-3.5" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); del.reset(); } }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>刪除這支歌回？</AlertDialogTitle>
                        <AlertDialogDescription>
                            「{deleteTarget?.title}」與它的 {deleteTarget?.segment_count ?? 0} 個片段會一起刪除，無法復原；使用者歌單與分享連結裡的這些歌會變成「已下架」。只是暫時不公開的話，建議改成草稿。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {del.error && <p role="alert" className="text-[13px] text-destructive">{formatSongError(del.error)}</p>}
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
