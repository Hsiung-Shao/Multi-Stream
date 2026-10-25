// 歌回編輯器：貼 YouTube 網址 → 嵌入播放器 → 逐首「設為目前時間」或貼時間軸文字匯入 → 即時驗證 → 存草稿或發布。
//
// - 播放器只在 playerEnabled（歌回分頁啟用中）時掛載：AdminDashboard 的分頁都 forceMount，切走仍會留著，
//   隱藏的播放器繼續播違反 YouTube 嵌入政策，所以切走一定要卸載。
// - 片段時間以文字輸入（12:34、1:02:03、754），parseTimecode 解析；驗證規則與伺服器同一套（validateSegments）。
// - 既有片段帶 id 送出，伺服器依 id 原地更新、保住分享用的 code；新列不帶 id，code 由資料庫產生。
// - 存檔中可隨時返回列表（不 disable），卡住時不會被困住（memory error_dialog_mutation_reset）。

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Clock, Crosshair, ExternalLink, Play, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { cn } from '../../../components/ui/utils';
import { extractVideoId } from '../../songs/lib/youtubeUrl';
import { formatTimecode, parseTimecode } from '../../songs/lib/timecode';
import { parseTimelineDetailed, type ParsedRow } from '../../songs/lib/timelineParser';
import { validateSegments } from '../../songs/lib/segmentValidation';
import { ensureYT, type YTPlayerLike } from '../../songs/hooks/useSegmentPlayer';
import {
    SEGMENT_ISSUE_LABEL,
    SONG_STATUS_LABEL,
    formatSongError,
    searchVtubers,
    segmentIssuesFromError,
    useAdminSongVideo,
    useSaveSongVideo,
    useVtuberNames,
    type SongSegmentRecord,
    type SongVideoStatus,
    type SongVideoWriteInput,
    type VtuberOption,
} from '../hooks/useAdminSongs';

/** 編輯中的片段列（時間保留使用者輸入的文字，存檔時才轉秒數） */
interface RowDraft {
    key: string;
    id?: string;
    code?: string;
    start: string;
    end: string;
    title: string;
    artist: string;
}

let rowSeq = 0;
const newKey = () => `row-${++rowSeq}`;

const fromRecord = (s: SongSegmentRecord): RowDraft => ({
    key: s.id,
    id: s.id,
    code: s.code,
    start: formatTimecode(s.start_seconds),
    end: formatTimecode(s.end_seconds),
    title: s.title,
    artist: s.original_artist ?? '',
});

const fromParsed = (r: ParsedRow): RowDraft => ({
    key: newKey(),
    start: formatTimecode(r.start),
    end: r.end === null ? '' : formatTimecode(r.end),
    title: r.title,
    artist: r.artist ?? '',
});

