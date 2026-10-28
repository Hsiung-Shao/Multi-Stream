// 歌曲長度查詢 POST /api/songs/lengths：站內／快取命中、iTunes 補查（上限、去重、配額、錯誤處理）、請求驗證
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestPost } from '../../functions/api/songs/lengths.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { quotaWindow } from '../../functions/lib/rate-limit.js';

type Item = { title: string; artist?: string | null };
type Looked = { seconds: number | null; source: 'site' | 'itunes' | 'miss' | 'unknown' };
type Call = { url: string; body: any };

const UNKNOWN: Looked = { seconds: null, source: 'unknown' };

// ---------- 外部 I/O mock：KV 與 fetch（Supabase RPC、iTunes） ----------
function memKv(initial: Record<string, string> = {}) {
    const m = new Map<string, string>(Object.entries(initial));
    const gets: string[] = [];
    const puts: Array<{ key: string; value: string }> = [];
    return {
        get: async (k: string) => {
            gets.push(k);
            return m.get(k) ?? null;
        },
        put: async (k: string, v: string) => {
            puts.push({ key: k, value: v });
            m.set(k, v);
        },
        gets,
        puts,
    };
}

let calls: Call[] = [];
// RPC song_ref_lengths 回什麼（預設全 unknown，由各測試覆寫）
let lookupResponse: () => Response;
// RPC song_length_refs_put 回什麼
let putResponse: () => Response;
// 每次 iTunes 請求的回應；參數為該次的 title(term 第一段以前不好拆，所以直接給整個 term 與國家)
let itunes: (info: { term: string; country: string; n: number }) => Response | Promise<Response>;

const lookupCalls = () => calls.filter((c) => c.url.includes('rpc/song_ref_lengths'));
const putCalls = () => calls.filter((c) => c.url.includes('rpc/song_length_refs_put'));
const itunesCalls = () => calls.filter((c) => c.url.startsWith('https://itunes.apple.com/'));
const termOf = (c: Call) => new URL(c.url).searchParams.get('term') ?? '';
const countryOf = (c: Call) => new URL(c.url).searchParams.get('country') ?? '';

const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
// 可配對的 iTunes 回應：曲名與歌手都含請求的歌名／原唱，長度 200 秒
const hit = (trackName: string, artistName: string, ms = 200000) => json({ results: [{ trackName, artistName, trackTimeMillis: ms }] });

beforeEach(() => {
    calls = [];
    lookupResponse = () => json([]);
    putResponse = () => new Response(null, { status: 204 });
    let n = 0;
    itunes = () => json({ results: [] });
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const raw = typeof init?.body === 'string' ? init.body : null;
        calls.push({ url, body: raw ? JSON.parse(raw) : null });
        if (url.includes('/rest/v1/rpc/song_ref_lengths')) return lookupResponse();
        if (url.includes('/rest/v1/rpc/song_length_refs_put')) return putResponse();
        if (url.startsWith('https://itunes.apple.com/')) {
            const u = new URL(url);
            return itunes({ term: u.searchParams.get('term') ?? '', country: u.searchParams.get('country') ?? '', n: ++n });
        }
        throw new Error(`unexpected fetch ${url}`);
    }));
});
afterEach(() => vi.unstubAllGlobals());

// ---------- 請求輔助 ----------
const ENV = (extra: Record<string, unknown> = {}) => ({
    SUPABASE_URL: 'http://sb',
    SUPABASE_SERVICE_ROLE_KEY: 'k',
    RATE_LIMIT_KV: memKv(),
    ...extra,
});

const req = (body: unknown, headers: Record<string, string | null> = {}, rawBody?: string) => {
    const h: Record<string, string | null> = {
        'Content-Type': 'application/json',
        Origin: 'https://multistreaming.org',
        ...headers,
    };
    const clean = Object.fromEntries(Object.entries(h).filter(([, v]) => v !== null)) as Record<string, string>;
    return new Request('https://multistreaming.org/api/songs/lengths', {
        method: 'POST',
        headers: clean,
        body: rawBody ?? JSON.stringify(body),
    });
};
const call = (items: Item[], env: Record<string, unknown> = ENV(), headers: Record<string, string | null> = {}) =>
    onRequestPost({ request: req({ items }, headers), env, waitUntil: () => undefined });

// 造 n 首 title=歌i／artist=歌手i 的項目
const songs = (n: number, from = 0): Item[] => Array.from({ length: n }, (_, i) => ({ title: `歌${i + from}`, artist: `歌手${i + from}` }));
// iTunes 回與請求 term（"歌i 歌手i"）一致、可配對的結果
const matchByTerm = ({ term }: { term: string }) => {
    const [title, artist] = term.split(' ');
    return hit(title, artist);
};

