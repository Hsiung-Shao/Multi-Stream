// Cloudflare Pages Function: Admin 歌回社群修改紀錄（社群投稿送出即生效，管理員事後檢視、還原、鎖定）
//
// 全部以 ADMIN_API_TOKEN 驗證(X-Admin-Token header,見 lib/auth-helper.js gateAdmin)。
//
// GET  /api/admin/song-submissions
//        → 最近 50 筆 applied／reverted 紀錄(新到舊;不含 ip_hash),每筆附 summary { added, changed, fields }
// POST /api/admin/song-submissions?action=revert  body { id }
//        只打一次 rpc admin_revert_song_edit:還原到這筆之前,並把同一支影片之後的紀錄一併標成 reverted;成功後清目錄快取
// POST /api/admin/song-submissions?action=lock    body { videoRef, locked }
//        切換 song_videos.community_locked(鎖定後社群不能再編輯該歌回)
//
// 回應:{ ok: true, ... } 或 { ok: false, error }

import { jsonResponse, handleOptions, readJsonBody } from '../../lib/cors.js';
import { select, update, rpc } from '../../lib/supabase-server.js';
import { gateAdmin } from '../../lib/auth-helper.js';
import { logError } from '../../lib/logger.js';
import { isUuid } from '../../lib/songs.js';
import { postgrestErrorMessage } from '../../lib/submit-guard.js';
import { purgeCatalogCache } from '../../lib/song-catalog-cache.js';

const MAX_BODY_BYTES = 4096;
const LIST_LIMIT = 50;
const NO_STORE = { 'Cache-Control': 'no-store' };
// 刻意不選 ip_hash、source_note、submitter_contact(列表用不到);before／segments 只用來算 summary,不回給前端
const LIST_COLUMNS = 'id,kind,video_id,title,vtuber_id,streamed_at,status,created_at,reverted_at,target_video_ref,before,segments';

const SEGMENT_FIELDS = ['start_seconds', 'end_seconds', 'title', 'original_artist', 'version_note'];
const segmentChanged = (prev, next) => SEGMENT_FIELDS.some((k) => (prev[k] ?? null) !== (next[k] ?? null));

/**
 * 以 code 對 before 的片段算變更摘要:
 *   沒 code 或找不到 → added;start、end、title、original_artist、version_note 任一不同 → changed。
 *   新歌回(before 為 null)全部算 added。
 * fields:影片欄位有變的名稱(title、vtuber_id、streamed_at),片段有新增或變動時另加 'segments'。
 */
function summarize(row) {
    const segs = Array.isArray(row.segments) ? row.segments : [];
    const before = row.before;
    if (!before) return { added: segs.length, changed: 0, fields: [] };

    const old = new Map((before.segments || []).filter((s) => s.code).map((s) => [s.code, s]));
    let added = 0;
    let changed = 0;
    for (const s of segs) {
        const prev = s.code ? old.get(s.code) : undefined;
        if (!prev) added++;
        else if (segmentChanged(prev, s)) changed++;
    }

    const bv = before.video || {};
    const fields = [];
    if (bv.title !== row.title) fields.push('title');
    if ((bv.vtuber_id ?? null) !== (row.vtuber_id ?? null)) fields.push('vtuber_id');
    // 毫秒精度比較（Date.parse 只留到毫秒）：.679176 與 .679 是同一瞬間，不算改了開台時間
    const ts = (t) => (t ? Math.floor(Date.parse(t)) : null);
    if (ts(bv.streamed_at) !== ts(row.streamed_at)) fields.push('streamed_at');
    if (added > 0 || changed > 0) fields.push('segments');
    return { added, changed, fields };
}

// ---------- GET ----------

export async function onRequestGet(context) {
    const { request, env } = context;
    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const res = await select(
        env,
        `song_submissions?status=in.(applied,reverted)&select=${LIST_COLUMNS}&order=created_at.desc&limit=${LIST_LIMIT}`,
    );
    if (!res.ok) {
        await logError(env, 'admin-song-submissions', 'list failed', { metadata: { status: res.status, error: res.error?.slice(0, 500) } });
        return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
    }
    const submissions = (res.data || []).map((r) => ({
        id: r.id,
        kind: r.kind,
        video_id: r.video_id,
        title: r.title,
        status: r.status,
        created_at: r.created_at,
        reverted_at: r.reverted_at ?? null,
        target_video_ref: r.target_video_ref ?? null,
        summary: summarize(r),
    }));
    return jsonResponse({ ok: true, submissions }, 200, request, NO_STORE);
}

// ---------- POST ----------

export async function onRequestPost(context) {
    const { request, env } = context;
    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const action = new URL(request.url).searchParams.get('action');
    if (action !== 'revert' && action !== 'lock') {
        return jsonResponse({ ok: false, error: 'invalid_action' }, 400, request);
    }

    const parsed = await readJsonBody(request, MAX_BODY_BYTES);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return jsonResponse({ ok: false, error: 'invalid_payload' }, 400, request);
    }

    return action === 'revert' ? revert(context, body) : lock(context, body);
}

async function revert(context, body) {
    const { request, env } = context;
    if (!isUuid(body.id)) return jsonResponse({ ok: false, error: 'invalid_id' }, 400, request);
    const id = body.id.toLowerCase();

    const res = await rpc(env, 'admin_revert_song_edit', { p_submission: id });
    if (!res.ok) {
        const message = postgrestErrorMessage(res.error);
        if (message === 'not_applied') return jsonResponse({ ok: false, error: 'not_applied' }, 409, request);
        if (message === 'submission_not_found') return jsonResponse({ ok: false, error: 'submission_not_found' }, 404, request);
        await logError(env, 'admin-song-submissions', 'revert failed', {
            metadata: { status: res.status, error: res.error?.slice(0, 500), target_id: id },
        });
        return jsonResponse({ ok: false, error: 'revert_failed' }, 500, request);
    }
    purgeCatalogCache(context); // 還原也改了影片與片段，目錄不必等 TTL
    return jsonResponse({ ok: true, ...(res.data && typeof res.data === 'object' ? res.data : {}) }, 200, request);
}

async function lock({ request, env }, body) {
    if (!isUuid(body.videoRef) || typeof body.locked !== 'boolean') {
        return jsonResponse({ ok: false, error: 'invalid_payload' }, 400, request);
    }
    const videoRef = body.videoRef.toLowerCase();

    const res = await update(env, 'song_videos', `id=eq.${encodeURIComponent(videoRef)}`, { community_locked: body.locked });
    if (!res.ok) {
        await logError(env, 'admin-song-submissions', 'lock failed', {
            metadata: { status: res.status, error: res.error?.slice(0, 500), target_id: videoRef },
        });
        return jsonResponse({ ok: false, error: 'lock_failed' }, 500, request);
    }
    // 更新 0 列 = 影片不存在
    if (!Array.isArray(res.data) || res.data.length === 0) {
        return jsonResponse({ ok: false, error: 'video_not_found' }, 404, request);
    }
    return jsonResponse({ ok: true, locked: body.locked }, 200, request);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'GET, POST, OPTIONS' });
}
