// 週表 snapshot 同源快取代理（functions/api/schedule/snapshot.js）＋ /schedule 預載接線
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    onRequest,
    resetSnapshotProxy,
    SNAPSHOT_FRESH_MS,
    SNAPSHOT_MAX_SERVE_MS,
    SNAPSHOT_FAIL_BACKOFF_MS,
    SNAPSHOT_ORIGIN_TIMEOUT_MS,
} from '../../functions/api/schedule/snapshot.js';
import { SCHEDULE_SNAPSHOT_PRELOAD_ROUTE, SCHEDULE_SNAPSHOT_PRELOAD_TAG } from '../../functions/[[path]].js';
import { SNAPSHOT_PROXY_PATH, SNAPSHOT_PROXY_TIMEOUT_MS } from '../../src/features/schedule/snapshotSource';

const env = { SUPABASE_URL: 'https://abc.supabase.co/' };
const ORIGIN_URL = 'https://abc.supabase.co/storage/v1/object/public/streams/v1/snapshot.json';
const get = { method: 'GET' } as Request;

afterEach(() => resetSnapshotProxy());

function jsonRes(body: string) {
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
}
function originOk(body: string) {
    return vi.fn(async () => jsonRes(body));
}
const originDown = () => vi.fn(async () => new Response('err', { status: 503 }));

/** 記憶體版 Cache API（match／put） */
function memoryCache() {
    const store = new Map<string, Response>();
    return {
        store,
        async match(key: string) {
            const r = store.get(key);
            return r ? r.clone() : undefined;
        },
        async put(key: string, res: Response) {
            store.set(key, res.clone());
        },
    };
}

/** 收集 waitUntil 的 promise，測試結束前等它們跑完 */
function ctx() {
    const waits: Promise<unknown>[] = [];
    return { c: { env, request: get, waitUntil: (p: Promise<unknown>) => waits.push(p) }, settle: () => Promise.all(waits) };
}