/** ISO → <input type="datetime-local"> 的本地時間字串 */
function toLocalInput(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 逐列問題（index → 中文訊息）；時間格式錯的列不參與 validateSegments，避免連帶誤判重疊 */
export function computeRowIssues(rows: RowDraft[], duration: number | null): Map<number, string[]> {
    const issues = new Map<number, string[]>();
    const push = (i: number, msg: string) => issues.set(i, [...(issues.get(i) ?? []), msg]);
    const valid: { index: number; start: number; end: number | null; title: string; artist: string }[] = [];
    rows.forEach((r, i) => {
        const start = parseTimecode(r.start);
        const end = r.end.trim() ? parseTimecode(r.end) : null;
        if (start === null) push(i, '開始時間格式錯誤');
        if (r.end.trim() && end === null) push(i, '結束時間格式錯誤');
        if (start !== null && !(r.end.trim() && end === null)) valid.push({ index: i, start, end, title: r.title, artist: r.artist });
    });
    for (const issue of validateSegments(valid, { duration })) {
        push(valid[issue.index].index, SEGMENT_ISSUE_LABEL[issue.code]);
    }
    return issues;
}

// ---------- 嵌入播放器（只在分頁啟用時掛載） ----------

interface PreviewApi {
    getCurrentTime(): number;
    seekTo(sec: number): void;
}

function PreviewPlayer({ videoId, onApi, onDuration }: {
    videoId: string;
    onApi: (api: PreviewApi | null) => void;
    onDuration: (sec: number) => void;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [failed, setFailed] = useState(false);
    // callback 用 ref 取最新值：播放器只依 videoId 重建
    const cbRef = useRef({ onApi, onDuration });
    useEffect(() => { cbRef.current = { onApi, onDuration }; }, [onApi, onDuration]);

    useEffect(() => {
        let cancelled = false;
        let player: YTPlayerLike | null = null;
        const container = containerRef.current;
        setFailed(false);
        void (async () => {
            if (!container) return;
            try {
                const YT = await ensureYT();
                if (cancelled) return;
                container.innerHTML = '';
                const target = document.createElement('div');
                target.style.width = '100%';
                target.style.height = '100%';
                container.appendChild(target);
                player = new YT.Player(target, {
                    width: '100%',
                    height: '100%',
                    videoId,
                    playerVars: { autoplay: 0, rel: 0, playsinline: 1, modestbranding: 1, enablejsapi: 1, origin: window.location.origin },
                    events: {
                        onReady: (e) => {
                            if (cancelled) return;
                            player = e.target;
                            const p = e.target;
                            cbRef.current.onApi({
                                getCurrentTime: () => { try { return p.getCurrentTime(); } catch { return 0; } },
                                seekTo: (sec) => { try { p.seekTo(sec, true); p.playVideo(); } catch { /* 已銷毀 */ } },
                            });
                            try {
                                const d = p.getDuration();
                                if (d > 0) cbRef.current.onDuration(d);
                            } catch { /* 直播中或尚未取得 */ }
                        },
                        onStateChange: (e) => {
                            // 部分影片 onReady 時還拿不到長度，開始播放後再補一次
                            if (cancelled || e.data !== 1) return;
                            try {
                                const d = e.target.getDuration();
                                if (d > 0) cbRef.current.onDuration(d);
                            } catch { /* ignore */ }
                        },
                        onError: () => { if (!cancelled) setFailed(true); },
                    },
                });
            } catch {
                if (!cancelled) setFailed(true);
            }
        })();
        return () => {
            cancelled = true;
            cbRef.current.onApi(null);
            const p = player;
            player = null;
            if (p) setTimeout(() => { try { p.destroy(); } catch { /* 已銷毀 */ } }, 0);
            if (container) container.innerHTML = '';
        };
    }, [videoId]);

    return (
        <div>
            <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
                <div ref={containerRef} className="absolute inset-0" />
            </div>
            {failed && <p role="alert" className="mt-1.5 text-[12px] text-destructive">播放器無法載入這支影片（可能禁止嵌入）。仍可手動輸入時間。</p>}
        </div>
    );
}

// ---------- VTuber 選擇 ----------

function VtuberPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
    const names = useVtuberNames(value ? [value] : []);
    const selected = value ? names.data?.get(value) : undefined;
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<VtuberOption[]>([]);
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        const q = query.trim();
        if (!q) {
            setResults([]);
            setError(false);
            return;
        }
        const ctrl = new AbortController();
        const timer = setTimeout(() => {
            setSearching(true);
            searchVtubers(q, ctrl.signal)
                .then((rows) => { setResults(rows); setError(false); })
                .catch(() => { if (!ctrl.signal.aborted) setError(true); })
                .finally(() => { if (!ctrl.signal.aborted) setSearching(false); });
        }, 300);
        return () => { clearTimeout(timer); ctrl.abort(); };
    }, [query]);

    if (value) {
        return (
            <div className="flex h-9 items-center gap-2 rounded-md border border-border px-2.5">
                {selected?.img_url && <img src={selected.img_url} alt="" className="size-6 rounded-full object-cover" />}
                <span className="min-w-0 flex-1 truncate text-sm">{selected?.name ?? (names.isLoading ? '載入中…' : value)}</span>
                <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => onChange(null)} aria-label="清除 VTuber" title="清除">
                    <X className="size-3.5" />
                </Button>
            </div>
        );
    }

    return (
        <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
                value={query}
                onChange={(e) => {
                    const v = e.target.value;
                    // 直接貼 VTuber 的 uuid 也可以
                    if (/^[0-9a-fA-F-]{36}$/.test(v.trim())) {
                        onChange(v.trim());
                        setQuery('');
                        return;
                    }
                    setQuery(v);
                }}
                placeholder="搜尋 VTuber 名稱（或貼 id）"
                aria-label="搜尋 VTuber"
                className="h-9 pl-8"
            />
            {query.trim() && (
                <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-md border border-border bg-popover p-1 shadow-md">
                    {searching && results.length === 0 ? (
                        <p className="px-2 py-1.5 text-[12px] text-muted-foreground">搜尋中…</p>
                    ) : error ? (
                        <p className="px-2 py-1.5 text-[12px] text-destructive">搜尋失敗</p>
                    ) : results.length === 0 ? (
                        <p className="px-2 py-1.5 text-[12px] text-muted-foreground">找不到</p>
                    ) : (
                        results.map((r) => (
                            <button
                                key={r.id}
                                type="button"
                                onClick={() => { onChange(r.id); setQuery(''); }}
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                            >
                                {r.img_url ? <img src={r.img_url} alt="" className="size-6 rounded-full object-cover" /> : <span className="size-6 rounded-full bg-muted" />}
                                <span className="truncate">{r.name}</span>
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

// ---------- 編輯器 ----------

export function SongVideoEditor({ id, playerEnabled, onClose, onSaved }: {
    /** null = 新增 */
    id: string | null;
    playerEnabled: boolean;
    onClose: () => void;
    onSaved: (id: string) => void;
}) {
    const detail = useAdminSongVideo(id);
    const save = useSaveSongVideo();

    const [url, setUrl] = useState('');
    const [title, setTitle] = useState('');
    const [vtuberId, setVtuberId] = useState<string | null>(null);
    const [streamedAt, setStreamedAt] = useState('');
    const [durationText, setDurationText] = useState('');
    const [status, setStatus] = useState<SongVideoStatus>('draft');
    const [rows, setRows] = useState<RowDraft[]>([]);
    const [timelineText, setTimelineText] = useState('');
    const [savedNote, setSavedNote] = useState<string | null>(null);
    const loadedIdRef = useRef<string | null>(null);
    const apiRef = useRef<PreviewApi | null>(null);
    const [hasApi, setHasApi] = useState(false);

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
        setRows(segments.map(fromRecord));
    }, [id, detail.data]);

    const videoId = extractVideoId(url);
    const duration = durationText.trim() ? parseTimecode(durationText) : null;
    const durationInvalid = durationText.trim() !== '' && (duration === null || duration <= 0);
    const rowIssues = useMemo(() => computeRowIssues(rows, durationInvalid ? null : duration), [rows, duration, durationInvalid]);

    // 伺服器回的 invalid_segments 問題（index 為送出順序 = rows 順序）；表格一改就以前端即時驗證為準
    const serverIssues = useMemo(() => {
        const map = new Map<number, string[]>();
        for (const i of segmentIssuesFromError(save.error)) map.set(i.index, [...(map.get(i.index) ?? []), SEGMENT_ISSUE_LABEL[i.code]]);
        return map;
    }, [save.error]);

    const timeline = useMemo(() => (timelineText.trim() ? parseTimelineDetailed(timelineText) : { rows: [], unparsed: [] }), [timelineText]);
    const parsedTimeline = timeline.rows;

    const titleOk = title.trim().length >= 1 && title.trim().length <= 200;
    const canSave = !!videoId && titleOk && !durationInvalid && rowIssues.size === 0 && !save.isPending;

    const updateRow = (key: string, patch: Partial<RowDraft>) => {
        setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
        if (save.error) save.reset();
    };
    const removeRow = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));
    const addRow = () => {
        setRows((rs) => {
            const last = rs[rs.length - 1];
            // 新列的開始預設接上一列的結束
            return [...rs, { key: newKey(), start: last?.end ?? '', end: '', title: '', artist: '' }];
        });
    };
    const currentTimecode = () => formatTimecode(Math.floor(apiRef.current?.getCurrentTime() ?? 0));

    const applyTimeline = (mode: 'replace' | 'append') => {
        const imported = parsedTimeline.map(fromParsed);
        setRows((rs) => (mode === 'replace' ? imported : [...rs, ...imported]));
        setTimelineText('');
    };

    const handleSave = async () => {
        if (!videoId || !canSave) return;
        const input: SongVideoWriteInput = {
            video_id: videoId,
            title: title.trim(),
            vtuber_id: vtuberId,
            streamed_at: streamedAt ? new Date(streamedAt).toISOString() : null,
            duration_seconds: duration,
            status,
            segments: rows.map((r) => ({
                ...(r.id ? { id: r.id } : {}),
                start_seconds: parseTimecode(r.start) ?? 0,
                end_seconds: r.end.trim() ? parseTimecode(r.end) : null,
                title: r.title.trim(),
                original_artist: r.artist.trim() || null,
            })),
        };
        setSavedNote(null);
        try {
            const result = await save.mutateAsync({ id, input });
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

    if (id && detail.isLoading) return <p className="text-sm text-muted-foreground">載入中…</p>;
    if (id && detail.isError) {
        return (
            <div className="space-y-3">
                <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="size-3.5" />返回列表</Button>
                <p role="alert" className="text-sm text-destructive">{formatSongError(detail.error)}</p>
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
                <h2 className="text-[15px] font-semibold">{id ? '編輯歌回' : '新增歌回'}</h2>
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
                    {videoId && playerEnabled ? (
                        <PreviewPlayer
                            key={videoId}
                            videoId={videoId}
                            onApi={(api) => { apiRef.current = api; setHasApi(!!api); }}
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
                </div>
            </div>

            {/* 貼上時間軸 */}
            <details className="rounded-lg border border-border bg-card p-3">
                <summary className="cursor-pointer text-sm font-medium">貼上時間軸文字匯入</summary>
                <div className="mt-3 space-y-2">
                    <Textarea
                        value={timelineText}
                        onChange={(e) => setTimelineText(e.target.value)}
                        rows={6}
                        placeholder={'01. 0:12:34 歌名 / 原唱\n02. 0:16:20 歌名 - 原唱\n（沒有結束時間時取下一首的開始）'}
                        aria-label="時間軸文字"
                    />
                    {timeline.unparsed.length > 0 && (
                        <p role="alert" className="text-[12px] text-amber-500">
                            {timeline.unparsed.slice(0, 10).map((l) => `第 ${l + 1} 行`).join('、')}
                            {timeline.unparsed.length > 10 ? ` 等 ${timeline.unparsed.length} 行` : ''}
                            未解析（有時間但格式看不懂，請手動補上或改寫成「12:34 歌名 / 原唱」）
                        </p>
                    )}
                    {timelineText.trim() && (
                        parsedTimeline.length === 0 ? (
                            <p className="text-[12px] text-muted-foreground">沒有找到帶時間的行。</p>
                        ) : (
                            <>
                                <p className="text-[12px] text-muted-foreground">解析出 {parsedTimeline.length} 首（預覽）：</p>
                                <ol className="max-h-48 overflow-hidden rounded border border-border text-[12.5px]">
                                    {parsedTimeline.slice(0, 8).map((r) => (
                                        <li key={r.line} className="flex gap-2 border-t border-border/60 px-2 py-1 first:border-t-0">
                                            <span className="w-28 shrink-0 tabular-nums text-muted-foreground">{formatTimecode(r.start)} – {r.end === null ? '?' : formatTimecode(r.end)}</span>
                                            <span className="min-w-0 flex-1 truncate">{r.title || '（無歌名）'}{r.artist ? ` / ${r.artist}` : ''}</span>
                                        </li>
                                    ))}
                                </ol>
                                {parsedTimeline.length > 8 && <p className="text-[12px] text-muted-foreground">…另有 {parsedTimeline.length - 8} 首</p>}
                                <div className="flex gap-2">
                                    <Button size="sm" onClick={() => applyTimeline('replace')}><Upload className="size-3.5" />取代現有片段</Button>
                                    <Button size="sm" variant="outline" onClick={() => applyTimeline('append')}><Plus className="size-3.5" />附加到最後</Button>
                                </div>
                            </>
                        )
                    )}
                </div>
            </details>

            {/* 片段表格 */}
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">片段（{rows.length} 首）</h3>
                    {rowIssues.size > 0 && <span className="text-[12px] text-destructive">{rowIssues.size} 列有錯誤，修正後才能儲存</span>}
                    <Button size="sm" variant="outline" className="ml-auto" onClick={addRow}><Plus className="size-3.5" />新增一列</Button>
                </div>
                {rows.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">還沒有片段。按「新增一列」或貼上時間軸。</p>
                ) : (
                    <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full min-w-[860px] text-sm">
                            <thead className="bg-muted/40 text-[12px] text-muted-foreground">
                                <tr>
                                    <th className="w-8 px-2 py-1.5 text-left font-medium">#</th>
                                    <th className="w-40 px-2 py-1.5 text-left font-medium">開始</th>
                                    <th className="w-40 px-2 py-1.5 text-left font-medium">結束</th>
                                    <th className="px-2 py-1.5 text-left font-medium">歌名</th>
                                    <th className="px-2 py-1.5 text-left font-medium">原唱</th>
                                    <th className="w-24 px-2 py-1.5 text-left font-medium">code</th>
                                    <th className="w-20 px-2 py-1.5" />
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r, i) => {
                                    const issues = rowIssues.get(i) ?? serverIssues.get(i);
                                    const startSec = parseTimecode(r.start);
                                    return (
                                        <tr key={r.key} className={cn('border-t border-border align-top', issues && 'bg-destructive/5')}>
                                            <td className="px-2 py-1.5 text-[12px] tabular-nums text-muted-foreground">{i + 1}</td>
                                            <td className="px-2 py-1.5">
                                                <div className="flex gap-1">
                                                    <Input value={r.start} onChange={(e) => updateRow(r.key, { start: e.target.value })} className="h-8 w-20 tabular-nums" aria-label={`第 ${i + 1} 首開始時間`} />
                                                    <Button variant="ghost" size="icon" className="size-8" disabled={!hasApi} onClick={() => updateRow(r.key, { start: currentTimecode() })} title="設為目前時間" aria-label={`第 ${i + 1} 首開始設為目前時間`}>
                                                        <Crosshair className="size-3.5" />
                                                    </Button>
                                                </div>
                                            </td>
                                            <td className="px-2 py-1.5">
                                                <div className="flex gap-1">
                                                    <Input value={r.end} onChange={(e) => updateRow(r.key, { end: e.target.value })} className="h-8 w-20 tabular-nums" aria-label={`第 ${i + 1} 首結束時間`} />
                                                    <Button variant="ghost" size="icon" className="size-8" disabled={!hasApi} onClick={() => updateRow(r.key, { end: currentTimecode() })} title="設為目前時間" aria-label={`第 ${i + 1} 首結束設為目前時間`}>
                                                        <Clock className="size-3.5" />
                                                    </Button>
                                                </div>
                                            </td>
                                            <td className="px-2 py-1.5">
                                                <Input value={r.title} onChange={(e) => updateRow(r.key, { title: e.target.value })} maxLength={200} className="h-8" aria-label={`第 ${i + 1} 首歌名`} />
                                                {issues && <p className="mt-1 text-[11.5px] text-destructive">{issues.join('、')}</p>}
                                            </td>
                                            <td className="px-2 py-1.5">
                                                <Input value={r.artist} onChange={(e) => updateRow(r.key, { artist: e.target.value })} maxLength={200} className="h-8" aria-label={`第 ${i + 1} 首原唱`} />
                                            </td>
                                            <td className="px-2 py-1.5 font-mono text-[11.5px] text-muted-foreground">{r.code ?? '（新）'}</td>
                                            <td className="px-2 py-1.5">
                                                <div className="flex justify-end gap-0.5">
                                                    <Button variant="ghost" size="icon" className="size-8" disabled={!hasApi || startSec === null} onClick={() => startSec !== null && apiRef.current?.seekTo(startSec)} title="從這裡播" aria-label={`從第 ${i + 1} 首開始播`}>
                                                        <Play className="size-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => removeRow(r.key)} title="刪除這列" aria-label={`刪除第 ${i + 1} 首`}>
                                                        <Trash2 className="size-3.5" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
                <Button onClick={() => void handleSave()} disabled={!canSave}>
                    {save.isPending ? '儲存中…' : status === 'published' ? '儲存並發布' : '存成草稿'}
                </Button>
                <Button variant="ghost" onClick={onClose}>返回列表</Button>
                <p className="text-[12px] text-muted-foreground">公開目錄有 10 分鐘快取，發布後最晚 10 分鐘出現。</p>
            </div>
            {save.error && <p role="alert" className="text-sm text-destructive">{formatSongError(save.error)}</p>}
            {savedNote && <p role="status" className="text-sm text-emerald-500">{savedNote}</p>}
        </div>
    );
}