describe('POST /api/songs/lengths：站內／快取命中', () => {
    it('F7 站內或快取命中時不呼叫 iTunes、不碰 KV，順序與請求相同', async () => {
        lookupResponse = () => json([
            { seconds: 180, source: 'site' },
            { seconds: 240, source: 'itunes' },
            { seconds: null, source: 'miss' },
        ]);
        const kv = memKv();
        const res = await call(songs(3), ENV({ RATE_LIMIT_KV: kv }));
        expect(res.status).toBe(200);
        expect(res.headers.get('Cache-Control')).toContain('no-store');
        // 順序錯亂（例如依 source 重排）會讓這行失敗
        expect(await res.json()).toEqual({
            ok: true,
            items: [
                { seconds: 180, source: 'site' },
                { seconds: 240, source: 'itunes' },
                { seconds: null, source: 'miss' },
            ],
        });
        // 沒有 unknown 還去打 iTunes／扣配額，會燒掉全站額度
        expect(itunesCalls()).toHaveLength(0);
        expect(kv.gets).toHaveLength(0);
        expect(kv.puts).toHaveLength(0);
        expect(putCalls()).toHaveLength(0);
    });

    it('F7 RPC 收到整理過的 p_items（title／artist 去頭尾空白、沒原唱為 null）', async () => {
        lookupResponse = () => json([{ seconds: 100, source: 'site' }, { seconds: 100, source: 'site' }]);
        await call([{ title: '  歌A ', artist: ' 原唱 ' }, { title: '歌B' }]);
        expect(lookupCalls()).toHaveLength(1);
        expect(lookupCalls()[0].body).toEqual({
            p_items: [{ title: '歌A', artist: '原唱' }, { title: '歌B', artist: null }],
        });
    });
});

describe('POST /api/songs/lengths：iTunes 補查', () => {
    it('F8 每次最多查 8 首，其餘標 pending，且只扣一次全站每日配額', async () => {
        lookupResponse = () => json(Array.from({ length: 12 }, () => UNKNOWN));
        itunes = matchByTerm;
        const kv = memKv();
        const res = await call(songs(12), ENV({ RATE_LIMIT_KV: kv }));
        expect(res.status).toBe(200);
        const { items } = await res.json();
        expect(items).toHaveLength(12);
        // 上限被拿掉會變成 12 首都查（外部請求超出每次預算）
        expect(itunesCalls().length).toBeLessThanOrEqual(24);
        expect(items.slice(0, 8).every((x: Looked) => x.source === 'itunes' && x.seconds === 200)).toBe(true);
        expect(items.slice(8).map((x: { source: string }) => x.source)).toEqual(['pending', 'pending', 'pending', 'pending']);
        // 排序／去重錯了，被查的就不是「依出現順序的前 8 首」
        const queried = new Set(itunesCalls().map(termOf));
        expect([...queried].sort()).toEqual(songs(8).map((s) => `${s.title} ${s.artist}`).sort());
        // 寫入只含查到的 8 列
        expect(putCalls()).toHaveLength(1);
        const rows = putCalls()[0].body.p_rows;
        expect(rows).toHaveLength(8);
        expect(rows[0]).toMatchObject({ title: '歌0', artist: '歌手0', seconds: 200, country: 'TW' });
        // 每個請求只檢查一次、只用全站每日這一個 key（每首各扣一次會讓額度 8 倍速燒光）
        const key = `songlen:day:${quotaWindow().day}`;
        expect(kv.puts).toEqual([{ key, value: '1' }]);
        expect([...new Set(kv.gets)]).toEqual([key]);
    });

    it('F8b 相同歌曲（大小寫、空白不同）只查一次，兩項結果相同', async () => {
        lookupResponse = () => json([UNKNOWN, UNKNOWN, UNKNOWN]);
        itunes = ({ term }) => (term.toLowerCase().includes('song a') ? hit('Song A', 'Art', 230000) : hit('Song B', 'Other', 150000));
        const res = await call([
            { title: 'Song A', artist: 'Art' },
            { title: 'Song B', artist: 'Other' },
            { title: '  song a ', artist: 'ART' },
        ]);
        const { items } = await res.json();
        const songA = itunesCalls().filter((c) => termOf(c).toLowerCase().includes('song a'));
        // 沒去重會是 2 次；第一個國家就配到所以只該 1 次
        expect(songA).toHaveLength(1);
        expect(countryOf(songA[0])).toBe('TW');
        expect(items[0]).toEqual({ seconds: 230, source: 'itunes' });
        expect(items[2]).toEqual(items[0]);
        expect(items[1]).toEqual({ seconds: 150, source: 'itunes' });
    });

    it('F8c 三國都配不到時記為查無（miss）並寫入快取', async () => {
        lookupResponse = () => json([UNKNOWN]);
        itunes = () => json({ results: [] });
        const res = await call([{ title: '冷門歌', artist: '無名' }]);
        const { items } = await res.json();
        expect(items).toEqual([{ seconds: null, source: 'miss' }]);
        // 少查一國會漏掉可能的配對；順序也固定 TW、JP、US
        expect(itunesCalls().map(countryOf)).toEqual(['TW', 'JP', 'US']);
        // 查無沒寫快取，下次每個人都會再打三次 iTunes
        expect(putCalls()).toHaveLength(1);
        expect(putCalls()[0].body.p_rows).toEqual([
            { title: '冷門歌', artist: '無名', seconds: null, matched: null, country: null },
        ]);
    });

    it('F8d 前面的國家配不到、後面的國家配到就停，寫入帶該國', async () => {
        lookupResponse = () => json([UNKNOWN]);
        itunes = ({ country }) => (country === 'JP' ? hit('歌J', '歌手J', 201000) : json({ results: [] }));
        const res = await call([{ title: '歌J', artist: '歌手J' }]);
        expect((await res.json()).items).toEqual([{ seconds: 201, source: 'itunes' }]);
        // 配到後還繼續查 US 會多燒一次外部請求
        expect(itunesCalls().map(countryOf)).toEqual(['TW', 'JP']);
        expect(putCalls()[0].body.p_rows[0]).toMatchObject({ title: '歌J', artist: '歌手J', seconds: 201, country: 'JP' });
    });
});

