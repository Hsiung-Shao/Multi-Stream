// 歌回社群直接編輯：body 驗證（純函式，供 functions/api/songs/submissions.js 的 guardSubmission 使用）
//
// body：{ videoId, title, vtuberId?, streamedAt?, rev?, durationSeconds?,
//         segments: [{ code?, start, end, title, artist?, versionNote?, endEstimated? }], note?, contact?, turnstileToken }
// rev＝使用者載入時的影片版本（updated_at 原字串），修正既有歌回時由 DB 比對；新歌回為 null，此時必須指定 vtuberId。
// 修正時 vtuberId 為 null＝沿用既有的 VTuber（不能清空），給別的 VTuber 則換人（DB 以 coalesce 處理）。
// 片段規則沿用 lib/songs.js 的 validateSegments（同名 issue code）；片段可帶 code（既有片段的短 ID，供 DB 原地更新），
// 但不可帶 id（id 是 DB 內部主鍵，不開放給匿名使用者）。
// 回傳 { value } 或 { error, issues? }（error 為 invalid_payload | invalid_video_id | invalid_segments | vtuber_required）。

import { validateSegments, isUuid, TITLE_MAX } from './songs.js';

export const SUBMISSION_SEGMENTS_MAX = 200;
export const NOTE_MAX = 300;
export const CONTACT_MAX = 200;
export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const CODE_RE = /^[0-9a-z]{8}$/;
const REV_MAX = 64;
const DURATION_MAX = 86400;
const INT_MAX = 2147483647;

const isInt = (v) => typeof v === 'number' && Number.isInteger(v);
const bad = (error, issues) => (issues ? { error, issues } : { error });

/** 選填文字：undefined／null／空白 → null；非字串或超過上限 → undefined（呼叫端視為不合法） */
function optionalText(v, max) {
    if (v === undefined || v === null) return null;
    if (typeof v !== 'string') return undefined;
    const t = v.trim();
    if (t === '') return null;
    return t.length > max ? undefined : t;
}

/**
 * @param {any} body
 * @returns {{ value: { videoId: string, title: string, vtuberId: string|null, streamedAt: string|null,
 *                      rev: string|null, durationSeconds: number|null,
 *                      segments: { code?: string, start: number, end: number, title: string, artist: string|null, versionNote: string|null, endEstimated: boolean }[],
 *                      note: string|null, contact: string|null } }
 *          | { error: 'invalid_payload'|'invalid_video_id'|'invalid_segments'|'vtuber_required', issues?: {index:number, code:string}[] }}
 */
export function parseSubmissionBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('invalid_payload');

    if (typeof body.videoId !== 'string' || !VIDEO_ID_RE.test(body.videoId)) return bad('invalid_video_id');

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (title.length < 1 || title.length > TITLE_MAX) return bad('invalid_payload');

    let vtuberId = null;
    if (body.vtuberId !== undefined && body.vtuberId !== null && body.vtuberId !== '') {
        if (!isUuid(body.vtuberId)) return bad('invalid_payload');
        vtuberId = body.vtuberId.toLowerCase();
    }

    let streamedAt = null;
    if (body.streamedAt !== undefined && body.streamedAt !== null && body.streamedAt !== '') {
        if (typeof body.streamedAt !== 'string' || Number.isNaN(Date.parse(body.streamedAt))) return bad('invalid_payload');
        streamedAt = new Date(body.streamedAt).toISOString();
    }

    // rev 原樣保留給 DB 比對（不解析、不正規化，否則精度被截斷會誤判 stale_edit）
    let rev = null;
    if (body.rev !== undefined && body.rev !== null) {
        if (typeof body.rev !== 'string' || body.rev === '' || body.rev.length > REV_MAX) return bad('invalid_payload');
        rev = body.rev;
    }
    // 新歌回（沒有 rev）一定要指定 VTuber；修正時不帶＝沿用既有的（不能清空），帶別人＝換人
    if (rev === null && vtuberId === null) return bad('vtuber_required');

    let durationSeconds = null;
    if (body.durationSeconds !== undefined && body.durationSeconds !== null) {
        if (!isInt(body.durationSeconds) || body.durationSeconds < 1 || body.durationSeconds > DURATION_MAX) return bad('invalid_payload');
        durationSeconds = body.durationSeconds;
    }

    const note = optionalText(body.note, NOTE_MAX);
    const contact = optionalText(body.contact, CONTACT_MAX);
    if (note === undefined || contact === undefined) return bad('invalid_payload');

    if (!Array.isArray(body.segments) || body.segments.length < 1 || body.segments.length > SUBMISSION_SEGMENTS_MAX) {
        return bad('invalid_payload');
    }
    const rows = [];
    for (const s of body.segments) {
        if (!s || typeof s !== 'object' || Array.isArray(s)) return bad('invalid_payload');
        if ('id' in s) return bad('invalid_payload'); // 不可帶片段 id（只認 code）
        if (s.code !== undefined && s.code !== null && (typeof s.code !== 'string' || !CODE_RE.test(s.code))) return bad('invalid_payload');
        if (!isInt(s.start) || s.start < 0 || s.start > INT_MAX) return bad('invalid_payload');
        if (!isInt(s.end) || s.end > INT_MAX) return bad('invalid_payload'); // end 必填
        if (typeof s.title !== 'string') return bad('invalid_payload');
        const artist = optionalText(s.artist, Number.MAX_SAFE_INTEGER);
        if (artist === undefined) return bad('invalid_payload');
        // 版本備註長度由 validateSegments 檢查（note_too_long）；非字串在此擋下
        const versionNote = optionalText(s.versionNote, Number.MAX_SAFE_INTEGER);
        if (versionNote === undefined) return bad('invalid_payload');
        const row = { start: s.start, end: s.end, title: s.title.trim(), artist, versionNote, endEstimated: s.endEstimated === true };
        if (typeof s.code === 'string') row.code = s.code; // 沒帶 code 就是新增片段，不憑空補
        rows.push(row);
    }

    const issues = validateSegments(rows);
    if (issues.length > 0) return bad('invalid_segments', issues);

    rows.sort((a, b) => a.start - b.start);
    return { value: { videoId: body.videoId, title, vtuberId, streamedAt, rev, durationSeconds, segments: rows, note, contact } };
}
