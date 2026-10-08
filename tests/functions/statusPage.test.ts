// 公開狀態頁（後端）：
//   lib：status-health 燈號判斷、known-issues 寫入驗證
//   端點：/api/status、/api/admin/known-issues
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    jobHealth,
    siteHealth,
    youtubeHealth,
    summarizeTwitch,
    worstHealth,
    // @ts-expect-error functions 目錄的 ESM JS 無型別宣告
} from '../../functions/lib/status-health.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { buildKnownIssueWritePayload, publicIssuesQuery } from '../../functions/lib/known-issues.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { maskContact, toPublicFeedback, publicFeedbackQuery, MASK, FEEDBACK_PUBLIC_MAX_LEN } from '../../functions/lib/feedback-public.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestGet as statusGet, buildStatus, resetStatusMemo } from '../../functions/api/status.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestPost as feedbackSubmit } from '../../functions/api/feedback/submit.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestGet as adminGet, onRequestPost as adminPost, onRequestPut as adminPut } from '../../functions/api/admin/known-issues.js';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const MIN = 60_000;
const ago = (m: number) => new Date(NOW - m * MIN).toISOString();
const row = (job_name: string, minutesAgo: number | null, stats: Record<string, unknown> = { errors: [] }) => ({
    job_name,
    last_run_at: minutesAgo == null ? null : ago(minutesAgo),
    last_run_stats: stats,
});

describe('jobHealth', () => {
    it('依間隔判斷正常／延遲／異常', () => {
        expect(jobHealth('schedule_live_og', row('schedule_live_og', 10), NOW).status).toBe('operational');
        expect(jobHealth('schedule_live_og', row('schedule_live_og', 60), NOW).status).toBe('degraded');
        expect(jobHealth('schedule_live_og', row('schedule_live_og', 120), NOW).status).toBe('down');
        expect(jobHealth('schedule_heavy_rss', row('schedule_heavy_rss', 120), NOW).status).toBe('operational');
    });

    it('整輪失敗（failed）→ 延遲；errors 混了單一頻道錯誤，不拿來判燈', () => {
        expect(jobHealth('schedule_light_rss', row('schedule_light_rss', 5, { errors: ['x'], failed: true }), NOW).status).toBe('degraded');
        expect(jobHealth('schedule_twitch', row('schedule_twitch', 5, { errors: ['twitch: channel suspended'] }), NOW).status).toBe('operational');
    });

    it('沒有資料 → unknown，公開 key 不外露 job_name', () => {
        expect(jobHealth('schedule_live_og', undefined, NOW)).toEqual({ key: 'live', status: 'unknown', lastRunAt: null });
    });
});

describe('siteHealth / worstHealth', () => {
    it('取最差的燈號；unknown 不算故障', () => {
        expect(worstHealth(['operational', 'unknown'])).toBe('unknown');
        expect(worstHealth(['unknown', 'degraded'])).toBe('degraded');
        const site = siteHealth([row('schedule_live_og', 10), row('schedule_light_rss', 5), row('schedule_heavy_rss', 30), row('schedule_twitch', 30)], NOW);
        expect(site.status).toBe('operational');
        expect(site.jobs.map((j: { key: string }) => j.key)).toEqual(['live', 'light', 'heavy', 'twitchSchedule']);
    });

    it('回傳內容不含 errors 字串', () => {
        const site = siteHealth([row('schedule_live_og', 10, { errors: ['secret internal message'] })], NOW);
        expect(JSON.stringify(site)).not.toContain('secret internal message');
    });
});

