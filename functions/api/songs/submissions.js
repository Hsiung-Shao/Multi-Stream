// POST /api/songs/submissions：匿名直接編輯歌回時間軸（新歌回，或修正已上架的歌回），送出即生效
// 整個寫入由 RPC community_save_song_video 在同一個交易完成（版本比對、鎖定、不可刪片段、留修改前快照），
// 每個請求只打一次 RPC；管理員事後可在後台「社群修改紀錄」一鍵還原（admin_revert_song_edit）。
//
// 檢查順序見 functions/lib/submit-guard.js（緊急開關 → 來源 → 大小 → 封鎖 IP → 欄位驗證 → 個人配額 → Turnstile → 全站配額）。
// 修正既有歌回要帶 rev（載入時的版本），DB 發現已被別人更新會回 stale_edit；新歌回 rev 為 null 且必須指定 VTuber。
// 新歌回另有全站配額（每小時 20 支，限制被灌垃圾歌回的規模）：以伺服器查到的影片是否存在為準，不信任前端送的 rev。
// 只存雜湊 IP，不存原始 IP。緊急開關：SUBMISSIONS_DISABLED=true → 503（與其他投稿共用）。
// 成功後刪除本機房的目錄 edge 快取（其他機房與 isolate 記憶體最慢約 10 分鐘後同步）。
//
// 回應：201 { ok: true, id, kind } 或 { ok: false, error }

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { rpc, select } from '../../lib/supabase-server.js';
import { logError } from '../../lib/logger.js';
import { guardSubmission, postgrestErrorMessage } from '../../lib/submit-guard.js';
import { parseSubmissionBody } from '../../lib/song-submissions.js';
import { purgeCatalogCache } from '../../lib/song-catalog-cache.js';
import { checkKvQuota, quotaWindow } from '../../lib/rate-limit.js';

const MAX_BODY_BYTES = 32768;
const NO_STORE = { 'Cache-Control': 'no-store' };
const NEW_VIDEO_HOURLY_LIMIT = 20;
// RPC 以 exception message 當錯誤碼 → HTTP 狀態；不在表內的一律 500 save_failed
const RPC_ERRORS = {
    stale_edit: 409,
    video_exists: 409,
    cannot_delete: 400,
    unknown_segment: 400,
    vtuber_required: 400,
    video_locked: 403,
};

export async function onRequestPost(context) {
    const { request, env } = context;
    const reply = (data, status) => jsonResponse(data, status, request, NO_STORE);

    const g = await guardSubmission(context, {
        disabledFlag: 'SUBMISSIONS_DISABLED',
        maxBytes: MAX_BODY_BYTES,
        validate: parseSubmissionBody,
        quotas: (ipHash, w) => ({
            personal: [
                { key: `songs:h:${ipHash}:${w.hour}`, limit: 3, ttl: 3700 },
                { key: `songs:d:${ipHash}:${w.day}`, limit: 10, ttl: 90000 },
            ],
            global: [{ key: `songs:g:${w.hour}`, limit: 100, ttl: 3700 }],
        }),
    });
    if (!g.ok) return g.response;
    const v = g.value;

    const found = await select(env, `song_videos?video_id=eq.${encodeURIComponent(v.videoId)}&select=id&limit=1`);
    if (!found.ok) {
        await logError(env, 'songs-submissions', 'video lookup failed', { metadata: { status: found.status } });
        return reply({ ok: false, error: 'save_failed' }, 500);
    }
    const isNew = !(Array.isArray(found.data) && found.data.length > 0);
    // 新歌回必然會被 RPC 擋下的請求先回 400：不扣新歌回配額（否則用失敗請求就能把全站額度耗光，且不留紀錄）
    if (isNew && !v.vtuberId) return reply({ ok: false, error: 'vtuber_required' }, 400);
    if (isNew && v.segments.some((s) => s.code)) return reply({ ok: false, error: 'unknown_segment' }, 400);
    if (isNew && !(await checkKvQuota(env.RATE_LIMIT_KV, `songs:new:g:${quotaWindow().hour}`, NEW_VIDEO_HOURLY_LIMIT, 3700))) {
        return reply({ ok: false, error: 'rate_limited' }, 429);
    }

    // parseSubmissionBody 已依 start 排序；有 code 才帶（沒有 = 新增片段）
    const segments = v.segments.map((s, position) => ({
        ...(s.code ? { code: s.code } : {}),
        start_seconds: s.start,
        end_seconds: s.end,
        title: s.title,
        original_artist: s.artist,
        version_note: s.versionNote,
        // 估計出來的結束時間不當成站內歌曲長度（song_ref_lengths 只取 false）
        end_estimated: s.endEstimated === true,
        position,
    }));

    const res = await rpc(env, 'community_save_song_video', {
        p_video_id: v.videoId,
        // 新歌回不帶 rev：RPC 新增路徑本來就不看它，壞值也不會在扣完配額後才讓轉型失敗
        p_rev: isNew ? null : v.rev,
        p_video: { title: v.title, vtuber_id: v.vtuberId, streamed_at: v.streamedAt, duration_seconds: v.durationSeconds },
        p_segments: segments,
        p_meta: { source_note: v.note, submitter_contact: v.contact, ip_hash: g.ipHash },
    });
    if (!res.ok) {
        const message = postgrestErrorMessage(res.error);
        const status = Object.hasOwn(RPC_ERRORS, message) ? RPC_ERRORS[message] : null;
        if (status) return reply({ ok: false, error: message }, status);
        await logError(env, 'songs-submissions', 'save failed', { metadata: { status: res.status, error: res.error?.slice(0, 300) } });
        return reply({ ok: false, error: 'save_failed' }, 500);
    }

    purgeCatalogCache(context);
    return reply({ ok: true, id: res.data?.submission_id ?? null, kind: res.data?.kind ?? (v.rev ? 'revision' : 'new') }, 201);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
