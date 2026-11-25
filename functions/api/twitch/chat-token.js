// /api/twitch/chat-token：合併聊天室發言用的 Twitch 權杖（需 Supabase 登入的 Bearer token）
//
// Supabase 只在登入當下交出 Twitch 的 provider_refresh_token，之後不保存也不續期，所以：
//   POST   登入回來時前端送 refresh_token → 換新並驗證屬於這個帳號連結的 Twitch 身分、有 chat:edit → 加密存起來
//   GET    解密 → 向 Twitch 換新（refresh token 會輪換，新的加密存回）→ 回 access token（前端只放記憶體）
//   DELETE 登出或取消授權時刪除
// 只處理「token 驗出的那個使用者」的列；上游錯誤一律 502、不回傳上游內容。

import { jsonResponse, handleOptions, readJsonBody } from '../../lib/cors.js';
import { getUserIdFromRequest } from '../../lib/auth-helper.js';
import { select, upsert, remove } from '../../lib/supabase-server.js';
import { checkKvQuota, quotaWindow } from '../../lib/rate-limit.js';
import { encryptToken, decryptToken } from '../../lib/token-crypto.js';

const TABLE = 'twitch_chat_tokens';
const NO_STORE = { 'Cache-Control': 'no-store' };
const TWITCH_TIMEOUT_MS = 10_000;

const reply = (request, data, status) => jsonResponse(data, status, request, NO_STORE);

async function authed(context) {
    const { request, env } = context;
    const { userId, verified } = await getUserIdFromRequest(request, env);
    if (!verified || !userId) return { error: reply(request, { ok: false, error: 'unauthorized' }, 401) };
    // 每人每小時 60 次（前端約 50 分鐘才取一次，正常用不到）
    if (!(await checkKvQuota(env.RATE_LIMIT_KV, `chat-token:${userId}:${quotaWindow().hour}`, 60, 3700))) {
        return { error: reply(request, { ok: false, error: 'rate_limited' }, 429) };
    }
    return { userId };
}

/** 向 Twitch 用 refresh token 換新；回 { status, data } */
async function refreshAtTwitch(env, refreshToken) {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: env.TWITCH_CLIENT_ID,
            client_secret: env.TWITCH_CLIENT_SECRET,
        }),
        signal: AbortSignal.timeout(TWITCH_TIMEOUT_MS),
    });
    return { status: res.status, data: res.ok ? await res.json() : null };
}

async function validateAtTwitch(accessToken) {
    const res = await fetch('https://id.twitch.tv/oauth2/validate', {
        headers: { Authorization: `OAuth ${accessToken}` },
        signal: AbortSignal.timeout(TWITCH_TIMEOUT_MS),
    });
    return res.ok ? res.json() : null;
}

/** 這個帳號連結的 Twitch 身分（Twitch user id） */
async function linkedTwitchId(env, userId) {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!res.ok) return { error: true };
    const user = await res.json();
    const identity = (user?.identities ?? []).find(i => i?.provider === 'twitch');
    const id = identity?.id ?? identity?.identity_data?.sub ?? identity?.identity_data?.provider_id;
    return { id: id ? String(id) : null };
}

async function store(env, userId, twitchUserId, login, refreshToken) {
    const refresh_token_enc = await encryptToken(refreshToken, env.TWITCH_TOKEN_ENC_KEY);
    const r = await upsert(env, TABLE, [{ user_id: userId, twitch_user_id: twitchUserId, login, refresh_token_enc, updated_at: new Date().toISOString() }], { onConflict: 'user_id' });
    return r.ok;
}

export async function onRequestPost(context) {
    const { request, env } = context;
    const a = await authed(context);
    if (a.error) return a.error;
    const body = await readJsonBody(request, 4096);
    if (!body.ok) return body.response;
    const refreshToken = body.body?.refresh_token;
    if (typeof refreshToken !== 'string' || !refreshToken || refreshToken.length > 1024) {
        return reply(request, { ok: false, error: 'invalid_body' }, 400);
    }
    try {
        const linked = await linkedTwitchId(env, a.userId);
        if (linked.error) return reply(request, { ok: false, error: 'upstream' }, 502);
        if (!linked.id) return reply(request, { ok: false, error: 'not_twitch_account' }, 403);

        const fresh = await refreshAtTwitch(env, refreshToken);
        if (!fresh.data) return reply(request, { ok: false, error: fresh.status === 400 ? 'invalid_token' : 'upstream' }, fresh.status === 400 ? 400 : 502);
        const info = await validateAtTwitch(fresh.data.access_token);
        if (!info) return reply(request, { ok: false, error: 'upstream' }, 502);
        if (String(info.user_id) !== linked.id) return reply(request, { ok: false, error: 'identity_mismatch' }, 403);
        if (!Array.isArray(info.scopes) || !info.scopes.includes('chat:edit')) return reply(request, { ok: false, error: 'missing_scope' }, 400);

        if (!(await store(env, a.userId, linked.id, String(info.login), fresh.data.refresh_token))) {
            return reply(request, { ok: false, error: 'upstream' }, 502);
        }
        return reply(request, { access_token: fresh.data.access_token, expires_in: fresh.data.expires_in, login: info.login }, 200);
    } catch {
        return reply(request, { ok: false, error: 'upstream' }, 502);
    }
}

export async function onRequestGet(context) {
    const { request, env } = context;
    const a = await authed(context);
    if (a.error) return a.error;
    try {
        const row = await select(env, `${TABLE}?user_id=eq.${encodeURIComponent(a.userId)}&select=twitch_user_id,login,refresh_token_enc`);
        if (!row.ok) return reply(request, { ok: false, error: 'upstream' }, 502);
        const r = row.data?.[0];
        if (!r) return reply(request, { ok: false, error: 'not_linked' }, 404);

        const fresh = await refreshAtTwitch(env, await decryptToken(r.refresh_token_enc, env.TWITCH_TOKEN_ENC_KEY));
        if (fresh.status === 400) {
            // 使用者在 Twitch 撤銷了授權：清掉，前端改顯示「用 Twitch 登入後發言」
            await remove(env, TABLE, `user_id=eq.${encodeURIComponent(a.userId)}`);
            return reply(request, { ok: false, error: 'not_linked' }, 404);
        }
        if (!fresh.data) return reply(request, { ok: false, error: 'upstream' }, 502);
        if (!(await store(env, a.userId, r.twitch_user_id, r.login, fresh.data.refresh_token))) {
            return reply(request, { ok: false, error: 'upstream' }, 502);
        }
        return reply(request, { access_token: fresh.data.access_token, expires_in: fresh.data.expires_in, login: r.login }, 200);
    } catch {
        return reply(request, { ok: false, error: 'upstream' }, 502);
    }
}

export async function onRequestDelete(context) {
    const { request, env } = context;
    const a = await authed(context);
    if (a.error) return a.error;
    const r = await remove(env, TABLE, `user_id=eq.${encodeURIComponent(a.userId)}`);
    return r.ok ? reply(request, { ok: true }, 200) : reply(request, { ok: false, error: 'upstream' }, 502);
}

export const onRequestOptions = ({ request }) => handleOptions(request, { methods: 'GET, POST, DELETE, OPTIONS' });
