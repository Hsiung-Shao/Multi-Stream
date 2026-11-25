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

export const useAuthStore = create<{ status: 'unknown' | 'anon' | 'authed'; user: AuthUser | null }>(() => ({ status: 'unknown', user: null }));

const SESSION_TIMEOUT_MS = 2000;

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

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
    Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), ms))]);

let initPromise: Promise<SupabaseClient | null> | null = null;

function loadClient(): Promise<SupabaseClient | null> {
    initPromise ??= getSupabase().then(sb => {
        if (!sb) return null;
        // 回呼內不能同步呼叫任何 auth 方法（會與 Supabase 內部的鎖互等而卡死），推遲到下一輪
        sb.auth.onAuthStateChange((_event, session) => { setTimeout(() => apply(session), 0); });
        return sb;
    });
    return initPromise;
}

export async function initAuth(): Promise<void> {
    if (useAuthStore.getState().status !== 'unknown' && initPromise) return;
    if (!hasStoredSession() && !isOAuthCallback()) {
        useAuthStore.setState({ status: 'anon', user: null });
        return;
    }
    const sb = await loadClient();
    if (!sb) { useAuthStore.setState({ status: 'anon', user: null }); return; }
    const res = await withTimeout(sb.auth.getSession(), SESSION_TIMEOUT_MS);
    // 逾時時維持 unknown 以外的明確狀態：沒拿到就當未登入，之後 onAuthStateChange 會再更新
    apply(res?.data.session ?? null);
    // 登入回呼的 ?code= 用過就從網址拿掉（reload 不會重送、分享出去也不帶）
    try {
        const url = new URL(window.location.href);
        if (url.searchParams.has('code')) {
            url.searchParams.delete('code');
            window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
        }
    } catch { /* 網址操作失敗不影響登入 */ }
}

export async function signIn(provider: AuthProvider): Promise<void> {
    const sb = await loadClient();
    if (!sb) return;
    await sb.auth.signInWithOAuth({
        provider,
        options: {
            redirectTo: window.location.href.split('#')[0],
            // Twitch 多要聊天讀寫權限：合併聊天室直接發言用
            ...(provider === 'twitch' ? { scopes: 'chat:read chat:edit' } : {}),
        },
    });
}

export async function signOut(): Promise<void> {
    const sb = await loadClient();
    await sb?.auth.signOut();
    useAuthStore.setState({ status: 'anon', user: null });
}

export async function getAccessToken(): Promise<string | null> {
    if (useAuthStore.getState().status !== 'authed') return null;
    const sb = await loadClient();
    const res = sb ? await withTimeout(sb.auth.getSession(), SESSION_TIMEOUT_MS) : null;
    return res?.data.session?.access_token ?? null;
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
