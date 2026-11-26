// 資安 C 組：twitch-token 擋裸 curl＋快取＋限流、youtube lookup 取代金鑰公開端點、移除匿名寫入頻道快取、channel-page 擋裸 curl＋快取
// 只 mock 外部 I/O（fetch、KV、Cache API）
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestGet as twitchTokenGet } from '../../functions/api/twitch-token.js';
// @ts-expect-error 同上
import { onRequestGet as channelPageGet } from '../../functions/api/youtube-channel-page.js';
import { upsertChannel } from '../../src/features/youtube/YouTubeChannelRepository';

const SAME_ORIGIN = { 'Sec-Fetch-Site': 'same-origin' };
// 以專案根目錄（vitest 的 cwd）為基準
const fileExists = (rel: string) => existsSync(resolve(process.cwd(), rel));

function memoryKv() {
    const m = new Map<string, string>();
    return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => void m.set(k, v) };
}

let pending: Promise<unknown>[] = [];
const waitUntil = (p: Promise<unknown>) => void pending.push(p);
const flush = async () => {
    await Promise.all(pending);
    pending = [];
};

// Cache API 替身：真的存取一個 Map（以 URL 為 key）
function stubCache() {
    const store = new Map<string, Response>();
    vi.stubGlobal('caches', {
        default: {
            match: async (req: Request | string) => store.get(typeof req === 'string' ? req : req.url)?.clone(),
            put: async (req: Request | string, res: Response) => void store.set(typeof req === 'string' ? req : req.url, res),
        },
    });
}

beforeEach(() => {
    pending = [];
    stubCache();
});
afterEach(() => vi.unstubAllGlobals());

