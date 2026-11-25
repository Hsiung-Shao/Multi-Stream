// /api/twitch/chat-token：保管 Twitch 聊天權杖（只依介面規格撰寫）
// 只 mock 外部 I/O：fetch（Supabase Auth／Admin／PostgREST、Twitch OAuth）、KV
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestGet, onRequestPost, onRequestDelete, onRequestOptions } from '../../functions/api/twitch/chat-token.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { encryptToken, decryptToken } from '../../functions/lib/token-crypto.js';

const UID = '33333333-3333-4333-8333-333333333333';
const TW_ID = '987654';
const JWT = 'aaa.bbb.ccc';
const KEY = Buffer.from(new Uint8Array(32).fill(5)).toString('base64');

const ENV = () => {
    const m = new Map<string, string>();
    return {
        SUPABASE_URL: 'http://sb',
        SUPABASE_SERVICE_ROLE_KEY: 'svc-key',
        TWITCH_CLIENT_ID: 'cid',
        TWITCH_CLIENT_SECRET: 'csecret',
        TWITCH_TOKEN_ENC_KEY: KEY,
        RATE_LIMIT_KV: { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => { m.set(k, v); } },
    };
};

type Call = { url: string; method: string; body: string };
let calls: Call[] = [];
// 可被各測試覆寫的上游行為
let userLookup: () => Response;
let adminUser: () => Response;
let twitchToken: (body: URLSearchParams) => Response;
let twitchValidate: () => Response;
let storedRow: Record<string, unknown> | null;

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });

beforeEach(() => {
    calls = [];
    storedRow = null;
    userLookup = () => json({ id: UID });
    adminUser = () => json({ id: UID, identities: [{ provider: 'twitch', id: TW_ID, identity_data: { sub: TW_ID } }] });
    twitchToken = () => json({ access_token: 'at-new', refresh_token: 'rt-new', expires_in: 14000 });
    twitchValidate = () => json({ user_id: TW_ID, login: 'me', scopes: ['chat:read', 'chat:edit'] });
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        const method = (init?.method || 'GET').toUpperCase();
        const body = typeof init?.body === 'string' ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : '';
        calls.push({ url, method, body });
        if (url.includes('/auth/v1/admin/users/')) return adminUser();
        if (url.includes('/auth/v1/user')) return userLookup();
        if (url.includes('id.twitch.tv/oauth2/token')) return twitchToken(new URLSearchParams(body));
        if (url.includes('id.twitch.tv/oauth2/validate')) return twitchValidate();
        if (url.includes('/rest/v1/twitch_chat_tokens')) {
            if (method === 'GET') return json(storedRow ? [storedRow] : []);
            return new Response('[]', { status: 200 });
        }
        return new Response('not mocked', { status: 500 });
    }));
});
afterEach(() => vi.unstubAllGlobals());

