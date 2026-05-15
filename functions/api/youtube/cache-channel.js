// Cloudflare Pages Function: 後端 YouTube 頻道 cache 寫入端點
//
// 目的:
//   - 取代前端直接 `supabase.from('youtube_channels').upsert(...)` 的寫入路徑
//   - 配合 RLS hardening — youtube_channels INSERT/UPDATE 只允許 service_role
//
// 設計(2026-05-15 修正):
//   - youtube_channels 是「真實 channel_id ↔ channel_title」對應 cache,
//     讓後續 user 查詢同一頻道時可從 Supabase 直接拿,**節省 YouTube Data API quota**
//   - 前端 `youtubeApi.getVideoInfo/getChannelTitleFromChannelId` 已從 YouTube Data API
//     拿到 channel_id + channel_title,後端 endpoint **不再重複呼叫 YouTube API**
//     (避免雙倍 quota 消耗,違背 cache 目的)
//   - 後端只負責:input sanitize + service_role upsert
//
// **匿名可寫**:不要求 caller 登入(因為並非所有 user 都會登入,但收集 cache 對所有 user
// 都有益處 — 減輕 YouTube Data API 負擔)。透過格式驗證 + service_role only RLS 限制
// 來防範惡意寫入(只能寫 channel_id 符合 UC + 22 字元的 row,channel_title 限 200 字)。
// 此 endpoint 只能寫入 `youtube_channels` 一張表,不會碰其他 schema。
//
// 流程:
//   1. 驗證 channel_id 格式(UC + 22 字元)+ channel_title 非空且長度合理
//   2. SERVICE_ROLE 走 PostgREST upsert(on_conflict=channel_id)
//
// 失敗策略:fail-open。前端用 .catch(() => {}) fire-and-forget,
//          失敗不阻塞 stream 加入。

import { jsonResponse, handleOptions } from '../../lib/cors.js';

const CHANNEL_ID_REGEX = /^UC[A-Za-z0-9_-]{22}$/;
const CHANNEL_TITLE_MAX_LEN = 200;

export async function onRequestPost(context) {
    const { request, env } = context;

    // 1. 解析 + 驗證 input(匿名可寫,不檢查 caller auth)
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

    // 2. service_role env 檢查
    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ ok: false, reason: 'server_misconfigured' }, 500, request);
    }

    // 3. 組 cache row(只寫 channel_id / channel_title / fetched_at,其餘欄位由其他流程填或留 null)
    const cacheRow = {
        channel_id: channelId,
        channel_title: channelTitle,
        fetched_at: new Date().toISOString(),
    };

    // 4. SERVICE_ROLE 走 PostgREST upsert
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
