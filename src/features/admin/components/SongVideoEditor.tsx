// 歌回編輯器：貼 YouTube 網址 → 嵌入播放器 → 逐首「設為目前時間」或貼時間軸文字匯入 → 即時驗證 → 存草稿或發布。
// 社群投稿立即生效、不經審核；編輯既有歌回時可「鎖定社群編輯」（開關，切換即送出），事後還原在歌回分頁的修改紀錄。
//
// - 播放器只在 playerEnabled（歌回分頁啟用中）時掛載：AdminDashboard 的分頁都 forceMount，切走仍會留著，
//   隱藏的播放器繼續播違反 YouTube 嵌入政策，所以切走一定要卸載。
// - 片段表格與時間軸匯入是共用元件 SegmentEditor（投稿頁也用）；驗證規則與伺服器同一套（validateSegments）。
// - 既有片段帶 id 送出，伺服器依 id 原地更新、保住分享用的 code；新列不帶 id，code 由資料庫產生。
// - 會讓 code 失效的操作（取代、刪除已存檔片段）先確認。
// - 存檔中可隨時返回列表（不 disable），卡住時不會被困住（memory error_dialog_mutation_reset）。
// - 版本備註（version_note）存檔時一併帶；歌名或原唱變動後 600ms 呼叫配對預覽（admin_match_songs），
//   在每列顯示「已配對／新歌曲／新歌曲・同名」，提醒管理員存檔後會配到哪首歌。

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Switch } from '../../../components/ui/switch';
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
import { SegmentEditor } from '../../songs/components/SegmentEditor';
import {
    computeRowIssues, fromImported, rowSeconds, type ImportedRow, type RowIssueCode, type SegmentRowDraft,
} from '../../songs/components/segmentRows';
import {
    SONG_STATUS_LABEL,
    formatSongError,
    segmentIssuesFromError,
    useAdminSongVideo,
    useLockSongVideo,
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

export function SongVideoEditor({ id, playerEnabled, onClose, onSaved }: {
    /** null = 新增 */
    id: string | null;
    playerEnabled: boolean;
    onClose: () => void;
    onSaved: (id: string) => void;
}) {
    const detail = useAdminSongVideo(id);
    const save = useSaveSongVideo();
    const lock = useLockSongVideo();

    const [url, setUrl] = useState('');
    const [title, setTitle] = useState('');
    const [vtuberId, setVtuberId] = useState<string | null>(null);
    const [streamedAt, setStreamedAt] = useState('');
    const [durationText, setDurationText] = useState('');
    const [status, setStatus] = useState<SongVideoStatus>('draft');
    const [rows, setRows] = useState<SegmentRowDraft[]>([]);
    const [savedNote, setSavedNote] = useState<string | null>(null);
    const [locked, setLocked] = useState(false);
    const [lockError, setLockError] = useState<string | null>(null);
    const loadedIdRef = useRef<string | null>(null);
    const [player, setPlayer] = useState<PreviewApi | null>(null);

    // 載入既有資料（每個 id 只灌一次，之後以編輯中的內容為準）
    useEffect(() => {
        if (!id || !detail.data || loadedIdRef.current === id) return;
        loadedIdRef.current = id;
        const { video, segments } = detail.data;
        setUrl(video.video_id);
        setTitle(video.title);
        setVtuberId(video.vtuber_id);
        setStreamedAt(toLocalInput(video.streamed_at));
        setDurationText(video.duration_seconds ? formatTimecode(video.duration_seconds) : '');
        setStatus(video.status);
        setLocked(!!video.community_locked);
        setRows(segments.map(fromRecord));
    }, [id, detail.data]);

    /** 切換即送出；失敗退回原狀態並顯示錯誤 */
    const handleLockChange = (next: boolean) => {
        if (!id) return;
        const prev = locked;
        setLocked(next);
        setLockError(null);
        lock.mutate({ videoRef: id, locked: next }, {
            onError: (e) => {
                setLocked(prev);
                setLockError(formatSongError(e));
            },
        });
    };

    const videoId = extractVideoId(url);

    // 新增模式貼上網址：到週表找同一場直播，只補還空著的 VTuber／標題／開台時間（不覆蓋已填的）
    const [prefillNote, setPrefillNote] = useState<string | null>(null);
    const latestFieldsRef = useRef({ title, vtuberId, streamedAt });
    useEffect(() => {
        latestFieldsRef.current = { title, vtuberId, streamedAt };
    }, [title, vtuberId, streamedAt]);
    useEffect(() => {
        setPrefillNote(null);
        if (id || !videoId) return;
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
    }, [id, videoId]);

    const duration = durationText.trim() ? parseTimecode(durationText) : null;
    const durationInvalid = durationText.trim() !== '' && (duration === null || duration <= 0);
    const rowIssues = useMemo(() => computeRowIssues(rows, durationInvalid ? null : duration), [rows, duration, durationInvalid]);

    // 伺服器回的 invalid_segments 問題（index 為送出順序 = rows 順序）；前端即時驗證有問題的列以前端為準
    const displayIssues = useMemo(() => {
        const map = new Map<number, RowIssueCode[]>(rowIssues);
        for (const i of segmentIssuesFromError(save.error)) {
            if (!rowIssues.has(i.index)) map.set(i.index, [...(map.get(i.index) ?? []), i.code]);
        }
        return map;
    }, [rowIssues, save.error]);

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
    const canSave = !!videoId && titleOk && !durationInvalid && rowIssues.size === 0 && !save.isPending;

    const clearMutationErrors = () => {
        if (save.error) save.reset();
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

    const loading = !!id && detail.isLoading;
    const loadError = id && detail.isError ? detail.error : null;
    if (loading) return <p className="text-sm text-muted-foreground">載入中…</p>;
    if (loadError) {
        return (
            <div className="space-y-3">
                <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="size-3.5" />返回列表</Button>
                <p role="alert" className="text-sm text-destructive">{formatSongError(loadError)}</p>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onClose}>
                    <ArrowLeft className="size-3.5" />
                    返回列表
                </Button>
                <h2 className="text-[15px] font-semibold">
                    {id ? '編輯歌回' : '新增歌回'}
                </h2>
                {videoId && (
                    <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
                        在 YouTube 開啟 <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                )}
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                {/* 左：網址＋播放器 */}
                <div className="space-y-2">
                    <Label htmlFor="song-url">YouTube 網址或影片 ID</Label>
                    <Input
                        id="song-url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                        disabled={!!id}
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
                    <div className="space-y-1.5">
                        <Label>狀態</Label>
                        <Select value={status} onValueChange={(v: string) => setStatus(v as SongVideoStatus)}>
                            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {(Object.keys(SONG_STATUS_LABEL) as SongVideoStatus[]).map((s) => <SelectItem key={s} value={s}>{SONG_STATUS_LABEL[s]}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    {id && (
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                                <Switch id="song-community-lock" checked={locked} onCheckedChange={handleLockChange} disabled={lock.isPending} />
                                <Label htmlFor="song-community-lock">鎖定社群編輯</Label>
                            </div>
                            <p className="text-[12px] text-muted-foreground">鎖定後，使用者不能再從公開頁修改這支歌回的時間軸；切換後立即生效，不需按儲存。</p>
                            {lockError && <p role="alert" className="text-[12px] text-destructive">{lockError}</p>}
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
                matchInfo={matchInfo}
            />

            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
                <Button onClick={() => void handleSave()} disabled={!canSave}>
                    {save.isPending ? '儲存中…' : status === 'published' ? '儲存並發布' : '存成草稿'}
                </Button>
                <Button variant="ghost" onClick={onClose}>返回列表</Button>
                <p className="text-[12px] text-muted-foreground">公開目錄有 10 分鐘快取，發布後最晚 10 分鐘出現。</p>
            </div>
            {save.error && <p role="alert" className="text-sm text-destructive">{formatSongError(save.error)}</p>}
            {savedNote && <p role="status" className="text-sm text-emerald-500">{savedNote}</p>}

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
