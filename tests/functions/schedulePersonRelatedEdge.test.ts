// 個人頁 edge 的相關推薦路徑（review 第 1 輪補的鎖）：可索引才採用 RPC 結果、不可索引不採用、RPC 失敗只短暫快取、
// personRelatedFromRpc 的防呆。
import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { resolveSchedulePerson, personRelatedFromRpc, PERSON_DEGRADED_CACHE_TTL_S, PERSON_CACHE_TTL_S } from '../../functions/lib/schedule-person.js';

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon-test' };
const row = (indexable: boolean) => ({
    name: '台一', img_url: null, schedule_indexable: indexable, youtube_channel_id: null, twitch_channel_id: null,
    active: [], recent: [], recent_count: [{ count: 0 }],
});
const ok = (data: unknown) => vi.fn(async () => ({ ok: true, data }));
const RELATED = { agency: { name: '子午計畫' }, siblings: [{ slug: 'sib1', name: '同事甲', img_url: null, group: '子午計畫' }], neighbors: [] };

function fakeCache() {
    const store = new Map<string, Response>();
    return {
        store,
        match: vi.fn(async (req: Request) => store.get(req.url) ?? null),
        put: vi.fn(async (req: Request, res: Response) => { store.set(req.url, res); }),
    };
}

describe('resolveSchedulePerson 的相關推薦', () => {
    it('可索引：以 p_slug 呼叫 RPC，found.related 帶同公司清單', async () => {
        const relatedFn = ok(RELATED);
        const r = await resolveSchedulePerson(env, '/schedule/taione', ok([row(true)]), null, relatedFn);
        expect(relatedFn).toHaveBeenCalledWith(env, 'schedule_person_related', { p_slug: 'taione' });
        expect(r.related).toEqual({ agency: { name: '子午計畫' }, siblings: RELATED.siblings, neighbors: [] });
    });

    it('不可索引：不呼叫 RPC（掃描路徑維持 1 支 subrequest），related 為 null', async () => {
        const relatedFn = ok(RELATED);
        const r = await resolveSchedulePerson(env, '/schedule/taione', ok([row(false)]), null, relatedFn);
        expect(r.related).toBeNull();
        expect(relatedFn).not.toHaveBeenCalled();
    });

    it('查無此人、主查詢失敗：都不呼叫 RPC', async () => {
        const relatedFn = ok(RELATED);
        await resolveSchedulePerson(env, '/schedule/nobody', ok([]), null, relatedFn);
        await resolveSchedulePerson(env, '/schedule/taione', vi.fn(async () => ({ ok: false, data: null })), null, relatedFn);
        expect(relatedFn).not.toHaveBeenCalled();
    });

    it('RPC 失敗：related 為 null，且快取只放 PERSON_DEGRADED_CACHE_TTL_S（不是 5 分鐘）', async () => {
        const cache = fakeCache();
        const r = await resolveSchedulePerson(env, '/schedule/taione', ok([row(true)]), cache, vi.fn(async () => ({ ok: false, data: null })));
        expect(r.related).toBeNull();
        const put = cache.put.mock.calls[0][1] as Response;
        expect(put.headers.get('Cache-Control')).toBe(`public, max-age=${PERSON_DEGRADED_CACHE_TTL_S}`);
        expect(PERSON_DEGRADED_CACHE_TTL_S).toBeLessThan(PERSON_CACHE_TTL_S);
    });

    it('RPC 成功但兩個清單都空：related 為 null，快取仍是正常 TTL', async () => {
        const cache = fakeCache();
        const r = await resolveSchedulePerson(env, '/schedule/taione', ok([{ ...row(true), active: [{ status: 'live', platform: 'twitch', title: 'x', scheduled_start: null, actual_start: new Date().toISOString(), actual_end: null, time_tbd: false }] }]), cache, ok({ agency: null, siblings: [], neighbors: [] }));
        expect(r.related).toBeNull();
        const put = cache.put.mock.calls[0][1] as Response;
        expect(put.headers.get('Cache-Control')).toBe(`public, max-age=${PERSON_CACHE_TTL_S}`);
    });
});

describe('personRelatedFromRpc 防呆', () => {
    it('不是物件、陣列、或兩清單都空 → null', () => {
        expect(personRelatedFromRpc(null)).toBeNull();
        expect(personRelatedFromRpc([])).toBeNull();
        expect(personRelatedFromRpc({ siblings: [], neighbors: [] })).toBeNull();
    });

    it('不合規 slug 的人被濾掉、名字截到 120 字、agency 非字串變 null', () => {
        const long = 'x'.repeat(200);
        const out = personRelatedFromRpc({
            agency: { name: 123 },
            siblings: [{ slug: 'Bad Slug', name: 'a' }, { slug: 'ok1', name: long, group: 7 }],
            neighbors: [{ slug: 'nb1', name: 'b', last_live_at: 5 }],
        });
        expect(out?.agency).toBeNull();
        expect(out?.siblings).toEqual([{ slug: 'ok1', name: 'x'.repeat(120), img_url: null, group: null }]);
        expect(out?.neighbors).toEqual([{ slug: 'nb1', name: 'b', img_url: null, last_live_at: null }]);
    });
});
