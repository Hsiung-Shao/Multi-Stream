// POST /api/recommendations/for-you
//
// body: { favorites: [{ platform: 'twitch'|'youtube', channel_id }] }
//
// 「為你推薦」：依 user 收藏的 vtuber 之 categories / languages，
// 推薦相似的其他 vtuber（同分類或同語言、有社群推薦數背書、排除已收藏）。
// anon OK（收藏是前端 localStorage 傳上來，server 不需登入）。

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { select } from '../../lib/supabase-server.js';
import { logError } from '../../lib/logger.js';
import { fetchVtuberMeta } from '../../lib/vtuber-meta.js';

const MAX_FAVORITES = 200;
const RESULT_LIMIT = 30;

// language enum 受控（zh-TW/zh-CN/en/ja/ko）；清掉 array literal 危險字元保險
function sanitizeLang(l) {
    return String(l).replace(/[{}",\\]/g, '');
}

export async function onRequestPost(context) {
    const { request, env } = context;

    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonResponse({ ok: false, error: 'server_misconfigured' }, 500, request);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ ok: false, error: 'invalid_json' }, 400, request);
    }
    const favorites = Array.isArray(body?.favorites) ? body.favorites.slice(0, MAX_FAVORITES) : [];

    // 1. 解析收藏 channel_id（twitch login / youtube UC...）
    const twitchIds = [];
    const youtubeIds = [];
    for (const f of favorites) {
        if (!f || typeof f.channel_id !== 'string') continue;
        const cid = f.channel_id.trim();
        if (!cid) continue;
        if (f.platform === 'twitch') twitchIds.push(cid.toLowerCase());
        else if (f.platform === 'youtube') youtubeIds.push(cid);
    }
    if (twitchIds.length === 0 && youtubeIds.length === 0) {
        return jsonResponse({ ok: true, items: [], reason: 'no_favorites' }, 200, request);
    }

    try {
        // 2. 找收藏對應的 vtuber
        const orParts = [];
        if (twitchIds.length) orParts.push(`twitch_channel_id.in.(${twitchIds.map(encodeURIComponent).join(',')})`);
        if (youtubeIds.length) orParts.push(`youtube_channel_id.in.(${youtubeIds.map(encodeURIComponent).join(',')})`);
        const favRes = await select(env, `vtubers?or=(${orParts.join(',')})&select=id,languages`);
        if (!favRes.ok) {
            await logError(env, 'for-you', 'fetch favorited vtubers failed', {
                metadata: { status: favRes.status, error: String(favRes.error || '').slice(0, 200) },
            });
            return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
        }
        const favVtubers = favRes.data || [];
        const favIds = new Set(favVtubers.map(v => v.id));
        if (favIds.size === 0) {
            return jsonResponse({ ok: true, items: [], reason: 'no_matched_vtubers' }, 200, request);
        }

        // 3. 口味：languages（union）+ categories
        const userLangs = new Set();
        for (const v of favVtubers) for (const l of v.languages || []) userLangs.add(l);

        const favIdList = [...favIds].map(encodeURIComponent).join(',');
        const catRes = await select(env, `vtuber_category_tags?vtuber_id=in.(${favIdList})&select=category_id`);
        const userCats = new Set();
        if (catRes.ok && Array.isArray(catRes.data)) {
            for (const t of catRes.data) userCats.add(t.category_id);
        }

        // 4. 候選 vtuber_ids（同 category 或同 language，排除已收藏）
        const candidateIds = new Set();
        if (userCats.size > 0) {
            const catList = [...userCats].map(encodeURIComponent).join(',');
            const tagRes = await select(env, `vtuber_category_tags?category_id=in.(${catList})&select=vtuber_id&limit=1000`);
            if (tagRes.ok && Array.isArray(tagRes.data)) {
                for (const t of tagRes.data) if (!favIds.has(t.vtuber_id)) candidateIds.add(t.vtuber_id);
            }
        }
        if (userLangs.size > 0) {
            const langLiteral = [...userLangs].map(sanitizeLang).join(',');
            const langRes = await select(env, `vtubers?languages=ov.{${langLiteral}}&select=id&limit=1000`);
            if (langRes.ok && Array.isArray(langRes.data)) {
                for (const v of langRes.data) if (!favIds.has(v.id)) candidateIds.add(v.id);
            }
        }
        if (candidateIds.size === 0) {
            return jsonResponse({ ok: true, items: [], reason: 'no_candidates' }, 200, request);
        }

        // 5. 候選的推薦 aggregate（只推有社群推薦背書的）
        const candList = [...candidateIds].map(encodeURIComponent).join(',');
        const recRes = await select(
            env,
            `vtuber_recommendations?vtuber_id=in.(${candList})&select=vtuber_id,comment,created_at&order=created_at.desc&limit=2000`,
        );
        const aggMap = new Map();
        if (recRes.ok && Array.isArray(recRes.data)) {
            for (const r of recRes.data) {
                if (!aggMap.has(r.vtuber_id)) {
                    aggMap.set(r.vtuber_id, { vtuber_id: r.vtuber_id, count: 0, latest_at: r.created_at, comments_preview: [] });
                }
                const e = aggMap.get(r.vtuber_id);
                e.count++;
                if (r.comment && e.comments_preview.length < 3) {
                    e.comments_preview.push({ comment: r.comment, created_at: r.created_at });
                }
            }
        }

        let items = [...aggMap.values()]
            .sort((a, b) => b.count - a.count || (b.latest_at > a.latest_at ? 1 : -1))
            .slice(0, RESULT_LIMIT);

        // 6. metadata + 訂閱變化
        if (items.length > 0) {
            const metaMap = await fetchVtuberMeta(env, items.map(it => it.vtuber_id));
            items = items.map(it => ({ ...it, vtuber: metaMap.get(it.vtuber_id) || null }));
        }

        return jsonResponse({ ok: true, items }, 200, request, { 'Cache-Control': 'private, max-age=30' });
    } catch (err) {
        await logError(env, 'for-you', 'unexpected error', { metadata: { error: String(err).slice(0, 300) } });
        return jsonResponse({ ok: false, error: 'fetch_failed' }, 500, request);
    }
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'POST, OPTIONS' });
}
