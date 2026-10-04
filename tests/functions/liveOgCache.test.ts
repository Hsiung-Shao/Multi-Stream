// /api/youtube-channel-live-og 的 edge 快取（2026-09 CPU 超限事件）：
//   1. 同一頻道 TTL 內只抓一次 YouTube（第二次命中快取，不再 fetch）
//   2. 快取 key 只認 channelId：加亂數參數不能繞過快取
//   3. 格式不合的 channelId 回 400 且不寫快取
//   4. YouTube 抓取失敗只快取 60 秒；內部標頭不外洩給瀏覽器
//   5. 回給瀏覽器的永遠是 no-store（快取只在 edge 層）
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestGet, toLiveStatusRow, LIVE_OG_CLIENT_HEADER, LIVE_OG_CLIENT_VERSION } from '../../functions/api/youtube-channel-live-og.js';
import { LIVE_OG_CLIENT_HEADER as CLIENT_HEADER_FE, LIVE_OG_CLIENT_VERSION as CLIENT_VERSION_FE } from '../../src/utils/youtubeApi';

const CHANNEL = 'UC' + 'a'.repeat(22);
const store = new Map<string, Response>();
let pending: Promise<unknown>[] = [];
let youtubeStatus = 200;
const fetchMock = vi.fn(async () => new Response('<html><head></head><body>offline</body></html>', { status: youtubeStatus }));

// 預設模擬本站頁面發出的同源請求（瀏覽器會帶 Sec-Fetch-Site: same-origin）
const SAME_ORIGIN = { 'Sec-Fetch-Site': 'same-origin' };

// 預設帶新版用戶端標頭；client=false 模擬修正前就開著的舊分頁
function call(query: string, headers: Record<string, string> = SAME_ORIGIN, env?: Record<string, string>, client = true) {
    const all = client ? { [LIVE_OG_CLIENT_HEADER]: LIVE_OG_CLIENT_VERSION, ...headers } : headers;
    const request = new Request(`https://multistreaming.org/api/youtube-channel-live-og?${query}`, { headers: all });
    return onRequestGet({ request, env, waitUntil: (p: Promise<unknown>) => pending.push(p) });
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

describe('youtube-channel-live-og 用戶端版本', () => {
    it('沒帶版本標頭（修正前開著的舊分頁）→ 426，不抓 YouTube、不寫快取', async () => {
        const res = await call(`channelId=${CHANNEL}`, SAME_ORIGIN, undefined, false);
        await flush();
        expect(res.status).toBe(426);
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        expect(fetchMock).not.toHaveBeenCalled();
        expect(store.size).toBe(0);
    });

    it('版本號不符 → 426；edge 快取裡已有資料也一樣（不回快取）', async () => {
        await call(`channelId=${CHANNEL}`);
        await flush();
        const res = await call(`channelId=${CHANNEL}`, { ...SAME_ORIGIN, [LIVE_OG_CLIENT_HEADER]: '1' }, undefined, false);
        expect(res.status).toBe(426);
    });

    it('前端送的標頭與端點要求的一致', () => {
        expect(CLIENT_HEADER_FE).toBe(LIVE_OG_CLIENT_HEADER);
        expect(CLIENT_VERSION_FE).toBe(LIVE_OG_CLIENT_VERSION);
    });
});

describe('youtube-channel-live-og 來源限制與 CORS', () => {
    it('沒有任何來源資訊（裸 curl）→ 403，不抓 YouTube', async () => {
        const res = await call(`channelId=${CHANNEL}`, {});
        expect(res.status).toBe(403);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('其他網站的 Origin → 403', async () => {
        const res = await call(`channelId=${CHANNEL}`, { Origin: 'https://evil.example' });
        expect(res.status).toBe(403);
    });

    it('本站 Referer（沒有 Sec-Fetch-Site 的舊瀏覽器）→ 放行', async () => {
        const res = await call(`channelId=${CHANNEL}`, { Referer: 'https://multistreaming.org/canvas' });
        expect(res.status).toBe(200);
    });

    it('CORS 不再是 *，只回白名單來源', async () => {
        const res = await call(`channelId=${CHANNEL}`, { Origin: 'https://multistreaming.org' });
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://multistreaming.org');
        const hit = await call(`channelId=${CHANNEL}`, { Origin: 'https://multistreaming.org' });
        expect(hit.headers.get('Access-Control-Allow-Origin')).toBe('https://multistreaming.org');
    });
});

describe('youtube-channel-live-og 寫入共享表 youtube_live_status', () => {
    const ENV = { SUPABASE_URL: 'https://sb.example', SUPABASE_SERVICE_ROLE_KEY: 'test-service-role' };
    const OFFLINE_WITH_TITLE = '<html><head><meta property="og:title" content="Test Channel"></head><body></body></html>';
    const supabaseCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).startsWith('https://sb.example/'));

    beforeEach(() => {
        fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
            if (String(input).startsWith('https://sb.example/')) return new Response(null, { status: 201 });
            return new Response(OFFLINE_WITH_TITLE, { status: youtubeStatus });
        });
    });

    afterEach(() => {
        fetchMock.mockImplementation(async () => new Response('<html><head></head><body>offline</body></html>', { status: youtubeStatus }));
    });

    it('抓到頻道資料 → 以 service_role upsert 一列（onConflict channel_id）', async () => {
        await call(`channelId=${CHANNEL}`, SAME_ORIGIN, ENV);
        await flush();
        const [url, init] = supabaseCalls()[0] as [string, RequestInit];
        expect(url).toBe('https://sb.example/rest/v1/youtube_live_status?on_conflict=channel_id');
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-service-role');
        const [row] = JSON.parse(String(init.body));
        expect(row).toMatchObject({ channel_id: CHANNEL, is_live: false, channel_title: 'Test Channel', video_id: null });
    });

    it('edge 快取命中時不重複寫入', async () => {
        await call(`channelId=${CHANNEL}`, SAME_ORIGIN, ENV);
        await flush();
        await call(`channelId=${CHANNEL}`, SAME_ORIGIN, ENV);
        await flush();
        expect(supabaseCalls()).toHaveLength(1);
    });

    it('YouTube 抓取失敗 → 不寫入（查不到不能當成全站共用的「沒開播」）', async () => {
        youtubeStatus = 429;
        await call(`channelId=${CHANNEL}`, SAME_ORIGIN, ENV);
        await flush();
        expect(supabaseCalls()).toHaveLength(0);
    });

    it('沒有設定 service_role（本機、preview）→ 略過寫入但照常回應', async () => {
        const res = await call(`channelId=${CHANNEL}`, SAME_ORIGIN, {});
        await flush();
        expect(res.status).toBe(200);
        expect(supabaseCalls()).toHaveLength(0);
    });
});

