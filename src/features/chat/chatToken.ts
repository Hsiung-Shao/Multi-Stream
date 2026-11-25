/**
 * 合併聊天室發言用的 Twitch 權杖（伺服器 /api/twitch/chat-token 保管 refresh token，這裡只把 access token 放記憶體）。
 * Twitch 要求每小時驗一次權杖：這裡 50 分鐘就重取一次（伺服器每次都向 Twitch 換新）。
 */
import type { Session } from '@supabase/supabase-js';

export interface ChatCredentials { login: string; token: string }

const REFRESH_BEFORE_MS = 10 * 60_000;
const TIMEOUT_MS = 15_000;

let cached: { creds: ChatCredentials; expiresAt: number } | null = null;
let missing = false; // 伺服器說這個帳號沒有發言授權：本次頁面不再一直問

async function call(method: 'GET' | 'POST' | 'DELETE', accessToken: string, body?: unknown): Promise<Response | null> {
    try {
        return await fetch('/api/twitch/chat-token', {
            method,
            headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
    } catch {
        return null;
    }
}

async function remember(res: Response | null): Promise<ChatCredentials | null> {
    if (!res) return null;
    if (res.status === 404 || res.status === 403) { missing = true; cached = null; return null; }
    if (!res.ok) return null;
    const d = await res.json().catch(() => null) as { access_token?: string; expires_in?: number; login?: string } | null;
    if (!d?.access_token || !d.login) return null;
    missing = false;
    const ttl = Math.max(60_000, Math.min((d.expires_in ?? 3600) * 1000, 60 * 60_000) - REFRESH_BEFORE_MS);
    cached = { creds: { login: d.login, token: d.access_token }, expiresAt: Date.now() + ttl };
    return cached.creds;
}

/** 剛用 Twitch 登入回來：把只出現這一次的 refresh token 交給伺服器保管 */
export async function captureTwitchChatToken(session: Session | null): Promise<void> {
    const refresh = session?.provider_refresh_token;
    if (!session || !refresh || session.user?.app_metadata?.provider !== 'twitch') return;
    await remember(await call('POST', session.access_token, { refresh_token: refresh }));
}

/** 取發言權杖；沒授權回 null。accessToken＝Supabase 登入 token */
export async function getChatCredentials(accessToken: string | null): Promise<ChatCredentials | null> {
    if (!accessToken) return null;
    if (cached && Date.now() < cached.expiresAt) return cached.creds;
    if (missing) return null;
    return remember(await call('GET', accessToken));
}

/** 登出：伺服器刪掉保管的權杖，記憶體清空 */
export async function forgetChatCredentials(accessToken: string | null): Promise<void> {
    cached = null;
    missing = false;
    if (accessToken) await call('DELETE', accessToken);
}

/** 換帳號時清掉記憶體快取（不動伺服器） */
export function resetChatCredentials(): void {
    cached = null;
    missing = false;
}