// ───────────── C1：twitch-token ─────────────
describe('twitch-token 端點', () => {
    const TOKEN_URL = 'id.twitch.tv/oauth2/token';
    const mkEnv = () => ({ TWITCH_CLIENT_ID: 'cid-xyz', TWITCH_CLIENT_SECRET: 'csecret-xyz', RATE_LIMIT_KV: memoryKv() });
    const mkReq = (headers: Record<string, string>) => new Request('https://multistreaming.org/api/twitch-token', { headers });
    let twitchStatus = 200;
    let fetchMock: ReturnType<typeof vi.fn>;
    const tokenCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes(TOKEN_URL)).length;

    beforeEach(() => {
        twitchStatus = 200;
        fetchMock = vi.fn(async () =>
            twitchStatus === 200
                ? new Response(JSON.stringify({ access_token: 'at-1', expires_in: 5000000, token_type: 'bearer' }), { status: 200 })
                : new Response('upstream boom', { status: twitchStatus, statusText: 'Server Error' }),
        );
        vi.stubGlobal('fetch', fetchMock);
    });

    it('C1a 非本站請求拿不到 Twitch 權杖（403 且不打 Twitch）', async () => {
        const res = await twitchTokenGet({ request: mkReq({}), env: mkEnv(), waitUntil });
        expect(res.status).toBe(403);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('C1b 本站連續請求兩次只向 Twitch 換一次權杖', async () => {
        const env = mkEnv();
        const r1 = await twitchTokenGet({ request: mkReq(SAME_ORIGIN), env, waitUntil });
        await flush();
        const r2 = await twitchTokenGet({ request: mkReq(SAME_ORIGIN), env, waitUntil });
        await flush();
        expect(r1.status).toBe(200);
        expect(r2.status).toBe(200);
        expect((await r2.json()).access_token).toBe('at-1');
        expect(tokenCalls()).toBe(1);
    });

    it('C1c 同 IP 每小時第 31 次回 429（前 30 次不擋）', async () => {
        const env = mkEnv();
        const statuses: number[] = [];
        for (let i = 0; i < 31; i++) {
            const res = await twitchTokenGet({ request: mkReq({ ...SAME_ORIGIN, 'CF-Connecting-IP': '203.0.113.7' }), env, waitUntil });
            await flush();
            statuses.push(res.status);
        }
        expect(statuses.slice(0, 30)).not.toContain(429);
        expect(statuses[30]).toBe(429);
    });

    it('C1d Twitch 回 500 時不外洩上游狀態碼與環境變數名稱', async () => {
        twitchStatus = 500;
        const res = await twitchTokenGet({ request: mkReq(SAME_ORIGIN), env: mkEnv(), waitUntil });
        await flush();
        const text = await res.text();
        expect(res.status).not.toBe(200);
        expect(text).not.toContain('500');
        expect(text).not.toContain('upstream boom');
        expect(text).not.toContain('TWITCH_CLIENT_ID');
        expect(text).not.toContain('TWITCH_CLIENT_SECRET');
        expect(text).not.toContain('csecret-xyz');
    });
});

// ───────────── C2：/api/youtube/lookup ─────────────
describe('youtube lookup 端點', () => {
    const API_KEY = 'AIza-SECRET-KEY-123';
    const CHANNEL = 'UC' + 'b'.repeat(22);
    const VIDEO = 'dQw4w9WgXcQ';
    const LOOKUP = '../../functions/api/youtube/lookup.js';
    let fetchMock: ReturnType<typeof vi.fn>;
    let sbCalls: { url: string; method: string; body: string }[] = [];

    const env = () => ({
        YOUTUBE_API_KEY: API_KEY,
        YOUTUBE_API_REFERER: 'https://multistreaming.org/',
        SUPABASE_URL: 'http://sb',
        SUPABASE_SERVICE_ROLE_KEY: 'svc-key',
        RATE_LIMIT_KV: memoryKv(),
    });
    const load = async () => (await import(/* @vite-ignore */ LOOKUP)) as { onRequestGet: (c: unknown) => Promise<Response> };
    const call = async (query: string) => {
        const { onRequestGet } = await load();
        const request = new Request(`https://multistreaming.org/api/youtube/lookup?${query}`, { headers: SAME_ORIGIN });
        return onRequestGet({ request, env: env(), waitUntil });
    };

    beforeEach(() => {
        sbCalls = [];
        fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
            const url = String(input instanceof Request ? input.url : input);
            if (url.startsWith('http://sb')) {
                sbCalls.push({ url, method: (init?.method || 'GET').toUpperCase(), body: typeof init?.body === 'string' ? init.body : '' });
                return new Response('[]', { status: 200 });
            }
            if (url.includes('googleapis.com/youtube/v3/videos')) {
                return new Response(JSON.stringify({ items: [{ snippet: { title: '伺服器影片標題', channelId: CHANNEL, channelTitle: '伺服器頻道名' } }] }), { status: 200 });
            }
            if (url.includes('googleapis.com/youtube/v3/channels')) {
                return new Response(JSON.stringify({ items: [{ id: CHANNEL, snippet: { title: '伺服器頻道名' } }] }), { status: 200 });
            }
            return new Response('not mocked', { status: 500 });
        });
        vi.stubGlobal('fetch', fetchMock);
    });

    it('C2a 用 videoId 查詢回標題與頻道資訊', async () => {
        const res = await call(`videoId=${VIDEO}`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.title).toBe('伺服器影片標題');
        expect(body.channelId).toBe(CHANNEL);
        expect(body.channelTitle).toBe('伺服器頻道名');
    });

    it('C2b 回應內容不含 YouTube API 金鑰', async () => {
        const res = await call(`videoId=${VIDEO}`);
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).not.toContain(API_KEY);
        expect(JSON.stringify([...res.headers.entries()])).not.toContain(API_KEY);
    });

    it('C2c 非法 id（../x）回 400 且不打上游', async () => {
        const res = await call(`videoId=${encodeURIComponent('../x')}`);
        expect(res.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('C2d 查到頻道時，伺服器端把查到的名稱寫入 youtube_channels', async () => {
        const res = await call(`videoId=${VIDEO}`);
        expect(res.status).toBe(200);
        await flush();
        const writes = sbCalls.filter((c) => c.url.includes('/rest/v1/youtube_channels') && c.method !== 'GET');
        expect(writes.length).toBeGreaterThan(0);
        expect(writes.some((w) => w.body.includes(CHANNEL) && w.body.includes('伺服器頻道名'))).toBe(true);
    });

    it('C2e youtube-config 端點檔案已刪除（金鑰不再公開）', () => {
        expect(fileExists('functions/api/youtube-config.js')).toBe(false);
    });
});

// ───────────── C3：移除匿名寫入頻道快取的路徑 ─────────────
describe('前端頻道快取寫入', () => {
    it('C3a upsertChannel 不再送出任何網路請求，cache-channel 端點檔案已刪除', async () => {
        const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        await upsertChannel({ channel_id: 'UC' + 'c'.repeat(22), channel_title: '某頻道' });
        // 讀 Supabase 設定（getSupabase）不算寫入；除此之外不得有任何請求
        const others = fetchMock.mock.calls.filter((c) => !String(c[0]).includes('/api/supabase-config'));
        expect(others).toEqual([]);
        expect(fileExists('functions/api/youtube/cache-channel.js')).toBe(false);
    });
});

// ───────────── C4：youtube-channel-page ─────────────
describe('youtube-channel-page 端點', () => {
    const CHANNEL = 'UC' + 'd'.repeat(22);
    const html = `<html><head><link rel="canonical" href="https://www.youtube.com/channel/${CHANNEL}"><title>Foo - YouTube</title></head><body></body></html>`;
    let fetchMock: ReturnType<typeof vi.fn>;
    const youtubeCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes('youtube.com')).length;

    beforeEach(() => {
        fetchMock = vi.fn(async () => new Response(html, { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
    });

    const call = (query: string, headers: Record<string, string>) =>
        channelPageGet({ request: new Request(`https://multistreaming.org/api/youtube-channel-page?${query}`, { headers }), env: {}, waitUntil });

    it('C4a 非本站請求被拒（403 且不抓 YouTube）', async () => {
        const res = await call('handle=@Foo', {});
        expect(res.status).toBe(403);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('C4b @Foo 與 @foo 視為同一快取鍵，只抓一次 YouTube', async () => {
        const first = await call('handle=@Foo', SAME_ORIGIN);
        await flush();
        expect(first.status).toBe(200);
        const second = await call('handle=@foo', SAME_ORIGIN);
        await flush();
        expect(second.status).toBe(200);
        expect(youtubeCalls()).toBe(1);
        expect((await second.json()).channelId).toBe(CHANNEL);
    });
});
