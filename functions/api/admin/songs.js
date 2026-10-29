// Cloudflare Pages Function: Admin 歌曲播放清單（歌回影片＋歌曲片段）CRUD
//
// 全部以 ADMIN_API_TOKEN 驗證(X-Admin-Token header,見 lib/auth-helper.js gateAdmin)。
//
// GET    /api/admin/songs          → 列出所有歌回影片(含草稿),每支附 segment_count
// GET    /api/admin/songs?id=xxx   → 單支影片＋其片段(依 start_seconds)
// POST   /api/admin/songs          → 建立影片＋片段
// PUT    /api/admin/songs?id=xxx   → 更新影片欄位並同步片段:
//                                    body 片段帶 id → 依 id 原地 update(保住分享用的 code)
//                                    不帶 id → insert;DB 有但 body 沒有 → delete
//                                    (id 不屬於這支影片 → 400 unknown_segment_id)
// DELETE /api/admin/songs?id=xxx   → 刪影片(CASCADE 清掉片段)
//
// 寫入（POST／PUT）只打一次 rpc admin_save_song_video:資料庫單一交易完成影片＋全部片段
// （帶 id 的片段原地更新以保住分享用的 code、不帶 id 新增並由 DB 產生 code、沒傳的刪除）。
// 逐筆打 PostgREST 在長歌回會超過 Cloudflare 每次請求的 subrequest 上限,且中途失敗會留下半套資料。
// 驗證失敗(400)不會發出任何 DB 請求;成功時也不另寫審計日誌(維持單一 subrequest)。
//
// 回應:{ ok: true, video, segments? } 或 { ok: false, error, issues? }

import { jsonResponse, handleOptions, readJsonBody } from '../../lib/cors.js';
import { select, remove, rpc } from '../../lib/supabase-server.js';
import { gateAdmin } from '../../lib/auth-helper.js';
import { logError, logWarn } from '../../lib/logger.js';
import { buildSongVideoPayload, isUuid } from '../../lib/songs.js';

const MAX_BODY_BYTES = 128 * 1024; // 200 片段 × 約 300 bytes 仍遠低於此
/** 列表每頁筆數只接受這幾種（後台選單同一份） */
const PAGE_SIZES = [15, 25, 50, 100];

/** 列表 query：page（≥1）、page_size、created_from／created_to（ISO，選填）；不合法回 null */
function parseListQuery(url) {
    const p = url.searchParams;
    const page = p.has('page') ? Number(p.get('page')) : 1;
    const pageSize = p.has('page_size') ? Number(p.get('page_size')) : PAGE_SIZES[0];
    if (!Number.isInteger(page) || page < 1 || !PAGE_SIZES.includes(pageSize)) return null;
    const from = p.get('created_from') || null;
    const to = p.get('created_to') || null;
    if ((from && Number.isNaN(Date.parse(from))) || (to && Number.isNaN(Date.parse(to)))) return null;
    return { page, pageSize, from, to };
}
const NO_STORE = { 'Cache-Control': 'no-store' };
const SEGMENT_COLUMNS = 'id,code,video_ref,song_id,start_seconds,end_seconds,title,original_artist,version_note,position';

function parseIdFromQuery(url) {
    const id = url.searchParams.get('id');
    return isUuid(id) ? id.toLowerCase() : null;
}

/** PostgREST 錯誤是 JSON 文字,取出 SQLSTATE code */
function pgCode(res) {
    try {
        return JSON.parse(res.error || '')?.code ?? null;
    } catch {
        return null;
    }
}

function logFail(env, message, res, extra = {}) {
    return logError(env, 'admin-songs', message, {
        metadata: { status: res.status, error: res.error?.slice(0, 500), ...extra },
    });
}

function misconfigured(env) {
    return !env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY;
}

/** 呼叫單一交易 RPC,並把資料庫錯誤對應成 HTTP 回應(成功回 { res },失敗回 { response }) */
async function saveVideo(env, request, id, built, failMessage) {
    const res = await rpc(env, 'admin_save_song_video', {
        p_id: id,
        p_video: built.video,
        p_segments: built.segments,
    });
    if (res.ok) return { res };
    const code = pgCode(res);
    const text = res.error || '';
    if (text.includes('unknown_segment_id')) {
        return { response: jsonResponse({ ok: false, error: 'unknown_segment_id' }, 400, request) };
    }
    if (text.includes('video_not_found') || code === 'P0002') {
        return { response: jsonResponse({ ok: false, error: 'not_found' }, 404, request) };
    }
    // 只有唯一鍵衝突才是 video_exists;片段 code 重抽 5 次仍撞號(song_segments_code_key)是伺服器問題
    if (code === '23505' && !text.includes('song_segments')) {
        return { response: jsonResponse({ ok: false, error: 'video_exists' }, 409, request) };
    }
    await logFail(env, failMessage, res, { target_id: id });
    if (code === '23503') {
        return { response: jsonResponse({ ok: false, error: 'invalid_reference' }, 400, request) };
    }
    return { response: jsonResponse({ ok: false, error: id ? 'update_failed' : 'create_failed' }, 500, request) };
}

