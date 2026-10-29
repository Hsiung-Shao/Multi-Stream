// 後台歌回列表分頁：GET /api/admin/songs 的 page／page_size／建立時間區間／總數
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestGet } from '../../functions/api/admin/songs.js';

const ENV = () => ({
    ADMIN_API_TOKEN: 't',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
});

type Call = { url: string; headers: Headers };
let calls: Call[];
let contentRange: string;
let rows: unknown[];

beforeEach(() => {
    calls = [];
    contentRange = '0-14/40';
    rows = [{ id: 'v1', video_id: 'dQw4w9WgXcQ', title: 'A', song_segments: [{ count: 7 }] }];
    vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
            const url = String(input instanceof Request ? input.url : input);
            const headers = new Headers(input instanceof Request ? input.headers : init?.headers);
            calls.push({ url, headers });
            return new Response(JSON.stringify(rows), { status: 200, headers: { 'Content-Range': contentRange } });
        }),
    );
});
afterEach(() => {
    vi.unstubAllGlobals();
});

const list = (qs = '') =>
    onRequestGet({
        request: new Request(`https://multistreaming.org/api/admin/songs${qs}`, { headers: { 'X-Admin-Token': 't' } }),
        env: ENV(),
    });
/** 打到 song_videos 的那次請求（網址先解碼，方便比對 order=created_at.desc,id.desc） */
const listCall = () => calls.find((c) => c.url.includes('song_videos'))!;
const decoded = () => decodeURIComponent(listCall().url);

describe('GET /api/admin/songs 列表分頁', () => {
    it('P1 列表預設第 1 頁、每頁 15 筆並回傳總數', async () => {
        const res = await list();
        expect(res.status).toBe(200);
        const url = decoded();
        expect(url).toContain('offset=0');
        expect(url).toContain('limit=15');
        expect(url).toContain('order=created_at.desc,id.desc');
        expect(listCall().headers.get('Prefer') ?? '').toContain('count=exact');
        const json = await res.json();
        expect(json.ok).toBe(true);
        expect(json.total).toBe(40);
        expect(json.videos).toHaveLength(1);
        expect(json.videos[0].segment_count).toBe(7);
    });

    it('P1b Content-Range 為 */0 時 total 為 0', async () => {
        contentRange = '*/0';
        rows = [];
        const json = await (await list()).json();
        expect(json.total).toBe(0);
        expect(json.videos).toEqual([]);
    });

    it('P2 第 3 頁、每頁 25 筆換算正確', async () => {
        await list('?page=3&page_size=25');
        const url = decoded();
        expect(url).toContain('offset=50');
        expect(url).toContain('limit=25');
    });

    it('P3 不合法的分頁參數回 400 且不查資料庫', async () => {
        for (const qs of ['?page_size=20', '?page=0', '?page=abc']) {
            const res = await list(qs);
            expect(res.status, qs).toBe(400);
            expect(await res.json()).toMatchObject({ ok: false, error: 'invalid_query' });
        }
        expect(calls).toHaveLength(0);
    });

    it('P4 建立時間起訖轉成 gte／lt 條件，格式錯回 400', async () => {
        const from = '2026-10-01T00:00:00.000Z';
        const to = '2026-10-08T00:00:00.000Z';
        const ok = await list(`?created_from=${encodeURIComponent(from)}&created_to=${encodeURIComponent(to)}`);
        expect(ok.status).toBe(200);
        const raw = listCall().url;
        expect(raw).toContain(`created_at=gte.${encodeURIComponent(from)}`);
        expect(raw).toContain(`created_at=lt.${encodeURIComponent(to)}`);

        calls = [];
        const bad = await list('?created_from=abc');
        expect(bad.status).toBe(400);
        expect(await bad.json()).toMatchObject({ ok: false, error: 'invalid_query' });
        expect(calls).toHaveLength(0);
    });
    it('P5 頁碼超過總頁數（PostgREST 416）視為空頁並回總數，不當成錯誤', async () => {
        (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
            const url = String(input instanceof Request ? input.url : input);
            calls.push({ url, headers: new Headers(input instanceof Request ? input.headers : init?.headers) });
            return new Response(JSON.stringify({ code: 'PGRST103', message: 'Requested range not satisfiable' }), {
                status: 416,
                headers: { 'Content-Range': '*/40' },
            });
        });
        const res = await list('?page=4');
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, videos: [], total: 40 });
        // 只打了列表那一次，沒有為了寫 error log 再發請求
        expect(calls.filter((c) => !c.url.includes('song_videos'))).toHaveLength(0);
    });
});
