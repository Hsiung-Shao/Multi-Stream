// 歌曲整理（合併／拆開／改名／配對）：請求參數驗證（純函式，供 functions/api/admin/song-library.js 使用）
//
// 各函式回傳 { value } 或 { error }；error 一律是 invalid_payload，驗證失敗不會發出任何 DB 請求。
// 長度上限與 migration 20261027014449 的 admin_rename_song／admin_match_songs 一致。

import { isUuid, TITLE_MAX } from './songs.js';

export const MATCH_ITEMS_MAX = 200;
export const SEARCH_LIMIT = 20;
export const SEARCH_QUERY_MAX = 200;
const BIGINT_MAX = Number.MAX_SAFE_INTEGER;

const bad = () => ({ error: 'invalid_payload' });
const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** 正整數 id（JS number 的安全整數範圍內） */
export function isPositiveInt(v) {
    return typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= BIGINT_MAX;
}

/** 查詢字串的 id：只接受純數字字串（拒絕 1.5、-3、0、abc、1e3） */
export function parseQueryId(raw) {
    if (typeof raw !== 'string' || !/^[0-9]+$/.test(raw)) return null;
    const n = Number(raw);
    return isPositiveInt(n) ? n : null;
}

export function parseMergeBody(body) {
    if (!isRecord(body)) return bad();
    if (!isPositiveInt(body.source) || !isPositiveInt(body.target)) return bad();
    return { value: { source: body.source, target: body.target, allowArtistMismatch: body.allow_artist_mismatch === true } };
}

export function parseSplitBody(body) {
    if (!isRecord(body) || !isUuid(body.segment_id)) return bad();
    return { value: { segmentId: body.segment_id.toLowerCase() } };
}

export function parseRenameBody(body) {
    if (!isRecord(body) || !isPositiveInt(body.id) || typeof body.title !== 'string') return bad();
    const title = body.title.trim();
    if (title.length < 1 || title.length > TITLE_MAX) return bad();
    // p_artist 在 DB 沒有預設值，沒帶／空白一律明確傳 null
    let artist = null;
    if (body.artist !== undefined && body.artist !== null) {
        if (typeof body.artist !== 'string') return bad();
        artist = body.artist.trim() || null;
        if (artist && artist.length > TITLE_MAX) return bad();
    }
    return { value: { id: body.id, title, artist } };
}

/** items 原樣轉給 RPC（逐項格式由 DB 的 invalid_items 把關），這裡只擋「不是陣列」與超量 */
export function parseMatchBody(body) {
    if (!isRecord(body) || !Array.isArray(body.items) || body.items.length > MATCH_ITEMS_MAX) return bad();
    return { value: { items: body.items } };
}
