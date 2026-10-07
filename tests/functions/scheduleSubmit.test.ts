// 使用者投稿「本週週表」（後端）：
//   lib：functions/lib/schedule-submit.js（列驗證、台北日期範圍）
//   端點：/api/schedule/entries（投稿）、/api/admin/contributions?action=approve（週表投稿走 approve_schedule_contribution）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { validateScheduleEntries, validateEntries, taipeiDate } from '../../functions/lib/schedule-submit.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestPost as entriesPost } from '../../functions/api/schedule/entries.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestPost as adminContribPost } from '../../functions/api/admin/contributions.js';

const VID = '11111111-1111-4111-8111-111111111111';
const CID = '33333333-3333-4333-8333-333333333333';
// 台北 2026-10-05 12:00
const NOW = Date.parse('2026-10-05T04:00:00Z');

type Entry = { date?: unknown; time?: unknown; title?: unknown; platform?: unknown };
const entry = (over: Entry = {}): Entry => ({ date: '2026-10-06', time: '20:00', title: '雜談', platform: 'youtube', ...over });
const body = (over: Record<string, unknown> = {}) => ({ vtuberId: VID, entries: [entry()], turnstileToken: 'tok', ...over });

describe('taipeiDate', () => {
    it('固定 +8：UTC 16:00 之後就是台北隔天', () => {
        expect(taipeiDate(Date.parse('2026-10-05T15:59:00Z'))).toBe('2026-10-05');
        expect(taipeiDate(Date.parse('2026-10-05T16:00:00Z'))).toBe('2026-10-06');
    });
});

