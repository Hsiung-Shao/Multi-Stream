// 歌回社群直接編輯（後端）：投稿驗證、POST /api/songs/submissions（呼叫 RPC 立即生效）、管理端修改紀錄／還原／鎖定
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { parseSubmissionBody, SUBMISSION_SEGMENTS_MAX } from '../../functions/lib/song-submissions.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestPost as submitPost } from '../../functions/api/songs/submissions.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestGet as adminGet, onRequestPost as adminPost } from '../../functions/api/admin/song-submissions.js';

const VIDEO = 'dQw4w9WgXcQ';
const IP = '203.0.113.9';
const SUB_ID = '44444444-4444-4444-8444-444444444444';
const REF = '55555555-5555-4555-8555-555555555555';
const REV = '2026-10-28T01:02:03.456+00:00';

const seg = (start: number, end: number | null, title = `歌${start}`, extra: Record<string, unknown> = {}) => ({ start, end, title, ...extra });
const sub = (over: Record<string, unknown> = {}) => ({
    videoId: VIDEO,
    title: '歌回 #1',
    vtuberId: REF,
    streamedAt: null,
    rev: null,
    durationSeconds: null,
    segments: [seg(0, 100, 'A', { artist: '原唱' }), seg(100, 200, 'B')],
    note: '來源：置頂留言',
    contact: 'a@b.c',
    turnstileToken: 'tok',
    ...over,
});

// ---------- parseSubmissionBody ----------
describe('parseSubmissionBody', () => {
    it('合法輸入：片段依 start 排序、endEstimated 轉 boolean、artist 空字串轉 null、空 note 轉 null', () => {
        expect(SUBMISSION_SEGMENTS_MAX).toBe(200);
        const r = parseSubmissionBody(sub({
            segments: [seg(100, 200, 'B', { artist: '' }), seg(0, 100, 'A', { endEstimated: true })],
            note: '',
        }));
        expect(r.error).toBeUndefined();
        expect(r.value.videoId).toBe(VIDEO);
        expect(r.value.segments.map((s: { title: string }) => s.title)).toEqual(['A', 'B']);
        expect(r.value.segments[0].endEstimated).toBe(true);
        expect(r.value.segments[1].endEstimated).toBe(false);
        expect(r.value.segments[1].artist).toBeNull();
        expect(r.value.note).toBeNull();
    });

    it('影片 ID 不合法 → invalid_video_id；body 不是物件 → invalid_payload', () => {
        expect(parseSubmissionBody(sub({ videoId: 'bad' })).error).toBe('invalid_video_id');
        expect(parseSubmissionBody(null).error).toBe('invalid_payload');
    });

    it('片段帶 id、缺 end、非整數 → 拒絕且不給 value', () => {
        const withId = parseSubmissionBody(sub({ segments: [seg(0, 10, 'A', { id: '11111111-1111-4111-8111-111111111111' })] }));
        expect(withId.error).toBe('invalid_payload');
        for (const bad of [seg(0, null), seg(0.5, 10), { start: 0, title: 'A' }]) {
            const r = parseSubmissionBody(sub({ segments: [bad] }));
            expect(['invalid_payload', 'invalid_segments']).toContain(r.error);
            expect(r.value).toBeUndefined();
        }
    });

    it('重疊 → invalid_segments 並附 issues', () => {
        const r = parseSubmissionBody(sub({ segments: [seg(0, 100), seg(50, 150)] }));
        expect(r.error).toBe('invalid_segments');
        expect(r.issues.length).toBeGreaterThan(0);
    });

    it('片段 0 個或超過 200 個、備註超過 300、聯絡超過 200 → 拒絕', () => {
        expect(parseSubmissionBody(sub({ segments: [] })).error).toBeTruthy();
        const many = Array.from({ length: 201 }, (_, i) => seg(i * 10, i * 10 + 5));
        expect(parseSubmissionBody(sub({ segments: many })).error).toBeTruthy();
        expect(parseSubmissionBody(sub({ note: 'x'.repeat(301) })).error).toBe('invalid_payload');
        expect(parseSubmissionBody(sub({ contact: 'x'.repeat(201) })).error).toBe('invalid_payload');
    });

    it('vtuberId 必須是嚴格 UUID（轉小寫），streamedAt 必須可解析', () => {
        expect(parseSubmissionBody(sub({ vtuberId: '-'.repeat(36) })).error).toBe('invalid_payload');
        expect(parseSubmissionBody(sub({ vtuberId: REF.toUpperCase() })).value.vtuberId).toBe(REF);
        expect(parseSubmissionBody(sub({ streamedAt: 'not a date' })).error).toBe('invalid_payload');
    });

    it('片段可帶合法 code（8 碼 [0-9a-z]）並保留；沒帶 code 的片段不會憑空多出 code', () => {
        const r = parseSubmissionBody(sub({ segments: [seg(0, 100, 'A', { code: 'abcd1234' }), seg(100, 200, 'B')] }));
        expect(r.error).toBeUndefined();
        expect(r.value.segments[0].code).toBe('abcd1234');
        expect(r.value.segments[1].code ?? null).toBeNull();
    });

    it('片段 code 不合法（大寫、長度錯、含符號）→ invalid_payload；有 code 仍不可再帶 id', () => {
        for (const code of ['ABCD1234', 'abcd123', 'abcd12345', 'abcd-123']) {
            expect(parseSubmissionBody(sub({ segments: [seg(0, 100, 'A', { code })] })).error, code).toBe('invalid_payload');
        }
        expect(parseSubmissionBody(sub({ segments: [seg(0, 100, 'A', { code: 'abcd1234', id: REF })] })).error).toBe('invalid_payload');
    });

    it('rev 為字串時原樣保留、沒給則為 null；修正（有 rev）時 vtuberId 可為 null', () => {
        const withRev = parseSubmissionBody(sub({ rev: REV, vtuberId: null }));
        expect(withRev.error).toBeUndefined();
        expect(withRev.value.rev).toBe(REV);
        expect(withRev.value.vtuberId).toBeNull();
        expect(parseSubmissionBody(sub()).value.rev).toBeNull();
    });

    it('durationSeconds 整數 1～86400 保留；超出、小數、非數字 → invalid_payload；null 保留 null', () => {
        expect(parseSubmissionBody(sub({ durationSeconds: 1 })).value.durationSeconds).toBe(1);
        expect(parseSubmissionBody(sub({ durationSeconds: 86400 })).value.durationSeconds).toBe(86400);
        expect(parseSubmissionBody(sub({ durationSeconds: null })).value.durationSeconds).toBeNull();
        for (const bad of [0, -5, 86401, 1.5, '600']) {
            expect(parseSubmissionBody(sub({ durationSeconds: bad })).error, String(bad)).toBe('invalid_payload');
        }
    });

    it('新歌回（rev 為 null）且沒選 VTuber → vtuber_required', () => {
        expect(parseSubmissionBody(sub({ rev: null, vtuberId: null })).error).toBe('vtuber_required');
    });
});

