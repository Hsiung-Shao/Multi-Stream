// 歌曲播放次數 API：輸入驗證、一次 RPC、IP 只送雜湊、限流對應
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { parsePlaysBody, SONG_PLAYS_MAX } from '../../functions/lib/song-plays.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestPost as playsPost } from '../../functions/api/songs/plays.js';

const IP = '203.0.113.9';
const ENV = (extra: Record<string, unknown> = {}) => ({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
    IP_HASH_SALT: 'test-salt',
    ...extra,
});
const gen = (n: number) => Array.from({ length: n }, (_, i) => `c${String(i).padStart(7, '0')}`);
// 預設：本站同源、有訪客 IP；headers 可覆寫（值為 null 代表移除該 header）
const req = (body: unknown, raw = false, headers: Record<string, string | null> = {}) => {
    const h: Record<string, string | null> = {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': IP,
        'Sec-Fetch-Site': 'same-origin',
        ...headers,
    };
    const clean = Object.fromEntries(Object.entries(h).filter(([, v]) => v !== null)) as Record<string, string>;
    return new Request('https://multistreaming.org/api/songs/plays', {
        method: 'POST',
        headers: clean,
        body: raw ? (body as string) : JSON.stringify(body),
    });
};
const rpcReply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
    fetchSpy = vi.fn(async () => rpcReply({ ok: true }));
    vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
    vi.unstubAllGlobals();
});

describe('parsePlaysBody', () => {
    it('合法 code 去重保序；上限 20', () => {
        expect(SONG_PLAYS_MAX).toBe(20);
        expect(parsePlaysBody({ codes: ['aaaaaaaa', 'bbbbbbbb', 'aaaaaaaa'] })).toEqual({ ok: true, codes: ['aaaaaaaa', 'bbbbbbbb'] });
        expect(parsePlaysBody({ codes: gen(20) }).ok).toBe(true);
        expect(parsePlaysBody({ codes: gen(21) })).toEqual({ ok: false, error: 'invalid_payload' });
    });

    it('非物件、codes 不是陣列、空陣列、含非法 code 都拒絕', () => {
        for (const bad of [null, 'x', 5, [], {}, { codes: 'aaaaaaaa' }, { codes: [] }, { codes: ['AAAAAAAA'] }, { codes: ['aaaaaaa'] }, { codes: ['aaaaaaaa', 5] }, { codes: ['aaaa-aaa'] }]) {
            expect(parsePlaysBody(bad), JSON.stringify(bad)).toEqual({ ok: false, error: 'invalid_payload' });
        }
    });
});

describe('POST /api/songs/plays', () => {
    it('擋非法輸入（大寫 code、21 個、非 JSON、空陣列）回 400，且不打 DB', async () => {
        const cases: Array<[unknown, boolean]> = [
            [{ codes: ['ABCDEFGH'] }, false],
            [{ codes: gen(21) }, false],
            ['not json{', true],
            [{ codes: [] }, false],
        ];
        for (const [body, raw] of cases) {
            const res = await playsPost({ request: req(body, raw), env: ENV() });
            expect(res.status, JSON.stringify(body)).toBe(400);
        }
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('合法 3 個：恰一次 RPC，帶雜湊 IP（不是明文），回 204', async () => {
        const res = await playsPost({ request: req({ codes: ['aaaaaaaa', 'bbbbbbbb', 'cccccccc'] }), env: ENV() });
        expect(res.status).toBe(204);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(String(url)).toContain('/rest/v1/rpc/record_song_plays');
        const sent = JSON.parse(String(init.body));
        expect(sent.p_ip_hash).toBeTruthy();
        expect(sent.p_ip_hash).not.toBe(IP);
        expect(String(init.body)).not.toContain(IP);
        expect(sent.p_codes).toEqual(['aaaaaaaa', 'bbbbbbbb', 'cccccccc']);
    });

    it('重複 code 在送出前去重', async () => {
        await playsPost({ request: req({ codes: ['aaaaaaaa', 'aaaaaaaa'] }), env: ENV() });
        const sent = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
        expect(sent.p_codes).toEqual(['aaaaaaaa']);
    });

    it('RPC 回 rate_limited → 429', async () => {
        fetchSpy.mockResolvedValue(rpcReply({ ok: false, reason: 'rate_limited' }));
        const res = await playsPost({ request: req({ codes: ['aaaaaaaa'] }), env: ENV() });
        expect(res.status).toBe(429);
    });

    it('RPC 失敗 → 502', async () => {
        fetchSpy.mockResolvedValue(rpcReply({ message: 'boom' }, 500));
        const res = await playsPost({ request: req({ codes: ['aaaaaaaa'] }), env: ENV() });
        expect(res.status).toBe(502);
    });

    it('被封鎖的 IP → 403，且不打 DB', async () => {
        const res = await playsPost({ request: req({ codes: ['aaaaaaaa'] }), env: ENV({ BANNED_IPS: IP }) });
        expect(res.status).toBe(403);
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

describe('POST /api/songs/plays 來源與 IP 檢查', () => {
    const body = { codes: ['aaaaaaaa'] };

    it('沒有訪客 IP 時回 204 且不打 DB', async () => {
        const res = await playsPost({ request: req(body, false, { 'CF-Connecting-IP': null }), env: ENV() });
        expect(res.status).toBe(204);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('跨站來源回 403 且不打 DB', async () => {
        const res = await playsPost({
            request: req(body, false, { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' }),
            env: ENV(),
        });
        expect(res.status).toBe(403);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('完全沒有 Sec-Fetch-Site / Origin / Referer 回 403 且不打 DB', async () => {
        const res = await playsPost({ request: req(body, false, { 'Sec-Fetch-Site': null }), env: ENV() });
        expect(res.status).toBe(403);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('Origin 為本站且沒有 Sec-Fetch-Site 時通過', async () => {
        const res = await playsPost({
            request: req(body, false, { 'Sec-Fetch-Site': null, Origin: 'https://multistreaming.org' }),
            env: ENV(),
        });
        expect(res.status).toBe(204);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
});
