/**
 * 登入狀態（Supabase OAuth：Twitch／Google／Discord）。
 * 沒登入過的訪客不載 Supabase SDK：localStorage 沒有 session、網址也不是 OAuth 回呼時直接判定 anon。
 */
import { create } from 'zustand';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '../../lib/supabase';
import { hasStoredSession } from '../../lib/hasStoredSession';

export interface AuthUser { id: string; email?: string; displayName: string; avatarUrl?: string; providers: string[] }
export type AuthProvider = 'twitch' | 'google' | 'discord';

// kicked：被其他裝置的新登入踢掉（帳號區顯示提示，下次登入時清掉）；linkError：綁定登入方式失敗的錯誤碼（OAuth 回來時從網址讀）
export const useAuthStore = create<{ status: 'unknown' | 'anon' | 'authed'; user: AuthUser | null; kicked?: boolean; linkError?: string | null }>(() => ({ status: 'unknown', user: null }));

const SESSION_TIMEOUT_MS = 2000;
// 登入與綁定 Twitch 都要的權限：聊天讀寫（合併聊天室發言）＋ user:read:emotes（貼圖選單列出自己的訂閱貼圖）
const TWITCH_SCOPES = 'chat:read chat:edit user:read:emotes';
// 切回頁面最多每分鐘查一次 session，避免頻繁切分頁時一直打 Supabase
const ALIVE_CHECK_MS = 60_000;

const isOAuthCallback = () => {
    try {
        return new URLSearchParams(window.location.search).has('code');
    } catch {
        return false;
    }
};

function toAuthUser(session: Session | null): AuthUser | null {
    const u = session?.user;
    if (!u) return null;
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const providers = (u.app_metadata as { providers?: unknown })?.providers;
    return {
        id: u.id,
        email: u.email ?? undefined,
        displayName: str(meta.full_name) ?? str(meta.name) ?? str(meta.preferred_username) ?? u.email?.split('@')[0] ?? '',
        avatarUrl: str(meta.avatar_url) ?? str(meta.picture),
        providers: Array.isArray(providers) ? providers.filter((p): p is string => typeof p === 'string') : [],
    };
}

function apply(session: Session | null) {
    const user = toAuthUser(session);
    useAuthStore.setState({ status: user ? 'authed' : 'anon', user });
}

// 一次性旗標：signIn 跳轉前寫入、回來後消耗。SDK 在還原 session、切回分頁時也會發 SIGNED_IN，只有帶旗標的才是真正的新登入
const FRESH_KEY = 'ms_oauth_fresh';
const LINK_KEY = 'ms_oauth_link';
const takeFlag = (key: string) => {
    try {
        const v = sessionStorage.getItem(key);
        if (v) sessionStorage.removeItem(key);
        return !!v;
    } catch {
        return false;
    }
};

/** 新登入後：踢掉其他裝置（後登入的踢掉先登入的），並把這台裝置之前的匿名問卷答案歸到帳號 */
function afterFreshSignIn(sb: SupabaseClient, session: Session | null) {
    void sb.auth.signOut({ scope: 'others' }).catch(() => {});
    let deviceId: string | null = null;
    try { deviceId = localStorage.getItem('announcement:device_id'); } catch { /* 無痕模式 */ }
    const token = session?.access_token;
    if (!deviceId || !token) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    void fetch('/api/announcements/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ device_id: deviceId }),
        signal: ctrl.signal,
    }).catch(() => {}).finally(() => clearTimeout(timer));
}

const captureChatToken = (session: Session | null) => {
    if (session?.provider_refresh_token) void import('../chat/chatToken').then(m => m.captureTwitchChatToken(session));
};

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
    Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), ms))]);

let initPromise: Promise<SupabaseClient | null> | null = null;

