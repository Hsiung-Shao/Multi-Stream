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
// DELETE /api/admin/songs?id=xxx   → 刪影片(CASCADE 清掉片段)
//
// 片段的 code 由資料庫 default(gen_song_code)產生,這裡不產生、也不接受 body 帶入。
// 不用 upsert:部分欄位 upsert 會撞 NOT NULL、return=minimal 空 body 會讓 res.json() 崩潰
// (memory error_postgrest_upsert_not_null_and_empty_body)。
// 多步驟寫入非單一交易(PostgREST 限制):失敗時 POST 會盡力把剛建的影片刪回去;PUT 在
// 「更新 → 新增 → 刪除」順序中途失敗可重送同一份 body 補齊。
//
// 回應:{ ok: true, video, segments? } 或 { ok: false, error, issues? }

import { jsonResponse, handleOptions, readJsonBody } from '../../lib/cors.js';
import { select, insert, update, remove } from '../../lib/supabase-server.js';
import { gateAdmin } from '../../lib/auth-helper.js';
import { logError, logWarn } from '../../lib/logger.js';
import { buildSongVideoPayload, isUuid } from '../../lib/songs.js';

const MAX_BODY_BYTES = 128 * 1024; // 200 片段 × 約 300 bytes 仍遠低於此
const LIST_LIMIT = 200;
const SEGMENT_INSERT_ATTEMPTS = 3;
const NO_STORE = { 'Cache-Control': 'no-store' };
const SEGMENT_COLUMNS = 'id,code,video_ref,start_seconds,end_seconds,title,original_artist,position';

