// POST /api/announcements/claim：登入後把這台裝置的匿名問卷答案認領到帳號（U8 端點部分、U9，只依介面規格撰寫）
// 只 mock 外部 I/O：fetch（Supabase Auth／PostgREST RPC）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestPost } from '../../functions/api/announcements/claim.js';

const UID = '33333333-3333-4333-8333-333333333333';
const DEVICE = '9b2f6c1e-0a4d-4f3e-8c55-1d2e3f4a5b6c';
const TOKEN = 'aaa.bbb.ccc';

function memKv() {
    const m = new Map<string, string>();
    return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => void m.set(k, v) };
}
const ENV = () => ({ SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'svc-key', RATE_LIMIT_KV: memKv() });

type Call = { url: string; method: string; body: any };
let calls: Call[] = [];
let userLookup: () => Response;
let rpcResult: () => Response;

beforeEach(() => {
    calls = [];
    userLookup = () => new Response(JSON.stringify({ id: UID }), { status: 200 });
    rpcResult = () => new Response('2', { status: 200 });
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        const raw = typeof init?.body === 'string' ? init.body : null;
        calls.push({ url, method: (init?.method || 'GET').toUpperCase(), body: raw ? JSON.parse(raw) : null });
        if (url.includes('/auth/v1/user')) return userLookup();
        if (url.includes('/rest/v1/rpc/claim_announcement_responses')) return rpcResult();
        return new Response('not mocked', { status: 500 });
    }));
});
afterEach(() => vi.unstubAllGlobals());

const post = (body: unknown, token: string | null = TOKEN) =>
    new Request('https://multistreaming.org/api/announcements/claim', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Origin: 'https://multistreaming.org',
            'CF-Connecting-IP': '203.0.113.9',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });
const rpcCalls = () => calls.filter((c) => c.url.includes('/rpc/claim_announcement_responses'));

describe('U8 問卷答案歸到帳號（端點）', () => {
    it('沒帶登入權杖回 401 且沒打 rpc', async () => {
        const res = await onRequestPost({ request: post({ device_id: DEVICE }, null), env: ENV() });
        expect(res.status).toBe(401);
        expect(rpcCalls()).toHaveLength(0);
    });

    it('權杖驗證失敗回 401 且沒打 rpc', async () => {
        userLookup = () => new Response('{}', { status: 401 });
        const res = await onRequestPost({ request: post({ device_id: DEVICE }), env: ENV() });
        expect(res.status).toBe(401);
        expect(rpcCalls()).toHaveLength(0);
    });

    it('通過時以驗證出的帳號與 device_id 呼叫 rpc，回 200 與認領筆數', async () => {
        const res = await onRequestPost({ request: post({ device_id: DEVICE }), env: ENV() });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, claimed: 2 });
        expect(rpcCalls()).toHaveLength(1);
        const rpc = rpcCalls()[0];
        expect(rpc.method).toBe('POST');
        expect(rpc.url).toBe('http://sb/rest/v1/rpc/claim_announcement_responses');
        expect(rpc.body).toEqual({ p_user_id: UID, p_device_id: DEVICE });
    });

    it('帳號只取自權杖：body 夾帶 user_id 不會被採用', async () => {
        await onRequestPost({ request: post({ device_id: DEVICE, user_id: '99999999-9999-4999-8999-999999999999', p_user_id: '99999999-9999-4999-8999-999999999999' }), env: ENV() });
        expect(rpcCalls()[0].body.p_user_id).toBe(UID);
    });

    it('沒有可認領的答案時回 200 且 claimed 為 0', async () => {
        rpcResult = () => new Response('0', { status: 200 });
        const res = await onRequestPost({ request: post({ device_id: DEVICE }), env: ENV() });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, claimed: 0 });
    });
});

describe('U9 claim 拒絕非 UUID 格式', () => {
    it.each([
        ['亂填字串', 'not-a-uuid'],
        ['長度對但含非 hex 字元', 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz'],
        ['空字串', ''],
        ['夾帶查詢語法', `${DEVICE}&select=*`],
        ['少一段', '9b2f6c1e-0a4d-4f3e-8c55'],
    ])('device_id 為%s回 400 且沒打 rpc', async (_name, device) => {
        const res = await onRequestPost({ request: post({ device_id: device }), env: ENV() });
        expect(res.status).toBe(400);
        expect(rpcCalls()).toHaveLength(0);
    });

    it('device_id 缺少或不是字串回 400 且沒打 rpc', async () => {
        for (const body of [{}, { device_id: 123 }, { device_id: null }]) {
            const res = await onRequestPost({ request: post(body), env: ENV() });
            expect(res.status).toBe(400);
        }
        expect(rpcCalls()).toHaveLength(0);
    });
});
