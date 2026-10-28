/**
 * 歌回即時時間軸：GET /api/songs/timeline?v=<videoId>（functions/api/songs/timeline.js，no-store，不走目錄的 10 分鐘快取）。
 *
 * - 社群投稿頁修正既有歌回時讀它：每個片段帶 code，整支影片帶 rev（版本比對）與 locked（已鎖定不能改）。
 * - 404（影片不存在或未發布）回 null，呼叫端當新歌回；其他失敗丟 Error，讓呼叫端擋住送出而不是誤當新歌回。
 * - 15 秒逾時，並與呼叫端的取消訊號連動（memory error_client_fetch_needs_timeout）。
 * - 逐欄防呆：格式不對的片段丟棄，rev 不是字串（理論上不會發生）就視為壞資料。
 */
export const TIMELINE_URL = '/api/songs/timeline';
export const TIMELINE_TIMEOUT_MS = 15_000;

export interface TimelineSegment {
    code: string;
    start: number;
    end: number;
    title: string;
    artist: string | null;
    note: string | null;
    /** 結束時間是估計值；舊後端沒有這個欄位 */
    estimated?: boolean;
}

export interface SongTimeline {
    videoId: string;
    title: string;
    vtuber: { id: string; name: string; img: string | null } | null;
    streamedAt: string | null;
    durationSeconds: number | null;
    rev: string;
    locked: boolean;
    segments: TimelineSegment[];
}

const CODE_RE = /^[0-9a-z]{8}$/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isSec = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

function toSegment(raw: unknown): TimelineSegment | null {
    if (!isObj(raw)) return null;
    const { code, start, end, title } = raw;
    if (typeof code !== 'string' || !CODE_RE.test(code) || !isSec(start) || !isSec(end) || end <= start) return null;
    if (typeof title !== 'string' || !title.trim()) return null;
    return { code, start, end, title, artist: strOrNull(raw.artist), note: strOrNull(raw.note) };
}

/** 回應 data → SongTimeline；格式不對回 null */
export function parseSongTimeline(raw: unknown): SongTimeline | null {
    if (!isObj(raw) || typeof raw.videoId !== 'string' || typeof raw.rev !== 'string' || !raw.rev) return null;
    const vt = isObj(raw.vtuber) && typeof raw.vtuber.id === 'string' && raw.vtuber.id ? raw.vtuber : null;
    return {
        videoId: raw.videoId,
        title: typeof raw.title === 'string' ? raw.title : '',
        vtuber: vt ? { id: vt.id as string, name: typeof vt.name === 'string' ? vt.name : '', img: strOrNull(vt.img) } : null,
        streamedAt: strOrNull(raw.streamedAt),
        durationSeconds: isSec(raw.durationSeconds) && raw.durationSeconds > 0 ? raw.durationSeconds : null,
        rev: raw.rev,
        locked: raw.locked === true,
        segments: Array.isArray(raw.segments) ? raw.segments.map(toSegment).filter((s): s is TimelineSegment => s !== null) : [],
    };
}

export async function fetchSongTimeline(
    videoId: string,
    signal?: AbortSignal,
    fetchFn: typeof fetch = fetch,
): Promise<SongTimeline | null> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMELINE_TIMEOUT_MS);
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort);
    try {
        const res = await fetchFn(`${TIMELINE_URL}?v=${encodeURIComponent(videoId)}`, {
            credentials: 'same-origin',
            cache: 'no-store',
            signal: ctrl.signal,
        });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`timeline ${res.status}`);
        const body: unknown = await res.json();
        const data = isObj(body) && body.ok === true ? parseSongTimeline(body.data) : null;
        if (!data) throw new Error('timeline bad payload');
        return data;
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    }
}
