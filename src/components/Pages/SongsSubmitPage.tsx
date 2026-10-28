// 投稿歌回時間軸（/songs/submit）：任何人都能投新歌回或修正既有時間軸，送出立即生效（社群共同編輯，站方可在後台還原）。
//
// 流程：貼網址 → 播放器（≥200×200、不遮擋）→ 標題用 YouTube oEmbed、VTuber／開台時間用週表資料自動帶入（只補空欄位）
//      → 讀 /api/songs/timeline（即時資料，不走目錄快取）：已發布就切到「修正既有時間軸」並預填現有片段（每列帶 code）、記下 rev，
//        404 當新歌回 → 貼時間軸或手動調整（SegmentEditor）→ 來源說明、聯絡方式（選填）→ Turnstile → 送出。
// - 修正模式：既有片段不能刪除（protectExisting；「取代現有片段」用 code 對回舊片段，沒對到的保留）；
//   已鎖定的歌回送出鍵停用；送出帶 rev，版本已被別人更新時後端回 stale_edit。新歌回 VTuber 必選。
// - ?v=<videoId> 直接進修正模式：mount 後才讀 query 並 replaceState（render 本體不碰 window，可預渲染殼層）。
// - 送出 15 秒逾時；送出中「取消」鍵不 disable，可隨時中止。
// - SEO（WebPage + Breadcrumb）由 App.tsx 統一處理。

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ChevronRight, Loader2 } from 'lucide-react';
import { StaticPageHeader } from '../StaticPageHeader';
import { RouteLink } from '../Navigation/RouteLink';
import { SiteFooter } from '../SiteFooter';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { TurnstileWidget, type TurnstileHandle } from '../turnstile/TurnstileWidget';
import { PAGE_PATHS } from '../../config/routes';
import { extractVideoId } from '../../features/songs/lib/youtubeUrl';
import { mergePrefill } from '../../features/songs/lib/streamPrefill';
import { formatTimecode, parseTimecode } from '../../features/songs/lib/timecode';
import { mergeReplaceRows } from '../../features/songs/lib/timelineMerge';
import { fetchSongTimeline, type SongTimeline } from '../../features/songs/timelineApi';
import { fetchOEmbedTitle, fetchStreamByVideoId } from '../../features/songs/streamLookup';
import { PreviewPlayer, type PreviewApi } from '../../features/songs/components/PreviewPlayer';
import { VtuberPicker } from '../../features/songs/components/VtuberPicker';
import { SegmentEditor } from '../../features/songs/components/SegmentEditor';
import { computeRowIssues, fromImported, newRowKey, rowSeconds, type ImportedRow, type SegmentRowDraft } from '../../features/songs/components/segmentRows';
import { SongSubmitError, submitSongTimeline } from '../../features/songs/submitApi';

const NOTE_MAX = 300;
const CONTACT_MAX = 200;
const TITLE_MAX = 200;
/** 後端接受的影片長度範圍（秒） */
const DURATION_MAX = 86_400;

type TFn = (key: string, options?: Record<string, unknown>) => string;

