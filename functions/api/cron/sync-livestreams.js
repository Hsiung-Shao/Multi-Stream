// Cloudflare Pages Function：定期同步 vtuber_livestreams
//
// POST /api/cron/sync-livestreams
//   Authorization: Bearer ${CRON_SHARED_SECRET}
//
// 流程：
// 1. 驗 secret（防外部任意呼叫）
// 2. 從 Supabase 撈 vtubers (activity='active') 的所有 channel_id
// 3. Twitch helix /streams?user_login=A&user_login=B&...（一批最多 100，分批）
//    取得當下 live 的 stream 列表
// 4. (TODO B1.2) YouTube 抓取留下個 commit
// 5. DELETE FROM vtuber_livestreams + INSERT 全部 currently live
//    （整表 swap，無 last_seen_at 欄位下最簡可行做法）
//
// 環境變數：
// - CRON_SHARED_SECRET (secret): 觸發者要在 Authorization header 提供
// - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (secret)
// - TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET (secret)
//
// 觸發者（cron）：Supabase pg_cron + pg_net（B1.3 commit 才設）
//   schedule.schedule('sync-livestreams', '*/2 * * * *', $$
//     SELECT net.http_post(...)
//   $$)

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { select } from '../../lib/supabase-server.js';
import { logError, logInfo } from '../../lib/logger.js';

// 直接呼叫 Supabase REST (DELETE / batch INSERT) — supabase-server.js 沒對應 helper
async function supabaseRequest(env, path, init = {}) {
    const url = `${env.SUPABASE_URL}/rest/v1/${path}`;
    const res = await fetch(url, {
        ...init,
        headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            ...(init.headers || {}),
        },
    });
    return {
        ok: res.ok,
        status: res.status,
        error: res.ok ? null : await res.text().catch(() => null),
    };
}

const TWITCH_BATCH_SIZE = 100; // helix /streams 限 100 user_login per call
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const TWITCH_STREAMS_URL = 'https://api.twitch.tv/helix/streams';

// ===== Twitch =====

async function getTwitchAppToken(env) {
    const params = new URLSearchParams({
        client_id: env.TWITCH_CLIENT_ID,
        client_secret: env.TWITCH_CLIENT_SECRET,
        grant_type: 'client_credentials',
    });
    const res = await fetch(TWITCH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
    });
    if (!res.ok) throw new Error(`Twitch token: ${res.status}`);
    const data = await res.json();
    return data.access_token;
}

/**
 * 撈當下 live 的 Twitch streams
 * @param {Object} env
 * @param {string[]} userLogins - twitch_channel_id 列表
 * @returns {Promise<Map<string, { title, viewer_count, started_at, thumbnail_url, video_id }>>}
 *   key 為小寫 user_login
 */
