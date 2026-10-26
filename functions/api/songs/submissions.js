// POST /api/songs/submissions：匿名投稿歌回時間軸（新歌回，或修正已上架的歌回）→ song_submissions（pending）
// 後台核准（approve_song_submission）才寫進 song_videos / song_segments。
//
// 檢查順序見 functions/lib/submit-guard.js（緊急開關 → 來源 → 大小 → 封鎖 IP → 欄位驗證 → 個人配額 → Turnstile → 全站配額）。
// 之後查影片是否已上架：有 → kind='revision'、target_video_ref 為該影片 id；無 → kind='new'。
// 同一個雜湊 IP 對同一支影片同時只能有一筆待審（唯一索引 song_submissions_pending_ip_video_uq，撞到回 409 already_pending）。
// 只存雜湊 IP，不存原始 IP。緊急開關：SUBMISSIONS_DISABLED=true → 503（與其他投稿共用）。
//
// 回應：201 { ok: true, id, kind } 或 { ok: false, error }

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { insert, select } from '../../lib/supabase-server.js';
import { logError } from '../../lib/logger.js';
import { guardSubmission, isUniqueViolation } from '../../lib/submit-guard.js';
import { parseSubmissionBody } from '../../lib/song-submissions.js';

const MAX_BODY_BYTES = 32768;
const NO_STORE = { 'Cache-Control': 'no-store' };

function pgCode(errorText) {
    try {
        return JSON.parse(errorText)?.code ?? null;
    } catch {
        return null;
    }
}

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
        await logError(env, 'songs-submissions', 'video lookup failed', { metadata: { status: found.status, error: found.error?.slice(0, 300) } });
        return reply({ ok: false, error: 'insert_failed' }, 500);
    }
    const targetRef = found.data?.[0]?.id ?? null;
    const kind = targetRef ? 'revision' : 'new';

    const res = await insert(env, 'song_submissions', {
        kind,
        video_id: v.videoId,
        target_video_ref: targetRef,
        title: v.title,
        vtuber_id: v.vtuberId,
        streamed_at: v.streamedAt,
        segments: v.segments,
        source_note: v.note,
        submitter_contact: v.contact,
        ip_hash: g.ipHash,
        status: 'pending',
    });
    if (!res.ok) {
        if (isUniqueViolation(res.error)) return reply({ ok: false, error: 'already_pending' }, 409);
        // 外鍵錯誤（vtuberId 指到不存在的 VTuber）是請求內容的問題，不是伺服器壞了
        if (pgCode(res.error) === '23503') return reply({ ok: false, error: 'invalid_payload' }, 400);
        await logError(env, 'songs-submissions', 'insert failed', { metadata: { status: res.status, error: res.error?.slice(0, 300) } });
        return reply({ ok: false, error: 'insert_failed' }, 500);
    }
    return reply({ ok: true, id: res.data?.[0]?.id ?? null, kind }, 201);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
