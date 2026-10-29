// 歌回 Tab — 社群修改紀錄（可還原）＋歌回影片列表 + 新增／編輯（SongVideoEditor）／刪除（公開頁 /songs 的資料來源）
// 社群投稿立即生效，不經審核；管理員事後從修改紀錄還原，或在編輯器鎖定單支歌回的社群編輯。
// 列表下方是「歌曲整理」（AdminSongLibrary）：合併／拆開／改名歌曲本體。
//
// 由後端 ADMIN_API_TOKEN（X-Admin-Token）把關，token 與其他後台分頁共用。
// active：這個分頁目前是否顯示。AdminDashboard 的分頁都 forceMount，編輯器裡的 YouTube 播放器只能在 active 時掛載。

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
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
import { SongVideoEditor } from './SongVideoEditor';
import { AdminSongLibrary } from './AdminSongLibrary';
import {
    SONG_PAGE_SIZES,
    SONG_STATUS_LABEL,
    type SongPageSize,
    formatSongError,
    formatSubmissionError,
    useAdminSongSubmissions,
    useAdminSongVideos,
    useDeleteSongVideo,
    useRevertSongEdit,
    type SongEditRecord,
    type SongVideoListItem,
} from '../hooks/useAdminSongs';
import { useVtuberNames } from '../../songs/streamLookup';
import { isUnauthorized } from '../hooks/useAdminSubmissions';