// ---------- 端點共用 mock ----------
function memKv() {
    const m = new Map<string, string>();
    return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => void m.set(k, v), _m: m };
}
type Call = { method: string; url: string; body: any };
let calls: Call[] = [];
let sb: (method: string, path: string, body: any) => Response;
const sbCalls = () => calls.filter((c) => c.url.startsWith('http://sb/'));

const ENV = (extra: Record<string, unknown> = {}) => ({
    SUPABASE_URL: 'http://sb',
    SUPABASE_SERVICE_ROLE_KEY: 'k',
    RATE_LIMIT_KV: memKv(),
    ENFORCE_TURNSTILE: 'true',
    TURNSTILE_SECRET_KEY: 's',
    IP_HASH_SALT: 'salt',
    ADMIN_API_TOKEN: 'admintoken',
    ...extra,
});

// PostgREST 的 RPC 成功回應（community_save_song_video 回 json 物件）
const saveOk = (kind: 'new' | 'revision' = 'new') =>
    new Response(JSON.stringify({ kind, video_ref: REF, rev: REV, submission_id: SUB_ID }), { status: 200 });
// PostgREST 的 RPC 錯誤格式：raise exception 'xxx' using errcode = 'P0001' → HTTP 400 {code, message}
const rpcErr = (message: string, code = 'P0001', status = 400) => new Response(JSON.stringify({ code, message }), { status });

beforeEach(() => {
    calls = [];
    sb = (method) => (method === 'GET' ? new Response('[]') : saveOk());
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const raw = typeof init?.body === 'string' ? init.body : null;
        const parsed = raw && (raw.startsWith('{') || raw.startsWith('[')) ? JSON.parse(raw) : raw;
        calls.push({ method, url, body: parsed });
        if (url.startsWith('https://challenges.cloudflare.com')) return new Response(JSON.stringify({ success: true }));
        if (url.startsWith('http://sb/rest/v1/')) return sb(method, url.slice('http://sb/rest/v1/'.length), parsed);
        throw new Error(`unexpected fetch ${url}`);
    }));
});
afterEach(() => vi.unstubAllGlobals());

