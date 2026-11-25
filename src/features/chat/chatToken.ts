/**
 * 合併聊天室發言用的 Twitch 權杖（伺服器 /api/twitch/chat-token 保管 refresh token，這裡只把 access token 放記憶體）。
 * Twitch 要求每小時驗一次權杖：呼叫端約 50 分鐘重取一次（伺服器每次都向 Twitch 換新）。
 */
import type { Session } from '@supabase/supabase-js';

export interface ChatCredentials { login: string; token: string }
export type CredResult = { kind: 'ok'; creds: ChatCredentials } | { kind: 'missing' } | { kind: 'error' };

const REFRESH_BEFORE_MS = 10 * 60_000;
const TIMEOUT_MS = 15_000;

let cached: { creds: ChatCredentials; expiresAt: number } | null = null;
/** 正在把續期權杖交給伺服器：這段期間查權杖要等它，否則會先拿到 404 誤判成沒授權 */
let capturing: Promise<void> | null = null;
/** 已交過的續期權杖：切回分頁 Supabase 會再發登入事件，同一個不重送 */
let capturedRefresh: string | null = null;
const listeners = new Set<() => void>();

/** 權杖狀態變了（交付完成）時通知；回傳取消函式 */
export function onChatCredentialsChanged(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

async function call(method: 'GET' | 'POST', accessToken: string, body?: unknown): Promise<Response | null> {
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

/** 404／403＝這個帳號沒有發言授權；其他失敗是暫時的（呼叫端保留現有權杖、稍後再試） */
async function toResult(res: Response | null): Promise<CredResult> {
    if (!res) return { kind: 'error' };
    if (res.status === 404 || res.status === 403) { cached = null; return { kind: 'missing' }; }
    if (!res.ok) return { kind: 'error' };
    const d = await res.json().catch(() => null) as { access_token?: string; expires_in?: number; login?: string } | null;
    if (!d?.access_token || !d.login) return { kind: 'error' };
    const ttl = Math.max(60_000, Math.min((d.expires_in ?? 3600) * 1000, 60 * 60_000) - REFRESH_BEFORE_MS);
    cached = { creds: { login: d.login, token: d.access_token }, expiresAt: Date.now() + ttl };
    return { kind: 'ok', creds: cached.creds };
}

/**
 * 用 Twitch 登入回來：把只出現在這次 session 的 refresh token 交給伺服器保管。
 * 不看 app_metadata.provider（那是「第一次註冊用的方式」，先用 Google 註冊的人永遠是 google）；
 * 不是 Twitch 的權杖伺服器會驗出來拒收。
 */
export function captureTwitchChatToken(session: Session | null): Promise<void> {
    const refresh = session?.provider_refresh_token;
    if (!session || !refresh || refresh === capturedRefresh) return capturing ?? Promise.resolve();
    capturedRefresh = refresh;
    capturing = (async () => {
        const r = await toResult(await call('POST', session.access_token, { refresh_token: refresh }));
        if (r.kind === 'ok') for (const fn of listeners) fn();
    })().finally(() => { capturing = null; });
    return capturing;
}

/** 向伺服器取權杖（會先等進行中的交付），回報 ok／missing／error */
export async function fetchChatCredentials(accessToken: string | null): Promise<CredResult> {
    if (capturing) await capturing;
    if (cached && Date.now() < cached.expiresAt) return { kind: 'ok', creds: cached.creds };
    if (!accessToken) return { kind: 'missing' };
    return toResult(await call('GET', accessToken));
}

/** 只要權杖本身（沒有就 null） */
export async function getChatCredentials(accessToken: string | null): Promise<ChatCredentials | null> {
    const r = await fetchChatCredentials(accessToken);
    return r.kind === 'ok' ? r.creds : null;
}

/** 換帳號或登出時清掉記憶體（伺服器保管的不刪：登出只登出這台，其他裝置照樣能發言；刪帳號時資料庫會連帶刪除） */
export function resetChatCredentials(): void {
    cached = null;
    capturedRefresh = null;
}
