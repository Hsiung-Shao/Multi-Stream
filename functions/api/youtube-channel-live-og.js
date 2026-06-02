// Cloudflare Pages Function: YouTube 頻道直播偵測（OG Image 法，不使用 YouTube Data API）
//
// 偵測核心已抽到 functions/lib/youtube-live-og.js，與 cron sync-livestreams 共用同一套。
// 本 endpoint 為薄包裝：解析 channelId → 呼叫 lib → 組前端相容的 JSON response。
//
// 前端（src/utils/youtubeApi.ts）只要本 endpoint 回 HTTP 200 就 trust，
// 使用欄位：isLive / videoId(或 liveVideoId) / finalUrl / isUpcoming / scheduledStartTime。

import { getCorsHeaders, handleOptions } from '../lib/cors.js';
import { detectYouTubeLiveOg } from '../lib/youtube-live-og.js';

let _currentRequest = null;

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}

export async function onRequestGet(context) {
    const { request } = context;
    _currentRequest = request;

    const url = new URL(request.url);
    const channelId = url.searchParams.get('channelId');

    if (!channelId) {
        return new Response(JSON.stringify({ error: '缺少 channelId 参数' }), { status: 400, headers: jsonHeaders() });
    }
    if (!/^UC[a-zA-Z0-9_-]{22}$/.test(channelId)) {
        return new Response(JSON.stringify({ error: '無效的 channelId 格式' }), { status: 400, headers: jsonHeaders() });
    }

    try {
        const r = await detectYouTubeLiveOg(channelId);

        // UPCOMING：回報排程，但不當 LIVE
        if (r.isUpcoming) {
            return new Response(JSON.stringify({
                isLive: false,
                isUpcoming: true,
                videoId: r.videoId,
                scheduledVideoId: r.videoId,
                scheduledStartTime: r.scheduledStartTime,
                finalUrl: r.video_url,
                message: 'Upcoming stream detected via HTML parse',
            }), { status: 200, headers: jsonHeaders() });
        }

        // LIVE：_live.jpg HEAD 確認
        if (r.isLive) {
            return new Response(JSON.stringify({
                isLive: true,
                isUpcoming: false,
                videoId: r.videoId,
                liveVideoId: r.videoId,
                finalUrl: r.video_url,
                title: r.title,
                message: 'Live confirmed via Image Server',
            }), { status: 200, headers: jsonHeaders() });
        }

        // OFFLINE（或找不到 videoId）
        return new Response(JSON.stringify({
            isLive: false,
            isUpcoming: false,
            videoId: r.videoId,
            finalUrl: r.video_url,
            message: r.videoId ? 'Video ID found but not Live or Upcoming' : 'Video ID not found in HTML',
        }), { status: 200, headers: jsonHeaders() });
    } catch (err) {
        return new Response(JSON.stringify({ error: 'Internal Error', message: err.message }), { status: 500, headers: jsonHeaders() });
    }
}

function jsonHeaders() {
    return {
        'Content-Type': 'application/json',
        ...getCorsHeaders(_currentRequest),
        'Cache-Control': 'no-store',
    };
}
