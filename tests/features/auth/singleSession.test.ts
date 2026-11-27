// 單一登入裝置（U10–U12，只依介面規格撰寫）：
//   新登入踢掉其他裝置、被踢的裝置切回頁面時登出並提示、綁定第二個平台不觸發踢人
// 只 mock 外部 I/O：getSupabase 回傳的假 client；每則測試重載模組以重置 store
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthSessionMissingError } from '@supabase/auth-js';

const { getSupabase } = vi.hoisted(() => ({ getSupabase: vi.fn() }));
vi.mock('../../../src/lib/supabase', () => ({ getSupabase }));

type Session = { user: Record<string, unknown> } | null;
type AuthCb = (event: string, session: Session) => void;

const makeSession = (): NonNullable<Session> => ({
    user: {
        id: 'u1',
        email: 'jane@example.com',
        user_metadata: { full_name: 'Jane' },
        app_metadata: { providers: ['twitch'] },
    },
});

function makeClient(initial: Session = null) {
    const auth = {
        getSession: vi.fn(async () => ({ data: { session: initial }, error: null })),
        getUser: vi.fn(async (): Promise<{ data: { user: unknown }; error: unknown }> => ({ data: { user: initial?.user ?? null }, error: null })),
        signInWithOAuth: vi.fn(async (_args: unknown) => ({ data: {}, error: null })),
        linkIdentity: vi.fn(async (_args: unknown) => ({ data: {}, error: null })),
        signOut: vi.fn(async (_args?: unknown) => ({ error: null })),
        getUserIdentities: vi.fn(async () => ({ data: { identities: [{ provider: 'twitch', identity_id: 'i1' }, { provider: 'discord', identity_id: 'i2' }] }, error: null })),
        unlinkIdentity: vi.fn(async (_i: unknown) => ({ data: {}, error: null })),
        refreshSession: vi.fn(async (): Promise<{ data: { session: unknown }; error: unknown }> => ({ data: { session: initial }, error: null })),
        onAuthStateChange: vi.fn((_cb: AuthCb) => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    };
    return { auth };
}

const loadStore = async () => {
    vi.resetModules();
    return await import('../../../src/features/auth/authStore');
};

const STORED_KEY = 'sb-abcdef-auth-token';
const tick = () => new Promise((r) => setTimeout(r, 20));
const othersCalls = (c: ReturnType<typeof makeClient>) =>
    c.auth.signOut.mock.calls.filter((args) => (args[0] as { scope?: string } | undefined)?.scope === 'others');

beforeEach(() => {
    getSupabase.mockReset();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
});

afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
});