// ---------- POST /api/songs/submissions ----------
const submitReq = (b: unknown, headers: Record<string, string | null> = {}) => {
    const h: Record<string, string | null> = {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': IP,
        Origin: 'https://multistreaming.org',
        ...headers,
    };
    const clean = Object.fromEntries(Object.entries(h).filter(([, v]) => v !== null)) as Record<string, string>;
    return new Request('https://multistreaming.org/api/songs/submissions', { method: 'POST', headers: clean, body: JSON.stringify(b) });
};
const pending: Promise<unknown>[] = [];
const submit = (b: unknown, env = ENV(), headers: Record<string, string | null> = {}) =>
    submitPost({ request: submitReq(b, headers), env, waitUntil: (p: Promise<unknown>) => void pending.push(p) });
const flush = async () => {
    await Promise.allSettled(pending.splice(0));
};
const rpcCalls = () => sbCalls().filter((c) => c.url.includes('rpc/community_save_song_video'));
// 查影片是否存在（新歌回配額）回「不存在」，其餘照 r：讓只關心 RPC 回應的測試不受這次查詢影響
const afterLookup = (r: () => Response) => (method: string, path: string) =>
    method === 'GET' && path.startsWith('song_videos') ? new Response('[]') : r();

describe('POST /api/songs/submissions', () => {
    it('擋非法投稿不寫 DB：重疊、缺 end、片段帶 id、影片 ID 錯、新歌回沒選 VTuber → 400', async () => {
        const cases: Array<[unknown, string[]]> = [
            [sub({ segments: [seg(0, 100), seg(50, 150)] }), ['invalid_segments']],
            [sub({ segments: [seg(0, null)] }), ['invalid_segments', 'invalid_payload']],
            [sub({ segments: [seg(0, 10, 'A', { id: REF })] }), ['invalid_payload']],
            [sub({ videoId: 'bad' }), ['invalid_video_id']],
            [sub({ rev: null, vtuberId: null }), ['vtuber_required']],
        ];
        for (const [b, errors] of cases) {
            const res = await submit(b);
            expect(res.status, JSON.stringify(b)).toBe(400);
            expect(errors).toContain((await res.json()).error);
        }
        expect(sbCalls()).toHaveLength(0);
    });

    it('F1 新歌回成功：只打一次 RPC community_save_song_video，帶完整 p_* 參數，不再寫 song_submissions 表', async () => {
        const res = await submit(sub({
            streamedAt: '2026-10-01T12:00:00Z',
            durationSeconds: 5400,
            segments: [seg(100, 200, 'B', { versionNote: '現場版' }), seg(0, 100, 'A', { artist: '原唱', code: 'abcd1234' })],
        }));
        expect(res.status).toBe(201);
        expect(await res.json()).toMatchObject({ ok: true, id: SUB_ID, kind: 'new' });

        // 寫入只有一次 RPC（影片是否存在的 song_videos 查詢另計，見「新歌回全站配額」）；不 POST song_submissions
        expect(sbCalls().filter((c) => !c.url.includes('song_videos'))).toHaveLength(1);
        expect(rpcCalls()).toHaveLength(1);
        expect(sbCalls().some((c) => c.url.includes('song_submissions'))).toBe(false);

        const body = rpcCalls()[0].body;
        expect(rpcCalls()[0].method).toBe('POST');
        expect(body.p_video_id).toBe(VIDEO);
        expect(body.p_rev).toBeNull();
        expect(body.p_video).toEqual({
            title: '歌回 #1',
            vtuber_id: REF,
            streamed_at: '2026-10-01T12:00:00.000Z',
            duration_seconds: 5400,
        });
        // 片段依 start 排序、position 從 0 起算；有 code 才帶 code
        expect(body.p_segments).toHaveLength(2);
        expect(body.p_segments[0]).toMatchObject({
            code: 'abcd1234', start_seconds: 0, end_seconds: 100, title: 'A', original_artist: '原唱', version_note: null, position: 0,
        });
        expect(body.p_segments[1]).toMatchObject({
            start_seconds: 100, end_seconds: 200, title: 'B', original_artist: null, version_note: '現場版', position: 1,
        });
        expect('code' in body.p_segments[1] && body.p_segments[1].code != null).toBe(false);
        // meta：只存雜湊 IP，不存原始 IP
        expect(body.p_meta).toMatchObject({ source_note: '來源：置頂留言', submitter_contact: 'a@b.c' });
        expect(body.p_meta.ip_hash).toBeTruthy();
        expect(body.p_meta.ip_hash).not.toBe(IP);
        expect(JSON.stringify(body)).not.toContain(IP);
    });

    it('F1 修正既有歌回：p_rev 帶使用者載入時的 rev，成功回 kind revision', async () => {
        sb = () => saveOk('revision');
        const res = await submit(sub({ rev: REV, vtuberId: null }));
        expect(res.status).toBe(201);
        expect(await res.json()).toMatchObject({ ok: true, id: SUB_ID, kind: 'revision' });
        expect(rpcCalls()).toHaveLength(1);
        expect(rpcCalls()[0].body.p_rev).toBe(REV);
        expect(rpcCalls()[0].body.p_video.vtuber_id).toBeNull();
    });

    it('F2 RPC 錯誤對應：stale_edit／video_exists → 409', async () => {
        for (const message of ['stale_edit', 'video_exists']) {
            sb = afterLookup(() => rpcErr(message));
            const res = await submit(sub());
            expect(res.status, message).toBe(409);
            expect((await res.json()).error, message).toBe(message);
        }
    });

    it('F2 RPC 錯誤對應：cannot_delete／unknown_segment／vtuber_required → 400', async () => {
        for (const message of ['cannot_delete', 'unknown_segment', 'vtuber_required']) {
            sb = afterLookup(() => rpcErr(message));
            const res = await submit(sub());
            expect(res.status, message).toBe(400);
            expect((await res.json()).error, message).toBe(message);
        }
    });

    it('F2 RPC 錯誤對應：video_locked → 403', async () => {
        sb = afterLookup(() => rpcErr('video_locked'));
        const res = await submit(sub({ rev: REV }));
        expect(res.status).toBe(403);
        expect((await res.json()).error).toBe('video_locked');
    });

    it('F2 其他 RPC 失敗（未知訊息、DB 掛掉）→ 500 save_failed，且只打過一次 RPC', async () => {
        sb = afterLookup(() => rpcErr('something_else'));
        const unknown = await submit(sub());
        expect(unknown.status).toBe(500);
        expect((await unknown.json()).error).toBe('save_failed');

        calls = [];
        sb = afterLookup(() => new Response('boom', { status: 500 }));
        const down = await submit(sub());
        expect(down.status).toBe(500);
        expect((await down.json()).error).toBe('save_failed');
        expect(rpcCalls()).toHaveLength(1);
    });

    it('F3 成功時刪除本機房的 catalog v2 邊緣快取', async () => {
        const del = vi.fn(async () => true);
        vi.stubGlobal('caches', { default: { delete: del } });
        const res = await submit(sub());
        await flush();
        expect(res.status).toBe(201);
        expect(del).toHaveBeenCalled();
        const key = (a: unknown) => (a instanceof Request ? a.url : String(a));
        expect(key(del.mock.calls[0][0])).toContain('catalog/v2');
    });

    it('F3 寫入失敗（RPC 錯誤）時不刪目錄快取', async () => {
        const del = vi.fn(async () => true);
        vi.stubGlobal('caches', { default: { delete: del } });
        sb = afterLookup(() => rpcErr('stale_edit'));
        const res = await submit(sub());
        await flush();
        expect(res.status).toBe(409);
        expect(del).not.toHaveBeenCalled();
    });

    it('F3 刪快取本身失敗不影響投稿成功', async () => {
        vi.stubGlobal('caches', { default: { delete: vi.fn(async () => { throw new Error('cache down'); }) } });
        const res = await submit(sub());
        await flush();
        expect(res.status).toBe(201);
    });

    it('走 guardSubmission：無來源標頭 403、未設 IP_HASH_SALT 503，皆不寫 DB', async () => {
        const noOrigin = await submit(sub(), ENV(), { Origin: null });
        expect(noOrigin.status).toBe(403);
        const noSalt = await submit(sub(), ENV({ IP_HASH_SALT: undefined }));
        expect(noSalt.status).toBe(503);
        expect(sbCalls()).toHaveLength(0);
    });

    it('驗證失敗 400 不耗配額；緊急開關 503', async () => {
        const env = ENV();
        await submit(sub({ videoId: 'bad' }), env);
        expect(env.RATE_LIMIT_KV._m.size).toBe(0);
        expect((await submit(sub(), ENV({ SUBMISSIONS_DISABLED: 'true' }))).status).toBe(503);
    });

    it('每 IP 每小時 3 次，第 4 次 429', async () => {
        const env = ENV();
        for (let i = 0; i < 3; i++) expect((await submit(sub(), env)).status).toBe(201);
        expect((await submit(sub(), env)).status).toBe(429);
    });
});