describe('youtubeHealth', () => {
    const live = (stats: Record<string, unknown>, minutesAgo = 10) => row('schedule_live_og', minutesAgo, { errors: [], ...stats });

    it('失敗率門檻', () => {
        expect(youtubeHealth(live({ og_checked: 100, og_failed: 10 }), NOW).status).toBe('operational');
        expect(youtubeHealth(live({ og_checked: 100, og_failed: 40 }), NOW).status).toBe('degraded');
        expect(youtubeHealth(live({ og_checked: 100, og_failed: 70 }), NOW).status).toBe('down');
    });

    it('這輪沒有要查的頻道或樣本太小：沿用排程新鮮度；quota 用完 → 延遲', () => {
        expect(youtubeHealth(live({ og_checked: 0, og_failed: 0 }), NOW).status).toBe('operational');
        expect(youtubeHealth(live({ og_checked: 6, og_failed: 3 }), NOW).status).toBe('operational');
        expect(youtubeHealth(live({ og_checked: 0, og_failed: 0 }, 120), NOW).status).toBe('down');
        expect(youtubeHealth(undefined, NOW).status).toBe('unknown');
        expect(youtubeHealth(live({ og_checked: 50, og_failed: 0, quota_exceeded: true }), NOW).status).toBe('degraded');
    });

    it('偵測停擺時失敗率再好也不算正常；這輪整個失敗時 og 數字不可信 → 未知，並標 runFailed', () => {
        expect(youtubeHealth(live({ og_checked: 50, og_failed: 0 }, 120), NOW).status).toBe('down');
        const failedRun = youtubeHealth(live({ og_checked: 0, og_failed: 0, failed: true }), NOW);
        expect(failedRun).toMatchObject({ status: 'unknown', runFailed: true });
        expect(youtubeHealth(live({ og_checked: 50, og_failed: 0 }), NOW).runFailed).toBe(false);
    });
});

describe('summarizeTwitch', () => {
    it('對應 indicator 與元件狀態，略過群組元件', () => {
        const s = summarizeTwitch({
            page: { updated_at: '2026-10-08T11:00:00Z' },
            status: { indicator: 'minor' },
            components: [
                { name: 'Chat', status: 'partial_outage' },
                { name: 'Video', status: 'operational' },
                { name: 'Group', status: 'operational', group: true },
            ],
            incidents: [{ name: 'Chat issues', status: 'identified', shortlink: 'https://stspg.io/x', updated_at: 'x' }, { name: 'bad', shortlink: 'javascript:alert(1)' }],
        });
        expect(s.status).toBe('degraded');
        expect(s.components).toEqual([{ name: 'Chat', status: 'degraded' }, { name: 'Video', status: 'operational' }]);
        expect(s.incidents[0].url).toBe('https://stspg.io/x');
        expect(s.incidents[1].url).toBeNull();
    });

    it('格式不對 → null', () => {
        expect(summarizeTwitch(null)).toBeNull();
        expect(summarizeTwitch('x')).toBeNull();
    });
});

describe('buildKnownIssueWritePayload', () => {
    const now = new Date(NOW);

    it('新增：預設值與驗證', () => {
        expect(buildKnownIssueWritePayload({ title: ' 聊天室載不出來 ' }, { now })).toEqual({
            ok: true,
            row: { title: '聊天室載不出來', status: 'investigating', resolved_at: null, severity: 'minor', areas: [], is_public: false },
        });
        expect(buildKnownIssueWritePayload({ title: '' }).error).toBe('title_required');
        expect(buildKnownIssueWritePayload({ title: 'x'.repeat(121) }).error).toBe('title_too_long');
        expect(buildKnownIssueWritePayload({ title: 'x', areas: ['canvas', 'evil'] }).error).toBe('invalid_areas');
        expect(buildKnownIssueWritePayload({ title: 'x', status: 'done' }).error).toBe('invalid_status');
        expect(buildKnownIssueWritePayload({ title: 'x', is_public: 'yes' }).error).toBe('invalid_is_public');
        expect(buildKnownIssueWritePayload([]).error).toBe('invalid_body');
    });

    it('resolved_at：改成 resolved 才填，狀態沒變不動，改回去清空；不接受 caller 指定', () => {
        expect(buildKnownIssueWritePayload({ status: 'resolved', resolved_at: '2000-01-01' }, { partial: true, now, previousStatus: 'fixing' }).row)
            .toEqual({ status: 'resolved', resolved_at: now.toISOString() });
        expect(buildKnownIssueWritePayload({ status: 'resolved' }, { partial: true, now, previousStatus: 'resolved' }).row).toEqual({ status: 'resolved' });
        expect(buildKnownIssueWritePayload({ status: 'fixing' }, { partial: true, now, previousStatus: 'resolved' }).row).toEqual({ status: 'fixing', resolved_at: null });
    });

    it('公開查詢只取公開、未解決或 14 天內解決', () => {
        const q = publicIssuesQuery(NOW);
        expect(q).toContain('is_public=eq.true');
        expect(q).toContain('or=(status.neq.resolved,resolved_at.gte.');
        expect(q).toContain(encodeURIComponent('2026-09-24T12:00:00.000Z'));
        expect(q).not.toContain('is_public,');
    });
});