function parseIdFromQuery(url) {
    const id = url.searchParams.get('id');
    return isUuid(id) ? id : null;
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

/** 批次新增片段(不帶 id/code);撞 code unique(23505)或 CHECK(23514)時整批重試 */
async function insertSegments(env, videoRef, segments) {
    if (segments.length === 0) return { ok: true, data: [] };
    const rows = segments.map((s) => ({
        video_ref: videoRef,
        start_seconds: s.start_seconds,
        end_seconds: s.end_seconds,
        title: s.title,
        original_artist: s.original_artist,
        position: s.position,
    }));
    let res;
    for (let attempt = 0; attempt < SEGMENT_INSERT_ATTEMPTS; attempt++) {
        res = await insert(env, 'song_segments', rows);
        if (res.ok) return { ok: true, data: res.data || [] };
        const code = pgCode(res);
        if (code !== '23505' && code !== '23514') break;
    }
    return { ok: false, res };
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

    const res = await select(
        env,
        `song_videos?select=*,song_segments(count)&order=created_at.desc&limit=${LIST_LIMIT}`,
    );
    if (!res.ok) {
        await logFail(env, 'list failed', res);
        return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
    }
    const videos = (res.data || []).map(({ song_segments, ...v }) => ({
        ...v,
        segment_count: song_segments?.[0]?.count ?? 0,
    }));
    return jsonResponse({ ok: true, videos }, 200, request, NO_STORE);
}

// ---------- POST ----------

export async function onRequestPost(context) {
    const { request, env } = context;
    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const parsed = await readJsonBody(request, MAX_BODY_BYTES);
    if (!parsed.ok) return parsed.response;

    const built = buildSongVideoPayload(parsed.body);
    if (!built.ok) {
        return jsonResponse({ ok: false, error: built.error, issues: built.issues }, 400, request);
    }
    if (misconfigured(env)) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
    }

    const vres = await insert(env, 'song_videos', built.video);
    if (!vres.ok) {
        if (vres.status === 409 || pgCode(vres) === '23505') {
            return jsonResponse({ ok: false, error: 'video_exists' }, 409, request);
        }
        await logFail(env, 'insert video failed', vres);
        return jsonResponse({ ok: false, error: 'create_failed' }, 500, request);
    }
    const video = Array.isArray(vres.data) ? vres.data[0] : vres.data;

    const sres = await insertSegments(env, video.id, built.segments);
    if (!sres.ok) {
        await logFail(env, 'insert segments failed', sres.res, { video_id: video.id });
        // 盡力回滾:不留下佔住 video_id 卻沒有片段的影片
        const rb = await remove(env, 'song_videos', `id=eq.${encodeURIComponent(video.id)}`);
        if (!rb.ok) await logFail(env, 'rollback video failed', rb, { video_id: video.id });
        return jsonResponse({ ok: false, error: 'create_failed' }, 500, request);
    }

    void logWarn(env, 'admin-songs', 'song video created', {
        metadata: { id: video.id, segments: sres.data.length, status: video.status },
    });
    return jsonResponse({ ok: true, video, segments: sres.data }, 200, request);
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

    const vres = await update(env, 'song_videos', `id=eq.${encodeURIComponent(id)}`, built.video);
    if (!vres.ok) {
        if (vres.status === 409 || pgCode(vres) === '23505') {
            return jsonResponse({ ok: false, error: 'video_exists' }, 409, request);
        }
        await logFail(env, 'update video failed', vres, { target_id: id });
        return jsonResponse({ ok: false, error: 'update_failed' }, 500, request);
    }
    if (!Array.isArray(vres.data) || vres.data.length === 0) {
        return jsonResponse({ ok: false, error: 'not_found' }, 404, request);
    }
    const video = vres.data[0];

    // 現有片段:決定哪些原地 update、哪些要刪
    const existing = await fetchSegments(env, id);
    if (!existing.ok) {
        await logFail(env, 'fetch existing segments failed', existing, { target_id: id });
        return jsonResponse({ ok: false, error: 'update_failed' }, 500, request);
    }
    const existingIds = new Set((existing.data || []).map((s) => s.id));
    const keepIds = new Set();
    const toUpdate = [];
    const toInsert = [];
    for (const seg of built.segments) {
        if (!seg.id) {
            toInsert.push(seg);
        } else if (existingIds.has(seg.id)) {
            keepIds.add(seg.id);
            toUpdate.push(seg);
        } else {
            // id 不屬於這支影片:不能當新片段偷塞(會讓 code 對不上),直接拒絕
            return jsonResponse({ ok: false, error: 'unknown_segment_id' }, 400, request);
        }
    }
    const toDelete = [...existingIds].filter((sid) => !keepIds.has(sid));

    // 1) 原地更新(code 不動)
    for (const seg of toUpdate) {
        const ures = await update(
            env,
            'song_segments',
            `id=eq.${encodeURIComponent(seg.id)}&video_ref=eq.${encodeURIComponent(id)}`,
            {
                start_seconds: seg.start_seconds,
                end_seconds: seg.end_seconds,
                title: seg.title,
                original_artist: seg.original_artist,
                position: seg.position,
            },
        );
        if (!ures.ok) {
            await logFail(env, 'update segment failed', ures, { target_id: id, segment_id: seg.id });
            return jsonResponse({ ok: false, error: 'update_failed' }, 500, request);
        }
    }

    // 2) 新增
    const ires = await insertSegments(env, id, toInsert);
    if (!ires.ok) {
        await logFail(env, 'insert segments failed', ires.res, { target_id: id });
        return jsonResponse({ ok: false, error: 'update_failed' }, 500, request);
    }

    // 3) 刪除 body 沒有的(最後才刪,中途失敗不會先丟資料)
    if (toDelete.length > 0) {
        const dres = await remove(env, 'song_segments', `id=in.(${toDelete.map(encodeURIComponent).join(',')})&video_ref=eq.${encodeURIComponent(id)}`);
        if (!dres.ok) {
            await logFail(env, 'delete segments failed', dres, { target_id: id });
            return jsonResponse({ ok: false, error: 'update_failed' }, 500, request);
        }
    }

    const final = await fetchSegments(env, id);
    if (!final.ok) {
        await logFail(env, 'fetch segments after update failed', final, { target_id: id });
        return jsonResponse({ ok: false, error: 'update_failed' }, 500, request);
    }

    void logWarn(env, 'admin-songs', 'song video updated', {
        metadata: { id, updated: toUpdate.length, inserted: toInsert.length, deleted: toDelete.length },
    });
    return jsonResponse({ ok: true, video, segments: final.data || [] }, 200, request);
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
