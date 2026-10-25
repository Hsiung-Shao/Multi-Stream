// 歌曲播放清單：後台寫入 payload 的驗證與組裝
//
// 片段規則與前端 src/features/songs/lib/segmentValidation.ts 一致（code 名稱相同）：
//   missing_end / end_before_start / overlap / exceeds_duration / empty_title /
//   title_too_long / artist_too_long
// 短 ID（song_segments.code）由資料庫 default 產生，這裡不產生也不接受 body 帶入。

export const SEGMENTS_MAX = 200;
export const TITLE_MAX = 200;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT_MAX = 2147483647; // Postgres integer 上限
const STATUSES = ['draft', 'published'];

export function isUuid(id) {
    return typeof id === 'string' && UUID_RE.test(id);
}

const isInt = (v) => typeof v === 'number' && Number.isInteger(v);

function invalid(error, issues) {
    return issues ? { ok: false, error, issues } : { ok: false, error };
}

/**
 * 驗證片段，回傳 [{ index, code }]（index 為 body 中的原始順序）
 * @param {{ start: number, end: number|null, title: string, artist?: string|null }[]} rows
 * @param {{ duration?: number|null }} [opts]
 */
export function validateSegments(rows, opts = {}) {
    const duration = opts.duration ?? null;
    const issues = [];
    rows.forEach((r, index) => {
        if (r.end === null) issues.push({ index, code: 'missing_end' });
        else if (r.end <= r.start) issues.push({ index, code: 'end_before_start' });
        if (r.title.trim() === '') issues.push({ index, code: 'empty_title' });
        if (r.title.trim().length > TITLE_MAX) issues.push({ index, code: 'title_too_long' });
        if (r.artist && r.artist.length > TITLE_MAX) issues.push({ index, code: 'artist_too_long' });
        if (duration != null && r.end !== null && r.end > duration) issues.push({ index, code: 'exceeds_duration' });
    });
    // 重疊：[s1,e1) 與 [s2,e2) 若 s1 < e2 且 s2 < e1；首尾相接不算。只比對起訖合法的列
    const flagged = new Set();
    for (let i = 0; i < rows.length; i++) {
        const a = rows[i];
        if (a.end === null || a.end <= a.start) continue;
        for (let j = i + 1; j < rows.length; j++) {
            const b = rows[j];
            if (b.end === null || b.end <= b.start) continue;
            if (a.start < b.end && b.start < a.end) {
                flagged.add(i);
                flagged.add(j);
            }
        }
    }
    for (const index of [...flagged].sort((x, y) => x - y)) issues.push({ index, code: 'overlap' });
    return issues;
}

/**
 * 把後台 body 驗證並組成可寫入資料庫的 payload
 * @param {any} body
 * @param {{ mode?: 'create'|'update' }} [opts] create 模式不允許片段帶 id(新影片沒有既有片段);預設 update
 * @returns {{ ok: true, video: object, segments: object[] } | { ok: false, error: string, issues?: {index:number, code:string}[] }}
 */
export function buildSongVideoPayload(body, opts = {}) {
    const mode = opts.mode === 'create' ? 'create' : 'update';
    if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid('invalid_payload');

    if (typeof body.video_id !== 'string' || !VIDEO_ID_RE.test(body.video_id)) return invalid('invalid_video_id');

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (title.length < 1 || title.length > TITLE_MAX) return invalid('invalid_payload');

    const status = body.status ?? 'draft';
    if (!STATUSES.includes(status)) return invalid('invalid_payload');

    let vtuberId = null;
    if (body.vtuber_id != null && body.vtuber_id !== '') {
        if (!isUuid(body.vtuber_id)) return invalid('invalid_payload');
        vtuberId = body.vtuber_id.toLowerCase();
    }

    let streamedAt = null;
    if (body.streamed_at != null && body.streamed_at !== '') {
        if (typeof body.streamed_at !== 'string' || Number.isNaN(Date.parse(body.streamed_at))) return invalid('invalid_payload');
        streamedAt = new Date(body.streamed_at).toISOString();
    }

    let duration = null;
    if (body.duration_seconds != null && body.duration_seconds !== '') {
        if (!isInt(body.duration_seconds) || body.duration_seconds <= 0 || body.duration_seconds > INT_MAX) return invalid('invalid_payload');
        duration = body.duration_seconds;
    }

    if (!Array.isArray(body.segments) || body.segments.length > SEGMENTS_MAX) return invalid('invalid_payload');

    const rows = [];
    for (const s of body.segments) {
        if (!s || typeof s !== 'object' || Array.isArray(s)) return invalid('invalid_payload');
        if (!isInt(s.start_seconds) || s.start_seconds < 0 || s.start_seconds > INT_MAX) return invalid('invalid_payload');
        const hasEnd = s.end_seconds !== null && s.end_seconds !== undefined;
        if (hasEnd && (!isInt(s.end_seconds) || s.end_seconds > INT_MAX)) return invalid('invalid_payload');
        if (typeof s.title !== 'string') return invalid('invalid_payload');
        if (s.id != null && (mode === 'create' || !isUuid(s.id))) return invalid('invalid_payload');
        let artist = null;
        if (s.original_artist != null) {
            if (typeof s.original_artist !== 'string') return invalid('invalid_payload');
            artist = s.original_artist.trim();
            if (artist === '') artist = null;
        }
        rows.push({
            id: s.id ? s.id.toLowerCase() : undefined,
            start: s.start_seconds,
            end: hasEnd ? s.end_seconds : null,
            title: s.title.trim(),
            artist,
        });
    }

    const issues = validateSegments(rows, { duration });
    if (issues.length > 0) return invalid('invalid_segments', issues);

    // 同一批 body 不可有重複 id（原地 update 會互相覆蓋）
    const ids = rows.filter((r) => r.id).map((r) => r.id);
    if (new Set(ids).size !== ids.length) return invalid('invalid_payload');

    const segments = [...rows]
        .sort((a, b) => a.start - b.start)
        .map((r, position) => {
            const seg = { start_seconds: r.start, end_seconds: r.end, title: r.title, original_artist: r.artist, position };
            if (r.id) seg.id = r.id;
            return seg;
        });

    return {
        ok: true,
        video: {
            video_id: body.video_id,
            title,
            vtuber_id: vtuberId,
            streamed_at: streamedAt,
            duration_seconds: duration,
            status,
        },
        segments,
    };
}