function loadClient(): Promise<SupabaseClient | null> {
    initPromise ??= getSupabase().then(sb => {
        if (!sb) return null;
        // 回呼內不能同步呼叫任何 auth 方法（會與 Supabase 內部的鎖互等而卡死），推遲到下一輪
        sb.auth.onAuthStateChange((event, session) => {
            setTimeout(() => {
                apply(session);
                if (event !== 'SIGNED_IN') return;
                // 用 Twitch 登入或綁定回來：續期權杖只出現在這次 session，交給伺服器保管（合併聊天室發言用；同一個只交一次）
                captureChatToken(session);
                // 綁定登入方式回來也是 SIGNED_IN，但不是新登入，不能踢其他裝置
                const linked = takeFlag(LINK_KEY);
                if (takeFlag(FRESH_KEY) && !linked) afterFreshSignIn(sb, session);
            }, 0);
        });
        return sb;
    });
    return initPromise;
}

let lastAliveCheck = 0;
let aliveListening = false;
function watchSessionAlive() {
    if (aliveListening || typeof document === 'undefined') return;
    aliveListening = true;
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || Date.now() - lastAliveCheck < ALIVE_CHECK_MS) return;
        lastAliveCheck = Date.now();
        void checkSessionAlive().catch(() => {});
    });
}

export async function initAuth(): Promise<void> {
    if (useAuthStore.getState().status !== 'unknown' && initPromise) return;
    watchSessionAlive();
    if (!hasStoredSession() && !isOAuthCallback()) {
        useAuthStore.setState({ status: 'anon', user: null });
        return;
    }
    const sb = await loadClient();
    if (!sb) { useAuthStore.setState({ status: 'anon', user: null }); return; }
    const res = await withTimeout(sb.auth.getSession(), SESSION_TIMEOUT_MS);
    if (res) { apply(res.data.session); captureChatToken(res.data.session); }
    // 逾時：回呼可能已經設好狀態，只有還沒定的才當未登入（之後 onAuthStateChange 會再更新）
    else if (useAuthStore.getState().status === 'unknown') useAuthStore.setState({ status: 'anon', user: null });
    // 登入回呼的 ?code=（與失敗時的 error 參數）用過就從網址拿掉（reload 不會重送、分享出去也不帶）
    try {
        const url = new URL(window.location.href);
        const errorCode = url.searchParams.get('error_code') ?? url.searchParams.get('error');
        // 綁定失敗（最常見：這個登入方式已屬於另一個帳號）SDK 只會保留原 session、不回報，從網址讀出來給帳號區顯示
        if (errorCode && takeFlag(LINK_KEY)) useAuthStore.setState({ linkError: errorCode });
        const params = ['code', 'error', 'error_code', 'error_description'].filter(k => url.searchParams.has(k));
        if (params.length) {
            params.forEach(k => url.searchParams.delete(k));
            window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
        }
    } catch { /* 網址操作失敗不影響登入 */ }
}

export async function signIn(provider: AuthProvider): Promise<void> {
    const sb = await loadClient();
    if (!sb) throw new Error('auth_unavailable');
    // 回來時要知道這次用哪個平台登入，才決定要不要把續期權杖交給聊天發言（見 chat/chatToken.ts）
    try {
        sessionStorage.setItem('ms_oauth_provider', provider);
        sessionStorage.setItem(FRESH_KEY, '1');
        sessionStorage.removeItem(LINK_KEY);
    } catch { /* 無痕模式：只是不能發言、不會踢其他裝置 */ }
    useAuthStore.setState({ kicked: false });
    await sb.auth.signInWithOAuth({
        provider,
        options: {
            redirectTo: window.location.href.split('#')[0],
            // Twitch 多要聊天讀寫權限（合併聊天室發言）與 user:read:emotes（貼圖選單列出自己的訂閱貼圖）
            ...(provider === 'twitch' ? { scopes: TWITCH_SCOPES } : {}),
        },
    });
}

/** 把另一種登入方式綁到目前帳號（同一個人用不同平台登入時才不會變成兩個帳號）；Supabase 後台要開 Manual linking */
export async function linkProvider(provider: AuthProvider): Promise<void> {
    useAuthStore.setState({ linkError: null });
    const sb = await loadClient();
    if (!sb) throw new Error('auth_unavailable');
    try {
        sessionStorage.setItem('ms_oauth_provider', provider);
        sessionStorage.setItem(LINK_KEY, '1');
        sessionStorage.removeItem(FRESH_KEY);
    } catch { /* 無痕模式 */ }
    const { error } = await sb.auth.linkIdentity({
        provider,
        options: {
            redirectTo: window.location.href.split('#')[0],
            ...(provider === 'twitch' ? { scopes: TWITCH_SCOPES } : {}),
        },
    });
    if (error) throw error;
}