describe('validateScheduleEntries', () => {
    it('合法輸入：去頭尾空白、平台預設 youtube、依日期時間排序', () => {
        const r = validateScheduleEntries(
            body({
                entries: [entry({ date: '2026-10-07', time: '21:00', title: '  歌回  ', platform: undefined }), entry({ date: '2026-10-06', time: '09:30', platform: 'twitch' })],
                note: ' 官方推特 ',
                contact: '',
            }),
            NOW,
        );
        expect(r).toEqual({
            value: {
                vtuberId: VID,
                entries: [
                    { date: '2026-10-06', time: '09:30', title: '雜談', platform: 'twitch' },
                    { date: '2026-10-07', time: '21:00', title: '歌回', platform: 'youtube' },
                ],
                note: '官方推特',
                contact: null,
            },
        });
    });

    it('vtuberId 必須是 uuid', () => {
        expect(validateScheduleEntries(body({ vtuberId: 'abc' }), NOW)).toEqual({ error: 'invalid_vtuber' });
        expect(validateScheduleEntries(body({ vtuberId: undefined }), NOW)).toEqual({ error: 'invalid_vtuber' });
        expect(validateScheduleEntries(null, NOW)).toEqual({ error: 'invalid_body' });
    });

    it('entries 1～7 列、每列要是物件', () => {
        expect(validateScheduleEntries(body({ entries: [] }), NOW)).toEqual({ error: 'invalid_entries' });
        expect(validateScheduleEntries(body({ entries: 'x' }), NOW)).toEqual({ error: 'invalid_entries' });
        const eight = Array.from({ length: 8 }, (_, i) => entry({ time: `1${i}:00` }));
        expect(validateScheduleEntries(body({ entries: eight }), NOW)).toEqual({ error: 'invalid_entries' });
        expect(validateScheduleEntries(body({ entries: eight.slice(0, 7) }), NOW).value.entries).toHaveLength(7);
        expect(validateScheduleEntries(body({ entries: [null] }), NOW)).toEqual({ error: 'invalid_entries' });
    });

    it('日期：台北今天 −1 ～ +10 天，格式與真實日期', () => {
        const ok = (d: string) => validateScheduleEntries(body({ entries: [entry({ date: d })] }), NOW);
        expect(ok('2026-10-04').value).toBeTruthy();
        expect(ok('2026-10-15').value).toBeTruthy();
        expect(ok('2026-10-03')).toEqual({ error: 'invalid_entry_date' });
        expect(ok('2026-10-16')).toEqual({ error: 'invalid_entry_date' });
        expect(ok('2026/10/06')).toEqual({ error: 'invalid_entry_date' });
        expect(ok('2026-02-30')).toEqual({ error: 'invalid_entry_date' });
        // UTC 已是 10-05、台北已是 10-06：下限跟著台北日期走
        expect(validateScheduleEntries(body({ entries: [entry({ date: '2026-10-04' })] }), Date.parse('2026-10-05T17:00:00Z'))).toEqual({ error: 'invalid_entry_date' });
    });

    it('時間：HH:MM 00:00～23:59', () => {
        const t = (time: unknown) => validateScheduleEntries(body({ entries: [entry({ time })] }), NOW);
        expect(t('00:00').value).toBeTruthy();
        expect(t('23:59').value).toBeTruthy();
        expect(t('24:00')).toEqual({ error: 'invalid_entry_time' });
        expect(t('8:00')).toEqual({ error: 'invalid_entry_time' });
        expect(t('20:60')).toEqual({ error: 'invalid_entry_time' });
        expect(t(2000)).toEqual({ error: 'invalid_entry_time' });
    });

    it('標題：去控制字元後 1～80 字', () => {
        const t = (title: unknown) => validateScheduleEntries(body({ entries: [entry({ title })] }), NOW);
        expect(t('a\u0000b\nc').value.entries[0].title).toBe('abc');
        expect(t('字'.repeat(80)).value).toBeTruthy();
        expect(t('字'.repeat(81))).toEqual({ error: 'invalid_entry_title' });
        expect(t('   ')).toEqual({ error: 'invalid_entry_title' });
        expect(t('\u0007')).toEqual({ error: 'invalid_entry_title' });
        expect(t(undefined)).toEqual({ error: 'invalid_entry_title' });
    });

    it('平台只收 youtube／twitch；同日同時重複視為 invalid_entries', () => {
        expect(validateScheduleEntries(body({ entries: [entry({ platform: 'kick' })] }), NOW)).toEqual({ error: 'invalid_entries' });
        expect(validateScheduleEntries(body({ entries: [entry(), entry({ title: '另一場' })] }), NOW)).toEqual({ error: 'invalid_entries' });
        expect(validateScheduleEntries(body({ entries: [entry(), entry({ time: '21:00' })] }), NOW).value).toBeTruthy();
    });

    it('備註 ≤ 500、聯絡方式 ≤ 200', () => {
        expect(validateScheduleEntries(body({ note: 'x'.repeat(501) }), NOW)).toEqual({ error: 'invalid_note' });
        expect(validateScheduleEntries(body({ note: 5 }), NOW)).toEqual({ error: 'invalid_note' });
        expect(validateScheduleEntries(body({ contact: 'x'.repeat(201) }), NOW)).toEqual({ error: 'invalid_contact' });
        expect(validateScheduleEntries(body({ note: 'x'.repeat(500), contact: 'y'.repeat(200) }), NOW).value).toBeTruthy();
    });

    it('核准端選項：列數上限與過去天數可放寬', () => {
        const fourteen = Array.from({ length: 14 }, (_, i) => entry({ time: `${String(i).padStart(2, '0')}:00` }));
        expect(validateEntries(fourteen, NOW)).toEqual({ error: 'invalid_entries' });
        expect(validateEntries(fourteen, NOW, { max: 14 }).value).toHaveLength(14);
        expect(validateEntries([entry({ date: '2026-09-30' })], NOW)).toEqual({ error: 'invalid_entry_date' });
        expect(validateEntries([entry({ date: '2026-09-30' })], NOW, { pastDays: 7 }).value).toBeTruthy();
    });
});

// ---------- 端點 ----------

function memKv() {
    const m = new Map<string, string>();
    return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => void m.set(k, v), _m: m };
}

type Call = { method: string; url: string; body: unknown };
let calls: Call[] = [];
let sb: (method: string, path: string, body: unknown) => Response;