// ---------- 新歌回全站配額 ----------
describe('POST /api/songs/submissions：新歌回全站每小時配額', () => {
    const NOW = new Date('2026-10-28T05:30:00Z');
    const NEW_KEY = 'songs:new:g:2026102805';
    const videoLookups = () => sbCalls().filter((c) => c.method === 'GET' && c.url.includes('song_videos'));
    const videoExists = () => {
        sb = (method, path) => {
            if (method === 'GET' && path.startsWith('song_videos')) return new Response(JSON.stringify([{ id: REF }]));
            return method === 'GET' ? new Response('[]') : saveOk('revision');
        };
    };

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(NOW);
    });
    afterEach(() => vi.useRealTimers());

    it('A1 新歌回且本小時新歌回已滿 20 → 429 rate_limited，不呼叫 RPC', async () => {
        const env = ENV();
        env.RATE_LIMIT_KV._m.set(NEW_KEY, '20');
        const res = await submit(sub(), env);
        expect(res.status).toBe(429);
        expect(await res.json()).toEqual({ ok: false, error: 'rate_limited' });
        expect(rpcCalls()).toHaveLength(0);
    });

    it('A2 既有影片的修正即使新歌回配額已滿 → 仍 201 並呼叫 RPC，且不增加新歌回計數', async () => {
        videoExists();
        const env = ENV();
        env.RATE_LIMIT_KV._m.set(NEW_KEY, '20');
        const res = await submit(sub({ rev: REV, vtuberId: null }), env);
        expect(res.status).toBe(201);
        expect(rpcCalls()).toHaveLength(1);
        expect(env.RATE_LIMIT_KV._m.get(NEW_KEY)).toBe('20');
    });

    it('A2 既有影片的修正不會在新歌回 key 上建立計數', async () => {
        videoExists();
        const env = ENV();
        expect((await submit(sub({ rev: REV, vtuberId: null }), env)).status).toBe(201);
        expect(env.RATE_LIMIT_KV._m.has(NEW_KEY)).toBe(false);
    });

    it('A3 body 帶 rev 但影片其實不存在（冒充修正）→ 仍算新歌回，配額已滿時 429 且不呼叫 RPC', async () => {
        const env = ENV();
        env.RATE_LIMIT_KV._m.set(NEW_KEY, '20');
        const res = await submit(sub({ rev: REV, vtuberId: null }), env);
        expect(res.status).toBe(429);
        expect((await res.json()).error).toBe('rate_limited');
        expect(rpcCalls()).toHaveLength(0);
    });

    it('A4 新歌回成功 → 本小時新歌回計數 +1，且以 ttl 3700 秒寫入', async () => {
        const env = ENV();
        const put = vi.spyOn(env.RATE_LIMIT_KV, 'put');
        env.RATE_LIMIT_KV._m.set(NEW_KEY, '7');
        const res = await submit(sub(), env);
        expect(res.status).toBe(201);
        expect(env.RATE_LIMIT_KV._m.get(NEW_KEY)).toBe('8');
        expect(put).toHaveBeenCalledWith(NEW_KEY, '8', { expirationTtl: 3700 });
    });

    it('A4 新歌回計數是整站共用：不同 IP 的新歌回都累加到同一個 key', async () => {
        const env = ENV();
        expect((await submit(sub(), env, { 'CF-Connecting-IP': '203.0.113.1' })).status).toBe(201);
        expect((await submit(sub(), env, { 'CF-Connecting-IP': '203.0.113.2' })).status).toBe(201);
        expect(env.RATE_LIMIT_KV._m.get(NEW_KEY)).toBe('2');
    });

    it('A5 通過 guard 後才查影片：用 song_videos?video_id=eq.<id> 只 select id', async () => {
        await submit(sub(), ENV());
        expect(videoLookups()).toHaveLength(1);
        const url = videoLookups()[0].url;
        expect(url).toContain(`video_id=eq.${VIDEO}`);
        expect(url).toMatch(/select=id(&|$)/);
    });

    it('A5 驗證失敗（400）時不查影片、不碰新歌回配額', async () => {
        const env = ENV();
        expect((await submit(sub({ videoId: 'bad' }), env)).status).toBe(400);
        expect(videoLookups()).toHaveLength(0);
        expect(env.RATE_LIMIT_KV._m.has(NEW_KEY)).toBe(false);
    });

    it('A6 查影片是否存在失敗（PostgREST 500）→ 500 save_failed 且不呼叫 RPC', async () => {
        sb = (method, path) =>
            method === 'GET' && path.startsWith('song_videos') ? new Response('boom', { status: 500 }) : saveOk();
        const res = await submit(sub(), ENV());
        expect(res.status).toBe(500);
        expect((await res.json()).error).toBe('save_failed');
        expect(rpcCalls()).toHaveLength(0);
    });
});

