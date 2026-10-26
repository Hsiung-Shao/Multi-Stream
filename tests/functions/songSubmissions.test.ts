// 歌回社群投稿（後端）：投稿驗證、POST /api/songs/submissions、管理端 /api/admin/song-submissions
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

const seg = (start: number, end: number | null, title = `歌${start}`, extra: Record<string, unknown> = {}) => ({ start, end, title, ...extra });
const sub = (over: Record<string, unknown> = {}) => ({
    videoId: VIDEO,
    title: '歌回 #1',
    vtuberId: null,
    streamedAt: null,
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

beforeEach(() => {
    calls = [];
    sb = (method) => (method === 'GET' ? new Response('[]') : new Response(JSON.stringify([{ id: SUB_ID }]), { status: 201 }));
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
const submit = (b: unknown, env = ENV(), headers: Record<string, string | null> = {}) => submitPost({ request: submitReq(b, headers), env });

describe('POST /api/songs/submissions', () => {
    it('擋非法片段不寫 DB：重疊、缺 end、片段帶 id、影片 ID 錯 → 400', async () => {
        const cases: Array<[unknown, string[]]> = [
            [sub({ segments: [seg(0, 100), seg(50, 150)] }), ['invalid_segments']],
            [sub({ segments: [seg(0, null)] }), ['invalid_segments', 'invalid_payload']],
            [sub({ segments: [seg(0, 10, 'A', { id: REF })] }), ['invalid_payload']],
            [sub({ videoId: 'bad' }), ['invalid_video_id']],
        ];
        for (const [b, errors] of cases) {
            const res = await submit(b);
            expect(res.status, JSON.stringify(b)).toBe(400);
            expect(errors).toContain((await res.json()).error);
        }
        expect(sbCalls()).toHaveLength(0);
    });

    it('影片還沒上架 → 新增（kind new、target_video_ref null），寫入待審並只存雜湊 IP', async () => {
        const res = await submit(sub());
        expect(res.status).toBe(201);
        expect(await res.json()).toMatchObject({ ok: true, id: SUB_ID, kind: 'new' });
        const write = calls.find((c) => c.method === 'POST' && c.url.includes('song_submissions'))!;
        expect(write.body).toMatchObject({
            kind: 'new',
            target_video_ref: null,
            video_id: VIDEO,
            title: '歌回 #1',
            status: 'pending',
            source_note: '來源：置頂留言',
            submitter_contact: 'a@b.c',
        });
        expect(write.body.segments).toHaveLength(2);
        expect(write.body.ip_hash).toBeTruthy();
        expect(JSON.stringify(write.body)).not.toContain(IP);
        // 查過影片是否已上架
        expect(calls.some((c) => c.method === 'GET' && c.url.includes(`song_videos?video_id=eq.${VIDEO}`))).toBe(true);
    });

    it('已上架影片自動判為修正（kind revision、target_video_ref 為該影片 id）', async () => {
        sb = (method, path) => {
            if (method === 'GET' && path.startsWith('song_videos')) return new Response(JSON.stringify([{ id: REF }]));
            if (method === 'GET') return new Response('[]');
            return new Response(JSON.stringify([{ id: SUB_ID }]), { status: 201 });
        };
        const res = await submit(sub());
        expect(res.status).toBe(201);
        expect((await res.json()).kind).toBe('revision');
        const write = calls.find((c) => c.method === 'POST' && c.url.includes('song_submissions'))!;
        expect(write.body).toMatchObject({ kind: 'revision', target_video_ref: REF });
    });

    it('同 IP 同影片已有待審（23505）→ 409 already_pending', async () => {
        sb = (method) => (method === 'GET' ? new Response('[]') : new Response('{"code":"23505","message":"duplicate"}', { status: 409 }));
        const res = await submit(sub());
        expect(res.status).toBe(409);
        expect((await res.json()).error).toBe('already_pending');
    });

    it('其他寫入失敗 → 500 insert_failed', async () => {
        sb = (method) => (method === 'GET' ? new Response('[]') : new Response('boom', { status: 500 }));
        const res = await submit(sub());
        expect(res.status).toBe(500);
        expect((await res.json()).error).toBe('insert_failed');
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

// ---------- /api/admin/song-submissions ----------
const adminReq = (query: string, b?: unknown, token: string | null = 'admintoken', method = 'POST') => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['X-Admin-Token'] = token;
    return new Request(`https://multistreaming.org/api/admin/song-submissions${query}`, {
        method,
        headers,
        body: b === undefined ? undefined : JSON.stringify(b),
    });
};
// 管理員微調後的版本：video 欄位沿用 buildSongVideoPayload；video_ref 為修正對象（新增為 null）
const approveBody = (over: Record<string, unknown> = {}) => ({
    video_ref: null,
    video: { video_id: VIDEO, title: '歌回 #1', status: 'published', vtuber_id: null, streamed_at: null, duration_seconds: null },
    segments: [
        { start_seconds: 0, end_seconds: 100, title: 'A', original_artist: '原唱' },
        { start_seconds: 100, end_seconds: 200, title: 'B' },
    ],
    ...over,
});

describe('/api/admin/song-submissions', () => {
    it('未帶管理 token 一律 401，且不碰 DB', async () => {
        const post = await adminPost({ request: adminReq(`?id=${SUB_ID}&action=approve`, approveBody(), null), env: ENV() });
        expect(post.status).toBe(401);
        const get = await adminGet({ request: adminReq('', undefined, null, 'GET'), env: ENV() });
        expect(get.status).toBe(401);
        const wrong = await adminPost({ request: adminReq(`?id=${SUB_ID}&action=reject`, { notes: 'x' }, 'bad'), env: ENV() });
        expect(wrong.status).toBe(401);
        expect(sbCalls()).toHaveLength(0);
    });

    it('核准只打一次 RPC approve_song_submission，帶 p_id/p_video_ref/p_video/p_segments', async () => {
        sb = () => new Response(JSON.stringify(REF), { status: 200 });
        const res = await adminPost({ request: adminReq(`?id=${SUB_ID}&action=approve`, approveBody()), env: ENV() });
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
        expect(sbCalls()).toHaveLength(1);
        const call = sbCalls()[0];
        expect(call.url).toContain('rpc/approve_song_submission');
        expect(call.body.p_id).toBe(SUB_ID);
        expect('p_video_ref' in call.body).toBe(true);
        expect(call.body.p_video).toMatchObject({ video_id: VIDEO });
        expect(call.body.p_segments).toHaveLength(2);
    });

    it('核准修正（revision）：p_video_ref 帶修正對象，片段可帶既有 id', async () => {
        sb = () => new Response(JSON.stringify(REF), { status: 200 });
        const SEG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        const body = approveBody({
            video_ref: REF,
            segments: [{ id: SEG_ID, start_seconds: 0, end_seconds: 100, title: 'A' }],
        });
        const res = await adminPost({ request: adminReq(`?id=${SUB_ID}&action=approve`, body), env: ENV() });
        expect(res.status).toBe(200);
        expect(sbCalls()[0].body.p_video_ref).toBe(REF);
        expect(sbCalls()[0].body.p_segments[0].id).toBe(SEG_ID);
    });

    it('RPC 錯誤對應：not_pending 409、unknown_segment_id 400、23505 409 video_exists、其他 500', async () => {
        const run = async (reply: Response) => {
            sb = () => reply;
            const res = await adminPost({ request: adminReq(`?id=${SUB_ID}&action=approve`, approveBody()), env: ENV() });
            return { status: res.status, error: (await res.json()).error };
        };
        expect(await run(new Response('{"code":"P0001","message":"not_pending"}', { status: 400 }))).toEqual({ status: 409, error: 'not_pending' });
        expect(await run(new Response('{"code":"P0001","message":"unknown_segment_id"}', { status: 400 }))).toEqual({ status: 400, error: 'unknown_segment_id' });
        expect(await run(new Response('{"code":"23505","message":"duplicate"}', { status: 409 }))).toEqual({ status: 409, error: 'video_exists' });
        expect((await run(new Response('boom', { status: 500 }))).status).toBe(500);
    });

    it('核准時片段驗證失敗（重疊）400，不打 RPC', async () => {
        const body = approveBody({
            segments: [
                { start_seconds: 0, end_seconds: 100, title: 'A' },
                { start_seconds: 50, end_seconds: 150, title: 'B' },
            ],
        });
        const res = await adminPost({ request: adminReq(`?id=${SUB_ID}&action=approve`, body), env: ENV() });
        expect(res.status).toBe(400);
        expect(sbCalls()).toHaveLength(0);
    });

    it('駁回：PATCH song_submissions 帶 status rejected 與 reviewer_notes，只動待審那筆', async () => {
        sb = () => new Response(JSON.stringify([{ id: SUB_ID }]), { status: 200 });
        const res = await adminPost({ request: adminReq(`?id=${SUB_ID}&action=reject`, { notes: '時間軸對不上' }), env: ENV() });
        expect(res.status).toBe(200);
        expect(sbCalls()).toHaveLength(1);
        const call = sbCalls()[0];
        expect(call.method).toBe('PATCH');
        expect(call.url).toContain('song_submissions');
        expect(call.url).toContain(`id=eq.${SUB_ID}`);
        expect(call.url).toContain('status=eq.pending');
        expect(call.body).toMatchObject({ status: 'rejected', reviewer_notes: '時間軸對不上' });
        expect(call.body.reviewed_at).toBeTruthy();
    });

    it('駁回更新 0 列 → 409 not_pending；理由超過 500 字 → 400', async () => {
        sb = () => new Response('[]', { status: 200 });
        const none = await adminPost({ request: adminReq(`?id=${SUB_ID}&action=reject`, { notes: 'x' }), env: ENV() });
        expect(none.status).toBe(409);
        expect((await none.json()).error).toBe('not_pending');

        calls = [];
        const long = await adminPost({ request: adminReq(`?id=${SUB_ID}&action=reject`, { notes: 'x'.repeat(501) }), env: ENV() });
        expect(long.status).toBe(400);
        expect(sbCalls()).toHaveLength(0);
    });

    it('非法 id、未知 action → 400，不碰 DB', async () => {
        const badId = await adminPost({ request: adminReq(`?id=${'-'.repeat(36)}&action=approve`, approveBody()), env: ENV() });
        expect(badId.status).toBe(400);
        const badAction = await adminPost({ request: adminReq(`?id=${SUB_ID}&action=explode`, {}), env: ENV() });
        expect(badAction.status).toBe(400);
        expect(sbCalls()).toHaveLength(0);
    });

    it('GET 列表預設只列待審；單筆若有 target_video_ref 另附 existing 片段', async () => {
        sb = (_method, path) => {
            if (path.startsWith('song_submissions?id=')) return new Response(JSON.stringify([{ id: SUB_ID, target_video_ref: REF, segments: [] }]));
            if (path.startsWith('song_segments')) return new Response(JSON.stringify([{ id: 's1', start_seconds: 0 }]));
            return new Response('[]');
        };
        await adminGet({ request: adminReq('', undefined, 'admintoken', 'GET'), env: ENV() });
        expect(sbCalls()[0].url).toContain('song_submissions?status=eq.pending');
        expect(sbCalls()[0].url).toContain('order=created_at.desc');

        calls = [];
        const res = await adminGet({ request: adminReq(`?id=${SUB_ID}`, undefined, 'admintoken', 'GET'), env: ENV() });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.existing).toBeTruthy();
        expect(sbCalls().some((c) => c.url.includes('song_segments') && c.url.includes(REF))).toBe(true);
    });
});

// ---------- v1.2.1：修正型單筆查詢附上原歌回欄位（核准時沿用，不被投稿內容覆寫） ----------
describe('GET /api/admin/song-submissions?id= 的 existing_video', () => {
    const VIDEO_ROW = { id: REF, video_id: VIDEO, title: '原歌回標題', vtuber_id: null, streamed_at: '2026-10-01T12:00:00Z', duration_seconds: 5400, status: 'draft' };
    const getOne = () => adminGet({ request: adminReq(`?id=${SUB_ID}`, undefined, 'admintoken', 'GET'), env: ENV() });
    const videoQueries = () => sbCalls().filter((c) => c.url.includes('song_videos'));
    const mockSb = (target: string | null, videoReply: () => Response) => {
        sb = (_method, path) => {
            if (path.startsWith('song_submissions?id=')) return new Response(JSON.stringify([{ id: SUB_ID, target_video_ref: target, segments: [] }]));
            if (path.startsWith('song_videos')) return videoReply();
            return new Response('[]');
        };
    };

    it('修正型：回傳原歌回那一列，並以 id=eq.<target> 查含 duration_seconds 與 status 的欄位', async () => {
        mockSb(REF, () => new Response(JSON.stringify([VIDEO_ROW])));
        const res = await getOne();
        expect(res.status).toBe(200);
        expect((await res.json()).existing_video).toEqual(VIDEO_ROW);
        const q = videoQueries();
        expect(q).toHaveLength(1);
        expect(q[0].url).toContain(`id=eq.${REF}`);
        expect(q[0].url).toContain('duration_seconds');
        expect(q[0].url).toContain('status');
    });

    it('新歌回（target 為 null）：existing_video 為 null，且完全不查 song_videos', async () => {
        mockSb(null, () => new Response(JSON.stringify([VIDEO_ROW])));
        const res = await getOne();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.existing_video).toBeNull();
        expect(videoQueries()).toHaveLength(0);
    });

    it('修正型但原歌回查不到：existing_video 為 null、仍回 200', async () => {
        mockSb(REF, () => new Response('[]'));
        const res = await getOne();
        expect(res.status).toBe(200);
        expect((await res.json()).existing_video).toBeNull();
    });

    it('查原歌回失敗（非 2xx）→ 500 fetch_failed', async () => {
        mockSb(REF, () => new Response('boom', { status: 500 }));
        const res = await getOne();
        expect(res.status).toBe(500);
        expect((await res.json()).error).toBe('fetch_failed');
    });

    it('既有欄位 submission 與 existing 維持不變', async () => {
        sb = (_method, path) => {
            if (path.startsWith('song_submissions?id=')) return new Response(JSON.stringify([{ id: SUB_ID, target_video_ref: REF, segments: [] }]));
            if (path.startsWith('song_segments')) return new Response(JSON.stringify([{ id: 's1', start_seconds: 0 }]));
            if (path.startsWith('song_videos')) return new Response(JSON.stringify([VIDEO_ROW]));
            return new Response('[]');
        };
        const json = await (await getOne()).json();
        expect(json.submission).toMatchObject({ id: SUB_ID, target_video_ref: REF });
        expect(json.existing).toEqual([{ id: 's1', start_seconds: 0 }]);
    });
});