describe('toLiveStatusRow', () => {
    const NOW = Date.UTC(2026, 8, 23);
    const VID = 'abcdefghijk';

    it('直播中', () => {
        expect(toLiveStatusRow(CHANNEL, { isLive: true, videoId: VID, channelTitle: 'Ch' }, NOW)).toMatchObject({
            is_live: true, is_upcoming: false, is_schedule_frame: false, video_id: VID,
        });
    });

    it('一週內的排程 → 即將直播', () => {
        const start = String(Math.floor(NOW / 1000) + 3 * 86400);
        expect(toLiveStatusRow(CHANNEL, { isUpcoming: true, videoId: VID, scheduledStartTime: start }, NOW)).toMatchObject({
            is_upcoming: true, is_schedule_frame: false,
        });
    });

    it('幾百年後的排程 → 週表框，不算即將直播', () => {
        const farFuture = String(Math.floor(Date.UTC(2400, 0, 1) / 1000));
        const row = toLiveStatusRow(CHANNEL, { isUpcoming: true, videoId: VID, scheduledStartTime: farFuture }, NOW);
        expect(row).toMatchObject({ is_upcoming: false, is_schedule_frame: true });
        expect(row!.scheduled_start_at).toBe('2400-01-01T00:00:00.000Z');
    });

    it('既沒有 videoId 也沒有頻道名 → null（不灌空列）', () => {
        expect(toLiveStatusRow(CHANNEL, { isLive: false, message: 'Video ID not found in HTML' }, NOW)).toBeNull();
    });

    it('格式錯誤的 videoId 不寫入、超長頻道名截斷', () => {
        const row = toLiveStatusRow(CHANNEL, { videoId: '<script>', channelTitle: 'x'.repeat(500) }, NOW);
        expect(row!.video_id).toBeNull();
        expect(row!.channel_title).toHaveLength(200);
    });

    it('錯誤回應 → null', () => {
        expect(toLiveStatusRow(CHANNEL, { error: 'Internal Error' }, NOW)).toBeNull();
    });
});