describe('U10 新登入會踢掉其他裝置', () => {
    it('signIn 寫入 ms_oauth_fresh 旗標，回來後的 SIGNED_IN 呼叫 signOut({scope:"others"}) 並清掉旗標', async () => {
        const client = makeClient(null);
        getSupabase.mockResolvedValue(client);
        const { signIn, initAuth } = await loadStore();

        await signIn('google');
        expect(window.sessionStorage.getItem('ms_oauth_fresh')).toBe('1');

        // 模擬 OAuth 回來：網址帶 code，SDK 發 SIGNED_IN
        window.history.replaceState(null, '', '/?code=abc');
        await initAuth();
        const cb = client.auth.onAuthStateChange.mock.calls[0][0];
        cb('SIGNED_IN', makeSession());

        await vi.waitFor(() => expect(othersCalls(client)).toHaveLength(1));
        expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'others' });
        expect(window.sessionStorage.getItem('ms_oauth_fresh')).toBeNull();
    });

    it('旗標用過一次就消耗掉：同一個旗標不會讓第二次 SIGNED_IN 再踢人', async () => {
        const client = makeClient(null);
        getSupabase.mockResolvedValue(client);
        window.localStorage.setItem(STORED_KEY, '{}');
        window.sessionStorage.setItem('ms_oauth_fresh', '1');
        const { initAuth } = await loadStore();
        await initAuth();
        const cb = client.auth.onAuthStateChange.mock.calls[0][0];

        cb('SIGNED_IN', makeSession());
        await vi.waitFor(() => expect(othersCalls(client)).toHaveLength(1));
        cb('SIGNED_IN', makeSession());
        await tick();
        expect(othersCalls(client)).toHaveLength(1);
    });

    it('沒有旗標的 SIGNED_IN（還原 session、切回分頁時 SDK 重發）不踢人', async () => {
        const client = makeClient(null);
        getSupabase.mockResolvedValue(client);
        window.localStorage.setItem(STORED_KEY, '{}');
        const { initAuth, useAuthStore } = await loadStore();
        await initAuth();
        const cb = client.auth.onAuthStateChange.mock.calls[0][0];

        cb('SIGNED_IN', makeSession());
        await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('authed'));
        await tick();
        expect(othersCalls(client)).toHaveLength(0);
    });

    it('旗標存在時只有 SIGNED_IN 事件會踢人，其他事件（TOKEN_REFRESHED）不會', async () => {
        const client = makeClient(null);
        getSupabase.mockResolvedValue(client);
        window.localStorage.setItem(STORED_KEY, '{}');
        window.sessionStorage.setItem('ms_oauth_fresh', '1');
        const { initAuth } = await loadStore();
        await initAuth();
        const cb = client.auth.onAuthStateChange.mock.calls[0][0];

        cb('TOKEN_REFRESHED', makeSession());
        await tick();
        expect(othersCalls(client)).toHaveLength(0);
        expect(window.sessionStorage.getItem('ms_oauth_fresh')).toBe('1');
    });
});

describe('U11 被踢的裝置切回頁面時登出並提示', () => {
    const authed = async (client: ReturnType<typeof makeClient>) => {
        getSupabase.mockResolvedValue(client);
        const mod = await loadStore();
        mod.useAuthStore.setState({ status: 'authed', user: { id: 'u1', displayName: 'Jane', providers: ['twitch'] } });
        return mod;
    };

    it('getUser 回 401：本機登出，狀態變 anon 且 kicked 為 true', async () => {
        const client = makeClient(makeSession());
        client.auth.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401, message: 'invalid JWT' } });
        const { checkSessionAlive, useAuthStore } = await authed(client);

        await checkSessionAlive();

        expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
        expect(useAuthStore.getState()).toMatchObject({ status: 'anon', user: null, kicked: true });
    });

    it('getUser 回 403 也視為被踢', async () => {
        const client = makeClient(makeSession());
        client.auth.getUser.mockResolvedValue({ data: { user: null }, error: { status: 403, message: 'forbidden' } });
        const { checkSessionAlive, useAuthStore } = await authed(client);

        await checkSessionAlive();

        expect(useAuthStore.getState()).toMatchObject({ status: 'anon', user: null, kicked: true });
    });

    it('SDK 把 session_not_found 轉成 AuthSessionMissingError（status 400）也視為被踢', async () => {
        const client = makeClient(makeSession());
        client.auth.getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
        const { checkSessionAlive, useAuthStore } = await authed(client);

        await checkSessionAlive();

        expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
        expect(useAuthStore.getState()).toMatchObject({ status: 'anon', user: null, kicked: true });
    });

    it('網路錯誤（沒有 status）不登出、狀態維持已登入', async () => {
        const client = makeClient(makeSession());
        client.auth.getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch' } });
        const { checkSessionAlive, useAuthStore } = await authed(client);

        await checkSessionAlive();

        expect(client.auth.signOut).not.toHaveBeenCalled();
        expect(useAuthStore.getState().status).toBe('authed');
        expect(useAuthStore.getState().kicked).toBeFalsy();
    });

    it('session 仍有效（getUser 成功）時不登出', async () => {
        const client = makeClient(makeSession());
        const { checkSessionAlive, useAuthStore } = await authed(client);

        await checkSessionAlive();

        expect(client.auth.getUser).toHaveBeenCalledTimes(1);
        expect(client.auth.signOut).not.toHaveBeenCalled();
        expect(useAuthStore.getState().status).toBe('authed');
    });

    it('沒登入時不查伺服器（getUser 不被呼叫）', async () => {
        const client = makeClient(null);
        getSupabase.mockResolvedValue(client);
        const { checkSessionAlive, useAuthStore } = await loadStore();
        useAuthStore.setState({ status: 'anon', user: null });

        await checkSessionAlive();

        expect(client.auth.getUser).not.toHaveBeenCalled();
    });
});

