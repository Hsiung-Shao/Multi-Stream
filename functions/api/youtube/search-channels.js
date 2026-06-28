// Cloudflare Pages Function: 搜尋 YouTube 頻道(合併 vtubers + youtube_channels)
//
// GET /api/youtube/search-channels?q=<keyword>&limit=8
//
// 行為:
//   - 任何人可呼叫(youtube_channels / vtubers 皆 public SELECT;此處用 service_role 繞過 anon-key 缺失場景)
//   - 合併查兩表(同時命中 YouTube 官方名與 VTuber 簡名),以 channel_id 去重
//   - 回填後 youtube_channels 已是 vtubers channel 的超集,但兩表 title 來源不同
//     (官方名 vs 簡名),故兩邊都 ilike 搜以避免漏命中
//   - 再用候選 channel_id 一次性查 vtubers 補 isVtuber / nationality(非 N+1)
//   - 回傳統一結構,依訂閱數 desc
//
// YouTube 沒有便宜的搜尋 API,故「搜 YouTube 頻道」只能搜本站資料(這份匯入名單)。

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { select } from '../../lib/supabase-server.js';
import { logError } from '../../lib/logger.js';

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

export async function onRequestGet(context) {
    const { request, env } = context;

    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ success: false, error: 'server_misconfigured' }, 500, request);
    }

    const url = new URL(request.url);
    const rawQ = (url.searchParams.get('q') || '').trim();
    // 移除 PostgREST / ilike 特殊字元(* % , ( ) \),避免 wildcard 注入與 filter 解析錯誤
    const q = rawQ.replace(/[%*,()\\]/g, ' ').trim();
    if (!q) {
        return jsonResponse({ success: true, channels: [] }, 200, request);
    }

    const limit = Math.min(
        parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
        MAX_LIMIT,
    );

    const pattern = encodeURIComponent(`*${q}*`);

    const ycQuery = [
        'select=channel_id,channel_title,thumbnail_url,subscriber_count',
        `channel_title=ilike.${pattern}`,
        'order=subscriber_count.desc.nullslast',
        `limit=${limit}`,
    ].join('&');

    const vtQuery = [
        'select=youtube_channel_id,name,img_url,youtube_subscriber_count,nationality',
        `name=ilike.${pattern}`,
        'youtube_channel_id=not.is.null',
        'order=youtube_subscriber_count.desc.nullslast',
        `limit=${limit}`,
    ].join('&');

    const [ycRes, vtRes] = await Promise.all([
        select(env, `youtube_channels?${ycQuery}`),
        select(env, `vtubers?${vtQuery}`),
    ]);

    if (!ycRes.ok && !vtRes.ok) {
        await logError(env, 'youtube-search-channels', 'both selects failed', {
            metadata: { yc: ycRes.status, vt: vtRes.status },
        });
        return jsonResponse({ success: false, error: 'fetch_failed' }, 500, request);
    }

    // 合併去重:youtube_channels 的官方名 / 縮圖優先
    const map = new Map();
    for (const r of ycRes.data || []) {
        if (!r.channel_id) continue;
        map.set(r.channel_id, {
            channelId: r.channel_id,
            title: r.channel_title || r.channel_id,
            thumbnail: r.thumbnail_url || null,
            subscriber: r.subscriber_count ?? null,
            isVtuber: false,
            nationality: null,
        });
    }
    for (const r of vtRes.data || []) {
        const id = r.youtube_channel_id;
        if (!id) continue;
        const existing = map.get(id);
        if (existing) {
            existing.isVtuber = true;
            existing.nationality = r.nationality || null;
        } else {
            map.set(id, {
                channelId: id,
                title: r.name || id,
                thumbnail: r.img_url || null,
                subscriber: r.youtube_subscriber_count ?? null,
                isVtuber: true,
                nationality: r.nationality || null,
            });
        }
    }

    // 補標記:youtube_channels 命中的頻道也可能是 VTuber(官方名 match 但簡名沒 match q),
    // 用候選 channel_id 一次查 vtubers 補 isVtuber / nationality
    const ids = [...map.keys()];
    if (ids.length > 0) {
        const inList = ids.map(encodeURIComponent).join(',');
        const tagRes = await select(
            env,
            `vtubers?select=youtube_channel_id,nationality&youtube_channel_id=in.(${inList})`,
        );
        if (tagRes.ok) {
            for (const r of tagRes.data || []) {
                const e = map.get(r.youtube_channel_id);
                if (e) {
                    e.isVtuber = true;
                    if (!e.nationality) e.nationality = r.nationality || null;
                }
            }
        }
    }

    const channels = [...map.values()]
        .sort((a, b) => (b.subscriber ?? -1) - (a.subscriber ?? -1))
        .slice(0, limit);

    return jsonResponse(
        { success: true, channels },
        200,
        request,
        { 'Cache-Control': 'public, max-age=30' },
    );
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