// ---------- /api/admin/song-submissions（修改紀錄／還原／鎖定） ----------
const adminReq = (query: string, b?: unknown, token: string | null = 'admintoken', method = 'POST') => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['X-Admin-Token'] = token;
    return new Request(`https://multistreaming.org/api/admin/song-submissions${query}`, {
        method,
        headers,
        body: b === undefined ? undefined : JSON.stringify(b),
    });
};
const adminList = () => adminGet({ request: adminReq('', undefined, 'admintoken', 'GET'), env: ENV() });

const segRow = (code: string, start: number, end: number, title: string) => ({
    code, start_seconds: start, end_seconds: end, title, original_artist: null, version_note: null,
});
const beforeSnap = (segs: ReturnType<typeof segRow>[]) => ({
    video: { title: '歌回 #1', vtuber_id: REF, streamed_at: null, duration_seconds: 5400 },
    segments: segs.map((s, i) => ({ id: `s${i}`, position: i, ...s })),
});
const logRow = (over: Record<string, unknown>) => ({
    id: SUB_ID,
    kind: 'revision',
    video_id: VIDEO,
    title: '歌回 #1',
    status: 'applied',
    created_at: '2026-10-28T02:00:00Z',
    reverted_at: null,
    target_video_ref: REF,
    before: null,
    segments: [],
    ...over,
});

