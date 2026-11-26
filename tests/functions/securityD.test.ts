// 資安 D 組：公告匿名回應以「IP＋公告」限量、readJsonBody 以實際大小把關、意見回饋 usage_time 元素截短
// 只 mock 外部 I/O（fetch、KV）
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestPost as respondPost } from '../../functions/api/announcements/respond.js';
// @ts-expect-error 同上
import { onRequestPost as feedbackPost } from '../../functions/api/feedback/submit.js';
// @ts-expect-error 同上
import { readJsonBody } from '../../functions/lib/cors.js';

afterEach(() => vi.unstubAllGlobals());

function memoryKv() {
    const m = new Map<string, string>();
    return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => void m.set(k, v) };
}

// ───────────── D1：公告匿名回應限量 ─────────────
describe('公告回應端點限量', () => {
    const ANN1 = '11111111-1111-4111-8111-111111111111';
    const ANN2 = '22222222-2222-4222-8222-222222222222';
    const IP = '203.0.113.9';

    const announcement = (id: string) => ({
        id,
        type: 'poll',
        status: 'published',
        starts_at: '2020-01-01T00:00:00Z',
        ends_at: null,
        target_segment: 'all',
        payload: { options: [{ id: 'a' }, { id: 'b' }], multi_select: false },
    });

    function setup() {
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: unknown, init?: RequestInit) => {
                const url = String(input instanceof Request ? input.url : input);
                const method = (init?.method || 'GET').toUpperCase();
                if (url.includes('/rest/v1/announcements?')) {
                    const id = decodeURIComponent(url.match(/id=eq\.([^&]+)/)?.[1] ?? '');
                    return new Response(JSON.stringify([announcement(id)]), { status: 200 });
                }
                if (url.includes('/rest/v1/announcement_responses') && method === 'POST') {
                    return new Response(JSON.stringify([{ id: 'r1' }]), { status: 201 });
                }
                return new Response('not mocked', { status: 500 });
            }),
        );
        const env = { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'svc-key', IP_HASH_SALT: 'salt', RATE_LIMIT_KV: memoryKv() };
        // 每次用不同 device_id，只有 IP＋公告這一層限量會擋
        let n = 0;
        const respond = async (announcementId: string) => {
            n += 1;
            const request = new Request('https://multistreaming.org/api/announcements/respond', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': IP },
                body: JSON.stringify({ announcement_id: announcementId, choices: ['a'], device_id: `device-${n}` }),
            });
            return respondPost({ request, env, waitUntil: () => {} }) as Promise<Response>;
        };
        return respond;
    }

    it('D1a 同 IP 對同一則公告用 5 個不同 device_id 後，第 6 筆被擋 429', async () => {
        const respond = setup();
        const statuses: number[] = [];
        for (let i = 0; i < 6; i++) statuses.push((await respond(ANN1)).status);
        expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
        expect(statuses[5]).toBe(429);
    });

    it('D1b 對另一則公告各自計數，不被前一則的上限誤擋', async () => {
        const respond = setup();
        for (let i = 0; i < 5; i++) expect((await respond(ANN1)).status).toBe(200);
        const res = await respond(ANN2);
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
    });
});

// ───────────── D2：readJsonBody 實際大小把關 ─────────────
describe('readJsonBody 實際大小', () => {
    const post = (body: string) =>
        new Request('https://multistreaming.org/api/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });

    it('D2a 沒有 Content-Length 的 64KB body 被擋（413）', async () => {
        const req = post(JSON.stringify({ pad: 'x'.repeat(64 * 1024) }));
        expect(req.headers.get('Content-Length')).toBeNull();
        const r = await readJsonBody(req, 16384);
        expect(r.ok).toBe(false);
        expect(r.response.status).toBe(413);
    });

    it('D2b 1KB 的正常 JSON 照常解析', async () => {
        const payload = { name: 'abc', pad: 'y'.repeat(1000) };
        const r = await readJsonBody(post(JSON.stringify(payload)), 16384);
        expect(r.ok).toBe(true);
        expect(r.body).toEqual(payload);
    });
});

// ───────────── D2c：feedback usage_time ─────────────
describe('feedback 送出', () => {
    it('D2c usage_time 的每個元素被截到 50 字內', async () => {
        const inserts: unknown[] = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: unknown, init?: RequestInit) => {
                const url = String(input instanceof Request ? input.url : input);
                if (url.includes('/rest/v1/feedbacks') && (init?.method || 'GET').toUpperCase() === 'POST') {
                    inserts.push(JSON.parse(String(init?.body)));
                    return new Response(JSON.stringify([{ id: 1 }]), { status: 201 });
                }
                return new Response('not mocked', { status: 500 });
            }),
        );
        const request = new Request('https://multistreaming.org/api/feedback/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.10' },
            body: JSON.stringify({ feedbackType: 'bug', content: '壞掉了', usageTime: ['z'.repeat(10 * 1024), '晚上'] }),
        });
        const res = (await feedbackPost({ request, env: { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'svc-key' } })) as Response;
        expect(res.status).toBe(200);
        expect(inserts).toHaveLength(1);
        const usage = (inserts[0] as { usage_time: unknown }).usage_time;
        expect(Array.isArray(usage)).toBe(true);
        for (const item of usage as string[]) expect(String(item).length).toBeLessThanOrEqual(50);
    });
});