describe('使用者回報公開規則', () => {
    it.each([
        '寄到 a.b+1@gmail.com', 'jerry＠gmail.com', 'jerry @ gmail.com', '王小明@例子.台灣',
        'https://x.com/me', 'www.example.com/a', 'discord.gg/abc123', 't.me/jerry', 'twitch.tv/somename',
        'IG @jerry_tw', 'Discord: jerry#1234', 'line id: jerry0912',
        '0912-345-678', '0912.345.678', '０９１２３４５６７８', '0912-34-56 78', '(02)2345-6789', '+886 912 345 678', '零九一二三四五六七八',
    ])('遮蔽：%s', (input) => {
        const out = maskContact(input);
        expect(out).toContain(MASK);
        // 遮蔽後不能再看到 @ 後的網域或連續的電話數字
        expect(out).not.toMatch(/gmail|example|jerry|abc123|somename|\d{3}[-. ]?\d{3}[-. ]?\d{3}|[０-９]{4}/);
    });

    it.each([
        '20261008 開始壞', '解析度 1920 1080', 'VOD 2271234567', '錯誤碼 (404) 12345678',
        '2026-10-08 20:30 在 v3.7.0、1920x1080 發生', '每 20 分鐘', '聊天室空白',
        // 中文全形標點不能被轉成半形
        '手機上，聊天室太窄：（看不到）！',
    ])('不誤遮：%s', (input) => {
        expect(maskContact(input)).toBe(input);
    });

    it('移除雙向控制字元；截斷不切壞 emoji', () => {
        expect(maskContact('abc\u202Edef')).toBe('abcdef');
        const [r] = toPublicFeedback([{ id: '1', content: '😀'.repeat(FEEDBACK_PUBLIC_MAX_LEN + 5), status: 'read', created_at: 't' }]);
        expect(Array.from(r.content)).toHaveLength(FEEDBACK_PUBLIC_MAX_LEN + 1);
        expect(r.content).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    });

    it('最壞情況（30 筆 × 5000 字的回溯陷阱字串）仍在 Workers CPU 預算內', () => {
        for (const bad of ['a'.repeat(5000), '1-'.repeat(2500), 'www.'.repeat(1250), 'a.'.repeat(2500)]) {
            const rows = Array.from({ length: 30 }, (_, i) => ({ id: String(i), content: bad, status: 'read', created_at: 't' }));
            toPublicFeedback(rows); // 暖機（JIT）
            const t0 = performance.now();
            toPublicFeedback(rows);
            // Workers 免費方案每次請求 10 ms CPU；這段要留給其他工作，本機量測要求 < 25 ms（CI 機器較慢的保守上限）
            expect(performance.now() - t0).toBeLessThan(25);
        }
    });

    it('轉公開格式：只留 id／content／status／created_at，先遮蔽再截斷', () => {
        const long = 'x'.repeat(FEEDBACK_PUBLIC_MAX_LEN + 50);
        const [a, b] = toPublicFeedback([
            { id: '1', content: ' 聯絡 me@a.io ', status: 'read', created_at: '2026-10-08T03:00:00Z', rating: 5, user_agent: 'UA' },
            { id: '2', content: long, status: 'fixed', created_at: 't' },
        ]);
        expect(a).toEqual({ id: '1', content: `聯絡 ${MASK}`, status: 'read', created_at: '2026-10-08' });
        expect(b.content).toHaveLength(FEEDBACK_PUBLIC_MAX_LEN + 1);
        expect(b.content.endsWith('…')).toBe(true);
    });

    it('查詢：只取公開欄位、public_notice、非封存、近 30 天', () => {
        const q = publicFeedbackQuery(NOW);
        expect(q).toContain('select=id,content,status,created_at');
        expect(q).toContain('public_notice=eq.true');
        // processed 是舊後台的值（等同已修正），migration 為相容舊後台保留它
        expect(q).toContain('status=in.(read,processing,fixed,processed)');
        expect(q).not.toContain('archived');
        expect(q).not.toContain('unread');
        expect(q).toContain(encodeURIComponent('2026-09-08T12:00:00.000Z'));
    });
});