describe('GET /api/admin/song-submissions（社群修改紀錄）', () => {
    it('F5 未帶或帶錯管理 token 一律 401，且不碰 DB', async () => {
        const get = await adminGet({ request: adminReq('', undefined, null, 'GET'), env: ENV() });
        expect(get.status).toBe(401);
        const wrong = await adminGet({ request: adminReq('', undefined, 'bad', 'GET'), env: ENV() });
        expect(wrong.status).toBe(401);
        expect(sbCalls()).toHaveLength(0);
    });

    it('F5 查最近 50 筆 applied／reverted 紀錄（新到舊），不再列待審', async () => {
        await adminList();
        const url = sbCalls()[0].url;
        expect(url).toContain('song_submissions');
        expect(url).toContain('applied');
        expect(url).toContain('reverted');
        expect(url).not.toContain('status=eq.pending');
        expect(url).toContain('order=created_at.desc');
        expect(url).toContain('limit=50');
    });

    it('F5 summary 依 before 與送出的片段計算：before 兩段、送出三段且其中一段時間有改 → added 1、changed 1', async () => {
        const before = beforeSnap([segRow('aaaaaaaa', 0, 100, 'A'), segRow('bbbbbbbb', 100, 200, 'B')]);
        sb = (_m, path) =>
            path.startsWith('song_submissions')
                ? new Response(JSON.stringify([
                    logRow({
                        before,
                        segments: [
                            segRow('aaaaaaaa', 0, 100, 'A'), // 沒變
                            segRow('bbbbbbbb', 100, 250, 'B'), // 結束時間改了
                            { start_seconds: 250, end_seconds: 300, title: 'C', original_artist: null, version_note: null }, // 新增（沒有 code）
                        ],
                    }),
                ]))
                : new Response('[]');
        const res = await adminList();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.ok).toBe(true);
        expect(json.submissions).toHaveLength(1);
        const row = json.submissions[0];
        expect(row).toMatchObject({
            id: SUB_ID, kind: 'revision', video_id: VIDEO, title: '歌回 #1', status: 'applied', target_video_ref: REF, reverted_at: null,
        });
        expect(row.summary.added).toBe(1);
        expect(row.summary.changed).toBe(1);
        expect(Array.isArray(row.summary.fields)).toBe(true);
    });

    it('F5 只改歌名（時間沒動）也算 changed 1，fields 含 segments', async () => {
        const before = beforeSnap([segRow('aaaaaaaa', 0, 100, 'A'), segRow('bbbbbbbb', 100, 200, 'B')]);
        sb = (_m, path) =>
            path.startsWith('song_submissions')
                ? new Response(JSON.stringify([
                    logRow({ before, segments: [segRow('aaaaaaaa', 0, 100, 'A改名'), segRow('bbbbbbbb', 100, 200, 'B')] }),
                ]))
                : new Response('[]');
        const row = (await (await adminList()).json()).submissions[0];
        expect(row.summary.added).toBe(0);
        expect(row.summary.changed).toBe(1);
        expect(row.summary.fields).toContain('segments');
    });

    it('F5 開台時間只差在毫秒以下（.679176 vs .679）不算改了 streamed_at；真的改了才算', async () => {
        const segs = [segRow('aaaaaaaa', 0, 100, 'A')];
        const before = { ...beforeSnap(segs), video: { title: '歌回 #1', vtuber_id: REF, streamed_at: '2026-10-23T09:39:07.679176+00:00', duration_seconds: 5400 } };
        const run = async (streamed_at: string) => {
            sb = (_m, path) =>
                path.startsWith('song_submissions')
                    ? new Response(JSON.stringify([logRow({ before, segments: segs, vtuber_id: REF, streamed_at })]))
                    : new Response('[]');
            return (await (await adminList()).json()).submissions[0].summary.fields as string[];
        };
        expect(await run('2026-10-23T09:39:07.679Z')).not.toContain('streamed_at');
        expect(await run('2026-10-23T09:39:08.679Z')).toContain('streamed_at');
    });

    it('F5 VTuber 沒換（before 與紀錄的 vtuber_id 相同）時 fields 不含 vtuber_id；換人才含', async () => {
        const segs = [segRow('aaaaaaaa', 0, 100, 'A')];
        const OTHER = '66666666-6666-4666-8666-666666666666';
        const run = async (vtuber_id: string | null) => {
            sb = (_m, path) =>
                path.startsWith('song_submissions')
                    ? new Response(JSON.stringify([logRow({ before: beforeSnap(segs), segments: segs, vtuber_id })]))
                    : new Response('[]');
            return (await (await adminList()).json()).submissions[0].summary.fields as string[];
        };
        expect(await run(REF)).not.toContain('vtuber_id');
        expect(await run(OTHER)).toContain('vtuber_id');
    });

    it('F5 只改原唱或版本備註也算 changed', async () => {
        const before = beforeSnap([segRow('aaaaaaaa', 0, 100, 'A'), segRow('bbbbbbbb', 100, 200, 'B')]);
        sb = (_m, path) =>
            path.startsWith('song_submissions')
                ? new Response(JSON.stringify([
                    logRow({
                        before,
                        segments: [
                            { ...segRow('aaaaaaaa', 0, 100, 'A'), original_artist: '新原唱' },
                            { ...segRow('bbbbbbbb', 100, 200, 'B'), version_note: '清唱' },
                        ],
                    }),
                ]))
                : new Response('[]');
        const row = (await (await adminList()).json()).submissions[0];
        expect(row.summary.changed).toBe(2);
        expect(row.summary.fields).toContain('segments');
    });

    it('F5 新歌回（before 為 null）：added = 送出的片段數、changed 為 0', async () => {
        sb = (_m, path) =>
            path.startsWith('song_submissions')
                ? new Response(JSON.stringify([
                    logRow({
                        kind: 'new',
                        target_video_ref: null,
                        before: null,
                        segments: [segRow('aaaaaaaa', 0, 100, 'A'), segRow('bbbbbbbb', 100, 200, 'B'), segRow('cccccccc', 200, 300, 'C')],
                    }),
                ]))
                : new Response('[]');
        const json = await (await adminList()).json();
        expect(json.submissions[0].kind).toBe('new');
        expect(json.submissions[0].summary.added).toBe(3);
        expect(json.submissions[0].summary.changed).toBe(0);
    });

    it('F5 片段完全沒變（只是改了標題等影片欄位）：added、changed 皆為 0；已還原的紀錄保留 reverted_at', async () => {
        const segs = [segRow('aaaaaaaa', 0, 100, 'A')];
        sb = (_m, path) =>
            path.startsWith('song_submissions')
                ? new Response(JSON.stringify([
                    logRow({ before: beforeSnap(segs), segments: segs, status: 'reverted', reverted_at: '2026-10-28T03:00:00Z' }),
                ]))
                : new Response('[]');
        const row = (await (await adminList()).json()).submissions[0];
        expect(row.summary.added).toBe(0);
        expect(row.summary.changed).toBe(0);
        expect(row.status).toBe('reverted');
        expect(row.reverted_at).toBe('2026-10-28T03:00:00Z');
    });

    it('F5 回應不含原始 IP 雜湊（ip_hash 不外洩）', async () => {
        sb = (_m, path) =>
            path.startsWith('song_submissions')
                ? new Response(JSON.stringify([logRow({ ip_hash: 'secret-hash-value' })]))
                : new Response('[]');
        const text = JSON.stringify(await (await adminList()).json());
        expect(text).not.toContain('secret-hash-value');
    });
});

