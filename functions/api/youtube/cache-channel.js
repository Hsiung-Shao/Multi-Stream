// Cloudflare Pages Function: 後端 YouTube 頻道 cache 寫入端點
//
// 目的:
//   - 取代前端直接 `supabase.from('youtube_channels').upsert(...)` 的寫入路徑
//   - 配合 RLS hardening — youtube_channels INSERT/UPDATE 只允許 service_role
//
// 設計(2026-05-15 重構):
//   - sanitize / upsert 邏輯統一抽到 `functions/lib/youtube-channel-cache.js`
//     共用 helper,避免與 scrape endpoints(youtube-channel-page /
//     youtube-channel-live)重複實作
//   - 此 endpoint 入口保留:onRequestPost、CORS、回應結構
//     ({ ok: true, channel: {...} } / { ok: false, reason })
//   - 匿名可寫(不檢查 caller auth):cache 對所有 user 都有益
//
// 流程:
//   1. 解析 JSON body
//   2. 呼叫 helper 同步 upsert(awaited 版本)
//   3. 把 helper 結果包成 HTTP 回應
//
// 失敗策略:fail-open。前端用 .catch(() => {}) fire-and-forget,
//          失敗不阻塞 stream 加入。

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { writeChannelCacheAwaited } from '../../lib/youtube-channel-cache.js';

export async function onRequestPost(context) {
    const { request, env } = context;

    // 1. 解析 input(匿名可寫,不檢查 caller auth;input 驗證由 helper 處理)
    let body = null;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ ok: false, reason: 'invalid_json' }, 400, request);
    }

    // 2. 走 helper 做 sanitize + service_role upsert
    const result = await writeChannelCacheAwaited(env, body?.channel_id, body?.channel_title);

    // 3. 把 helper 的 reason 對應回 HTTP status(維持原 endpoint 行為)
    if (result.ok) {
        return jsonResponse({ ok: true, channel: result.channel }, 200, request);
    }

    switch (result.reason) {
        case 'invalid_channel_id':
        case 'invalid_channel_title':
            return jsonResponse({ ok: false, reason: result.reason }, 400, request);
        case 'server_misconfigured':
            return jsonResponse({ ok: false, reason: result.reason }, 500, request);
        case 'db_error':
            return jsonResponse(
                {
                    ok: false,
                    reason: 'db_error',
                    ...(result.status ? { status: result.status } : {}),
                },
                500,
                request,
            );
        default:
            return jsonResponse({ ok: false, reason: 'unknown' }, 500, request);
    }
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