describe('POST /api/songs/lengths：iTunes 錯誤處理', () => {
    it('F9 iTunes 回 403 或 429 時立刻停止外部查詢，全部 unknown 標 pending 且不寫入查無', async () => {
        for (const status of [429, 403]) {
            calls = [];
            lookupResponse = () => json([UNKNOWN, UNKNOWN, UNKNOWN]);
            itunes = () => new Response('rate limited', { status });
            const res = await call(songs(3));
            expect(res.status, String(status)).toBe(200);
            expect((await res.json()).items, String(status)).toEqual([
                { seconds: null, source: 'pending' },
                { seconds: null, source: 'pending' },
                { seconds: null, source: 'pending' },
            ]);
            // 被限流還繼續打，會讓整站 IP 被封更久
            expect(itunesCalls(), String(status)).toHaveLength(1);
            // 限流被當成「查無」寫入，這首歌會被永久記成沒長度
            expect(putCalls(), String(status)).toHaveLength(0);
        }
    });

    it('F9b 5xx 或網路例外只影響那一首，其餘照常查並只寫入成功的', async () => {
        for (const failure of ['500', 'throw'] as const) {
            calls = [];
            lookupResponse = () => json([UNKNOWN, UNKNOWN]);
            itunes = ({ term }) => {
                if (term.startsWith('歌0 ')) {
                    if (failure === 'throw') throw new Error('network down');
                    return new Response('boom', { status: 500 });
                }
                return matchByTerm({ term });
            };
            const res = await call(songs(2));
            expect(res.status, failure).toBe(200);
            // 一首失敗就整批放棄，第二首會變 pending
            expect((await res.json()).items, failure).toEqual([
                { seconds: null, source: 'pending' },
                { seconds: 200, source: 'itunes' },
            ]);
            // 失敗的那首被寫成查無，之後就不會再重查
            expect(putCalls(), failure).toHaveLength(1);
            expect(putCalls()[0].body.p_rows, failure).toHaveLength(1);
            expect(putCalls()[0].body.p_rows[0], failure).toMatchObject({ title: '歌1', seconds: 200 });
        }
    });

    it('F9c 寫入快取失敗（put 回 500）不影響回應', async () => {
        lookupResponse = () => json([UNKNOWN]);
        itunes = matchByTerm;
        putResponse = () => new Response('boom', { status: 500 });
        const res = await call(songs(1));
        expect(res.status).toBe(200);
        expect((await res.json()).items).toEqual([{ seconds: 200, source: 'itunes' }]);
    });
});