describe('POST /api/admin/song-submissions（還原／鎖定）', () => {
    it('F6 未帶管理 token 一律 401，且不碰 DB', async () => {
        const revert = await adminPost({ request: adminReq('?action=revert', { id: SUB_ID }, null), env: ENV() });
        expect(revert.status).toBe(401);
        const lock = await adminPost({ request: adminReq('?action=lock', { videoRef: REF, locked: true }, null), env: ENV() });
        expect(lock.status).toBe(401);
        expect(sbCalls()).toHaveLength(0);
    });

    it('F6 還原只打一次 RPC admin_revert_song_edit，帶 p_submission，成功回 200', async () => {
        sb = () => new Response(JSON.stringify({ video_ref: REF, kind: 'revision', reverted: 2 }), { status: 200 });
        const res = await adminPost({ request: adminReq('?action=revert', { id: SUB_ID }), env: ENV() });
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
        expect(sbCalls()).toHaveLength(1);
        expect(sbCalls()[0].method).toBe('POST');
        expect(sbCalls()[0].url).toContain('rpc/admin_revert_song_edit');
        expect(sbCalls()[0].body).toEqual({ p_submission: SUB_ID });
    });

    it('F6 還原錯誤對應：not_applied → 409、submission_not_found → 404、其他 → 500', async () => {
        const run = async (reply: Response) => {
            sb = () => reply;
            const res = await adminPost({ request: adminReq('?action=revert', { id: SUB_ID }), env: ENV() });
            return { status: res.status, error: (await res.json()).error };
        };
        expect(await run(rpcErr('not_applied'))).toEqual({ status: 409, error: 'not_applied' });
        expect(await run(rpcErr('submission_not_found', 'P0002', 404))).toEqual({ status: 404, error: 'submission_not_found' });
        expect((await run(new Response('boom', { status: 500 }))).status).toBe(500);
    });

    it('F6 還原的 id 不是 uuid 或沒帶 → 400，不碰 DB', async () => {
        const bad = await adminPost({ request: adminReq('?action=revert', { id: '-'.repeat(36) }), env: ENV() });
        expect(bad.status).toBe(400);
        const missing = await adminPost({ request: adminReq('?action=revert', {}), env: ENV() });
        expect(missing.status).toBe(400);
        expect(sbCalls()).toHaveLength(0);
    });

    it('F6 鎖定：PATCH song_videos?id=eq.<videoRef> 帶 community_locked:true；解鎖帶 false', async () => {
        sb = () => new Response(JSON.stringify([{ id: REF }]), { status: 200 });
        const lock = await adminPost({ request: adminReq('?action=lock', { videoRef: REF, locked: true }), env: ENV() });
        expect(lock.status).toBe(200);
        expect(sbCalls()).toHaveLength(1);
        expect(sbCalls()[0].method).toBe('PATCH');
        expect(sbCalls()[0].url).toContain(`song_videos?id=eq.${REF}`);
        expect(sbCalls()[0].body).toEqual({ community_locked: true });

        calls = [];
        const unlock = await adminPost({ request: adminReq('?action=lock', { videoRef: REF, locked: false }), env: ENV() });
        expect(unlock.status).toBe(200);
        expect(sbCalls()[0].body).toEqual({ community_locked: false });
    });

    it('F6 鎖定的 videoRef 不是 uuid、locked 不是 boolean → 400，不碰 DB', async () => {
        const badRef = await adminPost({ request: adminReq('?action=lock', { videoRef: 'not-a-uuid', locked: true }), env: ENV() });
        expect(badRef.status).toBe(400);
        const badLocked = await adminPost({ request: adminReq('?action=lock', { videoRef: REF, locked: 'yes' }), env: ENV() });
        expect(badLocked.status).toBe(400);
        expect(sbCalls()).toHaveLength(0);
    });

    it('F6 舊的 approve／reject 動作已移除 → 一律 400（invalid_action），不碰 DB', async () => {
        const approve = await adminPost({ request: adminReq(`?id=${SUB_ID}&action=approve`, { video_ref: null, video: {}, segments: [] }), env: ENV() });
        expect(approve.status).toBe(400);
        const reject = await adminPost({ request: adminReq(`?id=${SUB_ID}&action=reject`, { notes: 'x' }), env: ENV() });
        expect(reject.status).toBe(400);
        const unknown = await adminPost({ request: adminReq('?action=explode', {}), env: ENV() });
        expect(unknown.status).toBe(400);
        expect(sbCalls()).toHaveLength(0);
    });
});