// ---------- 端點 ----------

type SbHandler = (method: string, path: string, body: unknown) => Response;
let sb: SbHandler;
let twitch: () => Promise<Response>;
let calls: Array<{ method: string; url: string; body: unknown }>;

const ENV = () => ({ SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'srk', ADMIN_API_TOKEN: 'admintoken' });

beforeEach(() => {
    resetStatusMemo();
    calls = [];
    sb = () => new Response('[]');
    twitch = async () => new Response(JSON.stringify({ status: { indicator: 'none' }, components: [{ name: 'Chat', status: 'operational' }], incidents: [] }));
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
        calls.push({ method, url, body });
        if (url.startsWith('https://status.twitch.com/')) return twitch();
        if (url.startsWith('http://sb/rest/v1/')) return sb(method, url.slice('http://sb/rest/v1/'.length), body);
        throw new Error(`unexpected fetch ${url}`);
    }));
});
afterEach(() => vi.unstubAllGlobals());

describe('/api/status', () => {
    const jobs = [
        { job_name: 'schedule_live_og', last_run_at: new Date(Date.now() - 5 * MIN).toISOString(), failed: false, og_checked: 10, og_failed: 1, errors: ['internal boom'] },
    ];

    it('四區都有資料；不回 errors 字串', async () => {
        sb = (_m, path) => {
            if (path.startsWith('cron_shard_state')) return new Response(JSON.stringify(jobs));
            if (path.startsWith('known_issues')) return new Response(JSON.stringify([{ id: 'i1', title: '已知問題' }]));
            if (path.startsWith('announcements')) return new Response(JSON.stringify([{ id: 'a1', title: '公告' }]));
            if (path.startsWith('feedbacks')) return new Response(JSON.stringify([{ id: 'f1', content: '聊天室空白 寄 x@y.io', status: 'processing', created_at: '2026-10-08T16:30:00Z' }]));
            return new Response('[]');
        };
        const res = await statusGet({ request: new Request('https://multistreaming.org/api/status'), env: ENV() });
        expect(res.status).toBe(200);
        expect(res.headers.get('Cache-Control')).toBe('no-cache');
        const text = await res.text();
        expect(text).not.toContain('internal boom');
        const data = JSON.parse(text);
        expect(data.site.jobs[0]).toMatchObject({ key: 'live', status: 'operational' });
        expect(data.youtube).toMatchObject({ status: 'operational', checked: 10, failed: 1 });
        expect(data.twitch.status).toBe('operational');
        expect(data.issues).toEqual([{ id: 'i1', title: '已知問題' }]);
        expect(data.announcements).toEqual([{ id: 'a1', title: '公告' }]);
        expect(data.feedbacks).toEqual([{ id: 'f1', content: `聊天室空白 寄 ${MASK}`, status: 'processing', created_at: '2026-10-09' }]);
        expect(text).not.toContain('x@y.io');

        const annQuery = calls.find((c) => c.url.includes('/announcements?'))!.url;
        expect(annQuery).toContain('type=eq.announcement');
        expect(annQuery).toContain('target_segment=eq.all');
        expect(annQuery).toContain('status=eq.published');
        expect(annQuery).not.toContain('archived');
        expect(annQuery).not.toContain('created_by');
    });

    it('Twitch 失敗或 DB 失敗時其他區塊照常回', async () => {
        twitch = async () => { throw new Error('timeout'); };
        sb = (_m, path) => (path.startsWith('known_issues') ? new Response('boom', { status: 500 }) : new Response('[]'));
        const data = await buildStatus({ env: ENV() }, Date.now());
        expect(data.success).toBe(true);
        expect(data.twitch).toBeNull();
        expect(data.issues).toBeNull();
        expect(data.announcements).toEqual([]);
        expect(data.site.status).toBe('unknown');
    });

    it('edge 快取命中時不再查資料庫', async () => {
        const store = new Map<string, Response>();
        vi.stubGlobal('caches', {
            default: {
                match: async (req: Request) => store.get(req.url)?.clone(),
                put: async (req: Request, res: Response) => { store.set(req.url, res); },
            },
        });
        const pending: Promise<unknown>[] = [];
        const ctx = () => ({ request: new Request('https://multistreaming.org/api/status'), env: ENV(), waitUntil: (p: Promise<unknown>) => pending.push(p) });
        const first = await statusGet(ctx());
        expect(first.headers.get('X-Edge-Cache')).toBe('MISS');
        await Promise.all(pending);
        const before = calls.length;
        const second = await statusGet(ctx());
        expect(second.headers.get('X-Edge-Cache')).toBe('HIT');
        expect(second.headers.get('Content-Type')).toBe('application/json');
        expect((await second.json()).success).toBe(true);
        expect(calls.length).toBe(before);
    });
});

