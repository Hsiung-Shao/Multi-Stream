// Cloudflare Pages Function: Admin 歌回投稿審核
//
// 全部以 ADMIN_API_TOKEN 驗證(X-Admin-Token header,見 lib/auth-helper.js gateAdmin)。
//
// GET  /api/admin/song-submissions?status=pending   → 列表(預設只列待審,新到舊,最多 100;不含 segments 與 ip_hash)
// GET  /api/admin/song-submissions?id=xxx           → 單筆(含 segments);有 target_video_ref 時另附 existing(該影片既有片段)
//                                                      與 existing_video(該影片目前的欄位)
// POST /api/admin/song-submissions?id=xxx&action=approve
//        body { video_ref, video, segments }(管理員微調後的版本;video_ref 為修正對象,新增為 null)
//        只打一次 rpc approve_song_submission:鎖投稿列、寫入影片＋片段、標記 approved,同一交易
// POST /api/admin/song-submissions?id=xxx&action=reject  body { notes }(≤500 字)
//
// 回應:{ ok: true, ... } 或 { ok: false, error, issues? }

import { jsonResponse, handleOptions, readJsonBody } from '../../lib/cors.js';
import { select, update, rpc } from '../../lib/supabase-server.js';
import { gateAdmin } from '../../lib/auth-helper.js';
import { logError } from '../../lib/logger.js';
import { buildSongVideoPayload, isUuid } from '../../lib/songs.js';

const MAX_BODY_BYTES = 128 * 1024; // 與後台存檔同上限
const LIST_LIMIT = 100;
const NOTES_MAX = 500;
const STATUSES = ['pending', 'approved', 'rejected'];
const NO_STORE = { 'Cache-Control': 'no-store' };
// 不回 ip_hash(審核用不到)
const LIST_COLUMNS = 'id,kind,video_id,target_video_ref,title,vtuber_id,streamed_at,source_note,submitter_contact,status,reviewer_notes,result_video_ref,created_at,reviewed_at';
const DETAIL_COLUMNS = `${LIST_COLUMNS},segments`;
const SEGMENT_COLUMNS = 'id,code,start_seconds,end_seconds,title,original_artist,version_note,position';
const VIDEO_COLUMNS = 'id,video_id,title,vtuber_id,streamed_at,duration_seconds,status';

function idFromQuery(url) {
    const id = url.searchParams.get('id');
    return isUuid(id) ? id.toLowerCase() : null;
}

function pgError(res) {
    try {
        const j = JSON.parse(res.error || '');
        return { code: j?.code ?? null, message: String(j?.message ?? '') };
    } catch {
        return { code: null, message: '' };
    }
}

// ---------- GET ----------

export async function onRequestGet(context) {
    const { request, env } = context;
    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const url = new URL(request.url);
    if (url.searchParams.has('id')) {
        const id = idFromQuery(url);
        if (!id) return jsonResponse({ ok: false, error: 'invalid_id' }, 400, request);

        const res = await select(env, `song_submissions?id=eq.${encodeURIComponent(id)}&select=${DETAIL_COLUMNS}&limit=1`);
        if (!res.ok) {
            await logError(env, 'admin-song-submissions', 'fetch single failed', { metadata: { status: res.status, error: res.error?.slice(0, 500) } });
            return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
        }
        const submission = res.data?.[0];
        if (!submission) return jsonResponse({ ok: false, error: 'not_found' }, 404, request);

        let existing = null;
        let existingVideo = null;
        if (submission.target_video_ref) {
            // 修正型：審核畫面以原歌回的影片欄位預填，核准時才不會被投稿內容覆寫（長度、草稿狀態）
            const vid = await select(
                env,
                `song_videos?id=eq.${encodeURIComponent(submission.target_video_ref)}&select=${VIDEO_COLUMNS}&limit=1`,
            );
            if (!vid.ok) {
                await logError(env, 'admin-song-submissions', 'fetch existing video failed', { metadata: { status: vid.status, error: vid.error?.slice(0, 500) } });
                return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
            }
            existingVideo = vid.data?.[0] ?? null;

            const seg = await select(
                env,
                `song_segments?video_ref=eq.${encodeURIComponent(submission.target_video_ref)}&select=${SEGMENT_COLUMNS}&order=start_seconds.asc`,
            );
            if (!seg.ok) {
                await logError(env, 'admin-song-submissions', 'fetch existing segments failed', { metadata: { status: seg.status, error: seg.error?.slice(0, 500) } });
                return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
            }
            existing = seg.data || [];
        }
        return jsonResponse({ ok: true, submission, existing, existing_video: existingVideo }, 200, request, NO_STORE);
    }

    const status = url.searchParams.get('status') || 'pending';
    if (!STATUSES.includes(status)) return jsonResponse({ ok: false, error: 'invalid_status' }, 400, request);
    const res = await select(env, `song_submissions?status=eq.${status}&select=${LIST_COLUMNS}&order=created_at.desc&limit=${LIST_LIMIT}`);
    if (!res.ok) {
        await logError(env, 'admin-song-submissions', 'list failed', { metadata: { status: res.status, error: res.error?.slice(0, 500) } });
        return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
    }
    return jsonResponse({ ok: true, submissions: res.data || [] }, 200, request, NO_STORE);
}