describe('snapshot 代理', () => {
    it('回源逾時小於前端等代理的時間（否則前端會先放棄、白白回源）', () => {
        expect(SNAPSHOT_ORIGIN_TIMEOUT_MS).toBeLessThan(SNAPSHOT_PROXY_TIMEOUT_MS);
    });

    it('沒有快取：回源一次、原樣轉送、寫進 edge 快取（經 waitUntil）', async () => {
        const fetchFn = originOk('{"v":1}');
        const cache = memoryCache();
        const { c, settle } = ctx();
        const res = await onRequest(c, { fetchFn, cache, now: 1_000_000 });
        await settle();
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('{"v":1}');
        expect(res.headers.get('Cache-Control')).toBe('public, max-age=30');
        expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
        expect(fetchFn).toHaveBeenCalledWith(ORIGIN_URL, expect.anything());
        expect(cache.store.size).toBe(1);
    });

    it('新鮮期內不回源；同一份 buffer 可以重複回應', async () => {
        const fetchFn = originOk('{"v":1}');
        const t0 = 5_000_000;
        await onRequest({ env, request: get }, { fetchFn, cache: null, now: t0 });
        for (let i = 0; i < 3; i++) {
            const res = await onRequest({ env, request: get }, { fetchFn, cache: null, now: t0 + SNAPSHOT_FRESH_MS - 1 });
            expect(await res.text()).toBe('{"v":1}');
        }
        expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('過期：先回手上這份（no-cache），背景更新，同時進來的只回源一次', async () => {
        let body = '{"v":1}';
        const fetchFn = vi.fn(async () => jsonRes(body));
        const t0 = 5_000_000;
        await onRequest({ env, request: get }, { fetchFn, cache: null, now: t0 });
        body = '{"v":2}';
        const { c, settle } = ctx();
        const later = t0 + SNAPSHOT_FRESH_MS + 1;
        const [a, b] = await Promise.all([onRequest(c, { fetchFn, cache: null, now: later }), onRequest(c, { fetchFn, cache: null, now: later })]);
        expect(await a.text()).toBe('{"v":1}');
        expect(await b.text()).toBe('{"v":1}');
        expect(a.headers.get('Cache-Control')).toBe('no-cache');
        await settle();
        expect(fetchFn).toHaveBeenCalledTimes(2);
        const d = await onRequest({ env, request: get }, { fetchFn, cache: null, now: later + 1 });
        expect(await d.text()).toBe('{"v":2}');
    });

    it('回源失敗後 30 秒內不再回源；手上沒有可用的份就回 502（讓前端退回直連）', async () => {
        const down = originDown();
        const t0 = 5_000_000;
        expect((await onRequest({ env, request: get }, { fetchFn: down, cache: null, now: t0 })).status).toBe(502);
        expect((await onRequest({ env, request: get }, { fetchFn: down, cache: null, now: t0 + 1000 })).status).toBe(502);
        expect(down).toHaveBeenCalledTimes(1);
        const up = originOk('{"v":1}');
        const res = await onRequest({ env, request: get }, { fetchFn: up, cache: null, now: t0 + SNAPSHOT_FAIL_BACKOFF_MS });
        expect(res.status).toBe(200);
    });

    it('過期期間源站故障：照回舊份，退避期間不回源', async () => {
        const t0 = 5_000_000;
        await onRequest({ env, request: get }, { fetchFn: originOk('{"v":1}'), cache: null, now: t0 });
        const down = originDown();
        const { c, settle } = ctx();
        const t1 = t0 + SNAPSHOT_FRESH_MS + 1;
        expect(await (await onRequest(c, { fetchFn: down, cache: null, now: t1 })).text()).toBe('{"v":1}');
        await settle();
        expect(await (await onRequest(c, { fetchFn: down, cache: null, now: t1 + 1000 })).text()).toBe('{"v":1}');
        await settle();
        expect(down).toHaveBeenCalledTimes(1);
    });

    it('手上那份超過 30 分鐘：同步回源，失敗回 502（不拿很舊的資料擋住前端退回）', async () => {
        const t0 = 5_000_000;
        await onRequest({ env, request: get }, { fetchFn: originOk('{"v":1}'), cache: null, now: t0 });
        const res = await onRequest({ env, request: get }, { fetchFn: originDown(), cache: null, now: t0 + SNAPSHOT_MAX_SERVE_MS });
        expect(res.status).toBe(502);
        expect(res.headers.get('Cache-Control')).toBe('no-store');
    });

    it('源站回的不是 JSON（例如錯誤頁）不收', async () => {
        const html = vi.fn(async () => new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
        const res = await onRequest({ env, request: get }, { fetchFn: html, cache: null, now: 5_000_000 });
        expect(res.status).toBe(502);
    });

    it('其他 isolate 寫進 edge 快取的較新一份會被採用（不回源）；不比手上新就不讀 body', async () => {
        const cache = memoryCache();
        const t0 = 5_000_000;
        const { c, settle } = ctx();
        await onRequest(c, { fetchFn: originOk('{"v":1}'), cache, now: t0 });
        await settle();
        resetSnapshotProxy();
        const fetchFn = originOk('{"v":9}');
        const res = await onRequest({ env, request: get }, { fetchFn, cache, now: t0 + 1000 });
        expect(await res.text()).toBe('{"v":1}');
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it('HEAD 只回標頭；其他方法 405', async () => {
        const fetchFn = originOk('{"v":1}');
        const head = await onRequest({ env, request: { method: 'HEAD' } as Request }, { fetchFn, cache: null, now: 5_000_000 });
        expect(head.status).toBe(200);
        expect(await head.text()).toBe('');
        const post = await onRequest({ env, request: { method: 'POST' } as Request }, { fetchFn, cache: null, now: 5_000_000 });
        expect(post.status).toBe(405);
    });
});

describe('/schedule 預載接線', () => {
    it('預載網址＝前端代理網址，且帶 crossorigin（as=fetch 沒帶就不會被重用）', () => {
        expect(SCHEDULE_SNAPSHOT_PRELOAD_ROUTE).toBe('/schedule');
        expect(SCHEDULE_SNAPSHOT_PRELOAD_TAG).toContain(`href="${SNAPSHOT_PROXY_PATH}"`);
        expect(SCHEDULE_SNAPSHOT_PRELOAD_TAG).toContain('as="fetch"');
        expect(SCHEDULE_SNAPSHOT_PRELOAD_TAG).toContain('crossorigin="anonymous"');
    });
    it('catch-all 只在 /schedule 插入預載', () => {
        const src = readFileSync(resolve(__dirname, '../../functions/[[path]].js'), 'utf8');
        expect(src).toMatch(/if \(rawPath === SCHEDULE_SNAPSHOT_PRELOAD_ROUTE\)/);
    });
});
