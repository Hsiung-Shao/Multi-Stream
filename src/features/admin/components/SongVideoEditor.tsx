// 歌回編輯器：貼 YouTube 網址 → 嵌入播放器 → 逐首「設為目前時間」或貼時間軸文字匯入 → 即時驗證 → 存草稿或發布。
// 也用來審核社群投稿（reviewId）：以投稿內容預填，修正型先對回既有片段的 id／code 並標出新增／改動／刪除，
// 按「核准並發布」或「駁回」。
//
// - 播放器只在 playerEnabled（歌回分頁啟用中）時掛載：AdminDashboard 的分頁都 forceMount，切走仍會留著，
//   隱藏的播放器繼續播違反 YouTube 嵌入政策，所以切走一定要卸載。
// - 片段表格與時間軸匯入是共用元件 SegmentEditor（投稿頁也用）；驗證規則與伺服器同一套（validateSegments）。
// - 既有片段帶 id 送出，伺服器依 id 原地更新、保住分享用的 code；新列不帶 id，code 由資料庫產生。
// - 會讓 code 失效的操作（取代、刪除已存檔片段、核准會刪掉舊片段的修正）先確認。
// - 存檔中可隨時返回列表（不 disable），卡住時不會被困住（memory error_dialog_mutation_reset）。
// - 投稿者填的標題、來源說明、聯絡方式一律以純文字節點顯示，不轉成連結（javascript: URL 會變 XSS）。
// - 版本備註（version_note）存檔／核准都帶；歌名或原唱變動後 600ms 呼叫配對預覽（admin_match_songs），
//   在每列顯示「已配對／新歌曲／新歌曲・同名」，提醒管理員存檔後會配到哪首歌。

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
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
import { extractVideoId } from '../../songs/lib/youtubeUrl';
import { mergePrefill } from '../../songs/lib/streamPrefill';
import { formatTimecode, parseTimecode } from '../../songs/lib/timecode';
import { mergeReplaceRows } from '../../songs/lib/timelineMerge';
import { fetchStreamByVideoId } from '../../songs/streamLookup';
import { PreviewPlayer, type PreviewApi } from '../../songs/components/PreviewPlayer';
import { VtuberPicker } from '../../songs/components/VtuberPicker';
import { SegmentEditor, type RowDiff } from '../../songs/components/SegmentEditor';
import {
    computeRowIssues, fromImported, rowSeconds, type ImportedRow, type RowIssueCode, type SegmentRowDraft,
} from '../../songs/components/segmentRows';
import {
    SONG_STATUS_LABEL,
    formatSongError,
    formatSubmissionError,
    segmentIssuesFromError,
    useAdminSongSubmission,
    useAdminSongVideo,
    useApproveSongSubmission,
    useRejectSongSubmission,
    useSaveSongVideo,
    type SongSegmentInput,
    type SongSegmentRecord,
    type SongVideoStatus,
    type SongVideoWriteInput,
} from '../hooks/useAdminSongs';
import { toSegmentMatch, useSongMatch, type SongMatchItem } from '../hooks/useAdminSongLibrary';
import type { SegmentMatch } from '../../songs/components/SegmentEditor';

/** 配對預覽的 debounce（ms） */
const MATCH_DEBOUNCE_MS = 600;
/** admin_match_songs 一次最多 200 項 */
const MATCH_ITEMS_MAX = 200;

const fromRecord = (s: SongSegmentRecord): SegmentRowDraft => ({
    key: s.id,
    id: s.id,
    code: s.code,
    start: formatTimecode(s.start_seconds),
    end: formatTimecode(s.end_seconds),
    title: s.title,
    artist: s.original_artist ?? '',
    note: s.version_note ?? '',
});

