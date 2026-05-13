// Cloudflare Pages Function: 後端 YouTube 頻道 cache 寫入端點
//
// 目的:
//   - 取代前端直接 `supabase.from('youtube_channels').upsert(...)` 的寫入路徑
//   - 配合 RLS hardening — youtube_channels INSERT/UPDATE 只允許 service_role
//
// 設計(2026-05-13 修正):
//   - youtube_channels 是「真實 channel_id ↔ channel_title」對應 cache,
//     讓後續 user 查詢同一頻道時可從 Supabase 直接拿,**節省 YouTube Data API quota**
//   - 前端 `youtubeApi.getVideoInfo/getChannelTitleFromChannelId` 已從 YouTube Data API
//     拿到 channel_id + channel_title,後端 endpoint **不再重複呼叫 YouTube API**
//     (避免雙倍 quota 消耗,違背 cache 目的)
//   - 後端只負責:auth 驗證 + input sanitize + service_role upsert
//
// 流程:
//   1. 驗證 caller 為 authenticated user
//   2. 驗證 channel_id 格式(UC + 22 字元)+ channel_title 非空且長度合理
//   3. SERVICE_ROLE 走 PostgREST upsert(on_conflict=channel_id)
//
// 失敗策略:fail-open。前端用 .catch(() => {}) fire-and-forget,
//          失敗不阻塞 stream 加入。

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { getUserIdFromRequest } from '../../lib/auth-helper.js';

const CHANNEL_ID_REGEX = /^UC[A-Za-z0-9_-]{22}$/;
const CHANNEL_TITLE_MAX_LEN = 200;

export async function onRequestPost(context) {
    const { request, env } = context;

    // 1. 驗證 authenticated(任何登入 user 都可觸發 cache 寫入)
    const { userId } = await getUserIdFromRequest(request, env);
    if (!userId) {
        return jsonResponse({ ok: false, reason: 'unauthenticated' }, 401, request);
    }

    // 2. 解析 + 驗證 input
    let body = null;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ ok: false, reason: 'invalid_json' }, 400, request);
    }

    const channelId = body?.channel_id;
    const channelTitleRaw = body?.channel_title;

    if (typeof channelId !== 'string' || !CHANNEL_ID_REGEX.test(channelId)) {
        return jsonResponse({ ok: false, reason: 'invalid_channel_id' }, 400, request);
    }
    if (typeof channelTitleRaw !== 'string' || channelTitleRaw.trim().length === 0) {
        return jsonResponse({ ok: false, reason: 'invalid_channel_title' }, 400, request);
    }

    const channelTitle = channelTitleRaw.trim().slice(0, CHANNEL_TITLE_MAX_LEN);

    // 3. service_role env 檢查
    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ ok: false, reason: 'server_misconfigured' }, 500, request);
    }

    // 4. 組 cache row(只寫 channel_id / channel_title / fetched_at,其餘欄位由其他流程填或留 null)
    const cacheRow = {
        channel_id: channelId,
        channel_title: channelTitle,
        fetched_at: new Date().toISOString(),
    };

    // 5. SERVICE_ROLE 走 PostgREST upsert
    //
    // PostgREST upsert pattern:POST 到 table + Prefer: resolution=merge-duplicates
    // on_conflict=channel_id 指定衝突欄位
    const upsertUrl = `${env.SUPABASE_URL}/rest/v1/youtube_channels?on_conflict=channel_id`;
    let dbRes;
    try {
        dbRes = await fetch(upsertUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                'Prefer': 'resolution=merge-duplicates,return=representation',
            },
            body: JSON.stringify(cacheRow),
        });
    } catch {
        return jsonResponse({ ok: false, reason: 'db_error' }, 500, request);
    }

    if (!dbRes.ok) {
        // 不洩漏 schema 細節給 client,但保留 status 供 debug
        return jsonResponse(
            { ok: false, reason: 'db_error', status: dbRes.status },
            500,
            request,
        );
    }

    return jsonResponse({ ok: true, channel: cacheRow }, 200, request);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