function formatDate(s: string | null | undefined): string {
    if (!s) return '—';
    return new Date(s).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** `YYYY-MM-DD`（瀏覽器本地日期）→ 當天 00:00 本地時間的 ISO；nextDay 取隔天，當作「不含」的上限讓迄日整天都算進去 */
function localDayToIso(day: string, nextDay = false): string {
    const d = new Date(`${day}T00:00:00`);
    if (nextDay) d.setDate(d.getDate() + 1);
    return d.toISOString();
}

const DATE_INPUT_CLASS = 'h-8 rounded-md border border-input bg-transparent dark:bg-input/30 px-2.5 text-[12px] text-foreground hover:bg-accent/40 transition-colors';
const PAGE_BUTTON_CLASS = 'w-7 h-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent/40 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors';

const EDIT_FIELD_LABEL: Record<string, string> = { title: '標題', vtuber_id: 'VTuber', streamed_at: '開台時間' };

/** 「新增 N 首」「修改 M 首」＋「改了標題／VTuber／開台時間」 */
function summarizeEdit(sub: SongEditRecord): string {
    const { added, changed, fields } = sub.summary;
    const parts: string[] = [];
    if (added > 0) parts.push(`新增 ${added} 首`);
    if (changed > 0) parts.push(`修改 ${changed} 首`);
    const labels = fields.map((f) => EDIT_FIELD_LABEL[f]).filter((l): l is string => !!l);
    if (labels.length > 0) parts.push(`改了${labels.join('／')}`);
    return parts.length > 0 ? parts.join('、') : '片段沒有變動';
}

export function AdminSongsTab({ active }: { active: boolean }) {
    const hasToken = useAdminTokenPresent();
    // 列表分頁與建立時間篩選（日期是 <input type="date"> 的 YYYY-MM-DD；改篩選或每頁筆數都回第 1 頁）
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<SongPageSize>(SONG_PAGE_SIZES[0]);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const listParams = useMemo(() => ({
        page,
        pageSize,
        ...(dateFrom ? { createdFrom: localDayToIso(dateFrom) } : {}),
        ...(dateTo ? { createdTo: localDayToIso(dateTo, true) } : {}),
    }), [page, pageSize, dateFrom, dateTo]);
    const query = useAdminSongVideos(listParams);
    const del = useDeleteSongVideo();
    const needToken = !hasToken || isUnauthorized(query.error);
    const videos = query.data?.videos ?? [];
    const total = query.data?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const filtered = !!(dateFrom || dateTo);
    const editLog = useAdminSongSubmissions();
    const edits = editLog.data ?? [];
    const revert = useRevertSongEdit();
    const names = useVtuberNames(videos.map((v) => v.vtuber_id).filter((id): id is string => !!id));

    /** null = 列表；{ id: null } = 新增；session 讓每次開編輯器都是全新 state */
    const [editing, setEditing] = useState<{ id: string | null; session: number } | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<SongVideoListItem | null>(null);
    const [revertTarget, setRevertTarget] = useState<SongEditRecord | null>(null);

    const openEditor = (id: string | null) => setEditing((cur) => ({ id, session: (cur?.session ?? 0) + 1 }));

    const handleConfirmRevert = async () => {
        if (!revertTarget) return;
        const id = revertTarget.id;
        try {
            await revert.mutateAsync(id);
            setRevertTarget((cur) => (cur?.id === id ? null : cur));
        } catch {
            // 錯誤顯示在 revert.error
        }
    };

    const handleConfirmDelete = async () => {
        if (!deleteTarget) return;
        const id = deleteTarget.id;
        try {
            await del.mutateAsync(id);
            setDeleteTarget((cur) => (cur?.id === id ? null : cur));
            // 刪掉的是這頁最後一筆：退回上一頁，免得停在空白頁
            if (videos.length === 1 && page > 1) setPage(page - 1);
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
                {query.data && <span className="text-[12px] text-muted-foreground">{total} 支</span>}
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

            {/* 社群修改紀錄：標題由使用者輸入，只以純文字顯示 */}
            {!needToken && (
                <section aria-labelledby="song-submissions-h" className="rounded-lg border border-border bg-card p-3">
                    <h3 id="song-submissions-h" className="text-[13px] font-semibold">社群修改紀錄{editLog.data ? `（最近 ${edits.length} 筆）` : ''}</h3>
                    {editLog.isError ? (
                        <p role="alert" className="mt-1 text-[12px] text-destructive">{formatSubmissionError(editLog.error)}</p>
                    ) : edits.length === 0 ? (
                        editLog.data && <p className="mt-1 text-[12px] text-muted-foreground">目前沒有社群修改紀錄</p>
                    ) : (
                        <ul className="mt-2 divide-y divide-border">
                            {edits.map((sub) => (
                                <li key={sub.id} className="flex flex-wrap items-center gap-2 py-1.5 text-[13px]">
                                    <span className={cn(
                                        'shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
                                        sub.kind === 'revision' ? 'border-sky-500/25 bg-sky-500/10 text-sky-400' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400',
                                    )}>
                                        {sub.kind === 'revision' ? '修正' : '新歌回'}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate">{sub.title}</span>
                                    <span className="shrink-0 text-[12px] text-muted-foreground">{summarizeEdit(sub)}</span>
                                    <span className="shrink-0 text-[12px] text-muted-foreground">{formatDate(sub.created_at)}</span>
                                    {sub.status === 'reverted' ? (
                                        <span className="shrink-0 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                                            已還原{sub.reverted_at ? `・${formatDate(sub.reverted_at)}` : ''}
                                        </span>
                                    ) : (
                                        <>
                                            <span className="shrink-0 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-400">已套用</span>
                                            <Button size="sm" variant="outline" className="h-7" onClick={() => setRevertTarget(sub)}>
                                                <RotateCcw className="size-3.5" />
                                                還原到這次之前
                                            </Button>
                                        </>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}

            {!needToken && (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] text-muted-foreground">建立時間</span>
                    <div className="flex items-center gap-1.5">
                        <input
                            type="date"
                            aria-label="建立時間起"
                            value={dateFrom}
                            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                            className={DATE_INPUT_CLASS}
                        />
                        <span className="text-muted-foreground text-[11px]">—</span>
                        <input
                            type="date"
                            aria-label="建立時間迄"
                            value={dateTo}
                            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                            className={DATE_INPUT_CLASS}
                        />
                    </div>
                    <Button size="sm" variant="ghost" className="h-8" disabled={!filtered} onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}>
                        清除
                    </Button>
                    <div className="ml-auto flex items-center gap-1.5">
                        <span className="text-[12px] text-muted-foreground">每頁</span>
                        <Select value={String(pageSize)} onValueChange={(v: string) => { setPageSize(Number(v) as SongPageSize); setPage(1); }}>
                            <SelectTrigger aria-label="每頁筆數" className="h-8 w-[84px] rounded-md text-[12px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {SONG_PAGE_SIZES.map((n) => (
                                    <SelectItem key={n} value={String(n)} className="text-[12px]">{n} 筆</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            )}

            {query.isLoading ? (
                <p className="text-sm text-muted-foreground">載入中…</p>
            ) : query.isError ? (
                needToken ? null : <p role="alert" className="text-sm text-destructive">{formatSongError(query.error)}</p>
            ) : videos.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                    {filtered ? '這個時間範圍內沒有歌回' : '還沒有歌回，按「新增歌回」開始'}
                </p>
            ) : (
                <>
                <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full min-w-[840px] text-sm">
                        <thead className="bg-muted/40 text-[12px] text-muted-foreground">
                            <tr>
                                <th className="px-3 py-2 text-left font-medium">影片標題</th>
                                <th className="px-3 py-2 text-left font-medium">VTuber</th>
                                <th className="px-3 py-2 text-left font-medium">狀態</th>
                                <th className="px-3 py-2 text-right font-medium">片段</th>
                                <th className="px-3 py-2 text-left font-medium">開台時間</th>
                                <th className="px-3 py-2 text-left font-medium">建立時間</th>
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
                                    <td className="px-3 py-2 text-[12px] text-muted-foreground">{formatDate(v.created_at)}</td>
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
                <div className="flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground tabular-nums">共 {total} 支・第 {page} / {totalPages} 頁</p>
                    <div className="flex gap-1">
                        <button type="button" aria-label="上一頁" title="上一頁" disabled={page <= 1} onClick={() => setPage(page - 1)} className={PAGE_BUTTON_CLASS}>
                            <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button type="button" aria-label="下一頁" title="下一頁" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className={PAGE_BUTTON_CLASS}>
                            <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                    </div>
                </div>
                </>
            )}

            {!needToken && <AdminSongLibrary />}

            <AlertDialog open={!!revertTarget} onOpenChange={(o) => { if (!o) { setRevertTarget(null); revert.reset(); } }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>還原到這次修改之前？</AlertDialogTitle>
                        <AlertDialogDescription>
                            「{revertTarget?.title}」會回到這次修改之前的內容；這次之後對這支歌回的修改也會一併還原，無法復原。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {revert.error && <p role="alert" className="text-[13px] text-destructive">{formatSubmissionError(revert.error)}</p>}
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={revert.isPending}
                            onClick={(e) => { e.preventDefault(); void handleConfirmRevert(); }}
                            className="bg-destructive text-white hover:bg-destructive/90"
                        >
                            {revert.isPending ? '還原中…' : '確定還原'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

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