async function fetchSegments(env, videoRef) {
    return select(
        env,
        `song_segments?video_ref=eq.${encodeURIComponent(videoRef)}&select=${SEGMENT_COLUMNS}&order=start_seconds.asc`,
    );
}

// ---------- GET ----------

export async function onRequestGet(context) {
    const { request, env } = context;
    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const url = new URL(request.url);
    const id = parseIdFromQuery(url);
    if (id) {
        const vres = await select(env, `song_videos?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
        if (!vres.ok) {
            await logFail(env, 'fetch single failed', vres);
            return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
        }
        if (!Array.isArray(vres.data) || vres.data.length === 0) {
            return jsonResponse({ ok: false, error: 'not_found' }, 404, request);
        }
        const sres = await fetchSegments(env, id);
        if (!sres.ok) {
            await logFail(env, 'fetch segments failed', sres);
            return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
        }
        return jsonResponse({ ok: true, video: vres.data[0], segments: sres.data || [] }, 200, request, NO_STORE);
    }

    const q = parseListQuery(url);
    if (!q) return jsonResponse({ ok: false, error: 'invalid_query' }, 400, request);
    const range = [
        q.from ? `&created_at=gte.${encodeURIComponent(q.from)}` : '',
        q.to ? `&created_at=lt.${encodeURIComponent(q.to)}` : '',
    ].join('');
    const res = await select(
        env,
        `song_videos?select=*,song_segments(count)${range}&order=created_at.desc,id.desc&offset=${(q.page - 1) * q.pageSize}&limit=${q.pageSize}`,
        { prefer: 'count=exact' },
    );
    if (!res.ok) {
        await logFail(env, 'list failed', res);
        return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
    }
    const videos = (res.data || []).map(({ song_segments, ...v }) => ({
        ...v,
        segment_count: song_segments?.[0]?.count ?? 0,
    }));
    // Content-Range：`0-14/40`、沒有資料時 `*/0`
    const total = Number(res.headers?.get('Content-Range')?.split('/')[1]);
    return jsonResponse({ ok: true, videos, total: Number.isFinite(total) ? total : videos.length }, 200, request, NO_STORE);
}

// ---------- POST ----------

export async function onRequestPost(context) {
    const { request, env } = context;
    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const parsed = await readJsonBody(request, MAX_BODY_BYTES);
    if (!parsed.ok) return parsed.response;

    const built = buildSongVideoPayload(parsed.body, { mode: 'create' });
    if (!built.ok) {
        return jsonResponse({ ok: false, error: built.error, issues: built.issues }, 400, request);
    }
    if (misconfigured(env)) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
    }

    const saved = await saveVideo(env, request, null, built, 'create failed');
    if (saved.response) return saved.response;
    const { id, segments } = saved.res.data;

    return jsonResponse({ ok: true, video: { id, ...built.video }, segments: segments || [] }, 200, request);
}

// ---------- PUT ----------

export async function onRequestPut(context) {
    const { request, env } = context;
    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const url = new URL(request.url);
    const id = parseIdFromQuery(url);
    if (!id) {
        return jsonResponse({ ok: false, error: 'id_required' }, 400, request);
    }

    const parsed = await readJsonBody(request, MAX_BODY_BYTES);
    if (!parsed.ok) return parsed.response;

    const built = buildSongVideoPayload(parsed.body);
    if (!built.ok) {
        return jsonResponse({ ok: false, error: built.error, issues: built.issues }, 400, request);
    }
    if (misconfigured(env)) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
    }

    const saved = await saveVideo(env, request, id, built, 'update failed');
    if (saved.response) return saved.response;
    const segments = saved.res.data?.segments || [];

    return jsonResponse({ ok: true, video: { id, ...built.video }, segments }, 200, request);
}

// ---------- DELETE ----------

export async function onRequestDelete(context) {
    const { request, env } = context;
    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const url = new URL(request.url);
    const id = parseIdFromQuery(url);
    if (!id) {
        return jsonResponse({ ok: false, error: 'id_required' }, 400, request);
    }
    if (misconfigured(env)) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
    }

    const res = await remove(env, 'song_videos', `id=eq.${encodeURIComponent(id)}`);
    if (!res.ok) {
        await logFail(env, 'delete failed', res, { target_id: id });
        return jsonResponse({ ok: false, error: 'delete_failed' }, 500, request);
    }
    if (!Array.isArray(res.data) || res.data.length === 0) {
        return jsonResponse({ ok: false, error: 'not_found' }, 404, request);
    }

    void logWarn(env, 'admin-songs', 'song video deleted', { metadata: { id } });
    return jsonResponse({ ok: true }, 200, request);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'GET, POST, PUT, DELETE, OPTIONS' });
}
