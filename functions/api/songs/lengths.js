// POST /api/songs/lengths — 時間軸匯入時查每首歌的長度，用來估計「沒寫結束」的列
//
// body：{ items: [{ title, artist? }] }（最多 60 筆）
// 回應：200 { ok: true, items: [{ seconds: number|null, source: 'site'|'itunes'|'miss'|'pending' }] }（順序同請求）；
//       400 invalid_payload；403 forbidden_origin；500 server_misconfigured；502 lookup_failed
//
// 來源順序：站內人工確認長度、iTunes 快取（都在 RPC song_ref_lengths）→ 快取沒有的才查 iTunes Search，結果寫回快取。
// 外部查詢的保護：全站每天 300 次「需要查外部」的請求（只用一個 KV key，KV 寫入額度與投稿共用）；
// 每個請求最多查 8 首（每首最多 3 個國家＝24 次子請求）；iTunes 回 403／429 就整批停下、不記查無。
// pending＝這次沒查（配額、上限、iTunes 暫時失敗），前端稍後再問。回應不快取。

import { handleOptions, getCorsHeaders, isRequestFromAllowedSite } from '../../lib/cors.js';
import { rpc } from '../../lib/supabase-server.js';
import { checkKvQuota, quotaWindow } from '../../lib/rate-limit.js';
import { logError } from '../../lib/logger.js';
import { parseLengthsBody, itunesUrl, pickItunesMatch, ITUNES_COUNTRIES } from '../../lib/song-lengths.js';

const MAX_BODY_BYTES = 32 * 1024;
const LOOKUPS_PER_REQUEST = 8;
const DAILY_LOOKUP_REQUESTS = 300;

function reply(request, status, data) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...getCorsHeaders(request), 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
    });
}

async function readBody(request) {
    const declared = parseInt(request.headers.get('Content-Length') || '0', 10);
    if (declared > MAX_BODY_BYTES) return null;
    try {
        const text = await request.text();
        if (text.length > MAX_BODY_BYTES) return null;
        return JSON.parse(text);
    } catch {
        return null;
    }
}

const sameSongKey = (it) => `${it.title.toLowerCase()}\u0001${(it.artist ?? '').toLowerCase()}`;

/**
 * 依序試各國 iTunes；回 { seconds, matched, country } 或 { seconds: null }（三國都沒配到），
 * 暫時失敗回 'retry'，被限流回 'throttled'。
 */
async function lookupItunes(it) {
    for (const country of ITUNES_COUNTRIES) {
        let res;
        try {
            res = await fetch(itunesUrl(it.title, it.artist, country));
        } catch {
            return 'retry';
        }
        if (res.status === 403 || res.status === 429) return 'throttled';
        if (!res.ok) return 'retry';
        let json;
        try {
            json = await res.json();
        } catch {
            return 'retry';
        }
        const hit = pickItunesMatch(json?.results, it.title, it.artist);
        if (hit) return { seconds: hit.seconds, matched: hit.matched, country };
    }
    return { seconds: null };
}

export async function onRequestPost(context) {
    const { request, env } = context;

    const parsed = parseLengthsBody(await readBody(request));
    if (!parsed.ok) return reply(request, 400, { ok: false, error: parsed.error });
    if (!isRequestFromAllowedSite(request)) return reply(request, 403, { ok: false, error: 'forbidden_origin' });
    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return reply(request, 500, { ok: false, error: 'server_misconfigured' });
    }

    const { items } = parsed;
    const res = await rpc(env, 'song_ref_lengths', { p_items: items });
    if (!res.ok || !Array.isArray(res.data) || res.data.length !== items.length) {
        const p = logError(env, 'songs-lengths', 'song_ref_lengths failed', {
            metadata: { status: res.status, error: res.error?.slice(0, 300) },
        });
        if (context.waitUntil) context.waitUntil(p);
        else p.catch(() => {});
        return reply(request, 502, { ok: false, error: 'lookup_failed' });
    }

    const out = res.data.map((r) => ({
        seconds: typeof r?.seconds === 'number' ? r.seconds : null,
        source: r?.source === 'unknown' ? 'pending' : r?.source,
    }));

    // 需要查外部的歌（同歌只查一次，依出現順序）
    const unknownKeys = [];
    const byKey = new Map();
    res.data.forEach((r, i) => {
        if (r?.source !== 'unknown') return;
        const key = sameSongKey(items[i]);
        if (!byKey.has(key)) {
            byKey.set(key, { item: items[i], indexes: [] });
            unknownKeys.push(key);
        }
        byKey.get(key).indexes.push(i);
    });

    if (unknownKeys.length > 0
        && await checkKvQuota(env.RATE_LIMIT_KV, `songlen:day:${quotaWindow().day}`, DAILY_LOOKUP_REQUESTS, 172800)) {
        const puts = [];
        for (const key of unknownKeys.slice(0, LOOKUPS_PER_REQUEST)) {
            const { item, indexes } = byKey.get(key);
            const found = await lookupItunes(item);
            if (found === 'throttled') break;
            if (found === 'retry') continue;
            for (const i of indexes) {
                out[i] = found.seconds === null ? { seconds: null, source: 'miss' } : { seconds: found.seconds, source: 'itunes' };
            }
            puts.push({
                title: item.title, artist: item.artist, seconds: found.seconds,
                matched: found.matched ?? null, country: found.country ?? null,
            });
        }
        if (puts.length > 0) {
            const put = await rpc(env, 'song_length_refs_put', { p_rows: puts });
            if (!put.ok) {
                const p = logError(env, 'songs-lengths', 'song_length_refs_put failed', {
                    metadata: { status: put.status, error: put.error?.slice(0, 300) },
                });
                if (context.waitUntil) context.waitUntil(p);
                else p.catch(() => {});
            }
        }
    }

    return reply(request, 200, { ok: true, items: out });
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'POST, OPTIONS' });
}