describe('POST /api/songs/lengths：全站每日配額', () => {
    it('F10 全站每日配額用完就不查外部，unknown 全標 pending', async () => {
        lookupResponse = () => json([{ seconds: 90, source: 'site' }, UNKNOWN, UNKNOWN]);
        const key = `songlen:day:${quotaWindow().day}`;
        const kv = memKv({ [key]: '300' });
        const res = await call(songs(3), ENV({ RATE_LIMIT_KV: kv }));
        expect(res.status).toBe(200);
        // 站內命中的不受配額影響；unknown 才改 pending
        expect((await res.json()).items).toEqual([
            { seconds: 90, source: 'site' },
            { seconds: null, source: 'pending' },
            { seconds: null, source: 'pending' },
        ]);
        // 配額檢查被略過（或檢查後仍照查）會讓外部請求無上限
        expect(itunesCalls()).toHaveLength(0);
        expect(putCalls()).toHaveLength(0);
        // 達上限時不再累加
        expect(kv.puts).toHaveLength(0);
    });
});

describe('POST /api/songs/lengths：請求驗證', () => {
    it('F12 空 items 或 body 不是 JSON → 400 invalid_payload，不碰外部', async () => {
        const empty = await call([]);
        expect(empty.status).toBe(400);
        expect(await empty.json()).toEqual({ ok: false, error: 'invalid_payload' });

        const notJson = await onRequestPost({ request: req(null, {}, 'not json{'), env: ENV(), waitUntil: () => undefined });
        expect(notJson.status).toBe(400);
        expect((await notJson.json()).error).toBe('invalid_payload');

        // 驗證被略過就會拿壞資料去問 RPC
        expect(calls).toHaveLength(0);
    });

    it('F12 缺 Origin 與 Referer、或來自他站 → 403 forbidden_origin，不碰外部', async () => {
        const none = await call(songs(1), ENV(), { Origin: null });
        expect(none.status).toBe(403);
        expect(await none.json()).toEqual({ ok: false, error: 'forbidden_origin' });

        const other = await call(songs(1), ENV(), { Origin: 'https://evil.example.com' });
        expect(other.status).toBe(403);
        expect((await other.json()).error).toBe('forbidden_origin');

        // 來源檢查失效，任何網站都能拿本站的 service role 去查庫、消耗 iTunes 額度
        expect(calls).toHaveLength(0);
    });

    it('F12 只有本站 Referer（沒有 Origin）仍放行', async () => {
        lookupResponse = () => json([{ seconds: 100, source: 'site' }]);
        const res = await call(songs(1), ENV(), { Origin: null, Referer: 'https://multistreaming.org/songs' });
        expect(res.status).toBe(200);
    });

    it('缺 SUPABASE env → 500 server_misconfigured', async () => {
        const res = await call(songs(1), ENV({ SUPABASE_URL: undefined }));
        expect(res.status).toBe(500);
        expect((await res.json()).error).toBe('server_misconfigured');
        expect(calls).toHaveLength(0);
    });

    it('F13 RPC song_ref_lengths 失敗 → 502 lookup_failed，且不打 iTunes', async () => {
        lookupResponse = () => new Response('boom', { status: 500 });
        const res = await call(songs(2));
        expect(res.status).toBe(502);
        expect(await res.json()).toEqual({ ok: false, error: 'lookup_failed' });
        // 查不到庫就去問 iTunes，會把本來站內有的歌也當 unknown
        expect(itunesCalls()).toHaveLength(0);
        expect(putCalls()).toHaveLength(0);
    });
});