const req = (method: string, token: string | null = JWT, body?: unknown) =>
    new Request('https://multistreaming.org/api/twitch/chat-token', {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
const post = (token: string | null = JWT) => onRequestPost({ request: req('POST', token, { refresh_token: 'rt-old' }), env: ENV() });
const get = (token: string | null = JWT) => onRequestGet({ request: req('GET', token), env: ENV() });
const del = (token: string | null = JWT) => onRequestDelete({ request: req('DELETE', token), env: ENV() });

const tableCalls = () => calls.filter(c => c.url.includes('/rest/v1/twitch_chat_tokens'));
const tableWrites = () => tableCalls().filter(c => c.method !== 'GET');
const twitchCalls = () => calls.filter(c => c.url.includes('id.twitch.tv'));
/** 寫入資料表的 body（可能是物件或單元素陣列） */
const writtenRow = () => {
    const w = tableWrites().find(c => c.method !== 'DELETE');
    const parsed = JSON.parse(w!.body);
    return Array.isArray(parsed) ? parsed[0] : parsed;
};

describe('T1 沒帶登入取權杖被拒', () => {
    it('三種方法都沒帶 Authorization：401，沒打 Twitch、沒碰資料表', async () => {
        for (const run of [get, post, del]) {
            const res = await run(null);
            expect(res.status).toBe(401);
        }
        expect(twitchCalls()).toHaveLength(0);
        expect(tableCalls()).toHaveLength(0);
    });

    it('token 驗證失敗（Supabase 回 401）：401，沒打 Twitch、沒碰資料表', async () => {
        userLookup = () => json({}, 401);
        for (const run of [get, post, del]) {
            const res = await run();
            expect(res.status).toBe(401);
        }
        expect(twitchCalls()).toHaveLength(0);
        expect(tableCalls()).toHaveLength(0);
    });
});

describe('POST 存入權杖', () => {
    it('T2 validate 的 user_id 與帳號 Twitch 身分不同：403 且沒有寫入', async () => {
        twitchValidate = () => json({ user_id: 'someone-else', login: 'evil', scopes: ['chat:edit'] });
        const res = await post();
        expect(res.status).toBe(403);
        expect(tableWrites()).toHaveLength(0);
    });

    it('T2a 帳號沒有 Twitch 身分：403 且沒有寫入', async () => {
        adminUser = () => json({ id: UID, identities: [{ provider: 'google', id: 'g1' }] });
        const res = await post();
        expect(res.status).toBe(403);
        expect(tableWrites()).toHaveLength(0);
    });

    it('T2b scopes 不含 chat:edit：400 且沒有寫入', async () => {
        twitchValidate = () => json({ user_id: TW_ID, login: 'me', scopes: ['chat:read'] });
        const res = await post();
        expect(res.status).toBe(400);
        expect(tableWrites()).toHaveLength(0);
    });

    it('T3 成功：回 200 含 access_token／expires_in／login；寫入的 refresh_token_enc 不是明文且可還原', async () => {
        const res = await post();
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ access_token: 'at-new', expires_in: 14000, login: 'me' });

        // 換新用的是使用者送來的 refresh token
        const tokenCall = calls.find(c => c.url.includes('oauth2/token'))!;
        expect(new URLSearchParams(tokenCall.body).get('grant_type')).toBe('refresh_token');
        expect(new URLSearchParams(tokenCall.body).get('refresh_token')).toBe('rt-old');

        const row = writtenRow();
        expect(row.user_id).toBe(UID);
        expect(row.twitch_user_id).toBe(TW_ID);
        expect(row.login).toBe('me');
        expect(row.refresh_token_enc).not.toBe('rt-new');
        expect(row.refresh_token_enc).not.toBe('rt-old');
        expect(JSON.stringify(tableWrites())).not.toContain('rt-new');
        expect(await decryptToken(row.refresh_token_enc, KEY)).toBe('rt-new');
    });

    it('T5 Twitch 換新回 500 含內部字串：502 且 body 不含該字串', async () => {
        twitchToken = () => new Response('boom SECRET_TWITCH_DETAIL', { status: 500 });
        const res = await post();
        expect(res.status).toBe(502);
        expect(await res.text()).not.toContain('SECRET_TWITCH_DETAIL');
        expect(tableWrites()).toHaveLength(0);
    });
});

describe('GET 取用權杖', () => {
    beforeEach(async () => {
        storedRow = { user_id: UID, twitch_user_id: TW_ID, login: 'me', refresh_token_enc: await encryptToken('rt-stored', KEY) };
    });

    it('沒有存過：404', async () => {
        storedRow = null;
        const res = await get();
        expect(res.status).toBe(404);
        expect(twitchCalls()).toHaveLength(0);
    });

    it('T4 換新後保存輪換的 refresh token：用解密後的舊值換新、寫回加密的新值、回應含 access_token', async () => {
        let usedRefresh = '';
        twitchToken = (b) => { usedRefresh = b.get('refresh_token') || ''; return json({ access_token: 'at-2', refresh_token: 'rt-rotated', expires_in: 3600 }); };
        const res = await get();
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ access_token: 'at-2', expires_in: 3600, login: 'me' });
        expect(usedRefresh).toBe('rt-stored');

        const row = writtenRow();
        expect(row.refresh_token_enc).not.toBe('rt-rotated');
        expect(await decryptToken(row.refresh_token_enc, KEY)).toBe('rt-rotated');
    });

    it('T4b 權杖被撤銷（Twitch 回 400）：刪掉該列並回 404', async () => {
        twitchToken = () => json({ status: 400, message: 'Invalid refresh token' }, 400);
        const res = await get();
        expect(res.status).toBe(404);
        const dels = tableCalls().filter(c => c.method === 'DELETE');
        expect(dels).toHaveLength(1);
        expect(dels[0].url).toContain(`user_id=eq.${UID}`);
    });

    it('T5b Twitch 回 500 含內部字串：502 且 body 不含該字串，不刪列', async () => {
        twitchToken = () => new Response('boom SECRET_TWITCH_DETAIL', { status: 500 });
        const res = await get();
        expect(res.status).toBe(502);
        expect(await res.text()).not.toContain('SECRET_TWITCH_DETAIL');
        expect(tableCalls().filter(c => c.method === 'DELETE')).toHaveLength(0);
    });
});

describe('DELETE 移除權杖', () => {
    it('刪除自己的列並回 200，只刪 user_id=自己', async () => {
        const res = await del();
        expect(res.status).toBe(200);
        const dels = tableCalls().filter(c => c.method === 'DELETE');
        expect(dels).toHaveLength(1);
        expect(dels[0].url).toContain(`user_id=eq.${UID}`);
        expect(twitchCalls()).toHaveLength(0);
    });
});

describe('OPTIONS', () => {
    it('預檢請求回 2xx', async () => {
        const res = await onRequestOptions({ request: new Request('https://multistreaming.org/api/twitch/chat-token', { method: 'OPTIONS', headers: { Origin: 'https://multistreaming.org' } }), env: ENV() });
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(300);
    });
});
