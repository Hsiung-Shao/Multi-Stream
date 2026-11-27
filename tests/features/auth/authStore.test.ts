// authStore：登入狀態 store（只依介面規格撰寫）
// 只 mock 外部 I/O：getSupabase 回傳的假 client；每則測試重載模組以重置 store 與冪等旗標
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { getSupabase } = vi.hoisted(() => ({ getSupabase: vi.fn() }));
vi.mock('../../../src/lib/supabase', () => ({ getSupabase }));

type Session = { user: Record<string, unknown> } | null;

const makeSession = (over: Record<string, unknown> = {}): NonNullable<Session> => ({
    user: {
        id: 'u1',
        email: 'jane.doe@example.com',
        user_metadata: { full_name: 'Jane Full', avatar_url: 'https://img/a.png' },
        app_metadata: { providers: ['twitch', 'google'] },
        ...over,
    },
});

function makeClient(initial: Session = null) {
    const auth = {
        getSession: vi.fn(async () => ({ data: { session: initial }, error: null })),
        getUser: vi.fn(async () => ({ data: { user: initial?.user ?? null }, error: null })),
        signInWithOAuth: vi.fn(async (_args: unknown) => ({ data: {}, error: null })),
        signOut: vi.fn(async () => ({ error: null })),
        onAuthStateChange: vi.fn((_cb: (event: string, session: Session) => void) => ({
            data: { subscription: { unsubscribe: vi.fn() } },
        })),
    };
    return { auth };
}

const loadStore = async () => {
    vi.resetModules();
    return await import('../../../src/features/auth/authStore');
};

const STORED_KEY = 'sb-abcdef-auth-token';

beforeEach(() => {
    getSupabase.mockReset();
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
});

afterEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
});

describe('initAuth', () => {
    it('A1 沒登入過也不是登入回呼時不載 Supabase 並設為 anon', async () => {
        const { initAuth, useAuthStore } = await loadStore();
        await initAuth();
        expect(getSupabase).not.toHaveBeenCalled();
        expect(useAuthStore.getState().status).toBe('anon');
        expect(useAuthStore.getState().user).toBeNull();
    });

    it('A1b 網址帶 code= 時視為登入回呼並載入 Supabase', async () => {
        window.history.replaceState(null, '', '/?code=abc123');
        getSupabase.mockResolvedValue(makeClient(null));
        const { initAuth } = await loadStore();
        await initAuth();
        expect(getSupabase).toHaveBeenCalled();
    });

    it('A2 登入狀態變更回呼內不同步呼叫 auth 方法，延後後才更新為 authed', async () => {
        window.localStorage.setItem(STORED_KEY, '{}');
        const client = makeClient(null);
        getSupabase.mockResolvedValue(client);
        const { initAuth, useAuthStore } = await loadStore();
        await initAuth();

        expect(client.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
        const cb = client.auth.onAuthStateChange.mock.calls[0][0];
        const getSessionBefore = client.auth.getSession.mock.calls.length;
        const getUserBefore = client.auth.getUser.mock.calls.length;

        cb('SIGNED_IN', makeSession());

        // 回呼同步執行完的當下：不得碰 supabase.auth（Supabase 已知死鎖）
        expect(client.auth.getSession.mock.calls.length).toBe(getSessionBefore);
        expect(client.auth.getUser.mock.calls.length).toBe(getUserBefore);

        await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('authed'));
        expect(useAuthStore.getState().user).toMatchObject({ id: 'u1', displayName: 'Jane Full' });
    });
});

describe('signIn', () => {
    it('A3 Twitch 登入要聊天權限並回到原頁（去掉 hash）；google 不帶 scopes', async () => {
        const client = makeClient(null);
        getSupabase.mockResolvedValue(client);
        window.history.replaceState(null, '', '/some/page?x=1#section');
        const expectedRedirect = window.location.href.split('#')[0];
        const { signIn } = await loadStore();

        await signIn('twitch');
        expect(client.auth.signInWithOAuth).toHaveBeenLastCalledWith({
            provider: 'twitch',
            options: { redirectTo: expectedRedirect, scopes: 'chat:read chat:edit user:read:emotes' },
        });

        await signIn('google');
        const arg = client.auth.signInWithOAuth.mock.calls.at(-1)![0] as {
            provider: string;
            options?: { redirectTo?: string; scopes?: string };
        };
        expect(arg.provider).toBe('google');
        expect(arg.options?.redirectTo).toBe(expectedRedirect);
        expect(arg.options?.scopes).toBeUndefined();
    });
});

describe('session 轉 AuthUser', () => {
    it.each([
        ['full_name 優先', { full_name: 'Full N', name: 'N', preferred_username: 'pu' }, 'Full N'],
        ['沒 full_name 用 name', { name: 'Just Name', preferred_username: 'pu' }, 'Just Name'],
        ['沒 name 用 preferred_username', { preferred_username: 'pu_user' }, 'pu_user'],
        ['都沒有用 email 前段', {}, 'jane.doe'],
    ])('A4 displayName：%s', async (_t, meta, expected) => {
        window.localStorage.setItem(STORED_KEY, '{}');
        getSupabase.mockResolvedValue(makeClient(makeSession({ user_metadata: meta })));
        const { initAuth, useAuthStore } = await loadStore();
        await initAuth();
        await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('authed'));
        expect(useAuthStore.getState().user?.displayName).toBe(expected);
    });

    it('A4 providers 取自 app_metadata.providers，id 與 email 正確帶入', async () => {
        window.localStorage.setItem(STORED_KEY, '{}');
        getSupabase.mockResolvedValue(makeClient(makeSession()));
        const { initAuth, useAuthStore } = await loadStore();
        await initAuth();
        await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('authed'));
        expect(useAuthStore.getState().user).toMatchObject({
            id: 'u1',
            email: 'jane.doe@example.com',
            providers: ['twitch', 'google'],
        });
    });
});

describe('review 第 1 輪', () => {
    it('取 session 逾時時不把已經由回呼設成已登入的狀態蓋回未登入', async () => {
        vi.useFakeTimers();
        try {
            window.localStorage.setItem(STORED_KEY, '{}');
            const client = makeClient(null);
            client.auth.getSession.mockImplementation(() => new Promise(() => {})); // 永遠不回
            getSupabase.mockResolvedValue(client);
            const { initAuth, useAuthStore } = await loadStore();
            const done = initAuth();
            await vi.advanceTimersByTimeAsync(0);
            client.auth.onAuthStateChange.mock.calls[0][0]('INITIAL_SESSION', makeSession());
            await vi.advanceTimersByTimeAsync(2500);
            await done;
            expect(useAuthStore.getState().status).toBe('authed');
        } finally {
            vi.useRealTimers();
        }
    });

    it('登出只登出這台裝置', async () => {
        const client = makeClient(null);
        getSupabase.mockResolvedValue(client);
        const { signOut } = await loadStore();
        await signOut();
        expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    });

    it('Supabase 載入失敗時登入回報失敗（讓按鈕能恢復）', async () => {
        getSupabase.mockResolvedValue(null);
        const { signIn } = await loadStore();
        await expect(signIn('twitch')).rejects.toThrow();
    });
});
