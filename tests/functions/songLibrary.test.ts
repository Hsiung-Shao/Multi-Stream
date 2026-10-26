// 歌曲整理（v1.3）後端：版本備註驗證、admin/songs 明細欄位、song-library 端點、catalog v2
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { buildSongVideoPayload } from '../../functions/lib/songs.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { parseSubmissionBody } from '../../functions/lib/song-submissions.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestGet as adminSongsGet } from '../../functions/api/admin/songs.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestGet as libGet, onRequestPost as libPost } from '../../functions/api/admin/song-library.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestGet as catalogGet, resetSongCatalogMemo } from '../../functions/api/songs/catalog.js';

const VIDEO_ID = 'dQw4w9WgXcQ';
const UID = '11111111-1111-4111-8111-111111111111';
const SEG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SB = 'https://example.supabase.co';
const ENV = () => ({
    ADMIN_API_TOKEN: 't',
    SUPABASE_URL: SB,
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
});

// ---------- fetch 記錄與路由 ----------
type Call = { method: string; url: string; body: any };
let calls: Call[] = [];
/** 依 URL 回應；預設一律回 200 空陣列 */
let route: (url: string, method: string, body: any) => Response;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const pgErr = (message: string, status: number, code = 'P0001') => json({ code, message, details: null, hint: null }, status);

beforeEach(() => {
    calls = [];
    route = () => json([]);
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        const method = init?.method ?? 'GET';
        const raw = typeof init?.body === 'string' ? init.body : null;
        const body = raw && (raw.startsWith('{') || raw.startsWith('[')) ? JSON.parse(raw) : raw;
        calls.push({ method, url, body });
        return route(decodeURIComponent(url), method, body);
    }));
});
afterEach(() => {
    vi.unstubAllGlobals();
});

const rpcCalls = (name?: string) => calls.filter((c) => c.url.includes('/rest/v1/rpc/') && (!name || c.url.endsWith(`/rpc/${name}`)));
const logCalls = () => calls.filter((c) => c.url.includes('/rest/v1/system_logs'));

/** 回應內容「原樣帶回」RPC 結果：本體相等，或包在 data／result／items 內，或物件結果的欄位全數帶回 */
function carries(payload: any, result: unknown): boolean {
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    const candidates = [payload, payload?.data, payload?.result, payload?.items];
    return candidates.some((c) => {
        if (c === undefined) return false;
        if (same(c, result)) return true;
        if (result && typeof result === 'object' && !Array.isArray(result) && c && typeof c === 'object') {
            return Object.entries(result as Record<string, unknown>).every(([k, v]) => same((c as any)[k], v));
        }
        return false;
    });
}

// ================= F1：後台 payload 的片段 version_note =================
describe('F1 buildSongVideoPayload 的 version_note', () => {
    const body = (segments: unknown[]) => ({ video_id: VIDEO_ID, title: '測試歌回', status: 'draft', segments });
    const seg = (extra: Record<string, unknown> = {}) => ({ start_seconds: 0, end_seconds: 10, title: 'A', ...extra });

    it('F1 備註前後空白被 trim 後輸出', () => {
        const r = buildSongVideoPayload(body([seg({ version_note: '  Live 版  ' })]));
        expect(r.ok).toBe(true);
        expect(r.segments[0].version_note).toBe('Live 版');
    });

    it("F1 空字串與全空白都轉成 null", () => {
        const r = buildSongVideoPayload(
            body([seg({ version_note: '' }), seg({ start_seconds: 10, end_seconds: 20, version_note: '   ' })]),
        );
        expect(r.ok).toBe(true);
        expect(r.segments[0].version_note).toBeNull();
        expect(r.segments[1].version_note).toBeNull();
    });

    it('F1 恰好 30 字通過，31 字回 invalid_segments + note_too_long 且 index 指到該片段', () => {
        const ok = buildSongVideoPayload(body([seg({ version_note: 'x'.repeat(30) })]));
        expect(ok.ok).toBe(true);
        expect(ok.segments[0].version_note).toBe('x'.repeat(30));

        const bad = buildSongVideoPayload(
            body([seg(), seg({ start_seconds: 10, end_seconds: 20, version_note: 'x'.repeat(31) })]),
        );
        expect(bad.ok).toBe(false);
        expect(bad.error).toBe('invalid_segments');
        expect(bad.issues).toContainEqual({ index: 1, code: 'note_too_long' });
    });

    it('F1 備註非字串（數字）回 invalid_payload', () => {
        const r = buildSongVideoPayload(body([seg({ version_note: 123 })]));
        expect(r.ok).toBe(false);
        expect(r.error).toBe('invalid_payload');
    });

    it('F1 沒帶 version_note 時輸出片段不含此 key（DB 以 key 不存在表示保留舊值）', () => {
        const r = buildSongVideoPayload(body([seg()]));
        expect(r.ok).toBe(true);
        expect('version_note' in r.segments[0]).toBe(false);
    });
});