async function fetchLiveTwitchStreams(env, userLogins) {
    if (userLogins.length === 0) return new Map();

    const token = await getTwitchAppToken(env);
    const result = new Map();

    // 分批，每批 TWITCH_BATCH_SIZE 個
    for (let i = 0; i < userLogins.length; i += TWITCH_BATCH_SIZE) {
        const batch = userLogins.slice(i, i + TWITCH_BATCH_SIZE);
        const params = new URLSearchParams();
        for (const login of batch) params.append('user_login', login);
        params.append('first', String(TWITCH_BATCH_SIZE));

        const res = await fetch(`${TWITCH_STREAMS_URL}?${params.toString()}`, {
            headers: {
                'Client-Id': env.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${token}`,
            },
        });
        if (!res.ok) {
            throw new Error(`Twitch streams batch failed: ${res.status}`);
        }
        const data = await res.json();
        for (const stream of data.data ?? []) {
            // user_login 是小寫，與 vtubers.twitch_channel_id 比對前都 lower
            const login = String(stream.user_login || '').toLowerCase();
            if (!login) continue;
            result.set(login, {
                title: stream.title || null,
                viewer_count: stream.viewer_count ?? null,
                started_at: stream.started_at || null,
                thumbnail_url: stream.thumbnail_url
                    ? stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180')
                    : null,
                video_id: stream.id || null, // helix stream id（用於組 video_url）
            });
        }
    }

    return result;
}

// ===== Main handler =====

export async function onRequestPost(context) {
    const { request, env } = context;

    // 1. 驗 secret
    const auth = request.headers.get('Authorization') || '';
    const expected = `Bearer ${env.CRON_SHARED_SECRET || ''}`;
    if (!env.CRON_SHARED_SECRET || auth !== expected) {
        return jsonResponse({ success: false, error: 'unauthorized' }, 401, request);
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ success: false, error: 'supabase not configured' }, 500, request);
    }

    try {
        // 2. 撈 active vtubers 的 channel_id
        const vtubersRes = await select(
            env,
            `vtubers?select=id,name,youtube_channel_id,twitch_channel_id&activity=eq.active`,
        );
        if (!vtubersRes.ok) {
            await logError(env, 'sync-livestreams', 'fetch vtubers failed', {
                metadata: { status: vtubersRes.status, error: vtubersRes.error?.slice(0, 500) },
            });
            return jsonResponse({ success: false, error: 'fetch vtubers failed' }, 500, request);
        }
        const vtubers = vtubersRes.data || [];

        // 3. Twitch
        const twitchLogins = vtubers
            .map(v => v.twitch_channel_id)
            .filter(Boolean)
            .map(s => String(s).toLowerCase());

        let liveTwitch = new Map();
        if (env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET && twitchLogins.length > 0) {
            try {
                liveTwitch = await fetchLiveTwitchStreams(env, twitchLogins);
            } catch (err) {
                await logError(env, 'sync-livestreams', 'twitch fetch failed', {
                    metadata: { error: String(err).slice(0, 500) },
                });
                // 不 abort 整個 sync，繼續用空 map
            }
        }

        // 4. 組 vtuber_livestreams row
        const rows = [];
        for (const v of vtubers) {
            if (v.twitch_channel_id) {
                const login = String(v.twitch_channel_id).toLowerCase();
                const stream = liveTwitch.get(login);
                if (stream) {
                    rows.push({
                        vtuber_id: v.id,
                        title: stream.title,
                        video_url: `https://www.twitch.tv/${v.twitch_channel_id}`,
                        thumbnail_url: stream.thumbnail_url,
                        platform: 'twitch',
                        start_time: stream.started_at,
                        viewer_count: stream.viewer_count,
                    });
                }
            }
            // YouTube 抓取在 B1.2
        }

        // 5. swap：DELETE 全表 + INSERT
        const deleteRes = await supabaseRequest(
            env,
            'vtuber_livestreams?id=neq.00000000-0000-0000-0000-000000000000',
            { method: 'DELETE' },
        );
        if (!deleteRes.ok) {
            await logError(env, 'sync-livestreams', 'delete livestreams failed', {
                metadata: { status: deleteRes.status, error: deleteRes.error?.slice(0, 500) },
            });
            return jsonResponse({ success: false, error: 'delete failed' }, 500, request);
        }

        if (rows.length > 0) {
            const insertRes = await supabaseRequest(env, 'vtuber_livestreams', {
                method: 'POST',
                body: JSON.stringify(rows),
            });
            if (!insertRes.ok) {
                await logError(env, 'sync-livestreams', 'insert livestreams failed', {
                    metadata: { status: insertRes.status, error: insertRes.error?.slice(0, 500), row_count: rows.length },
                });
                return jsonResponse({ success: false, error: 'insert failed' }, 500, request);
            }
        }

        await logInfo(env, 'sync-livestreams', 'sync complete', {
            metadata: {
                vtubers_active: vtubers.length,
                twitch_channels: twitchLogins.length,
                live_twitch: liveTwitch.size,
                inserted: rows.length,
            },
        });

        return jsonResponse(
            {
                success: true,
                vtubers_active: vtubers.length,
                live_twitch: liveTwitch.size,
                live_youtube: 0, // TODO B1.2
                inserted: rows.length,
            },
            200,
            request,
        );
    } catch (err) {
        await logError(env, 'sync-livestreams', 'unexpected error', {
            metadata: { error: String(err).slice(0, 500) },
        });
        return jsonResponse({ success: false, error: 'sync failed' }, 500, request);
    }
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
