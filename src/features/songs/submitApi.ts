/**
 * 社群投稿歌回時間軸：POST /api/songs/submissions（functions/api/songs/submissions.js）。
 *
 * - 15 秒逾時，並與呼叫端的取消訊號連動（使用者按「取消」就中止）。
 * - 錯誤轉成 SongSubmitError（code 為後端的 error 字串；逾時 timeout、網路 network、取消 aborted）。
 * - 201 { ok, id, kind }（送出即生效）；錯誤碼：
 *   409 stale_edit（版本已被別人更新）／video_exists（影片已存在卻沒帶 rev）；
 *   400 cannot_delete（少了既有片段）／unknown_segment／vtuber_required／invalid_*；
 *   403 video_locked（已鎖定）；429 rate_limited。
 */
export const SONG_SUBMIT_URL = '/api/songs/submissions';
export const SONG_SUBMIT_TIMEOUT_MS = 15_000;

export interface SongSubmissionInput {
    videoId: string;
    title: string;
    vtuberId: string | null;
    streamedAt: string | null;
    /** 修正既有歌回時帶 GET /api/songs/timeline 回的 rev（版本比對用）；新歌回 null */
    rev: string | null;
    /** 播放器取得的影片長度（整數秒，1～86400）；取不到 null */
    durationSeconds: number | null;
    /** code：既有片段的分享碼（原地更新用）；新增的片段不帶 */
    segments: { code?: string; start: number; end: number; title: string; artist: string | null; versionNote: string | null; endEstimated: boolean }[];
    note: string | null;
    contact: string | null;
    turnstileToken: string | null;
}

export class SongSubmitError extends Error {
    constructor(public code: string, public status: number) {
        super(code);
        this.name = 'SongSubmitError';
    }
}

export async function submitSongTimeline(
    input: SongSubmissionInput,
    signal?: AbortSignal,
    fetchFn: typeof fetch = fetch,
): Promise<{ id: string | null; kind: 'new' | 'revision' }> {
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, SONG_SUBMIT_TIMEOUT_MS);
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort);
    let res: Response;
    try {
        res = await fetchFn(SONG_SUBMIT_URL, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
            signal: ctrl.signal,
        });
    } catch (e) {
        if (timedOut) throw new SongSubmitError('timeout', 0);
        if (signal?.aborted) throw new SongSubmitError('aborted', 0);
        throw new SongSubmitError((e as Error)?.name === 'AbortError' ? 'timeout' : 'network', 0);
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    }
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: unknown; id?: unknown; kind?: unknown } | null;
    if (!res.ok || data?.ok === false) {
        throw new SongSubmitError(typeof data?.error === 'string' ? data.error : `http_${res.status}`, res.status);
    }
    return {
        id: typeof data?.id === 'string' ? data.id : null,
        kind: data?.kind === 'revision' ? 'revision' : 'new',
    };
}
