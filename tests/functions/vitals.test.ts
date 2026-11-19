// POST /api/vitals：匿名 Web Vitals 回報端點（來源檢查、欄位驗證、限流、寫入 web_vitals_reports）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestPost } from '../../functions/api/vitals.js';

type Call = { method: string; url: string; body: unknown; headers: Headers };
let calls: Call[] = [];

beforeEach(() => {
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const raw = typeof init?.body === 'string' ? init.body : null;
        calls.push({ method: init?.method ?? 'GET', url: String(input), body: raw ? JSON.parse(raw) : null, headers: new Headers(init?.headers) });
        return new Response(null, { status: 201 });
    }));
});
afterEach(() => vi.unstubAllGlobals());

const writes = () => calls.filter((c) => c.url.includes('web_vitals_reports'));

const ENV = () => ({ SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'k' });

const VALID = {
    name: 'CLS', value: 0.2431, rating: 'poor', target: 'main>div.hero',
    landing_path: '/', page_path: '/schedule/taione', device: 'mobile', vw: 390, vh: 844,
};

const req = (b: unknown, headers: Record<string, string> = {}) =>
    new Request('https://multistreaming.org/api/vitals', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Sec-Fetch-Site': 'same-origin',
            'CF-Connecting-IP': '203.0.113.9',
            'User-Agent': 'TestUA/1.0',
            ...headers,
        },
        body: typeof b === 'string' ? b : JSON.stringify(b),
    });

describe('POST /api/vitals', () => {
    it('端點接受合法資料', async () => {
        const res = await onRequestPost({ request: req(VALID), env: ENV() });
        expect(res.status).toBe(204);
        expect(writes()).toHaveLength(1);
        const w = writes()[0];
        expect(w.method).toBe('POST');
        expect(w.url).toBe('http://sb/rest/v1/web_vitals_reports');
        expect(w.headers.get('Authorization')).toBe('Bearer k');
        const row = Array.isArray(w.body) ? w.body[0] : w.body;
        expect(row).toEqual({
            metric: 'CLS', value: 0.2431, rating: 'poor', target: 'main>div.hero',
            landing_path: '/', page_path: '/schedule/taione', device: 'mobile', vw: 390, vh: 844,
        });
        // 不存 IP 與 UA
        const dump = JSON.stringify(w.body);
        expect(dump).not.toContain('203.0.113.9');
        expect(dump).not.toContain('TestUA');
    });

    it('來源只有 Origin／Referer 為本站時也放行', async () => {
        const r1 = await onRequestPost({ request: req(VALID, { 'Sec-Fetch-Site': '', Origin: 'https://multistreaming.org' }), env: ENV() });
        expect(r1.status).toBe(204);
        const r2 = await onRequestPost({ request: req(VALID, { 'Sec-Fetch-Site': '', Referer: 'https://multistreaming.org/schedule/x' }), env: ENV() });
        expect(r2.status).toBe(204);
        expect(writes()).toHaveLength(2);
    });

    it.each([
        ['name 非 CLS／INP', { name: 'LCP' }],
        ['value 非數字', { value: 'abc' }],
        ['value 為負數', { value: -1 }],
        ['rating 為 good', { rating: 'good' }],
        ['device 不在白名單', { device: 'tablet' }],
        ['vw 超過 20000', { vw: 20001 }],
        ['target 超過 100 字', { target: 'x'.repeat(101) }],
        ['page_path 不是 / 開頭', { page_path: 'schedule/x' }],
        ['landing_path 超過 120 字', { landing_path: '/' + 'a'.repeat(120) }],
    ])('端點拒絕不合法資料：%s', async (_label, over) => {
        const res = await onRequestPost({ request: req({ ...VALID, ...over }), env: ENV() });
        expect(res.status).toBe(400);
        expect(writes()).toHaveLength(0);
    });

    it('body 不是 JSON 回 400', async () => {
        const res = await onRequestPost({ request: req('not json'), env: ENV() });
        expect(res.status).toBe(400);
        expect(writes()).toHaveLength(0);
    });

    it.each([
        ['target 含 NUL', { target: `a${String.fromCharCode(0)}b` }],
        ['page_path 含 NUL', { page_path: `/x${String.fromCharCode(0)}` }],
        ['target 含單獨的 surrogate', { target: `a${String.fromCharCode(0xd800)}` }],
    ])('資料庫存不了的字元直接拒絕：%s', async (_n, patch) => {
        // 這類字串 Postgres 會拒絕；放行的話每筆都會變成一次失敗寫入＋一列錯誤紀錄
        const res = await onRequestPost({ request: req({ ...VALID, ...patch }), env: ENV() });
        expect(res.status).toBe(400);
        expect(calls).toHaveLength(0);
    });

    it('寫入連續失敗時，錯誤紀錄只記一次', async () => {
        vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
            calls.push({ method: 'POST', url: String(input), body: null, headers: new Headers() });
            return new Response('{"message":"relation does not exist"}', { status: 404 });
        }));
        for (let i = 0; i < 3; i++) {
            const res = await onRequestPost({ request: req(VALID), env: ENV() });
            expect(res.status).toBe(204);
        }
        expect(calls.filter((c) => c.url.includes('system_logs')).length).toBeLessThanOrEqual(1);
        expect(writes()).toHaveLength(3);
    });

    it('端點擋跨站來源', async () => {
        const res = await onRequestPost({
            request: req(VALID, { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' }),
            env: ENV(),
        });
        expect(res.status).toBe(403);
        expect(writes()).toHaveLength(0);
    });
});