describe('POST /api/songs/lengths：重試提示 retryAfter 與 iTunes 逾時', () => {
    it('R1 只是每請求上限 8 首沒輪到的 pending，不帶 retryAfter', async () => {
        lookupResponse = () => json(Array.from({ length: 12 }, () => UNKNOWN));
        itunes = matchByTerm;
        const body = await (await call(songs(12))).json();
        expect(body.items.slice(8).every((x: { source: string }) => x.source === 'pending')).toBe(true);
        // 沒輪到的不是失敗；帶了 retryAfter 前端會把它當失敗退避，12 首要等很久才查完
        expect(body.retryAfter).toBeUndefined();
    });

    it('R2 iTunes 403／429：整批 pending 並帶 retryAfter 60', async () => {
        for (const status of [429, 403]) {
            lookupResponse = () => json([UNKNOWN, UNKNOWN]);
            itunes = () => new Response('limited', { status });
            const body = await (await call(songs(2))).json();
            expect(body.items.map((x: { source: string }) => x.source), String(status)).toEqual(['pending', 'pending']);
            expect(body.retryAfter, String(status)).toBe(60);
        }
    });

    it('R3 全站配額用完：pending 並帶 retryAfter 3600', async () => {
        lookupResponse = () => json([UNKNOWN]);
        const kv = memKv({ [`songlen:day:${quotaWindow().day}`]: '300' });
        const body = await (await call(songs(1), ENV({ RATE_LIMIT_KV: kv }))).json();
        expect(body.items).toEqual([{ seconds: null, source: 'pending' }]);
        expect(body.retryAfter).toBe(3600);
    });

    it('R4 iTunes 暫時失敗（5xx／逾時）的 pending 也帶 retryAfter，避免前端立刻重送', async () => {
        lookupResponse = () => json([UNKNOWN, UNKNOWN]);
        itunes = ({ term }) => (term.startsWith('歌0 ') ? new Response('boom', { status: 500 }) : matchByTerm({ term }));
        const body = await (await call(songs(2))).json();
        expect(body.items[0]).toEqual({ seconds: null, source: 'pending' });
        expect(body.items[1]).toEqual({ seconds: 200, source: 'itunes' });
        expect(typeof body.retryAfter).toBe('number');
        expect(body.retryAfter).toBeGreaterThan(0);
    });

    it('R5 每次呼叫 iTunes 都帶逾時 signal', async () => {
        lookupResponse = () => json([UNKNOWN, UNKNOWN]);
        itunes = matchByTerm;
        await call(songs(2));
        const inits = (fetch as unknown as { mock: { calls: [string, RequestInit | undefined][] } }).mock.calls
            .filter(([u]) => String(u).startsWith('https://itunes.apple.com/'));
        expect(inits).toHaveLength(2);
        // 沒設逾時時 iTunes 卡住會讓整個請求（與 Workers 時限）一起卡死
        for (const [, init] of inits) expect(init?.signal).toBeInstanceOf(AbortSignal);
    });

    it('R6 iTunes 逾時（AbortError／TimeoutError）：該首 pending 不寫快取，下一首照常有結果', async () => {
        for (const name of ['AbortError', 'TimeoutError']) {
            calls = [];
            lookupResponse = () => json([UNKNOWN, UNKNOWN]);
            itunes = ({ term }) => {
                if (term.startsWith('歌0 ')) throw new DOMException('timed out', name);
                return matchByTerm({ term });
            };
            const body = await (await call(songs(2))).json();
            expect(body.items, name).toEqual([{ seconds: null, source: 'pending' }, { seconds: 200, source: 'itunes' }]);
            const rows = putCalls()[0].body.p_rows;
            expect(rows, name).toHaveLength(1);
            expect(rows[0].title, name).toBe('歌1');
        }
    });
});

describe('POST /api/songs/lengths：帶版本括號的歌名', () => {
    it('V1 「Lemon (Short ver.)」以「Lemon」查 iTunes 並配到', async () => {
        lookupResponse = () => json([UNKNOWN]);
        itunes = ({ term }) => (term === 'Lemon 米津玄師' ? hit('Lemon', '米津玄師', 255000) : json({ results: [] }));
        const body = await (await call([{ title: 'Lemon (Short ver.)', artist: '米津玄師' }])).json();
        // 沒去版本括號，term 會帶「(Short ver.)」且曲名比對不到
        expect(itunesCalls().map(termOf)[0]).toBe('Lemon 米津玄師');
        expect(body.items).toEqual([{ seconds: 255, source: 'itunes' }]);
        expect(putCalls()[0].body.p_rows[0]).toMatchObject({ title: 'Lemon', artist: '米津玄師', seconds: 255 });
    });

    it('V2 同批「Lemon」與「Lemon (Short ver.)」只打一次 iTunes，兩項結果相同', async () => {
        lookupResponse = () => json([UNKNOWN, UNKNOWN]);
        itunes = ({ term }) => (term === 'Lemon 米津玄師' ? hit('Lemon', '米津玄師', 255000) : json({ results: [] }));
        const body = await (await call([
            { title: 'Lemon', artist: '米津玄師' },
            { title: 'Lemon (Short ver.)', artist: '米津玄師' },
        ])).json();
        expect(itunesCalls()).toHaveLength(1);
        expect(body.items).toEqual([{ seconds: 255, source: 'itunes' }, { seconds: 255, source: 'itunes' }]);
        expect(putCalls()[0].body.p_rows).toHaveLength(1);
    });
});
