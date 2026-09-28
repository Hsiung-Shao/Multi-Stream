import { afterEach, describe, expect, it } from 'vitest';
import {
    fetchSnapshot,
    resetSnapshotSourceCache,
    resolveSnapshotUrl,
    SNAPSHOT_OBJECT_PATH,
} from '../../../src/features/schedule/snapshotSource';
import { makeSnapshot } from './fixtures';

afterEach(() => resetSnapshotSourceCache());

function mockFetch(routes: Record<string, () => Response | Promise<Response>>) {
    const calls: string[] = [];
    const fn = (async (input: string | URL | Request) => {
        const url = String(input);
        calls.push(url);
        const handler = routes[url];
        if (!handler) throw new Error(`unexpected ${url}`);
        return handler();
    }) as unknown as typeof fetch;
    return { fn, calls };
}

describe('resolveSnapshotUrl', () => {
    it('有 env 就直接用，不打 supabase-config', async () => {
        const { fn, calls } = mockFetch({});
        await expect(resolveSnapshotUrl({ envUrl: 'http://127.0.0.1:57321/x.json', fetchFn: fn })).resolves.toBe('http://127.0.0.1:57321/x.json');
        expect(calls).toEqual([]);
    });

    it('沒有 env：用 supabase-config 的 url 組出 Storage 路徑，且只查一次', async () => {
        const { fn, calls } = mockFetch({
            '/api/supabase-config': () => new Response(JSON.stringify({ url: 'https://abc.supabase.co/', anonKey: 'k' }), { status: 200 }),
        });
        const url = await resolveSnapshotUrl({ envUrl: '', fetchFn: fn });
        expect(url).toBe(`https://abc.supabase.co${SNAPSHOT_OBJECT_PATH}`);
        await resolveSnapshotUrl({ envUrl: '', fetchFn: fn });
        expect(calls).toEqual(['/api/supabase-config']);
    });

    it('supabase-config 失敗或缺 url → config 錯誤', async () => {
        const bad = mockFetch({ '/api/supabase-config': () => new Response('{}', { status: 200 }) });
        await expect(resolveSnapshotUrl({ envUrl: '', fetchFn: bad.fn })).rejects.toMatchObject({ reason: 'config' });
        const down = mockFetch({ '/api/supabase-config': () => new Response('', { status: 503 }) });
        await expect(resolveSnapshotUrl({ envUrl: '', fetchFn: down.fn })).rejects.toMatchObject({ reason: 'config' });
    });
});

describe('fetchSnapshot', () => {
    const URL_ = 'http://local/snapshot.json';

    it('回傳驗證過格式的 snapshot', async () => {
        const snap = makeSnapshot();
        const { fn } = mockFetch({ [URL_]: () => new Response(JSON.stringify(snap), { status: 200 }) });
        await expect(fetchSnapshot({ envUrl: URL_, fetchFn: fn })).resolves.toEqual(snap);
    });

    it('HTTP 錯誤、格式不對', async () => {
        const e404 = mockFetch({ [URL_]: () => new Response('nope', { status: 404 }) });
        await expect(fetchSnapshot({ envUrl: URL_, fetchFn: e404.fn })).rejects.toMatchObject({ reason: 'http' });
        const wrong = mockFetch({ [URL_]: () => new Response(JSON.stringify({ version: 2 }), { status: 200 }) });
        await expect(fetchSnapshot({ envUrl: URL_, fetchFn: wrong.fn })).rejects.toMatchObject({ reason: 'format' });
    });

    it('逾時會中止請求並回 timeout', async () => {
        const hang = (async (_: string | URL | Request, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
            })) as unknown as typeof fetch;
        await expect(fetchSnapshot({ envUrl: URL_, fetchFn: hang, timeoutMs: 20 })).rejects.toMatchObject({ reason: 'timeout' });
    });
});