/** 解除綁定；只剩一種登入方式時由呼叫端擋（UI 停用按鈕），這裡再擋一次 */
export async function unlinkProvider(provider: AuthProvider): Promise<void> {
    const sb = await loadClient();
    if (!sb) throw new Error('auth_unavailable');
    const { data, error } = await sb.auth.getUserIdentities();
    if (error) throw error;
    const list = data?.identities ?? [];
    const target = list.find(i => i.provider === provider);
    if (!target || list.length < 2) throw new Error('cannot_unlink');
    const res = await sb.auth.unlinkIdentity(target);
    if (res.error) throw res.error;
    // 解除 Twitch：伺服器保管的發言權杖一起刪，不然還能用那個 Twitch 身分發言
    if (provider === 'twitch') {
        const token = await getAccessToken();
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15_000);
        await fetch('/api/twitch/chat-token', { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: ctrl.signal })
            .catch(() => {}).finally(() => clearTimeout(timer));
        void import('../chat/chatToken').then(m => m.resetChatCredentials()).catch(() => {});
    }
    // 拿新的 session 更新登入方式清單；失敗（網路）時保留原狀態，不誤顯示成已登出
    const s = await sb.auth.refreshSession();
    if (!s.error && s.data.session) apply(s.data.session);
}

/**
 * 被其他裝置的新登入踢掉時，存取權杖仍可能有效到過期（最長 1 小時）；切回頁面時問一次伺服器。
 * session 已不存在（401／403／session_not_found）→ 本機登出並標記 kicked；網路錯誤不動。
 */
export async function checkSessionAlive(): Promise<void> {
    if (useAuthStore.getState().status !== 'authed') return;
    const sb = await loadClient();
    if (!sb) return;
    const res = await withTimeout(sb.auth.getUser(), 5000);
    const err = res?.error as { name?: string; status?: number; code?: string } | null | undefined;
    if (!err) return;
    // SDK 收到 session_not_found 會轉成 AuthSessionMissingError（status 400、沒有 code），要另外認；
    // 用名稱比對，不從 SDK 靜態匯入（SDK 只能經 getSupabase 動態載入）
    if (err.name === 'AuthSessionMissingError' || err.status === 401 || err.status === 403 || err.code === 'session_not_found') {
        await signOut();
        useAuthStore.setState({ kicked: true });
    }
}

export async function signOut(): Promise<void> {
    const sb = await loadClient();
    // 伺服器保管的發言權杖不刪：登出只登出這台，其他裝置照樣能發言（刪帳號時資料庫連帶刪除）
    void import('../chat/chatToken').then(m => m.resetChatCredentials()).catch(() => {});
    // 只登出這台；預設 global 會連其他裝置（與同瀏覽器的管理後台）一起登出
    await sb?.auth.signOut({ scope: 'local' });
    useAuthStore.setState({ status: 'anon', user: null });
}

export async function getAccessToken(): Promise<string | null> {
    if (useAuthStore.getState().status !== 'authed') return null;
    const sb = await loadClient();
    const res = sb ? await withTimeout(sb.auth.getSession(), SESSION_TIMEOUT_MS) : null;
    return res?.data.session?.access_token ?? null;
}

/** 投稿類請求用：已登入就帶 Bearer，讓伺服器把投稿記到帳號；未登入回空物件（不載 Supabase） */
export async function authHeaders(): Promise<Record<string, string>> {
    const token = await getAccessToken().catch(() => null);
    return token ? { Authorization: `Bearer ${token}` } : {};
}

/** 刪除自己的帳號（伺服器端驗證 token 後刪除），成功後登出 */
export async function deleteAccount(): Promise<boolean> {
    const token = await getAccessToken();
    if (!token) return false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
        const res = await fetch('/api/account/delete', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
        if (!res.ok) return false;
        await signOut();
        return true;
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}
