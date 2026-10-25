// POST /api/songs/plays — 回報歌曲片段被聽了（播放次數 +1）
//
// body：{ codes: string[] }（片段短 ID，去重後最多 20 個；前端用 sendBeacon 批次送）
// 回應：204 成功（含取不到 IP、已計過而 counted=0）；400 invalid_payload；403 forbidden_origin／被封鎖的 IP；429 太頻繁／一次太多；502 資料庫失敗
//
// 防刷由資料庫 RPC record_song_plays 單一交易處理（每個 IP 雜湊的頻率限制＋寫入）；
// 這裡只做輸入驗證與 IP 雜湊（資料庫只看得到加鹽雜湊，不存明文 IP）。
// sendBeacon 的 Content-Type 可能是 text/plain 或 application/json，所以不檢查 Content-Type，
// 一律當 JSON 文字解析。回應不快取。

import { handleOptions, getCorsHeaders, isRequestFromAllowedSite } from '../../lib/cors.js';
import { rpc } from '../../lib/supabase-server.js';
import { getVisitorIp, isIpBanned, hashIp } from '../../lib/rate-limit.js';
import { logError } from '../../lib/logger.js';
import { parsePlaysBody } from '../../lib/song-plays.js';

const MAX_BODY_BYTES = 2 * 1024;

function reply(request, status, data) {
    const headers = { ...getCorsHeaders(request), 'Cache-Control': 'no-store' };
    if (data === undefined) return new Response(null, { status, headers });
    return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

/** 讀 body 文字並解析 JSON；超過上限或解析失敗回 null */
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

export async function onRequestPost(context) {
    const { request, env } = context;

    const parsed = parsePlaysBody(await readBody(request));
    if (!parsed.ok) return reply(request, 400, { ok: false, error: parsed.error });

    // 只收本站頁面發來的請求：擋掉別的網站讓訪客用 sendBeacon 替我們灌次數（header 可偽造，真正防線是 WAF rate limit）
    if (!isRequestFromAllowedSite(request)) return reply(request, 403, { ok: false, error: 'forbidden_origin' });

    // 取不到訪客 IP：無法限流也無法雜湊（'unknown' 會撞 song_play_rate.ip_hash 的長度 CHECK），不計次、不打 DB
    const ip = getVisitorIp(request);
    if (!ip) return reply(request, 204);
    if (isIpBanned(env, ip)) return reply(request, 403, { ok: false, error: 'forbidden' });

    // 沒有加鹽的 IPv4 雜湊可被暴力還原，未設定時不寫入
    if (!env?.IP_HASH_SALT || !env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        return reply(request, 500, { ok: false, error: 'server_misconfigured' });
    }

    const res = await rpc(env, 'record_song_plays', {
        p_ip_hash: await hashIp(env, ip),
        p_codes: parsed.codes,
    });
    if (!res.ok || !res.data || typeof res.data !== 'object') {
        const p = logError(env, 'songs-plays', 'record_song_plays failed', {
            metadata: { status: res.status, error: res.error?.slice(0, 300) },
        });
        if (context.waitUntil) context.waitUntil(p);
        else p.catch(() => {}); // 日誌寫入失敗不影響回應
        return reply(request, 502, { ok: false, error: 'record_failed' });
    }
    // counted 可能是 0（同 IP 同首同小時已計過），仍算成功
    if (res.data.ok === true) return reply(request, 204);
    if (res.data.reason === 'rate_limited' || res.data.reason === 'too_many') {
        return reply(request, 429, { ok: false, error: res.data.reason });
    }
    return reply(request, 502, { ok: false, error: 'record_failed' });
}

export async function onRequestOptions(context) {
    return handleOptions(context.request, { methods: 'POST, OPTIONS' });
}
