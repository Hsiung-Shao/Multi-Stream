// 歌曲公開目錄 API：RPC 轉發、失敗回 502、記憶體快取
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestGet as catalogGet, resetSongCatalogMemo } from '../../functions/api/songs/catalog.js';

const ENV = () => ({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
});

const CATALOG = [{ v: 'dQw4w9WgXcQ', t: '歌回', d: null, vt: null, s: [['abcd1234', 0, 100, '歌', null]] }];

const ctx = () => ({
    request: new Request('https://multistreaming.org/api/songs/catalog'),
    env: ENV(),
    waitUntil: () => {},
});

const rpcCalls = (spy: ReturnType<typeof vi.fn>) =>
    spy.mock.calls.filter((c) => String(c[0]).includes('/rpc/get_song_catalog'));

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
    resetSongCatalogMemo();
    fetchSpy = vi.fn(async (url: string) =>
        String(url).includes('/rpc/get_song_catalog')
            ? new Response(JSON.stringify(CATALOG), { status: 200 })
            : new Response('[]', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
    vi.unstubAllGlobals();
});

describe('GET /api/songs/catalog', () => {
    it('成功時回傳目錄 JSON 與公開快取標頭', async () => {
        const res = await catalogGet(ctx());
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('application/json');
        expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
        expect(await res.json()).toEqual(CATALOG);
        expect(rpcCalls(fetchSpy)).toHaveLength(1);
    });

    it('DB 失敗回 502 且不快取，下一次會重查', async () => {
        fetchSpy.mockImplementation(async () => new Response('boom', { status: 500 }));
        const bad = await catalogGet(ctx());
        expect(bad.status).toBe(502);
        expect((await bad.json()).error).toBe('catalog_unavailable');

        fetchSpy.mockImplementation(async () => new Response(JSON.stringify(CATALOG), { status: 200 }));
        const ok = await catalogGet(ctx());
        expect(ok.status).toBe(200);
    });

    it('第二次請求命中記憶體快取，不再打 DB', async () => {
        await catalogGet(ctx());
        const second = await catalogGet(ctx());
        expect(second.headers.get('X-Edge-Cache')).toContain('MEMO');
        expect(await second.json()).toEqual(CATALOG);
        expect(rpcCalls(fetchSpy)).toHaveLength(1);
    });

    it('同時進來的請求共用同一次 DB 查詢', async () => {
        await Promise.all([catalogGet(ctx()), catalogGet(ctx()), catalogGet(ctx())]);
        expect(rpcCalls(fetchSpy)).toHaveLength(1);
    });
});
