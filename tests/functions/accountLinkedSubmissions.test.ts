// 投稿記到帳號（U1–U5，只依介面規格撰寫）：
//   VTuber 投稿／週表投稿／回報／意見回饋／歌單 帶有效 Bearer 權杖時，寫入列帶 user_id；匿名維持原樣；限流改用帳號
// 只 mock 外部 I/O：fetch（Supabase Auth／PostgREST／YouTube／Turnstile）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestPost as contributePost } from '../../functions/api/vtuber/contribute.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestPost as entriesPost } from '../../functions/api/schedule/entries.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestPost as reportPost } from '../../functions/api/report.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestPost as feedbackPost } from '../../functions/api/feedback/submit.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestPost as songsPost } from '../../functions/api/songs/submissions.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { hashIp } from '../../functions/lib/rate-limit.js';

const UID = '33333333-3333-4333-8333-333333333333';
const UID2 = '44444444-4444-4444-8444-444444444444';
const TOKEN = 'aaa.bbb.ccc';
const IP = '203.0.113.9';
const VID = '11111111-1111-4111-8111-111111111111';
const UC = 'UC' + 'a'.repeat(22);
const SONG_VIDEO = 'dQw4w9WgXcQ';

function memKv() {
    const m = new Map<string, string>();
    return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => void m.set(k, v), _m: m };
}

type Call = { method: string; url: string; body: any };
let calls: Call[] = [];
let sb: (method: string, path: string, body: any) => Response;
// 權杖查詢（/auth/v1/user）：依 Authorization 回不同使用者；null = 權杖無效
let userLookup: (token: string) => Response;

const channelPage =
    `<html><head><title>x</title><meta property="og:title" content="新人"><meta property="og:image" content="https://yt3.googleusercontent.com/avatar=s900">` +
    `<meta property="og:url" content="https://www.youtube.com/channel/${UC}"></head><body></body></html>`;

const ENV = () => ({
    SUPABASE_URL: 'http://sb',
    SUPABASE_SERVICE_ROLE_KEY: 'k',
    RATE_LIMIT_KV: memKv(),
    ENFORCE_TURNSTILE: 'true',
    TURNSTILE_SECRET_KEY: 's',
    IP_HASH_SALT: 'salt',
});

beforeEach(() => {
    calls = [];
    userLookup = (token) => new Response(JSON.stringify({ id: token === 'ddd.eee.fff' ? UID2 : UID }), { status: 200 });
    sb = (method, path) => {
        if (path.startsWith('vtubers?id=eq.')) return new Response(JSON.stringify([{ id: VID, slug: 'akumu', name: '阿夢', activity: 'active' }]));
        if (path.startsWith('rpc/community_save_song_video')) return new Response(JSON.stringify({ kind: 'new', submission_id: 'sub-1' }), { status: 200 });
        if (method === 'GET') return new Response('[]');
        return new Response(JSON.stringify([{ id: 'new-id' }]), { status: 201 });
    };
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        const method = init?.method ?? 'GET';
        const raw = typeof init?.body === 'string' ? init.body : null;
        const parsed = raw && (raw.startsWith('{') || raw.startsWith('[')) ? JSON.parse(raw) : raw;
        calls.push({ method, url, body: parsed });
        if (url.startsWith('https://challenges.cloudflare.com')) return new Response(JSON.stringify({ success: true }));
        if (url.startsWith('https://www.youtube.com')) return new Response(channelPage);
        if (url === 'http://sb/auth/v1/user') {
            const auth = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? '');
            return userLookup(auth.replace('Bearer ', ''));
        }
        if (url.startsWith('http://sb/rest/v1/')) return sb(method, url.slice('http://sb/rest/v1/'.length), parsed);
        throw new Error(`unexpected fetch ${url}`);
    }));
});
afterEach(() => vi.unstubAllGlobals());

