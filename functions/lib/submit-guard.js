// 公開寫入端點（投稿 VTuber、資料回報）共用的前置檢查：
//   緊急開關 → 設定檢查 → 來源（本站頁面） → JSON／大小 → 封鎖 IP → 欄位驗證 → 個人配額 → Turnstile → 全站配額
// 來源檢查擋得住別的網站與裸 curl（header 可偽造，真正的防線是 Turnstile 與配額），與頻道查詢一致。
// 欄位驗證放在配額之前（格式錯的請求不耗配額）；全站配額放在 Turnstile 之後（不然拿假 token 就能把全站額度用光）。
// 設定缺漏（IP_HASH_SALT、RATE_LIMIT_KV）回 503：漏設時不能在沒有限流、個資可還原的狀態下默默上線。

import { isRequestFromAllowedSite, jsonResponse, readJsonBody } from './cors.js';
import { getVisitorIp, isIpBanned, hashIp, checkQuotas, quotaWindow } from './rate-limit.js';
import { verifyTurnstile } from './turnstile.js';
import { select } from './supabase-server.js';

/**
 * @param {Object} context - Pages Function context
 * @param {{ disabledFlag: string, maxBytes: number, validate: (body) => ({value}|{error}),
 *           quotas: (ipHash: string, w: {hour: string, day: string}) => { personal: {key,limit,ttl}[], global: {key,limit,ttl}[] } }} cfg
 * @returns {Promise<{ ok: true, value: object, body: object, ip: string, ipHash: string } | { ok: false, response: Response }>}
 */
export async function guardSubmission(context, cfg) {
    const { request, env } = context;
    const fail = (status, error) => ({ ok: false, response: jsonResponse({ ok: false, error }, status, request, { 'Cache-Control': 'no-store' }) });

    if (env[cfg.disabledFlag] === 'true') return fail(503, 'disabled');
    if (!env.IP_HASH_SALT || !env.RATE_LIMIT_KV) return fail(503, 'not_configured');
    if (!isRequestFromAllowedSite(request)) return fail(403, 'forbidden');

    const parsed = await readJsonBody(request, cfg.maxBytes);
    if (!parsed.ok) return { ok: false, response: parsed.response };
    const body = parsed.body;

    const ip = getVisitorIp(request);
    if (isIpBanned(env, ip)) return fail(403, 'banned');

    const checked = cfg.validate(body);
    if (checked.error) return fail(400, checked.error);

    const ipHash = await hashIp(env, ip);
    const quotas = cfg.quotas(ipHash, quotaWindow());
    if (!(await checkQuotas(env.RATE_LIMIT_KV, quotas.personal)).ok) return fail(429, 'rate_limited');

    const ts = await verifyTurnstile(env, body?.turnstileToken, ip);
    if (!ts.ok) return fail(ts.status, ts.error);

    if (!(await checkQuotas(env.RATE_LIMIT_KV, quotas.global)).ok) return fail(429, 'rate_limited');

    return { ok: true, value: checked.value, body, ip, ipHash };
}

/** PostgREST 錯誤文字 → 函式丟出的 message（approve_vtuber_contribution 用 exception message 當錯誤碼） */
export function postgrestErrorMessage(errorText) {
    try {
        return JSON.parse(errorText)?.message ?? null;
    } catch {
        return null;
    }
}

/** PostgREST 錯誤是否為唯一索引衝突（23505） */
export function isUniqueViolation(errorText) {
    try {
        return JSON.parse(errorText)?.code === '23505';
    } catch {
        return false;
    }
}

/**
 * 頻道是否已在站上或已有待審投稿；查重範圍與核准函式（approve_vtuber_contribution）一致：
 *   YouTube：vtubers.youtube_channel_id 或 active 的 vtuber_channels（第二個頻道只登記在這裡）
 *   Twitch（有給 login 時）：vtubers.twitch_channel_id 或 active 的 vtuber_channels.handle
 * 沒設 Supabase 的環境回空結果。
 */
export async function findExisting(env, channelId, twitchLogin = null) {
    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) return { exists: null, pending: false, twitchTaken: false };
    const id = encodeURIComponent(channelId);
    const tw = twitchLogin ? encodeURIComponent(twitchLogin.toLowerCase()) : null;
    const [vt, vc, ct, tv, tc] = await Promise.all([
        select(env, `vtubers?youtube_channel_id=eq.${id}&select=name,slug&limit=1`),
        select(env, `vtuber_channels?platform=eq.youtube&external_id=eq.${id}&status=eq.active&select=vtubers(name,slug)&limit=1`),
        select(env, `vtuber_contributions?youtube_channel_id=eq.${id}&status=eq.pending&select=id&limit=1`),
        tw ? select(env, `vtubers?twitch_channel_id=ilike.${tw}&select=id&limit=1`) : null,
        tw ? select(env, `vtuber_channels?platform=eq.twitch&handle=ilike.${tw}&status=eq.active&select=id&limit=1`) : null,
    ]);
    const byChannel = vc.ok ? vc.data?.[0]?.vtubers : null;
    const person = vt.ok && vt.data?.[0] ? vt.data[0] : byChannel;
    return {
        exists: person ? { name: person.name, slug: person.slug } : null,
        pending: !!(ct.ok && ct.data?.length),
        twitchTaken: !!((tv?.ok && tv.data?.length) || (tc?.ok && tc.data?.length)),
    };
}