/** ISO → <input type="datetime-local"> 的本地時間字串 */
function toLocalInput(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 「取代現有片段」：新解析的列依開始時間對回既有片段（保住 code）；沒對到的既有片段不能刪，
 * 併回列表並依開始時間排序（時間格式有誤的排最後），回傳保留的首數讓畫面提示使用者手動調整。
 * 沒有 code 的列（使用者新增的）照一般取代處理，不保留。
 */
function replaceKeepingExisting(current: SegmentRowDraft[], imported: ImportedRow[]): { rows: SegmentRowDraft[]; kept: number } {
    const existing = current.map((r) => ({ code: r.code, start: parseTimecode(r.start) ?? -1, note: r.note }));
    const { rows: merged, lostCodes } = mergeReplaceRows(existing, imported);
    const replaced = merged.map((m, i) => fromImported({ ...m, end: imported[i].end, endEstimated: imported[i].endEstimated }));
    const lost = new Set(lostCodes);
    const keptRows = current.filter((r) => r.code !== undefined && lost.has(r.code));
    const startOf = (r: SegmentRowDraft) => parseTimecode(r.start) ?? Number.POSITIVE_INFINITY;
    return { rows: [...replaced, ...keptRows].sort((a, b) => startOf(a) - startOf(b)), kept: keptRows.length };
}

export function SongsSubmitPage() {
    const { t } = useTranslation('songs');
    const tf = t as unknown as TFn;

    const [url, setUrl] = useState('');
    const [title, setTitle] = useState('');
    const [vtuberId, setVtuberId] = useState<string | null>(null);
    const [streamedAt, setStreamedAt] = useState('');
    const [rows, setRows] = useState<SegmentRowDraft[]>([]);
    const [note, setNote] = useState('');
    const [contact, setContact] = useState('');
    const [duration, setDuration] = useState<number | null>(null);
    const [player, setPlayer] = useState<PreviewApi | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const turnstile = useRef<TurnstileHandle>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<'new' | 'revision' | null>(null);
    // 即時時間軸（timeline 端點）：data 為 null＝404（新歌回）；status error＝讀取失敗，擋住送出避免把已存在的歌回當新歌回
    const [timeline, setTimeline] = useState<{ videoId: string; status: 'ready' | 'error'; data: SongTimeline | null } | null>(null);
    // 「取代現有片段」保留下來的既有片段數（提示手動調整）
    const [keptCount, setKeptCount] = useState(0);
    const abortRef = useRef<AbortController | null>(null);
    // 開台時間自動帶入的原始 ISO（datetime-local 只到分鐘，使用者沒改時送原始值，不截掉秒與毫秒）
    const streamedPrefillRef = useRef<{ local: string; iso: string } | null>(null);

    // ?v=<videoId>：直接進修正模式；讀完把網址換回乾淨的 /songs/submit
    useEffect(() => {
        const v = new URLSearchParams(window.location.search).get('v');
        if (v === null) return;
        const id = extractVideoId(v);
        if (id) setUrl(id);
        window.history.replaceState(null, '', PAGE_PATHS.songsSubmit);
    }, []);
    // 離開頁面時中止送出中的請求
    useEffect(() => () => abortRef.current?.abort(), []);

    const videoId = extractVideoId(url);
    // 換影片後舊的 timeline 結果不算數（videoId 對不上就當載入中）
    const tl = timeline && timeline.videoId === videoId ? timeline : null;
    const timelineLoading = !!videoId && !tl;
    const timelineFailed = tl?.status === 'error';
    const existing = tl?.data ?? null;
    const isRevision = !!existing;
    const locked = existing?.locked === true;

    // 自動帶入：只補還空著的欄位（不覆蓋使用者已填的）；記下帶入的值，換影片時才分得出哪些是上一支的預填
    const latestRef = useRef({ title, vtuberId, streamedAt });
    useEffect(() => {
        latestRef.current = { title, vtuberId, streamedAt };
    }, [title, vtuberId, streamedAt]);
    const autoRef = useRef<{ title?: string; vtuberId?: string | null; streamedAt?: string; rows?: SegmentRowDraft[] }>({});
    // replaceAuto：修正既有歌回時，即時資料優先於 oEmbed／週表先帶入的值（使用者沒改過才蓋）
    const fillEmpty = (found: { title: string | null; vtuberId: string | null; streamedAt: string | null }, replaceAuto = false) => {
        const cur = latestRef.current;
        const auto = autoRef.current;
        // 只有即時資料真的有值才蓋掉自動帶入的值；沒值就留著原本帶入的
        const current = {
            title: replaceAuto && found.title && cur.title === auto.title ? '' : cur.title,
            vtuberId: replaceAuto && found.vtuberId && cur.vtuberId === auto.vtuberId ? null : cur.vtuberId,
            streamedAt: (replaceAuto && found.streamedAt && cur.streamedAt === auto.streamedAt ? '' : cur.streamedAt) || null,
        };
        const merged = mergePrefill(current, found);
        if (merged.title !== cur.title) {
            const v = merged.title.slice(0, TITLE_MAX);
            setTitle(v);
            autoRef.current.title = v;
        }
        if (merged.vtuberId !== cur.vtuberId) {
            setVtuberId(merged.vtuberId);
            autoRef.current.vtuberId = merged.vtuberId;
        }
        if (merged.streamedAt !== (cur.streamedAt || null) && merged.streamedAt) {
            const v = toLocalInput(merged.streamedAt);
            setStreamedAt(v);
            autoRef.current.streamedAt = v;
            streamedPrefillRef.current = { local: v, iso: merged.streamedAt };
        }
    };

    // 換影片：清掉上一支自動帶入、使用者還沒改過的欄位與片段列（改過的保留）
    const prevVideoRef = useRef<string | null>(null);
    // 記「已預填過的那份 timeline 物件」：同一支影片重新讀到的新資料（再投一支後重貼）才會重新預填
    const prefilledRef = useRef<SongTimeline | null>(null);
    const clearAutoFilled = () => {
        const auto = autoRef.current;
        const cur = latestRef.current;
        if (auto.title !== undefined && cur.title === auto.title) { setTitle(''); cur.title = ''; }
        if (auto.vtuberId !== undefined && cur.vtuberId === auto.vtuberId) { setVtuberId(null); cur.vtuberId = null; }
        if (auto.streamedAt !== undefined && cur.streamedAt === auto.streamedAt) { setStreamedAt(''); cur.streamedAt = ''; }
        // 使用者改過而保留的列，帶著上一支影片的 code 送出會被後端擋（unknown_segment），所以一併拿掉
        if (auto.rows) setRows((r) => (r === auto.rows ? [] : r.some((x) => x.code) ? r.map((x) => (x.code ? { ...x, code: undefined } : x)) : r));
        autoRef.current = {};
        prefilledRef.current = null;
        setKeptCount(0);
    };

    useEffect(() => {
        if (prevVideoRef.current !== null && prevVideoRef.current !== videoId) clearAutoFilled();
        prevVideoRef.current = videoId;
        setDuration(null);
        if (!videoId) return;
        const ctrl = new AbortController();
        fetchOEmbedTitle(videoId, ctrl.signal)
            .then((found) => { if (!ctrl.signal.aborted && found) fillEmpty({ title: found, vtuberId: null, streamedAt: null }); })
            .catch(() => { /* 手填即可 */ });
        fetchStreamByVideoId(videoId, ctrl.signal)
            .then((found) => { if (!ctrl.signal.aborted && found) fillEmpty(found); })
            .catch(() => { /* 不在週表：手填即可 */ });
        return () => ctrl.abort();
        // fillEmpty、clearAutoFilled 只讀 ref 與 setter
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoId]);

    // 讀這支影片的即時時間軸（no-store、15 秒逾時）；404 當新歌回，其他失敗擋住送出
    useEffect(() => {
        if (!videoId) return;
        const ctrl = new AbortController();
        fetchSongTimeline(videoId, ctrl.signal)
            .then((data) => { if (!ctrl.signal.aborted) setTimeline({ videoId, status: 'ready', data }); })
            .catch(() => { if (!ctrl.signal.aborted) setTimeline({ videoId, status: 'error', data: null }); });
        return () => ctrl.abort();
    }, [videoId]);

    // 修正既有時間軸：每份讀到的 timeline 只預填一次現有片段（之後以使用者編輯為準）；每列帶 code，送出時後端靠它原地更新
    useEffect(() => {
        if (!existing || prefilledRef.current === existing) return;
        prefilledRef.current = existing;
        fillEmpty({ title: existing.title, vtuberId: existing.vtuber?.id || null, streamedAt: existing.streamedAt }, true);
        const prefill: SegmentRowDraft[] = existing.segments.map((s) => ({
            key: newRowKey(),
            code: s.code,
            start: formatTimecode(s.start),
            end: formatTimecode(s.end),
            title: s.title,
            artist: s.artist ?? '',
            note: s.note ?? '',
        }));
        autoRef.current.rows = prefill;
        setRows((cur) => (cur.length > 0 ? cur : prefill));
        // 只在時間軸資料變動時預填；fillEmpty 只讀 ref 與 setter
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [existing]);

    const durationForCheck = duration !== null ? Math.ceil(duration) : null;
    const issues = useMemo(() => computeRowIssues(rows, durationForCheck), [rows, durationForCheck]);
    const titleOk = title.trim().length >= 1 && title.trim().length <= TITLE_MAX;
    // 新歌回一定要選 VTuber（修正既有歌回沿用原本的）；時間軸還在讀、讀取失敗、已鎖定都不能送
    const needVtuber = !!videoId && !!tl && !timelineFailed && !existing && !vtuberId;
    // 修正時不能把原本有的 VTuber 清空（後端也會沿用原值），清掉了就要求改選別人
    const vtuberCleared = !!existing?.vtuber?.id && !vtuberId;
    const canSubmit = !!videoId && !timelineLoading && !timelineFailed && !locked && !needVtuber && !vtuberCleared
        && titleOk && rows.length > 0 && issues.size === 0 && note.length <= NOTE_MAX && contact.length <= CONTACT_MAX;

    const handleSubmit = async () => {
        if (!videoId || !canSubmit || submitting) return;
        setError(null);
        setSubmitting(true);
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        try {
            const result = await submitSongTimeline({
                videoId,
                title: title.trim(),
                vtuberId,
                streamedAt: !streamedAt ? null
                    : streamedPrefillRef.current?.local === streamedAt ? streamedPrefillRef.current.iso
                    : new Date(streamedAt).toISOString(),
                rev: existing?.rev ?? null,
                durationSeconds: durationForCheck !== null && durationForCheck >= 1 && durationForCheck <= DURATION_MAX ? durationForCheck : null,
                segments: rows.map((r) => {
                    const { start, end } = rowSeconds(r);
                    return {
                        ...(r.code ? { code: r.code } : {}),
                        start, end: end ?? start, title: r.title.trim(), artist: r.artist.trim() || null,
                        versionNote: r.note.trim() || null, endEstimated: !!r.endEstimated,
                    };
                }),
                note: note.trim() || null,
                contact: contact.trim() || null,
                turnstileToken: token,
            }, ctrl.signal);
            setDone(result.kind);
        } catch (e) {
            const code = e instanceof SongSubmitError ? e.code : 'generic';
            if (code !== 'aborted') {
                setError(tf(`submit.error.${code}`, { defaultValue: tf(`schedule:contribute.error.${code}`, { defaultValue: t('submit.error.generic') }) }));
            }
            turnstile.current?.reset();
        } finally {
            if (abortRef.current === ctrl) abortRef.current = null;
            setSubmitting(false);
        }
    };

    // 取代：用 code 對回既有片段，沒對到的保留（不能刪除），提示使用者手動調整
    const handleReplace = (imported: ImportedRow[]) => {
        const result = replaceKeepingExisting(rows, imported);
        setRows(() => result.rows);
        setKeptCount(result.kept);
    };

    const reset = () => {
        setUrl('');
        setTitle('');
        setVtuberId(null);
        setStreamedAt('');
        setRows([]);
        setNote('');
        setContact('');
        setError(null);
        setDone(null);
        setKeptCount(0);
        // 成功畫面卸載了 widget（卸載時不會回呼 onToken），用過的 token 要手動清掉，等新 widget 重新給
        setToken(null);
        // 清掉舊 timeline：再貼同一支影片時，不能先拿舊的 rev／片段預填
        setTimeline(null);
        prefilledRef.current = null;
        streamedPrefillRef.current = null;
    };

    return (
        <div className="relative min-h-screen bg-background text-foreground">
            <StaticPageHeader title={t('submit.title')} analyticsCategory="SongsSubmitPage" />
            <main className="mx-auto max-w-[1080px] px-4 pb-36 sm:px-6">
                <nav aria-label="Breadcrumb" className="pt-5 text-[13px] text-muted-foreground">
                    <ol className="flex flex-wrap items-center gap-1.5">
                        <li><RouteLink to="home" className="hover:text-foreground">MultiStream Hub</RouteLink></li>
                        <li aria-hidden="true" className="inline-flex opacity-50"><ChevronRight size={13} /></li>
                        <li><RouteLink to="songs" className="hover:text-foreground">{t('title')}</RouteLink></li>
                        <li aria-hidden="true" className="inline-flex opacity-50"><ChevronRight size={13} /></li>
                        <li aria-current="page" className="font-medium text-foreground">{t('submit.title')}</li>
                    </ol>
                </nav>

                <header className="pb-6 pt-4">
                    <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight sm:text-[2.125rem]">{t('submit.heading')}</h1>
                    <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-muted-foreground">{t('submit.subtitle')}</p>
                </header>

                {done ? (
                    <section role="status" className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] p-6">
                        <p className="flex items-center gap-2 text-lg font-bold">
                            <CheckCircle2 className="size-5 text-emerald-500" aria-hidden="true" />
                            {t('submit.success')}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">{t('submit.successHint')}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <Button asChild variant="outline"><RouteLink to="songs">{t('submit.backToSongs')}</RouteLink></Button>
                            <Button variant="ghost" onClick={reset}>{t('submit.another')}</Button>
                        </div>
                    </section>
                ) : (
                    <div className="space-y-6">
                        <section aria-labelledby="songs-submit-video-h" className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                            <h2 id="songs-submit-video-h" className="sr-only left-0 top-0">{t('submit.videoSection')}</h2>
                            <div className="space-y-2">
                                <Label htmlFor="songs-submit-url">{t('submit.url')}</Label>
                                <Input
                                    id="songs-submit-url"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    placeholder="https://www.youtube.com/watch?v=..."
                                    aria-invalid={url.trim() !== '' && !videoId}
                                />
                                {url.trim() !== '' && !videoId && <p className="text-[12px] text-destructive">{t('submit.urlInvalid')}</p>}
                                {locked ? (
                                    <p className="text-[13px] font-medium text-destructive">{t('submit.locked')}</p>
                                ) : isRevision && (
                                    <p className="text-[13px] text-sky-700 dark:text-sky-300">{t('submit.revisionMode')}</p>
                                )}
                                {timelineFailed && <p className="text-[13px] text-destructive">{t('submit.timelineFailed')}</p>}
                                {videoId ? (
                                    <PreviewPlayer key={videoId} videoId={videoId} onApi={setPlayer} onDuration={setDuration} />
                                ) : (
                                    <div className="flex aspect-video min-h-[202px] w-full items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-[13px] text-muted-foreground">
                                        {t('submit.playerPlaceholder')}
                                    </div>
                                )}
                            </div>
                            <div className="space-y-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="songs-submit-title">{t('submit.videoTitle')}</Label>
                                    <Input id="songs-submit-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX} aria-invalid={title !== '' && !titleOk} />
                                    <p className="text-[12px] text-muted-foreground">{t('submit.autoFillHint')}</p>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="songs-submit-vtuber">{t('submit.vtuber')}</Label>
                                    <VtuberPicker id="songs-submit-vtuber" value={vtuberId} onChange={setVtuberId} />
                                    {needVtuber && <p className="text-[12px] text-destructive">{t('submit.vtuberRequired')}</p>}
                                    {vtuberCleared && <p className="text-[12px] text-destructive">{t('submit.vtuberCannotClear')}</p>}
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="songs-submit-streamed">{t('submit.streamedAt')}</Label>
                                    <Input id="songs-submit-streamed" type="datetime-local" value={streamedAt} onChange={(e) => setStreamedAt(e.target.value)} />
                                </div>
                            </div>
                        </section>

                        <section aria-labelledby="songs-submit-segments-h">
                            <h2 id="songs-submit-segments-h" className="mb-2 text-lg font-bold">{t('submit.segmentsSection')}</h2>
                            <p className="mb-3 text-[13px] text-muted-foreground">{t('submit.segmentsHint')}</p>
                            {keptCount > 0 && <p className="mb-3 text-[13px] text-amber-600 dark:text-amber-400">{t('submit.kept', { count: keptCount })}</p>}
                            <SegmentEditor
                                rows={rows}
                                onRowsChange={setRows}
                                issues={issues}
                                player={player}
                                duration={durationForCheck}
                                onReplace={handleReplace}
                                protectExisting
                            />
                        </section>

                        <section aria-labelledby="songs-submit-extra-h" className="space-y-3">
                            <h2 id="songs-submit-extra-h" className="text-lg font-bold">{t('submit.extraSection')}</h2>
                            <div className="space-y-1.5">
                                <Label htmlFor="songs-submit-note">{t('submit.note')}</Label>
                                <Textarea id="songs-submit-note" rows={3} value={note} maxLength={NOTE_MAX} onChange={(e) => setNote(e.target.value)} placeholder={t('submit.notePlaceholder')} />
                                <p className="text-right text-[11px] text-muted-foreground">{note.length}/{NOTE_MAX}</p>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="songs-submit-contact">{t('submit.contact')}</Label>
                                <Input id="songs-submit-contact" value={contact} maxLength={CONTACT_MAX} onChange={(e) => setContact(e.target.value)} autoComplete="email" />
                                <p className="text-[12px] text-muted-foreground">{t('submit.contactHint')}</p>
                            </div>
                            <TurnstileWidget ref={turnstile} onToken={setToken} />
                            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                            {!canSubmit && rows.length > 0 && issues.size > 0 && <p className="text-[13px] text-destructive">{t('submit.fixIssues')}</p>}
                            <div className="flex flex-wrap items-center gap-2">
                                <Button onClick={() => void handleSubmit()} disabled={!canSubmit || token === null || submitting} className="gap-2">
                                    {submitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                                    {submitting ? t('submit.sending') : isRevision ? t('submit.sendRevision') : t('submit.send')}
                                </Button>
                                {submitting && (
                                    <Button variant="ghost" onClick={() => abortRef.current?.abort()}>{t('submit.cancel')}</Button>
                                )}
                                <p className="text-[12px] text-muted-foreground">{t('submit.instantHint')}</p>
                            </div>
                        </section>
                    </div>
                )}

                <SiteFooter analyticsCategory="SongsSubmitPage" />
            </main>
        </div>
    );
}