describe('/api/feedback/submit：公開告知旗標', () => {
    const submit = (body: Record<string, unknown>) => feedbackSubmit({
        request: new Request('https://multistreaming.org/api/feedback/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
            body: JSON.stringify({ feedbackType: 'bug', content: '聊天室空白', ...body }),
        }),
        env: ENV(),
    });
    const inserted = () => calls.filter((c) => c.method === 'POST' && c.url.includes('/feedbacks')).at(-1)!.body as Record<string, unknown>;

    it('新版表單送 publicNotice: true 才標記公開；舊版或亂送的值一律 false', async () => {
        sb = () => new Response('[{}]', { status: 201 });
        expect((await submit({ publicNotice: true })).status).toBe(200);
        expect(inserted().public_notice).toBe(true);
        await submit({});
        expect(inserted().public_notice).toBe(false);
        await submit({ publicNotice: 'true' });
        expect(inserted().public_notice).toBe(false);
    });
});

describe('/api/admin/known-issues', () => {
    const ID = '11111111-1111-4111-8111-111111111111';
    const admin = (path: string, init: RequestInit = {}, token = 'admintoken') =>
        new Request(`https://multistreaming.org${path}`, { ...init, headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token } });

    it('沒有 token 401', async () => {
        expect((await adminGet({ request: admin('/api/admin/known-issues', {}, 'wrong'), env: ENV() })).status).toBe(401);
    });

    it('新增：驗證失敗 400；成功寫入標準化後的 row', async () => {
        const bad = await adminPost({ request: admin('/api/admin/known-issues', { method: 'POST', body: JSON.stringify({ title: '' }) }), env: ENV() });
        expect(bad.status).toBe(400);
        sb = (method) => new Response(JSON.stringify([{ id: ID }]), { status: method === 'POST' ? 201 : 200 });
        const ok = await adminPost({ request: admin('/api/admin/known-issues', { method: 'POST', body: JSON.stringify({ title: '測試', areas: ['chat'], is_public: true }) }), env: ENV() });
        expect(ok.status).toBe(200);
        expect(calls.find((c) => c.method === 'POST' && c.url.includes('known_issues'))!.body).toMatchObject({ title: '測試', areas: ['chat'], is_public: true });
    });

    it('更新：先查目前狀態，狀態沒變不刷新 resolved_at；查不到 404', async () => {
        sb = (method) => (method === 'GET' ? new Response(JSON.stringify([{ status: 'resolved' }])) : new Response(JSON.stringify([{ id: ID }])));
        const res = await adminPut({ request: admin(`/api/admin/known-issues?id=${ID}`, { method: 'PUT', body: JSON.stringify({ title: '改標題', status: 'resolved' }) }), env: ENV() });
        expect(res.status).toBe(200);
        const patch = calls.find((c) => c.method === 'PATCH')!.body as Record<string, unknown>;
        expect(patch).toEqual({ title: '改標題', status: 'resolved' });

        sb = () => new Response('[]');
        const missing = await adminPut({ request: admin(`/api/admin/known-issues?id=${ID}`, { method: 'PUT', body: JSON.stringify({ title: 'x' }) }), env: ENV() });
        expect(missing.status).toBe(404);
        expect((await adminPut({ request: admin('/api/admin/known-issues?id=bad', { method: 'PUT', body: '{}' }), env: ENV() })).status).toBe(400);
    });
});
