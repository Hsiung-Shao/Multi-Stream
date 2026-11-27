// POST /api/announcements/claim：登入後把這台裝置之前匿名填的問卷答案歸到帳號。
//   需 Bearer（Supabase 登入）；帳號只取自權杖，body 只收 { device_id }（必須是 UUID）。
//   實際更新由 RPC claim_announcement_responses 完成（只給 service_role）：只動 user_id 為 null 的答案，
//   帳號已作答的公告不覆蓋。device_id 可被偽造，最壞情況是把別人的匿名答案歸到自己名下（問卷價值低），
//   以每帳號每小時 10 次限流。

import { jsonResponse, handleOptions, readJsonBody } from '../../lib/cors.js';
import { getUserIdFromRequest } from '../../lib/auth-helper.js';
import { checkQuotas, quotaWindow } from '../../lib/rate-limit.js';
import { rpc } from '../../lib/supabase-server.js';
import { logError } from '../../lib/logger.js';

const NO_STORE = { 'Cache-Control': 'no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function onRequestPost(context) {
    const { request, env } = context;
    const reply = (data, status) => jsonResponse(data, status, request, NO_STORE);

    const { userId, verified } = await getUserIdFromRequest(request, env);
    if (!verified || !userId) return reply({ ok: false, error: 'unauthorized' }, 401);

    const parsed = await readJsonBody(request, 1024);
    if (!parsed.ok) return parsed.response;
    const deviceId = parsed.body?.device_id;
    if (typeof deviceId !== 'string' || !UUID_RE.test(deviceId)) return reply({ ok: false, error: 'invalid_device_id' }, 400);

    if (env.RATE_LIMIT_KV) {
        const q = await checkQuotas(env.RATE_LIMIT_KV, [{ key: `ann-claim:u:${userId}:${quotaWindow().hour}`, limit: 10, ttl: 3700 }]);
        if (!q.ok) return reply({ ok: false, error: 'rate_limited' }, 429);
    }

    const res = await rpc(env, 'claim_announcement_responses', { p_user_id: userId, p_device_id: deviceId.toLowerCase() });
    if (!res.ok) {
        await logError(env, 'announcements-claim', 'rpc failed', { metadata: { status: res.status, error: res.error?.slice(0, 300) } });
        return reply({ ok: false, error: 'claim_failed' }, 502);
    }
    return reply({ ok: true, claimed: Number(res.data) || 0 }, 200);
}

export const onRequestOptions = ({ request }) => handleOptions(request, { methods: 'POST, OPTIONS' });