const ENV = () => ({
    SUPABASE_URL: 'http://sb',
    SUPABASE_SERVICE_ROLE_KEY: 'k',
    RATE_LIMIT_KV: memKv(),
    ENFORCE_TURNSTILE: 'true',
    TURNSTILE_SECRET_KEY: 's',
    IP_HASH_SALT: 'salt',
    ADMIN_API_TOKEN: 'admintoken',
});

const PERSON = { id: VID, slug: 'akumu', name: '阿夢', activity: 'active' };

beforeEach(() => {
    calls = [];
    sb = (method, path) => {
        if (method === 'GET' && path.startsWith('vtubers')) return new Response(JSON.stringify([PERSON]));
        if (method === 'GET') return new Response('[]');
        return new Response(JSON.stringify([{ id: 'new-id' }]), { status: 201 });
    };
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

const post = (path: string, b: unknown, headers: Record<string, string> = {}) =>
    new Request(`https://multistreaming.org${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9', Origin: 'https://multistreaming.org', ...headers },
        body: typeof b === 'string' ? b : JSON.stringify(b),
    });

// 端點用真實時間驗日期：以「台北明天」當投稿日期
const tomorrow = () => new Date(Date.parse(`${taipeiDate(Date.now())}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const liveBody = (over: Record<string, unknown> = {}) => body({ entries: [entry({ date: tomorrow() })], note: '來源：社群', contact: 'a@b.c', ...over });

describe('POST /api/schedule/entries', () => {
    const run = (b: unknown, env = ENV()) => entriesPost({ request: post('/api/schedule/entries', b), env });

    it('成功 201：寫入待審（action=schedule、target_vtuber_id、payload 含名稱與 slug），只存雜湊 IP', async () => {
        const res = await run(liveBody());
        expect(res.status).toBe(201);
        expect(await res.json()).toEqual({ ok: true, id: 'new-id' });
        const write = calls.find((c) => c.method === 'POST' && c.url.includes('vtuber_contributions'))!;
        const row = write.body as Record<string, any>;
        expect(row).toMatchObject({ action: 'schedule', status: 'pending', target_vtuber_id: VID, submitter_contact: 'a@b.c', source_note: '來源：社群' });
        expect(row.payload).toEqual({
            vtuber_id: VID,
            vtuber_name: '阿夢',
            vtuber_slug: 'akumu',
            platform: 'youtube',
            entries: [{ date: tomorrow(), time: '20:00', title: '雜談', platform: 'youtube' }],
            note: '來源：社群',
            source: 'user',
        });
        expect(row.submitted_by).toMatch(/^anon:[0-9a-f]{16}$/);
        expect(JSON.stringify(row)).not.toContain('203.0.113.9');
    });

    it('VTuber 不存在或已畢業 → 404 vtuber_not_found', async () => {
        sb = (method) => (method === 'GET' ? new Response('[]') : new Response('[{"id":"x"}]', { status: 201 }));
        const nf = await run(liveBody());
        expect(nf.status).toBe(404);
        expect((await nf.json()).error).toBe('vtuber_not_found');
        sb = (method, path) => (method === 'GET' && path.startsWith('vtubers') ? new Response(JSON.stringify([{ ...PERSON, activity: 'graduate' }])) : new Response('[]'));
        expect((await run(liveBody())).status).toBe(404);
        expect(calls.some((c) => c.method === 'POST' && c.url.includes('vtuber_contributions'))).toBe(false);
    });

    it('已有待審 → 409 pending_exists；唯一索引衝突（同時送出）也是 409', async () => {
        sb = (method, path) => {
            if (path.startsWith('vtubers')) return new Response(JSON.stringify([PERSON]));
            if (method === 'GET') return new Response('[{"id":"p"}]');
            return new Response('[]', { status: 201 });
        };
        const dup = await run(liveBody());
        expect(dup.status).toBe(409);
        expect((await dup.json()).error).toBe('pending_exists');
        expect(calls.find((c) => c.method === 'GET' && c.url.includes('vtuber_contributions'))!.url).toContain(`target_vtuber_id=eq.${VID}&action=eq.schedule&status=eq.pending`);

        sb = (method, path) => {
            if (path.startsWith('vtubers')) return new Response(JSON.stringify([PERSON]));
            if (method === 'GET') return new Response('[]');
            return new Response('{"code":"23505","message":"duplicate"}', { status: 409 });
        };
        expect((await (await run(liveBody())).json()).error).toBe('pending_exists');
    });

    it('驗證失敗 400 不耗配額；每小時 3 次後 429；緊急開關 503；外站 403', async () => {
        const env = ENV();
        const bad = await run(liveBody({ entries: [entry({ date: '2000-01-01' })] }), env);
        expect(bad.status).toBe(400);
        expect((await bad.json()).error).toBe('invalid_entry_date');
        expect(env.RATE_LIMIT_KV._m.size).toBe(0);

        const limited = ENV();
        for (let i = 0; i < 3; i++) expect((await run(liveBody(), limited)).status).toBe(201);
        expect((await run(liveBody(), limited)).status).toBe(429);
        expect([...limited.RATE_LIMIT_KV._m.keys()].some((k) => k.startsWith('sched:h:'))).toBe(true);

        expect((await run(liveBody(), { ...ENV(), SUBMISSIONS_DISABLED: 'true' })).status).toBe(503);
        const cross = await entriesPost({ request: post('/api/schedule/entries', liveBody(), { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' }), env: ENV() });
        expect(cross.status).toBe(403);
    });
});

describe('POST /api/admin/contributions（週表投稿）', () => {
    const admin = (path: string, b: unknown) =>
        new Request(`https://multistreaming.org${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': 'admintoken' }, body: JSON.stringify(b) });
    const approve = (b: unknown) => adminContribPost({ request: admin(`/api/admin/contributions?id=${CID}&action=approve`, b), env: ENV() }, { now: NOW });

    it('action=schedule：驗證列後呼叫 approve_schedule_contribution；備註先合併進 payload', async () => {
        sb = (method, path) => {
            if (path.startsWith('rpc/')) return new Response('{"vtuber_id":"v","slug":"akumu","written":1,"canceled":0}');
            if (method === 'GET' && path.includes('select=twitch_login')) return new Response('[{"twitch_login":null,"action":"schedule"}]');
            if (method === 'GET') return new Response('[{"payload":{"vtuber_id":"v","source":"user"}}]');
            return new Response('[{"id":"c"}]');
        };
        const res = await approve({ entries: [entry({ title: ' 改過 ' })], notes: ' 看過推特 ' });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, result: { vtuber_id: 'v', slug: 'akumu', written: 1, canceled: 0 } });
        const patch = calls.find((c) => c.method === 'PATCH')!;
        expect(patch.url).toContain(`id=eq.${CID}&status=eq.pending`);
        expect(patch.body).toEqual({ payload: { vtuber_id: 'v', source: 'user', reviewer_notes: '看過推特' } });
        expect(calls.find((c) => c.url.includes('rpc/approve_schedule_contribution'))!.body).toEqual({
            p_id: CID,
            p_entries: [{ date: '2026-10-06', time: '20:00', title: '改過', platform: 'youtube' }],
        });
        expect(calls.some((c) => c.url.includes('rpc/approve_vtuber_contribution'))).toBe(false);
    });

    it('沒給 entries → p_entries null；沒備註不改 payload；RPC 錯誤碼轉 HTTP；列格式錯 400', async () => {
        sb = (method, path) => {
            if (path.startsWith('rpc/')) return new Response('{"message":"channel_not_found","code":"P0002"}', { status: 400 });
            return new Response('[{"twitch_login":null,"action":"schedule"}]');
        };
        const res = await approve({});
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('channel_not_found');
        expect(calls.find((c) => c.url.includes('rpc/approve_schedule_contribution'))!.body).toEqual({ p_id: CID, p_entries: null });
        expect(calls.some((c) => c.method === 'PATCH')).toBe(false);

        calls = [];
        const bad = await approve({ entries: [entry({ time: '25:00' })] });
        expect(bad.status).toBe(400);
        expect((await bad.json()).error).toBe('invalid_entry_time');
        expect(calls.some((c) => c.url.includes('rpc/'))).toBe(false);
    });
});
