// 投稿歌回時間軸（/songs/submit）：任何人都能投新歌回或修正既有時間軸，送出後進後台待審。
//
// 流程：貼網址 → 播放器（≥200×200、不遮擋）→ 標題用 YouTube oEmbed、VTuber／開台時間用週表資料自動帶入（只補空欄位）
//      → 目錄裡已有這支歌回就切到「修正既有時間軸」並預填現有片段 → 貼時間軸或手動調整（SegmentEditor）
//      → 來源說明、聯絡方式（選填）→ Turnstile → 送出。
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
import { formatTimecode } from '../../features/songs/lib/timecode';
import { useSongCatalog } from '../../features/songs/songsSource';
import { fetchOEmbedTitle, fetchStreamByVideoId } from '../../features/songs/streamLookup';
import { PreviewPlayer, type PreviewApi } from '../../features/songs/components/PreviewPlayer';
import { VtuberPicker } from '../../features/songs/components/VtuberPicker';
import { SegmentEditor } from '../../features/songs/components/SegmentEditor';
import { computeRowIssues, newRowKey, rowSeconds, type SegmentRowDraft } from '../../features/songs/components/segmentRows';
import { SongSubmitError, submitSongTimeline } from '../../features/songs/submitApi';

const NOTE_MAX = 300;
const CONTACT_MAX = 200;
const TITLE_MAX = 200;

type TFn = (key: string, options?: Record<string, unknown>) => string;

/** ISO → <input type="datetime-local"> 的本地時間字串 */
function toLocalInput(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SongsSubmitPage() {
    const { t } = useTranslation('songs');
    const tf = t as unknown as TFn;
    const catalog = useSongCatalog();

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
    const abortRef = useRef<AbortController | null>(null);

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
    const existing = useMemo(
        () => (videoId ? catalog.data?.videos.find((v) => v.videoId === videoId) ?? null : null),
        [catalog.data, videoId],
    );
    const isRevision = !!existing;

    // 自動帶入：只補還空著的欄位（不覆蓋使用者已填的）
    const latestRef = useRef({ title, vtuberId, streamedAt });
    useEffect(() => {
        latestRef.current = { title, vtuberId, streamedAt };
    }, [title, vtuberId, streamedAt]);
    const fillEmpty = (found: { title: string | null; vtuberId: string | null; streamedAt: string | null }) => {
        const cur = latestRef.current;
        const current = { title: cur.title, vtuberId: cur.vtuberId, streamedAt: cur.streamedAt || null };
        const merged = mergePrefill(current, found);
        if (merged.title !== current.title) setTitle(merged.title.slice(0, TITLE_MAX));
        if (merged.vtuberId !== current.vtuberId) setVtuberId(merged.vtuberId);
        if (merged.streamedAt !== current.streamedAt && merged.streamedAt) setStreamedAt(toLocalInput(merged.streamedAt));
    };

    useEffect(() => {
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
        // fillEmpty 只讀 ref 與 setter
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoId]);

    // 修正既有時間軸：每支影片只預填一次現有片段（之後以使用者編輯為準）
    const prefilledRef = useRef<string | null>(null);
    useEffect(() => {
        if (!existing || prefilledRef.current === existing.videoId) return;
        prefilledRef.current = existing.videoId;
        fillEmpty({ title: existing.title, vtuberId: existing.vtuber?.id || null, streamedAt: existing.streamedAt });
        setRows((cur) => (cur.length > 0 ? cur : existing.segments.map((s) => ({
            key: newRowKey(),
            start: formatTimecode(s.start),
            end: formatTimecode(s.end),
            title: s.title,
            artist: s.artist ?? '',
        }))));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [existing]);

    const durationForCheck = duration !== null ? Math.ceil(duration) : null;
    const issues = useMemo(() => computeRowIssues(rows, durationForCheck), [rows, durationForCheck]);
    const titleOk = title.trim().length >= 1 && title.trim().length <= TITLE_MAX;
    const canSubmit = !!videoId && titleOk && rows.length > 0 && issues.size === 0 && note.length <= NOTE_MAX && contact.length <= CONTACT_MAX;

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
                streamedAt: streamedAt ? new Date(streamedAt).toISOString() : null,
                segments: rows.map((r) => {
                    const { start, end } = rowSeconds(r);
                    return { start, end: end ?? start, title: r.title.trim(), artist: r.artist.trim() || null, endEstimated: !!r.endEstimated };
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
        prefilledRef.current = null;
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
                                {isRevision && <p role="status" className="text-[13px] text-sky-700 dark:text-sky-300">{t('submit.revisionMode')}</p>}
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
                            <SegmentEditor rows={rows} onRowsChange={setRows} issues={issues} player={player} duration={durationForCheck} />
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
                                <p className="text-[12px] text-muted-foreground">{t('submit.reviewHint')}</p>
                            </div>
                        </section>
                    </div>
                )}

                <SiteFooter analyticsCategory="SongsSubmitPage" />
            </main>
        </div>
    );
}