/** ISO → <input type="datetime-local"> 的本地時間字串 */
function toLocalInput(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const toSegmentInputs = (rows: SegmentRowDraft[]): SongSegmentInput[] =>
    rows.map((r) => {
        const { start, end } = rowSeconds(r);
        return {
            ...(r.id ? { id: r.id } : {}),
            start_seconds: start,
            end_seconds: end,
            title: r.title.trim(),
            original_artist: r.artist.trim() || null,
            version_note: r.note.trim() || null,
        };
    });

/** 配對預覽的請求內容：沒填歌名的列不送；keys 與 items 一一對應（回應依 items 順序） */
function matchRequest(rows: SegmentRowDraft[]): { keys: string[]; items: SongMatchItem[] } {
    const keys: string[] = [];
    const items: SongMatchItem[] = [];
    for (const r of rows) {
        const title = r.title.trim();
        if (!title) continue;
        if (items.length >= MATCH_ITEMS_MAX) break;
        keys.push(r.key);
        items.push({ ...(r.id ? { segment_id: r.id } : {}), title, original_artist: r.artist.trim() || null });
    }
    return { keys, items };
}

/** 取代時對回舊片段的 id／code（開始時間相同才算同一首） */
function mergeWithExisting(current: SegmentRowDraft[], imported: ImportedRow[]): { rows: SegmentRowDraft[]; lostCodes: string[] } {
    const existing = current.map((r) => ({ id: r.id, code: r.code, start: parseTimecode(r.start) ?? -1, note: r.note }));
    const { rows: merged, lostCodes } = mergeReplaceRows(existing, imported);
    return {
        rows: merged.map((m, i) => fromImported({ ...m, end: imported[i].end, endEstimated: imported[i].endEstimated })),
        lostCodes,
    };
}

export function SongVideoEditor({ id, reviewId = null, playerEnabled, onClose, onSaved }: {
    /** null = 新增（或審核投稿） */
    id: string | null;
    /** 審核中的投稿 id */
    reviewId?: string | null;
    playerEnabled: boolean;
    onClose: () => void;
    onSaved: (id: string) => void;
}) {
    const reviewing = !!reviewId;
    const detail = useAdminSongVideo(reviewing ? null : id);
    const submission = useAdminSongSubmission(reviewId);
    const save = useSaveSongVideo();
    const approve = useApproveSongSubmission();
    const reject = useRejectSongSubmission();

    const [url, setUrl] = useState('');
    const [title, setTitle] = useState('');
    const [vtuberId, setVtuberId] = useState<string | null>(null);
    const [streamedAt, setStreamedAt] = useState('');
    const [durationText, setDurationText] = useState('');
    const [status, setStatus] = useState<SongVideoStatus>('draft');
    const [rows, setRows] = useState<SegmentRowDraft[]>([]);
    const [savedNote, setSavedNote] = useState<string | null>(null);
    const [rejectNotes, setRejectNotes] = useState('');
    const loadedIdRef = useRef<string | null>(null);
    const [player, setPlayer] = useState<PreviewApi | null>(null);

    // 載入既有資料（每個 id 只灌一次，之後以編輯中的內容為準）
    useEffect(() => {
        if (reviewing || !id || !detail.data || loadedIdRef.current === id) return;
        loadedIdRef.current = id;
        const { video, segments } = detail.data;
        setUrl(video.video_id);
        setTitle(video.title);
        setVtuberId(video.vtuber_id);
        setStreamedAt(toLocalInput(video.streamed_at));
        setDurationText(video.duration_seconds ? formatTimecode(video.duration_seconds) : '');
        setStatus(video.status);
        setRows(segments.map(fromRecord));
    }, [reviewing, id, detail.data]);

    // 審核：以投稿內容預填；修正型先對回既有片段的 id／code，影片欄位沿用原歌回（不被投稿覆寫長度、草稿狀態）
    const existing = submission.data?.existing ?? null;
    const existingVideo = submission.data?.existingVideo ?? null;
    useEffect(() => {
        if (!reviewId || !submission.data || loadedIdRef.current === `review:${reviewId}`) return;
        loadedIdRef.current = `review:${reviewId}`;
        const s = submission.data.submission;
        const ev = submission.data.existingVideo;
        setUrl(s.video_id);
        setTitle(ev ? ev.title : s.title);
        setVtuberId(ev ? ev.vtuber_id : s.vtuber_id);
        setStreamedAt(toLocalInput(ev ? ev.streamed_at : s.streamed_at));
        setDurationText(ev?.duration_seconds ? formatTimecode(ev.duration_seconds) : '');
        setStatus(ev ? ev.status : 'published');
        const imported: ImportedRow[] = (s.segments ?? []).map((seg, line) => ({
            start: seg.start, end: seg.end, title: seg.title, artist: seg.artist, endEstimated: seg.endEstimated, note: seg.versionNote ?? null, line,
        }));
        const base = (submission.data.existing ?? []).map(fromRecord);
        setRows(base.length > 0 ? mergeWithExisting(base, imported).rows : imported.map(fromImported));
    }, [reviewId, submission.data]);

    const videoId = extractVideoId(url);

    // 新增模式貼上網址：到週表找同一場直播，只補還空著的 VTuber／標題／開台時間（不覆蓋已填的）
    const [prefillNote, setPrefillNote] = useState<string | null>(null);
    const latestFieldsRef = useRef({ title, vtuberId, streamedAt });
    useEffect(() => {
        latestFieldsRef.current = { title, vtuberId, streamedAt };
    }, [title, vtuberId, streamedAt]);
    useEffect(() => {
        setPrefillNote(null);
        if (id || reviewing || !videoId) return;
        const ctrl = new AbortController();
        fetchStreamByVideoId(videoId, ctrl.signal)
            .then((found) => {
                if (ctrl.signal.aborted || !found) return;
                const cur = latestFieldsRef.current;
                const current = { title: cur.title, vtuberId: cur.vtuberId, streamedAt: cur.streamedAt || null };
                const merged = mergePrefill(current, found);
                const filled: string[] = [];
                if (merged.title !== current.title) { setTitle(merged.title); filled.push('標題'); }
                if (merged.vtuberId !== current.vtuberId) { setVtuberId(merged.vtuberId); filled.push('VTuber'); }
                if (merged.streamedAt !== current.streamedAt && merged.streamedAt) {
                    setStreamedAt(toLocalInput(merged.streamedAt));
                    filled.push('開台時間');
                }
                if (filled.length > 0) setPrefillNote(`已從週表帶入：${filled.join('、')}（請確認）`);
            })
            .catch(() => { /* 找不到或查詢失敗：手動填即可 */ });
        return () => ctrl.abort();
    }, [id, reviewing, videoId]);

    const duration = durationText.trim() ? parseTimecode(durationText) : null;
    const durationInvalid = durationText.trim() !== '' && (duration === null || duration <= 0);
    const rowIssues = useMemo(() => computeRowIssues(rows, durationInvalid ? null : duration), [rows, duration, durationInvalid]);

    // 伺服器回的 invalid_segments 問題（index 為送出順序 = rows 順序）；前端即時驗證有問題的列以前端為準
    const mutationError = save.error ?? approve.error;
    const displayIssues = useMemo(() => {
        const map = new Map<number, RowIssueCode[]>(rowIssues);
        for (const i of segmentIssuesFromError(mutationError)) {
            if (!rowIssues.has(i.index)) map.set(i.index, [...(map.get(i.index) ?? []), i.code]);
        }
        return map;
    }, [rowIssues, mutationError]);

    // 審核修正型：每列對既有片段的差異（新增／改動），以及會被刪掉的既有片段
    const existingById = useMemo(() => new Map((existing ?? []).map((e) => [e.id, e])), [existing]);
    const diff = useMemo(() => {
        if (!reviewing || !existing) return undefined;
        const map = new Map<string, RowDiff>();
        for (const r of rows) {
            const old = r.id ? existingById.get(r.id) : undefined;
            if (!old) { map.set(r.key, 'new'); continue; }
            const { start, end } = rowSeconds(r);
            if (
                start !== old.start_seconds || end !== old.end_seconds || r.title.trim() !== old.title
                || (r.artist.trim() || null) !== old.original_artist || (r.note.trim() || null) !== (old.version_note ?? null)
            ) {
                map.set(r.key, 'changed');
            }
        }
        return map;
    }, [reviewing, existing, existingById, rows]);
    const removedExisting = useMemo(() => {
        if (!reviewing || !existing) return [];
        const kept = new Set(rows.map((r) => r.id).filter(Boolean));
        return existing.filter((e) => !kept.has(e.id));
    }, [reviewing, existing, rows]);

    // 配對預覽：歌名／原唱停止變動 600ms 後才查（簽章字串不含備註，改備註不會重查）
    const matchSig = useMemo(() => JSON.stringify(matchRequest(rows)), [rows]);
    const [debouncedMatchSig, setDebouncedMatchSig] = useState<string | null>(null);
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedMatchSig(matchSig), MATCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [matchSig]);
    const matchReq = useMemo(
        () => (debouncedMatchSig ? (JSON.parse(debouncedMatchSig) as ReturnType<typeof matchRequest>) : null),
        [debouncedMatchSig],
    );
    const match = useSongMatch(matchReq?.items ?? null);
    const matchInfo = useMemo(() => {
        if (!matchReq || !match.data) return undefined;
        const map = new Map<string, SegmentMatch>();
        matchReq.keys.forEach((key, i) => {
            const r = match.data[i];
            if (r) map.set(key, toSegmentMatch(r));
        });
        return map;
    }, [matchReq, match.data]);

    const titleOk = title.trim().length >= 1 && title.trim().length <= 200;
    const busy = save.isPending || approve.isPending || reject.isPending;
    // 審核核准至少要有一首（投稿本身就至少一首；管理員刪光就改用駁回）
    const canSave = !!videoId && titleOk && !durationInvalid && rowIssues.size === 0 && !busy && (!reviewing || rows.length > 0);

    const clearMutationErrors = () => {
        if (save.error) save.reset();
        if (approve.error) approve.reset();
    };

    /** 會讓已存檔片段的 code 失效的操作，先確認（分享連結與使用者歌單裡的這些歌會變成「已下架」） */
    const [pendingLoss, setPendingLoss] = useState<{ count: number; apply: () => void } | null>(null);

    const removeRow = (key: string) => {
        const target = rows.find((r) => r.key === key);
        const apply = () => setRows((rs) => rs.filter((r) => r.key !== key));
        if (target?.code) setPendingLoss({ count: 1, apply });
        else apply();
    };

    const replaceRows = (imported: ImportedRow[]) => {
        const { rows: merged, lostCodes } = mergeWithExisting(rows, imported);
        const apply = () => setRows(merged);
        if (lostCodes.length > 0) setPendingLoss({ count: lostCodes.length, apply });
        else apply();
    };

    const videoFields = (): Omit<SongVideoWriteInput, 'segments'> | null => {
        if (!videoId) return null;
        return {
            video_id: videoId,
            title: title.trim(),
            vtuber_id: vtuberId,
            streamed_at: streamedAt ? new Date(streamedAt).toISOString() : null,
            duration_seconds: duration,
            status,
        };
    };

    const handleSave = async () => {
        const video = videoFields();
        if (!video || !canSave) return;
        setSavedNote(null);
        try {
            const result = await save.mutateAsync({ id, input: { ...video, segments: toSegmentInputs(rows) } });
            loadedIdRef.current = result.video.id;
            setRows(result.segments.map(fromRecord));
            setStatus(result.video.status);
            setSavedNote(
                result.video.status === 'published'
                    ? `已儲存並發布（${result.segments.length} 首）。公開目錄有 10 分鐘快取，最晚 10 分鐘後出現在 /songs。`
                    : `已存成草稿（${result.segments.length} 首）。草稿不會出現在公開目錄。`,
            );
            onSaved(result.video.id);
        } catch {
            // 錯誤顯示在 save.error
        }
    };

    const doApprove = async () => {
        const video = videoFields();
        if (!reviewId || !video) return;
        try {
            const result = await approve.mutateAsync({
                id: reviewId,
                input: { video_ref: submission.data?.submission.target_video_ref ?? null, video, segments: toSegmentInputs(rows) },
            });
            onSaved(result.video_ref);
            onClose();
        } catch {
            // 錯誤顯示在 approve.error
        }
    };
    const handleApprove = () => {
        if (!canSave) return;
        if (removedExisting.length > 0) setPendingLoss({ count: removedExisting.length, apply: () => void doApprove() });
        else void doApprove();
    };
    const handleReject = async () => {
        if (!reviewId) return;
        try {
            await reject.mutateAsync({ id: reviewId, notes: rejectNotes.trim() || null });
            onClose();
        } catch {
            // 錯誤顯示在 reject.error
        }
    };

    const loading = reviewing ? submission.isLoading : !!id && detail.isLoading;
    const loadError = reviewing ? (submission.isError ? submission.error : null) : (id && detail.isError ? detail.error : null);
    if (loading) return <p className="text-sm text-muted-foreground">載入中…</p>;
    if (loadError) {
        return (
            <div className="space-y-3">
                <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="size-3.5" />返回列表</Button>
                <p role="alert" className="text-sm text-destructive">{reviewing ? formatSubmissionError(loadError) : formatSongError(loadError)}</p>
            </div>
        );
    }

    const sub = submission.data?.submission;
    // 修正型但原歌回已被刪除（target_video_ref、existing 都是 null）：當新增處理
    const orphanRevision = sub?.kind === 'revision' && !sub.target_video_ref;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onClose}>
                    <ArrowLeft className="size-3.5" />
                    返回列表
                </Button>
                <h2 className="text-[15px] font-semibold">
                    {reviewing ? (sub?.kind === 'revision' && !orphanRevision ? '審核投稿（修正既有時間軸）' : '審核投稿（新歌回）') : id ? '編輯歌回' : '新增歌回'}
                </h2>
                {videoId && (
                    <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
                        在 YouTube 開啟 <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                )}
            </div>

            {reviewing && sub && (
                <div className="rounded-lg border border-violet-500/30 bg-violet-500/[0.06] p-3 text-[13px]">
                    <p className="text-muted-foreground">投稿時間 {new Date(sub.created_at).toLocaleString('zh-TW')}・{sub.segments?.length ?? 0} 首（以下表格已預填，可微調後核准）</p>
                    {/* 使用者輸入：純文字節點，不轉連結 */}
                    <p className="mt-1.5"><span className="text-muted-foreground">來源說明：</span><span className="whitespace-pre-wrap break-words">{sub.source_note || '（未填）'}</span></p>
                    <p className="mt-0.5"><span className="text-muted-foreground">聯絡方式：</span><span className="break-all">{sub.submitter_contact || '（未填）'}</span></p>
                    {existingVideo && sub.title !== existingVideo.title && (
                        <p className="mt-0.5"><span className="text-muted-foreground">投稿者填的標題：</span><span className="break-words">{sub.title}</span></p>
                    )}
                    {existingVideo?.status === 'draft' && <p className="mt-1.5 text-muted-foreground">原歌回是草稿，核准後仍維持草稿。</p>}
                    {orphanRevision && <p className="mt-1.5 text-amber-600 dark:text-amber-400">原歌回已刪除，核准會新建一支歌回。</p>}
                    {removedExisting.length > 0 && (
                        <p className="mt-1.5 text-destructive">
                            核准後會刪除 {removedExisting.length} 首既有片段（分享連結會失效）：{removedExisting.map((e) => `${e.title}（${e.code}）`).join('、')}
                        </p>
                    )}
                </div>
            )}

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                {/* 左：網址＋播放器 */}
                <div className="space-y-2">
                    <Label htmlFor="song-url">YouTube 網址或影片 ID</Label>
                    <Input
                        id="song-url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                        disabled={!!id || reviewing}
                        aria-invalid={url.trim() !== '' && !videoId}
                    />
                    {url.trim() !== '' && !videoId && <p className="text-[12px] text-destructive">看不出影片 ID，支援 watch、youtu.be、live、shorts 網址</p>}
                    {id && <p className="text-[12px] text-muted-foreground">已建立的歌回不能改影片；要換影片請刪除後重建。</p>}
                    {prefillNote && <p role="status" className="text-[12px] text-emerald-500">{prefillNote}</p>}
                    {videoId && playerEnabled ? (
                        <PreviewPlayer
                            key={videoId}
                            videoId={videoId}
                            onApi={setPlayer}
                            onDuration={(d) => setDurationText((cur) => (cur.trim() ? cur : formatTimecode(Math.ceil(d))))}
                        />
                    ) : (
                        <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-border text-[13px] text-muted-foreground">
                            {videoId ? '播放器已暫停（切回歌回分頁時重新載入）' : '貼上網址後會出現播放器'}
                        </div>
                    )}
                </div>

                {/* 右：影片欄位 */}
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="song-title">歌回標題</Label>
                        <Input id="song-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-invalid={title !== '' && !titleOk} />
                    </div>
                    <div className="space-y-1.5">
                        <Label>VTuber</Label>
                        <VtuberPicker value={vtuberId} onChange={setVtuberId} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="song-streamed">開台時間</Label>
                            <Input id="song-streamed" type="datetime-local" value={streamedAt} onChange={(e) => setStreamedAt(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="song-duration">影片長度</Label>
                            <Input id="song-duration" value={durationText} onChange={(e) => setDurationText(e.target.value)} placeholder="1:23:45（播放器會自動帶入）" aria-invalid={durationInvalid} />
                            {durationInvalid && <p className="text-[12px] text-destructive">時間格式錯誤</p>}
                        </div>
                    </div>
                    {!reviewing && (
                        <div className="space-y-1.5">
                            <Label>狀態</Label>
                            <Select value={status} onValueChange={(v: string) => setStatus(v as SongVideoStatus)}>
                                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {(Object.keys(SONG_STATUS_LABEL) as SongVideoStatus[]).map((s) => <SelectItem key={s} value={s}>{SONG_STATUS_LABEL[s]}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
            </div>

            <SegmentEditor
                rows={rows}
                onRowsChange={setRows}
                issues={displayIssues}
                player={player}
                duration={durationInvalid ? null : duration}
                onReplace={replaceRows}
                onRemoveRow={removeRow}
                onEdit={clearMutationErrors}
                showCode
                diff={diff}
                matchInfo={matchInfo}
            />

            {reviewing ? (
                <div className="space-y-3 border-t border-border pt-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <Button onClick={handleApprove} disabled={!canSave}>
                            {approve.isPending ? '核准中…' : '核准並發布'}
                        </Button>
                        <Button variant="ghost" onClick={onClose}>返回列表</Button>
                        <p className="text-[12px] text-muted-foreground">公開目錄有 10 分鐘快取，核准後最晚 10 分鐘出現。</p>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-[260px] flex-1 space-y-1.5">
                            <Label htmlFor="song-reject-notes">駁回理由（選填，最多 500 字，只存在後台）</Label>
                            <Textarea id="song-reject-notes" rows={2} maxLength={500} value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} />
                        </div>
                        <Button variant="outline" className="text-destructive" onClick={() => void handleReject()} disabled={busy}>
                            {reject.isPending ? '駁回中…' : '駁回'}
                        </Button>
                    </div>
                    {approve.error && <p role="alert" className="text-sm text-destructive">{formatSubmissionError(approve.error)}</p>}
                    {reject.error && <p role="alert" className="text-sm text-destructive">{formatSubmissionError(reject.error)}</p>}
                </div>
            ) : (
                <>
                    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
                        <Button onClick={() => void handleSave()} disabled={!canSave}>
                            {save.isPending ? '儲存中…' : status === 'published' ? '儲存並發布' : '存成草稿'}
                        </Button>
                        <Button variant="ghost" onClick={onClose}>返回列表</Button>
                        <p className="text-[12px] text-muted-foreground">公開目錄有 10 分鐘快取，發布後最晚 10 分鐘出現。</p>
                    </div>
                    {save.error && <p role="alert" className="text-sm text-destructive">{formatSongError(save.error)}</p>}
                    {savedNote && <p role="status" className="text-sm text-emerald-500">{savedNote}</p>}
                </>
            )}

            <AlertDialog open={!!pendingLoss} onOpenChange={(o) => { if (!o) setPendingLoss(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>確定要移除已存檔的片段？</AlertDialogTitle>
                        <AlertDialogDescription>
                            {pendingLoss?.count ?? 0} 首歌的分享連結與使用者歌單會失效（儲存後這些歌會變成「已下架」）。開始時間沒變的片段會保留原本的 code。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-white hover:bg-destructive/90"
                            onClick={() => {
                                pendingLoss?.apply();
                                setPendingLoss(null);
                            }}
                        >
                            確定移除
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