// ================= F2：投稿 payload 的片段 versionNote =================
describe('F2 parseSubmissionBody 的 versionNote', () => {
    const sub = (segments: unknown[]) => ({
        videoId: VIDEO_ID,
        title: '歌回 #1',
        vtuberId: null,
        streamedAt: null,
        segments,
        note: null,
        contact: null,
        turnstileToken: 'tok',
    });
    const seg = (start: number, end: number, extra: Record<string, unknown> = {}) => ({ start, end, title: `歌${start}`, ...extra });

    it('F2 備註 trim 後輸出；空字串與全空白轉 null；沒帶也是 null', () => {
        const r = parseSubmissionBody(
            sub([
                seg(0, 10, { versionNote: '  Live 版  ' }),
                seg(10, 20, { versionNote: '' }),
                seg(20, 30, { versionNote: '   ' }),
                seg(30, 40),
            ]),
        );
        expect(r.error).toBeUndefined();
        expect(r.value.segments.map((s: { versionNote: unknown }) => s.versionNote)).toEqual(['Live 版', null, null, null]);
    });

    it('F2 恰好 30 字通過，31 字回 invalid_segments + note_too_long 且 index 指到該片段', () => {
        const ok = parseSubmissionBody(sub([seg(0, 10, { versionNote: 'x'.repeat(30) })]));
        expect(ok.error).toBeUndefined();
        expect(ok.value.segments[0].versionNote).toBe('x'.repeat(30));

        const bad = parseSubmissionBody(sub([seg(0, 10), seg(10, 20, { versionNote: 'x'.repeat(31) })]));
        expect(bad.error).toBe('invalid_segments');
        expect(bad.value).toBeUndefined();
        expect(bad.issues).toContainEqual({ index: 1, code: 'note_too_long' });
    });

    it('F2 備註非字串（數字）回 invalid_payload 且不給 value', () => {
        const r = parseSubmissionBody(sub([seg(0, 10, { versionNote: 123 })]));
        expect(r.error).toBe('invalid_payload');
        expect(r.value).toBeUndefined();
    });
});

// ================= F3：admin/songs 單筆 GET 的 select 欄位 =================
describe('F3 GET /api/admin/songs?id= 單筆明細', () => {
    it('F3 讀 song_segments 的 select 參數含 song_id 與 version_note', async () => {
        route = (url) => (url.includes('song_videos') && !url.includes('song_segments') ? json([{ id: UID, video_id: VIDEO_ID, title: 'T' }]) : json([]));
        const res = await adminSongsGet({
            request: new Request(`https://multistreaming.org/api/admin/songs?id=${UID}`, { headers: { 'X-Admin-Token': 't' } }),
            env: ENV(),
        });
        expect(res.status).toBeLessThan(500);
        const segCalls = calls.filter((c) => c.url.includes('song_segments'));
        expect(segCalls.length).toBeGreaterThan(0);
        const selects = segCalls.map((c) => new URL(c.url.replace(/ /g, '%20')).searchParams.get('select') ?? c.url);
        expect(selects.some((s) => s.includes('song_id') && s.includes('version_note'))).toBe(true);
    });
});

// ================= F4～F9：song-library 端點 =================
const LIB = 'https://multistreaming.org/api/admin/song-library';
const getReq = (qs = '', headers: Record<string, string> = { 'X-Admin-Token': 't' }) =>
    new Request(`${LIB}${qs}`, { method: 'GET', headers });