describe('U12 綁定不觸發踢人', () => {
    it('linkProvider 寫 ms_oauth_provider 與 ms_oauth_link、不寫 ms_oauth_fresh', async () => {
        const client = makeClient(makeSession());
        getSupabase.mockResolvedValue(client);
        const { linkProvider } = await loadStore();

        await linkProvider('discord');

        expect(window.sessionStorage.getItem('ms_oauth_provider')).toBe('discord');
        expect(window.sessionStorage.getItem('ms_oauth_link')).toBe('1');
        expect(window.sessionStorage.getItem('ms_oauth_fresh')).toBeNull();
    });

    it('綁定回來後的 SIGNED_IN 不呼叫 signOut({scope:"others"})', async () => {
        const client = makeClient(makeSession());
        getSupabase.mockResolvedValue(client);
        const { linkProvider, useAuthStore } = await loadStore();

        await linkProvider('google');
        const cb = client.auth.onAuthStateChange.mock.calls[0][0];
        cb('SIGNED_IN', makeSession());

        await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('authed'));
        await tick();
        expect(othersCalls(client)).toHaveLength(0);
    });

});

describe('review 第 1 輪：綁定與解除', () => {
    const withToken = () => ({ ...makeSession(), access_token: 'tok' });

    it('解除 Twitch 時刪除伺服器保管的發言權杖', async () => {
        const client = makeClient(withToken());
        getSupabase.mockResolvedValue(client);
        const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const { unlinkProvider, useAuthStore } = await loadStore();
        useAuthStore.setState({ status: 'authed', user: { id: 'u1', displayName: 'Jane', providers: ['twitch', 'discord'] } });

        await unlinkProvider('twitch');

        const del = fetchMock.mock.calls.find(([u, init]) => String(u) === '/api/twitch/chat-token' && (init as RequestInit)?.method === 'DELETE');
        expect(del).toBeTruthy();
        vi.unstubAllGlobals();
    });

    it('解除後重新整理 session 失敗時不誤判成已登出', async () => {
        const client = makeClient(withToken());
        client.auth.refreshSession.mockResolvedValue({ data: { session: null }, error: new Error('network') });
        getSupabase.mockResolvedValue(client);
        vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
        const { unlinkProvider, useAuthStore } = await loadStore();
        useAuthStore.setState({ status: 'authed', user: { id: 'u1', displayName: 'Jane', providers: ['twitch', 'discord'] } });

        await unlinkProvider('discord');

        expect(useAuthStore.getState().status).toBe('authed');
        vi.unstubAllGlobals();
    });

    it('綁定失敗從網址帶回錯誤碼：記下錯誤、清掉網址參數與旗標', async () => {
        const client = makeClient(withToken());
        getSupabase.mockResolvedValue(client);
        window.localStorage.setItem(STORED_KEY, '{}');
        window.sessionStorage.setItem('ms_oauth_link', '1');
        window.history.replaceState(null, '', '/zh-TW?error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked');
        const { initAuth, useAuthStore } = await loadStore();

        await initAuth();

        expect(useAuthStore.getState().linkError).toBe('identity_already_exists');
        expect(window.location.search).toBe('');
        expect(window.sessionStorage.getItem('ms_oauth_link')).toBeNull();
    });
});