// ---------- POST ----------

export async function onRequestPost(context) {
    const { request, env } = context;
    const gate = gateAdmin(request, env);
    if (!gate.ok) return gate.response;

    const url = new URL(request.url);
    const id = idFromQuery(url);
    if (!id) return jsonResponse({ ok: false, error: 'invalid_id' }, 400, request);
    const action = url.searchParams.get('action');
    if (action !== 'approve' && action !== 'reject') {
        return jsonResponse({ ok: false, error: 'invalid_action' }, 400, request);
    }

    const parsed = await readJsonBody(request, MAX_BODY_BYTES);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return jsonResponse({ ok: false, error: 'invalid_payload' }, 400, request);
    }

    return action === 'approve' ? approve(context, id, body) : reject(context, id, body);
}

async function approve({ request, env }, id, body) {
    let videoRef = null;
    if (body.video_ref !== undefined && body.video_ref !== null) {
        if (!isUuid(body.video_ref)) return jsonResponse({ ok: false, error: 'invalid_payload' }, 400, request);
        videoRef = body.video_ref.toLowerCase();
    }
    if (!body.video || typeof body.video !== 'object' || Array.isArray(body.video)) {
        return jsonResponse({ ok: false, error: 'invalid_payload' }, 400, request);
    }

    // 修正型(有 video_ref)片段可帶既有 id → update 模式;新增型不得帶 id → create 模式
    const built = buildSongVideoPayload(
        { ...body.video, segments: body.segments },
        { mode: videoRef ? 'update' : 'create' },
    );
    if (!built.ok) {
        return jsonResponse({ ok: false, error: built.error, issues: built.issues }, 400, request);
    }

    const res = await rpc(env, 'approve_song_submission', {
        p_id: id,
        p_video_ref: videoRef,
        p_video: built.video,
        p_segments: built.segments,
    });
    if (!res.ok) {
        const { code, message } = pgError(res);
        if (message.includes('not_pending')) return jsonResponse({ ok: false, error: 'not_pending' }, 409, request);
        if (message.includes('unknown_segment_id')) return jsonResponse({ ok: false, error: 'unknown_segment_id' }, 400, request);
        if (message.includes('video_not_found') || code === 'P0002') return jsonResponse({ ok: false, error: 'video_not_found' }, 404, request);
        // 片段 code 重抽 5 次仍撞號(song_segments_code_key)是伺服器問題,不是影片重複
        if (code === '23505' && !message.includes('song_segments')) return jsonResponse({ ok: false, error: 'video_exists' }, 409, request);
        await logError(env, 'admin-song-submissions', 'approve failed', {
            metadata: { status: res.status, error: res.error?.slice(0, 500), target_id: id },
        });
        return jsonResponse({ ok: false, error: 'approve_failed' }, 500, request);
    }

    // RPC 回傳 { id, segments }(也容忍純 uuid 字串);成功不另寫審計日誌(核准紀錄就在投稿列的 status/reviewed_at)
    const data = res.data;
    const resultRef = typeof data === 'string' ? data : data?.id ?? null;
    return jsonResponse({ ok: true, video_ref: resultRef }, 200, request);
}

async function reject({ request, env }, id, body) {
    let notes = null;
    if (body.notes !== undefined && body.notes !== null) {
        if (typeof body.notes !== 'string') return jsonResponse({ ok: false, error: 'invalid_payload' }, 400, request);
        notes = body.notes.trim() || null;
        if (notes && notes.length > NOTES_MAX) return jsonResponse({ ok: false, error: 'notes_too_long' }, 400, request);
    }

    // 只動待審那筆;更新 0 列代表已被處理過(或不存在)
    const res = await update(env, 'song_submissions', `id=eq.${encodeURIComponent(id)}&status=eq.pending`, {
        status: 'rejected',
        reviewer_notes: notes,
        reviewed_at: new Date().toISOString(),
    });
    if (!res.ok) {
        await logError(env, 'admin-song-submissions', 'reject failed', {
            metadata: { status: res.status, error: res.error?.slice(0, 500), target_id: id },
        });
        return jsonResponse({ ok: false, error: 'reject_failed' }, 500, request);
    }
    if (!Array.isArray(res.data) || res.data.length === 0) {
        return jsonResponse({ ok: false, error: 'not_pending' }, 409, request);
    }
    return jsonResponse({ ok: true }, 200, request);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'GET, POST, OPTIONS' });
}