const postReq = (action: string, payload: unknown, headers: Record<string, string> = { 'X-Admin-Token': 't' }) =>
    new Request(`${LIB}?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    });
const pending: Promise<unknown>[] = [];
const ctx = (request: Request) => ({
    request,
    env: ENV(),
    waitUntil: (p: Promise<unknown>) => void pending.push(p),
});
/** 讓 fire-and-forget 的 log 寫入跑完 */
const flush = async () => {
    await Promise.allSettled(pending.splice(0));
    await new Promise((r) => setTimeout(r, 0));
};

describe('F4 GET song-library', () => {
    it('F4 ?q=foo 只打一次 admin_search_songs，帶 p_query 與 p_limit，原樣回傳', async () => {
        const result = [{ id: 1, title: 'foo', artist: null, versions: 2 }];
        route = () => json(result);
        const res = await libGet(ctx(getReq('?q=foo')));
        expect(res.status).toBe(200);
        expect(calls).toHaveLength(1);
        const rpc = rpcCalls('admin_search_songs');
        expect(rpc).toHaveLength(1);
        expect(rpc[0].method).toBe('POST');
        expect(rpc[0].body.p_query).toBe('foo');
        expect(typeof rpc[0].body.p_limit).toBe('number');
        expect(carries(await res.json(), result)).toBe(true);
    });

    it('F4 ?view=duplicates 打 admin_song_duplicates', async () => {
        const result = [{ title_key: 'foo', songs: [{ id: 1 }, { id: 2 }] }];
        route = () => json(result);
        const res = await libGet(ctx(getReq('?view=duplicates')));
        expect(res.status).toBe(200);
        expect(calls).toHaveLength(1);
        expect(rpcCalls('admin_song_duplicates')).toHaveLength(1);
        expect(carries(await res.json(), result)).toBe(true);
    });

    // 規格寫 {p_id:12}，但 DB 函式實際參數名是 p_song_id（見 migration 20261027100100），以 DB 為準
    it('F4 ?id=12 打 admin_get_song，參數名與 DB 函式一致（p_song_id: 12）', async () => {
        const result = { song: { id: 12 }, keys: [], versions: [] };
        route = () => json(result);
        const res = await libGet(ctx(getReq('?id=12')));
        expect(res.status).toBe(200);
        const rpc = rpcCalls('admin_get_song');
        expect(rpc).toHaveLength(1);
        expect(calls).toHaveLength(1);
        expect(rpc[0].body).toEqual({ p_song_id: 12 });
        expect(carries(await res.json(), result)).toBe(true);
    });

    it('F4 ?id 不是正整數（abc、0、1.5、-3）回 400 且不呼叫 fetch', async () => {
        for (const bad of ['abc', '0', '1.5', '-3']) {
            const res = await libGet(ctx(getReq(`?id=${bad}`)));
            expect(res.status, `?id=${bad}`).toBe(400);
        }
        expect(calls).toHaveLength(0);
    });

    it('F4 DB 回 song_not_found 時 ?id= 回 404', async () => {
        route = () => pgErr('song_not_found', 404, 'P0002');
        const res = await libGet(ctx(getReq('?id=999')));
        expect(res.status).toBe(404);
    });
});

describe('F5 POST merge', () => {
    const merged = { song: { id: 2, title: 'T', artist: null, versions: 3 }, source_id: 1, moved_segment_ids: [SEG_ID], moved_keys: 1 };

    it('F5 source／target 不是正整數回 400 且不呼叫 fetch', async () => {
        const bads = [
            { source: 0, target: 2 },
            { source: 1, target: -2 },
            { source: 1.5, target: 2 },
            { source: 'abc', target: 2 },
            { source: 1 },
            { target: 2 },
            { source: null, target: 2 },
        ];
        for (const b of bads) {
            const res = await libPost(ctx(postReq('merge', b)));
            expect(res.status, JSON.stringify(b)).toBe(400);
        }
        const notJson = await libPost(ctx(postReq('merge', 'not json{')));
        expect(notJson.status).toBe(400);
        expect(calls).toHaveLength(0);
    });

    it('F5 成功回 200、原樣帶回 RPC 結果，只打一次 admin_merge_songs 並以 logWarn 記下搬動的片段', async () => {
        route = (url) => (url.includes('/rpc/admin_merge_songs') ? json(merged) : json([{ id: 1 }], 201));
        const res = await libPost(ctx(postReq('merge', { source: 1, target: 2 })));
        await flush();
        expect(res.status).toBe(200);
        expect(carries(await res.json(), merged)).toBe(true);

        const rpc = rpcCalls();
        expect(rpc).toHaveLength(1);
        expect(rpc[0].url.endsWith('/rpc/admin_merge_songs')).toBe(true);
        expect(rpc[0].body).toMatchObject({ p_source: 1, p_target: 2 });
        expect(rpc[0].body.p_allow_artist_mismatch ?? false).toBe(false);

        const logs = logCalls();
        expect(logs).toHaveLength(1);
        expect(logs[0].method).toBe('POST');
        expect(logs[0].body.level).toBe('warn');
        expect(JSON.stringify(logs[0].body)).toContain(SEG_ID);
    });

    it('F5 allow_artist_mismatch: true 轉成 p_allow_artist_mismatch: true', async () => {
        route = (url) => (url.includes('/rpc/admin_merge_songs') ? json(merged) : json([], 201));
        const res = await libPost(ctx(postReq('merge', { source: 1, target: 2, allow_artist_mismatch: true })));
        await flush();
        expect(res.status).toBe(200);
        expect(rpcCalls('admin_merge_songs')[0].body.p_allow_artist_mismatch).toBe(true);
    });

    it('F5 RPC 錯誤對應：song_not_found 404；same_song、artist_mismatch 400；其他 500', async () => {
        const cases: Array<[Response, number]> = [
            [pgErr('song_not_found', 404, 'P0002'), 404],
            [pgErr('same_song', 400), 400],
            [pgErr('artist_mismatch', 400), 400],
            [json({ code: 'XX000', message: 'boom' }, 500), 500],
        ];
        for (const [resp, status] of cases) {
            route = () => resp.clone();
            const res = await libPost(ctx(postReq('merge', { source: 1, target: 2 })));
            expect(res.status, await resp.clone().text()).toBe(status);
        }
        // 失敗的合併不得留下「已搬動」的 warn log（500 的 logError 是應有的錯誤記錄，不算）
        await flush();
        expect(logCalls().filter((c) => c.body?.level === 'warn')).toHaveLength(0);
    });

    it('F5 錯誤回應帶 error 代碼，前端可依代碼顯示訊息', async () => {
        route = () => pgErr('artist_mismatch', 400);
        const res = await libPost(ctx(postReq('merge', { source: 1, target: 2 })));
        expect((await res.json()).error).toBe('artist_mismatch');
    });
});

describe('F6 POST split', () => {
    it('F6 segment_id 不是 uuid 回 400 且不呼叫 fetch', async () => {
        for (const bad of [{}, { segment_id: 'abc' }, { segment_id: '-'.repeat(36) }, { segment_id: 12 }, { segment_id: null }]) {
            const res = await libPost(ctx(postReq('split', bad)));
            expect(res.status, JSON.stringify(bad)).toBe(400);
        }
        expect(calls).toHaveLength(0);
    });

    it('F6 成功回 200、原樣帶回結果，只打一次 admin_split_segment 並帶 p_segment_id', async () => {
        const result = { song: { id: 9 }, from_song: { id: 2 }, segment_id: SEG_ID };
        route = () => json(result);
        const res = await libPost(ctx(postReq('split', { segment_id: SEG_ID })));
        await flush();
        expect(res.status).toBe(200);
        expect(carries(await res.json(), result)).toBe(true);
        expect(rpcCalls()).toHaveLength(1);
        expect(rpcCalls('admin_split_segment')[0].body).toEqual({ p_segment_id: SEG_ID });
    });

    it('F6 segment_not_found 回 404；already_single 回 409', async () => {
        route = () => pgErr('segment_not_found', 404, 'P0002');
        const nf = await libPost(ctx(postReq('split', { segment_id: SEG_ID })));
        expect(nf.status).toBe(404);

        route = () => pgErr('already_single', 400);
        const single = await libPost(ctx(postReq('split', { segment_id: SEG_ID })));
        expect(single.status).toBe(409);
        expect((await single.json()).error).toBe('already_single');
    });
});

describe('F7 POST rename', () => {
    it('F7 title 空、全空白、超過 200 字，或 artist 超過 200 字，或 id 非正整數：回 400 且不呼叫 fetch', async () => {
        const bads = [
            { id: 1, title: '', artist: null },
            { id: 1, title: '   ', artist: null },
            { id: 1, title: 'x'.repeat(201), artist: null },
            { id: 1, title: 'ok', artist: 'x'.repeat(201) },
            { id: 1, artist: null },
            { id: 0, title: 'ok', artist: null },
            { id: 'abc', title: 'ok', artist: null },
        ];
        for (const b of bads) {
            const res = await libPost(ctx(postReq('rename', b)));
            expect(res.status, JSON.stringify(b).slice(0, 80)).toBe(400);
        }
        expect(calls).toHaveLength(0);
    });

    it('F7 恰好 200 字的 title 與 artist 通過', async () => {
        route = () => json({ song: { id: 1 }, key_added: true });
        const res = await libPost(ctx(postReq('rename', { id: 1, title: 'x'.repeat(200), artist: 'y'.repeat(200) })));
        expect(res.status).toBe(200);
    });

    it('F7 成功回 200，只打一次 admin_rename_song，帶 p_song_id／p_title／p_artist；沒帶 artist 時明確送 null', async () => {
        const result = { song: { id: 5, title: '新名', artist: '原唱', versions: 2 }, key_added: true };
        route = () => json(result);
        const res = await libPost(ctx(postReq('rename', { id: 5, title: '新名', artist: '原唱' })));
        expect(res.status).toBe(200);
        expect(carries(await res.json(), result)).toBe(true);
        expect(rpcCalls()).toHaveLength(1);
        expect(rpcCalls('admin_rename_song')[0].body).toEqual({ p_song_id: 5, p_title: '新名', p_artist: '原唱' });

        calls = [];
        await libPost(ctx(postReq('rename', { id: 5, title: '新名' })));
        const body = rpcCalls('admin_rename_song')[0].body;
        // DB 函式 p_artist 沒有預設值，缺了 PostgREST 會找不到函式，必須明確送 null
        expect(body.p_artist).toBeNull();
    });

    it('F7 key_taken 回 409；song_not_found 回 404；invalid_title 回 400', async () => {
        route = () => pgErr('key_taken', 400);
        const taken = await libPost(ctx(postReq('rename', { id: 5, title: '新名', artist: null })));
        expect(taken.status).toBe(409);
        expect((await taken.json()).error).toBe('key_taken');

        route = () => pgErr('song_not_found', 404, 'P0002');
        const nf = await libPost(ctx(postReq('rename', { id: 5, title: '新名', artist: null })));
        expect(nf.status).toBe(404);

        route = () => pgErr('invalid_title', 400);
        const inv = await libPost(ctx(postReq('rename', { id: 5, title: '新名', artist: null })));
        expect(inv.status).toBe(400);
    });
});

describe('F8 POST match', () => {
    const items = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `歌${i}`, original_artist: i % 2 ? '原唱' : null }));

    it('F8 超過 200 項回 400 且不呼叫 fetch；items 不是陣列也回 400', async () => {
        const over = await libPost(ctx(postReq('match', { items: items(201) })));
        expect(over.status).toBe(400);
        const notArr = await libPost(ctx(postReq('match', { items: 'x' })));
        expect(notArr.status).toBe(400);
        const missing = await libPost(ctx(postReq('match', {})));
        expect(missing.status).toBe(400);
        expect(calls).toHaveLength(0);
    });

    it('F8 正常時只打一次 admin_match_songs，p_items 與輸入原樣相同（含恰好 200 項）', async () => {
        const result = [{ status: 'existing', song_id: 1, song: { id: 1 }, similar: [] }];
        route = () => json(result);
        const input = [{ segment_id: SEG_ID, title: '歌', original_artist: '原唱' }, { title: '另一首', original_artist: null }];
        const res = await libPost(ctx(postReq('match', { items: input })));
        expect(res.status).toBe(200);
        expect(carries(await res.json(), result)).toBe(true);
        expect(rpcCalls()).toHaveLength(1);
        expect(rpcCalls('admin_match_songs')[0].body).toEqual({ p_items: input });

        calls = [];
        const max = items(200);
        const edge = await libPost(ctx(postReq('match', { items: max })));
        expect(edge.status).toBe(200);
        expect(rpcCalls('admin_match_songs')[0].body.p_items).toEqual(max);
    });

    it('F8 RPC 回 invalid_items、too_many_items 時回 400', async () => {
        route = () => pgErr('invalid_items', 400);
        const a = await libPost(ctx(postReq('match', { items: items(1) })));
        expect(a.status).toBe(400);
        route = () => pgErr('too_many_items', 400);
        const b = await libPost(ctx(postReq('match', { items: items(1) })));
        expect(b.status).toBe(400);
    });
});

describe('F9 驗證、no-store、未知 action', () => {
    it('F9 沒帶或帶錯管理 token：GET 與所有 POST action 都回 401 且不碰 DB', async () => {
        for (const headers of [{}, { 'X-Admin-Token': 'wrong' }]) {
            expect((await libGet(ctx(getReq('?q=foo', headers)))).status).toBe(401);
            expect((await libGet(ctx(getReq('?view=duplicates', headers)))).status).toBe(401);
            expect((await libGet(ctx(getReq('?id=1', headers)))).status).toBe(401);
            for (const [action, payload] of [
                ['merge', { source: 1, target: 2 }],
                ['split', { segment_id: SEG_ID }],
                ['rename', { id: 1, title: 'a', artist: null }],
                ['match', { items: [] }],
            ] as const) {
                const res = await libPost(ctx(postReq(action, payload, headers)));
                expect(res.status, `${action} ${JSON.stringify(headers)}`).toBe(401);
            }
        }
        expect(calls).toHaveLength(0);
    });

    it('F9 所有成功回應的 Cache-Control 含 no-store', async () => {
        route = (url) => {
            if (url.includes('/rpc/admin_merge_songs')) return json({ song: { id: 2 }, source_id: 1, moved_segment_ids: [], moved_keys: 0 });
            if (url.includes('/rpc/admin_split_segment')) return json({ song: { id: 3 }, from_song: { id: 2 }, segment_id: SEG_ID });
            if (url.includes('/rpc/admin_rename_song')) return json({ song: { id: 1 }, key_added: false });
            if (url.includes('/rpc/admin_get_song')) return json({ song: { id: 1 }, keys: [], versions: [] });
            if (url.includes('/rest/v1/system_logs')) return json([], 201);
            return json([]);
        };
        const responses = [
            await libGet(ctx(getReq('?q=foo'))),
            await libGet(ctx(getReq('?view=duplicates'))),
            await libGet(ctx(getReq('?id=1'))),
            await libPost(ctx(postReq('merge', { source: 1, target: 2 }))),
            await libPost(ctx(postReq('split', { segment_id: SEG_ID }))),
            await libPost(ctx(postReq('rename', { id: 1, title: 'a', artist: null }))),
            await libPost(ctx(postReq('match', { items: [{ title: 'a', original_artist: null }] }))),
        ];
        await flush();
        for (const res of responses) {
            expect(res.status).toBe(200);
            expect(res.headers.get('Cache-Control') ?? '').toContain('no-store');
        }
    });

    it('F9 未知或缺少 action 回 400 且不呼叫 fetch', async () => {
        const unknown = await libPost(ctx(postReq('drop_everything', {})));
        expect(unknown.status).toBe(400);
        const none = await libPost(
            ctx(new Request(LIB, { method: 'POST', headers: { 'X-Admin-Token': 't', 'Content-Type': 'application/json' }, body: '{}' })),
        );
        expect(none.status).toBe(400);
        expect(calls).toHaveLength(0);
    });
});

// ================= F10：公開目錄 v2 =================
describe('F10 GET /api/songs/catalog v2', () => {
    const CATALOG_V2 = [
        { v: VIDEO_ID, t: '歌回', d: null, vt: null, s: [['abcd1234', 0, 100, '歌', null, 7, '備註', 1]] },
        // 尾端字典
        { songs: [[1, '歌', null]] },
    ];

    beforeEach(() => {
        resetSongCatalogMemo();
    });

    it('F10 edge 快取鍵包含 catalog/v2（舊 v1 快取不得被當成新格式回傳）', async () => {
        const matchSpy = vi.fn(async () => undefined);
        const putSpy = vi.fn(async () => undefined);
        vi.stubGlobal('caches', { default: { match: matchSpy, put: putSpy } });
        route = () => json(CATALOG_V2);
        const res = await catalogGet({
            request: new Request('https://multistreaming.org/api/songs/catalog'),
            env: ENV(),
            waitUntil: (p: Promise<unknown>) => void pending.push(p),
        });
        await flush();
        expect(res.status).toBe(200);
        const keyOf = (spy: ReturnType<typeof vi.fn>) => String((spy.mock.calls[0][0] as Request).url);
        expect(matchSpy).toHaveBeenCalledTimes(1);
        expect(keyOf(matchSpy)).toContain('catalog/v2');
        expect(keyOf(matchSpy)).not.toContain('catalog/v1');
        expect(putSpy).toHaveBeenCalledTimes(1);
        expect(keyOf(putSpy)).toContain('catalog/v2');
        vi.unstubAllGlobals();
    });

    it('F10 RPC 回帶尾端字典的陣列時原樣轉傳', async () => {
        route = () => json(CATALOG_V2);
        const res = await catalogGet({
            request: new Request('https://multistreaming.org/api/songs/catalog'),
            env: ENV(),
            waitUntil: () => {},
        });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual(CATALOG_V2);
    });
});
