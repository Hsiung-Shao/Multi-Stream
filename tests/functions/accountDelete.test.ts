// POST /api/account/delete：登入者刪除自己的帳號（只依介面規格撰寫）
// 只 mock 外部 I/O：fetch（Supabase Auth／PostgREST／Admin API）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestPost } from '../../functions/api/account/delete.js';

const UID = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'aaa.bbb.ccc';
const ENV = () => ({ SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'svc-key' });

let calls: { url: string; method: string }[] = [];
let adminDelete: () => Response;
let userLookup: () => Response;

beforeEach(() => {
    calls = [];
    userLookup = () => new Response(JSON.stringify({ id: UID }), { status: 200 });
    adminDelete = () => new Response('{}', { status: 200 });
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        const method = (init?.method || 'GET').toUpperCase();
        calls.push({ url, method });
        if (url.includes('/auth/v1/user')) return userLookup();
        if (url.includes('/auth/v1/admin/users/')) return adminDelete();
        if (url.includes('/rest/v1/announcement_responses')) return new Response('[]', { status: 200 });
        return new Response('not mocked', { status: 500 });
    }));
});

afterEach(() => vi.unstubAllGlobals());

const post = (token: string | null = TOKEN) =>
    new Request('https://multistreaming.org/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: '{}',
    });

const adminCalls = () => calls.filter(c => c.url.includes('/auth/v1/admin/'));

describe('POST /api/account/delete', () => {
    it('D1 沒帶登入的刪帳號被拒（401）且沒打 admin 端點', async () => {
        const res = await onRequestPost({ request: post(null), env: ENV() });
        expect(res.status).toBe(401);
        expect(adminCalls()).toHaveLength(0);
        expect(calls.some(c => c.url.includes('announcement_responses'))).toBe(false);
    });

    it('D1b token 驗證失敗時回 401 且沒打 admin 端點', async () => {
        userLookup = () => new Response('{}', { status: 401 });
        const res = await onRequestPost({ request: post(), env: ENV() });
        expect(res.status).toBe(401);
        expect(adminCalls()).toHaveLength(0);
    });

    it('D2 刪的是自己的帳號：先清 announcement_responses 再刪使用者並回 200', async () => {
        const res = await onRequestPost({ request: post(), env: ENV() });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true });

        const del = calls.filter(c => c.method === 'DELETE');
        const respIdx = calls.findIndex(c => c.method === 'DELETE' && c.url.includes(`announcement_responses?user_id=eq.${UID}`));
        const adminIdx = calls.findIndex(c => c.method === 'DELETE' && c.url === `http://sb/auth/v1/admin/users/${UID}`);
        expect(del).toHaveLength(2);
        expect(respIdx).toBeGreaterThanOrEqual(0);
        expect(adminIdx).toBeGreaterThan(respIdx);
    });

    it('D3 Supabase 刪除失敗時回 502 且不洩漏上游錯誤內容', async () => {
        adminDelete = () => new Response('internal: SECRET_UPSTREAM_DETAIL', { status: 500 });
        const res = await onRequestPost({ request: post(), env: ENV() });
        expect(res.status).toBe(502);
        expect(await res.text()).not.toContain('SECRET_UPSTREAM_DETAIL');
    });
});
