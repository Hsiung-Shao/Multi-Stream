// /api/youtube-channel-live-og 的 edge 快取（2026-09 CPU 超限事件）：
//   1. 同一頻道 TTL 內只抓一次 YouTube（第二次命中快取，不再 fetch）
//   2. 快取 key 只認 channelId：加亂數參數不能繞過快取
//   3. 格式不合的 channelId 回 400 且不寫快取
//   4. YouTube 抓取失敗只快取 60 秒；內部標頭不外洩給瀏覽器
//   5. 回給瀏覽器的永遠是 no-store（快取只在 edge 層）
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestGet } from '../../functions/api/youtube-channel-live-og.js';

const CHANNEL = 'UC' + 'a'.repeat(22);
const store = new Map<string, Response>();
let pending: Promise<unknown>[] = [];
let youtubeStatus = 200;
const fetchMock = vi.fn(async () => new Response('<html><head></head><body>offline</body></html>', { status: youtubeStatus }));

function call(query: string) {
    const request = new Request(`https://multistreaming.org/api/youtube-channel-live-og?${query}`);
    return onRequestGet({ request, waitUntil: (p: Promise<unknown>) => pending.push(p) });
}

async function flush() {
    await Promise.all(pending);
    pending = [];
}

beforeEach(() => {
    store.clear();
    pending = [];
    youtubeStatus = 200;
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('caches', {
        default: {
            match: async (req: Request) => store.get(req.url)?.clone(),
            put: async (req: Request, res: Response) => {
                store.set(req.url, res);
            },
        },
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('youtube-channel-live-og edge 快取', () => {
    it('同一頻道第二次命中快取，不再抓 YouTube', async () => {
        const first = await call(`channelId=${CHANNEL}`);
        await flush();
        expect(first.status).toBe(200);
        expect(first.headers.get('X-Edge-Cache')).toBe('MISS');
        const fetchesAfterMiss = fetchMock.mock.calls.length;
        expect(fetchesAfterMiss).toBeGreaterThan(0);

        const second = await call(`channelId=${CHANNEL}`);
        expect(second.headers.get('X-Edge-Cache')).toBe('HIT');
        expect(fetchMock.mock.calls.length).toBe(fetchesAfterMiss);
        expect(await second.json()).toEqual(await first.json());
    });

    it('成功結果以 max-age=180 存入 edge，回給瀏覽器仍是 no-store', async () => {
        const res = await call(`channelId=${CHANNEL}`);
        await flush();
        const stored = store.get(`https://multistreaming.org/api/youtube-channel-live-og?channelId=${CHANNEL}`);
        expect(stored?.headers.get('Cache-Control')).toBe('public, max-age=180');
        expect(res.headers.get('Cache-Control')).toBe('no-store');
    });

    it('多餘查詢參數不影響快取 key（不能用亂數參數繞過）', async () => {
        await call(`channelId=${CHANNEL}`);
        await flush();
        const fetches = fetchMock.mock.calls.length;
        const res = await call(`channelId=${CHANNEL}&_=${Date.now()}`);
        expect(res.headers.get('X-Edge-Cache')).toBe('HIT');
        expect(fetchMock.mock.calls.length).toBe(fetches);
    });

    it('格式不合的 channelId 回 400，不寫快取', async () => {
        const res = await call('channelId=not-a-channel');
        await flush();
        expect(res.status).toBe(400);
        expect(store.size).toBe(0);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('YouTube 抓取失敗只快取 60 秒，內部標頭不外洩', async () => {
        youtubeStatus = 429;
        const res = await call(`channelId=${CHANNEL}`);
        await flush();
        const stored = store.get(`https://multistreaming.org/api/youtube-channel-live-og?channelId=${CHANNEL}`);
        expect(stored?.headers.get('Cache-Control')).toBe('public, max-age=60');
        expect(res.headers.get('X-Live-Og-Fetch-Failed')).toBeNull();
        expect((await res.json()).isLive).toBe(false);
    });

    it('沒有 Cache API（*.pages.dev）時照常運作', async () => {
        vi.stubGlobal('caches', undefined);
        const res = await call(`channelId=${CHANNEL}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('X-Edge-Cache')).toBe('MISS');
    });
});
