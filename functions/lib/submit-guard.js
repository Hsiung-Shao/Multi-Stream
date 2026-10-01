// 公開寫入端點（投稿 VTuber、資料回報）共用的前置檢查：緊急開關 → JSON／大小 → 封鎖 IP → 頻率限制 → Turnstile
// 欄位驗證放在頻率限制之前（格式錯的請求不耗配額）；Turnstile 放最後（減少對 siteverify 的呼叫）。

import { jsonResponse, readJsonBody } from './cors.js';
import { getVisitorIp, isIpBanned, hashIp, checkQuotas, quotaWindow } from './rate-limit.js';
import { verifyTurnstile } from './turnstile.js';
import { select } from './supabase-server.js';

/**
 * @param {Object} context - Pages Function context
 * @param {{ disabledFlag: string, maxBytes: number, validate: (body) => ({value}|{error}),
 *           quotas: (ipHash: string, w: {hour: string, day: string}) => {key,limit,ttl}[] }} cfg
 * @returns {Promise<{ ok: true, value: object, body: object, ip: string, ipHash: string } | { ok: false, response: Response }>}
 */
export async function guardSubmission(context, cfg) {
    const { request, env } = context;
    const fail = (status, error) => ({ ok: false, response: jsonResponse({ ok: false, error }, status, request, { 'Cache-Control': 'no-store' }) });

    if (env[cfg.disabledFlag] === 'true') return fail(503, 'disabled');

    const parsed = await readJsonBody(request, cfg.maxBytes);
    if (!parsed.ok) return { ok: false, response: parsed.response };
    const body = parsed.body;

    const ip = getVisitorIp(request);
    if (isIpBanned(env, ip)) return fail(403, 'banned');

    const checked = cfg.validate(body);
    if (checked.error) return fail(400, checked.error);

    const ipHash = await hashIp(env, ip);
    const quota = await checkQuotas(env.RATE_LIMIT_KV, cfg.quotas(ipHash, quotaWindow()));
    if (!quota.ok) return fail(429, 'rate_limited');

    const ts = await verifyTurnstile(env, body?.turnstileToken, ip);
    if (!ts.ok) return fail(ts.status, ts.error);

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

/** 頻道是否已在站上（vtubers）或已有待審投稿；沒設 Supabase 的環境回空結果 */
export async function findExisting(env, channelId) {
    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) return { exists: null, pending: false };
    const id = encodeURIComponent(channelId);
    const [vt, ct] = await Promise.all([
        select(env, `vtubers?youtube_channel_id=eq.${id}&select=name,slug&limit=1`),
        select(env, `vtuber_contributions?youtube_channel_id=eq.${id}&status=eq.pending&select=id&limit=1`),
    ]);
    return {
        exists: vt.ok && vt.data?.[0] ? { name: vt.data[0].name, slug: vt.data[0].slug } : null,
        pending: !!(ct.ok && ct.data?.length),
    };
}