const post = (path: string, b: unknown, token: string | null = null) =>
    new Request(`https://multistreaming.org${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': IP,
            Origin: 'https://multistreaming.org',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(b),
    });

const writeOf = (table: string) => calls.find((c) => c.method === 'POST' && c.url.includes(`/rest/v1/${table}`))!.body as Record<string, any>;

const contribution = { youtubeUrl: '@newbie_vt', name: '新人', nationality: 'TW', affiliation: { type: 'personal' }, socials: {}, turnstileToken: 'tok' };
const tomorrow = () => new Date(Date.now() + 86_400_000 * 1.5).toISOString().slice(0, 10);
const scheduleBody = () => ({
    vtuberId: VID,
    entries: [{ date: tomorrow(), time: '20:00', title: '雜談', platform: 'youtube' }],
    turnstileToken: 'tok',
});
const songBody = () => ({
    videoId: SONG_VIDEO,
    title: '歌回 #1',
    vtuberId: VID,
    streamedAt: null,
    rev: null,
    durationSeconds: null,
    segments: [{ start: 0, end: 100, title: 'A' }],
    turnstileToken: 'tok',
});
const reportBody = () => ({ kind: 'vtuber_info', vtuberId: VID, reasons: ['name'], description: '名字錯了', turnstileToken: 't' });
const feedbackBody = () => ({ feedbackType: 'bug', content: '切換版型後聲音不見' });

describe('U1 登入者投稿記到帳號', () => {
    it('登入者投 VTuber：寫入列 user_id 為該帳號、submitted_by 為 user:<id>', async () => {
        const res = await contributePost({ request: post('/api/vtuber/contribute', contribution, TOKEN), env: ENV() });
        expect(res.status).toBe(201);
        const row = writeOf('vtuber_contributions');
        expect(row.user_id).toBe(UID);
        expect(row.submitted_by).toBe(`user:${UID}`);
    });

    it('登入者投週表：寫入列 user_id 為該帳號、submitted_by 為 user:<id>', async () => {
        const res = await entriesPost({ request: post('/api/schedule/entries', scheduleBody(), TOKEN), env: ENV() });
        expect(res.status).toBe(201);
        const row = writeOf('vtuber_contributions');
        expect(row.user_id).toBe(UID);
        expect(row.submitted_by).toBe(`user:${UID}`);
    });
});

describe('U2 匿名投稿照舊', () => {
    it('不帶權杖投 VTuber：user_id 為 null、submitted_by 以 anon: 開頭，且沒打 auth 驗證', async () => {
        const res = await contributePost({ request: post('/api/vtuber/contribute', contribution), env: ENV() });
        expect(res.status).toBe(201);
        const row = writeOf('vtuber_contributions');
        expect(row).toHaveProperty('user_id', null);
        expect(row.submitted_by).toMatch(/^anon:[0-9a-f]{16}$/);
        expect(calls.some((c) => c.url.includes('/auth/v1/user'))).toBe(false);
    });

    it('不帶權杖投週表：user_id 為 null、submitted_by 以 anon: 開頭', async () => {
        const res = await entriesPost({ request: post('/api/schedule/entries', scheduleBody()), env: ENV() });
        expect(res.status).toBe(201);
        const row = writeOf('vtuber_contributions');
        expect(row).toHaveProperty('user_id', null);
        expect(row.submitted_by).toMatch(/^anon:[0-9a-f]{16}$/);
    });
});

describe('U3 權杖無效當匿名', () => {
    it('/auth/v1/user 回 401：投稿仍成功（201）、user_id 為 null、submitted_by 為 anon:', async () => {
        userLookup = () => new Response('{}', { status: 401 });
        const res = await contributePost({ request: post('/api/vtuber/contribute', contribution, TOKEN), env: ENV() });
        expect(res.status).toBe(201);
        const row = writeOf('vtuber_contributions');
        expect(row).toHaveProperty('user_id', null);
        expect(row.submitted_by).toMatch(/^anon:/);
    });

    it('權杖無效時週表投稿也照樣成功並當匿名', async () => {
        userLookup = () => new Response('{}', { status: 401 });
        const res = await entriesPost({ request: post('/api/schedule/entries', scheduleBody(), TOKEN), env: ENV() });
        expect(res.status).toBe(201);
        expect(writeOf('vtuber_contributions')).toHaveProperty('user_id', null);
    });
});

describe('U4 登入者用帳號限流', () => {
    it('個人配額的 KV key 含 u:<帳號> 且不含 ipHash，全站配額照舊', async () => {
        const env = ENV();
        const ipHash = await hashIp(env, IP);
        const res = await contributePost({ request: post('/api/vtuber/contribute', contribution, TOKEN), env });
        expect(res.status).toBe(201);
        const keys = [...env.RATE_LIMIT_KV._m.keys()];
        const personal = keys.filter((k) => k.startsWith('contrib:h:') || k.startsWith('contrib:d:'));
        expect(personal.length).toBeGreaterThan(0);
        for (const k of personal) {
            expect(k).toContain(`u:${UID}`);
            expect(k).not.toContain(ipHash);
        }
        expect(keys.some((k) => k.startsWith('contrib:g:'))).toBe(true);
    });

    it('同一帳號超過個人上限回 429，同 IP 的另一個帳號不受影響', async () => {
        const env = ENV();
        const run = (token: string) => contributePost({ request: post('/api/vtuber/contribute', contribution, token), env });
        for (let i = 0; i < 3; i++) expect((await run(TOKEN)).status).toBe(201);
        expect((await run(TOKEN)).status).toBe(429);
        expect((await run('ddd.eee.fff')).status).toBe(201);
    });

    it('匿名仍以 ipHash 限流（key 含 ipHash、不含 u:）', async () => {
        const env = ENV();
        const ipHash = await hashIp(env, IP);
        await contributePost({ request: post('/api/vtuber/contribute', contribution), env });
        const personal = [...env.RATE_LIMIT_KV._m.keys()].filter((k) => k.startsWith('contrib:h:'));
        expect(personal.length).toBeGreaterThan(0);
        for (const k of personal) {
            expect(k).toContain(ipHash);
            expect(k).not.toContain('u:');
        }
    });
});

describe('U5 回報、意見、歌單都帶帳號', () => {
    it('登入者回報：vtuber_reports 寫入列 user_id 為該帳號；匿名為 null', async () => {
        const ok = await reportPost({ request: post('/api/report', reportBody(), TOKEN), env: ENV() });
        expect(ok.status).toBe(201);
        expect(writeOf('vtuber_reports').user_id).toBe(UID);

        calls = [];
        const anon = await reportPost({ request: post('/api/report', reportBody()), env: ENV() });
        expect(anon.status).toBe(201);
        expect(writeOf('vtuber_reports')).toHaveProperty('user_id', null);
    });

    it('登入者送意見：feedbacks 寫入列 user_id 為該帳號；匿名為 null', async () => {
        const ok = await feedbackPost({ request: post('/api/feedback/submit', feedbackBody(), TOKEN), env: ENV() });
        expect(ok.status).toBe(200);
        expect(writeOf('feedbacks').user_id).toBe(UID);

        calls = [];
        const anon = await feedbackPost({ request: post('/api/feedback/submit', feedbackBody()), env: ENV() });
        expect(anon.status).toBe(200);
        expect(writeOf('feedbacks')).toHaveProperty('user_id', null);
    });

    it('登入者投歌單：RPC 的 p_meta 帶 user_id；匿名為 null', async () => {
        const rpc = () => calls.find((c) => c.url.includes('rpc/community_save_song_video'))!.body;
        const ok = await songsPost({ request: post('/api/songs/submissions', songBody(), TOKEN), env: ENV(), waitUntil: () => {} });
        expect(ok.status).toBe(201);
        expect(rpc().p_meta.user_id).toBe(UID);

        calls = [];
        const anon = await songsPost({ request: post('/api/songs/submissions', songBody()), env: ENV(), waitUntil: () => {} });
        expect(anon.status).toBe(201);
        expect(rpc().p_meta).toHaveProperty('user_id', null);
    });
});
