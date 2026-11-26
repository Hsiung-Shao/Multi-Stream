// 後端安全強化：公告問卷同題重複作答要擋（B8）、意見回饋限流以 IPv6 /64 計（B9）
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { validateResponseAgainstAnnouncement } from '../../functions/lib/announcements.js';
// @ts-expect-error 同上
import { onRequestPost as feedbackPost } from '../../functions/api/feedback/submit.js';

describe('validateResponseAgainstAnnouncement', () => {
    it('B8 survey 同一題送兩筆答案時回 duplicate_question', () => {
        const announcement = {
            type: 'survey',
            payload: { questions: [{ id: 'q1', type: 'single', options: [{ id: 'a' }, { id: 'b' }] }] },
        };
        const r = validateResponseAgainstAnnouncement(announcement, {
            choices: [{ question_id: 'q1', option_ids: ['a'] }, { question_id: 'q1', option_ids: ['b'] }],
        });
        expect(r).toEqual({ ok: false, error: 'duplicate_question' });
    });
});

describe('feedback submit 限流', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('B9 同一 /64 內換 IPv6 位址連送 6 次，第 6 次被限流 429', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 201 })));
        const store = new Map<string, string>();
        const kv = { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => void store.set(k, v) };
        const env = { RATE_LIMIT_KV: kv, SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'k' };
        const statuses: number[] = [];
        for (let i = 1; i <= 6; i++) {
            const req = new Request('https://multistreaming.org/api/feedback/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `2001:db8:1:2::${i}` },
                body: JSON.stringify({ feedbackType: 'bug', content: `第 ${i} 則` }),
            });
            statuses.push((await feedbackPost({ request: req, env })).status);
        }
        expect(statuses.slice(0, 5)).not.toContain(429);
        expect(statuses[5]).toBe(429);
    });
});
