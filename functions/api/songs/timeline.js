// GET /api/songs/timeline?v=<11 碼 videoId> — 社群編輯器載入單場歌回的最新時間軸（只回已發布）
//
// 回應：{ ok: true, data: { videoId, title, vtuber: {id,name,img}|null, streamedAt, durationSeconds, rev, locked,
//                           segments: [{ code, start, end, title, artist, note }] } }
// rev 是影片的 updated_at 原字串，編輯器送出時原樣帶回，DB 以它偵測「載入後被別人改過」（stale_edit）。
// 不做任何快取（記憶體、edge 都不做）：快取會讓編輯器拿到舊 rev，造成一次必失敗的送出。
// DB 失敗回 500 fetch_failed，不回錯誤文字；草稿與不存在一律 404，不洩漏草稿內容。

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { select } from '../../lib/supabase-server.js';
import { logError } from '../../lib/logger.js';
import { VIDEO_ID_RE } from '../../lib/song-submissions.js';

const NO_STORE = { 'Cache-Control': 'no-store' };
const COLUMNS = [
    'id', 'video_id', 'title', 'streamed_at', 'duration_seconds', 'status', 'community_locked', 'updated_at',
    'vtubers(id,name,img_url)',
    'song_segments(code,start_seconds,end_seconds,title,original_artist,version_note)',
].join(',');

export async function onRequestGet(context) {
    const { request, env } = context;
    const reply = (data, status) => jsonResponse(data, status, request, NO_STORE);

    const videoId = new URL(request.url).searchParams.get('v');
    if (!videoId || !VIDEO_ID_RE.test(videoId)) return reply({ ok: false, error: 'invalid_video_id' }, 400);

    const res = await select(env, `song_videos?video_id=eq.${encodeURIComponent(videoId)}&select=${COLUMNS}&limit=1`);
    if (!res.ok) {
        const p = logError(env, 'songs-timeline', 'fetch failed', { metadata: { status: res.status, error: res.error?.slice(0, 300) } });
        if (context.waitUntil) context.waitUntil(p); else p.catch(() => {});
        return reply({ ok: false, error: 'fetch_failed' }, 500);
    }
    const v = res.data?.[0];
    if (!v || v.status !== 'published') return reply({ ok: false, error: 'not_found' }, 404);

    const segments = (v.song_segments || [])
        .slice()
        .sort((a, b) => a.start_seconds - b.start_seconds)
        .map((s) => ({
            code: s.code,
            start: s.start_seconds,
            end: s.end_seconds,
            title: s.title,
            artist: s.original_artist ?? null,
            note: s.version_note ?? null,
        }));

    return reply({
        ok: true,
        data: {
            videoId: v.video_id,
            title: v.title,
            vtuber: v.vtubers ? { id: v.vtubers.id, name: v.vtubers.name, img: v.vtubers.img_url ?? null } : null,
            streamedAt: v.streamed_at ?? null,
            durationSeconds: v.duration_seconds ?? null,
            rev: v.updated_at,
            locked: v.community_locked === true,
            segments,
        },
    }, 200);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'GET, OPTIONS' });
}
