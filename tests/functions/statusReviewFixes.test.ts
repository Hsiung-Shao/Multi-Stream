// 公開狀態頁：2026-10-08 多 agent code review 的修正，以及常數 ↔ 文案 ↔ SQL 的一致性
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    jobHealth, youtubeHealth, summarizeTwitch, overallHealth,
    JOB_KEYS, JOB_THRESHOLDS, OG_FAIL_RATIO, FAILED_STREAK_DOWN,
    // @ts-expect-error functions 目錄的 ESM JS 無型別宣告
} from '../../functions/lib/status-health.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { maskContact, toPublicFeedback, MASK, FEEDBACK_PUBLIC_DAYS } from '../../functions/lib/feedback-public.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { ISSUE_STATUSES, ISSUE_AREAS, RESOLVED_VISIBLE_DAYS } from '../../functions/lib/known-issues.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestGet as statusGet, resetStatusMemo } from '../../functions/api/status.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestPost as feedbackSubmit } from '../../functions/api/feedback/submit.js';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const MIN = 60_000;
const ago = (m: number) => new Date(NOW - m * MIN).toISOString();
const ROOT = resolve(__dirname, '../..');
const LANGS = ['zh-TW', 'en', 'zh-CN', 'ja', 'ko'];
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('燈號判斷（review 修正）', () => {
    it('整輪失敗：單次延遲、連續達門檻才異常（failed_streak）', () => {
        const row = (stats: Record<string, unknown>) => ({ job_name: 'schedule_heavy_rss', last_run_at: ago(1), last_run_stats: stats });
        expect(jobHealth('schedule_heavy_rss', row({ failed: true, failed_streak: 1 }), NOW).status).toBe('degraded');
        expect(jobHealth('schedule_heavy_rss', row({ failed: true, failed_streak: FAILED_STREAK_DOWN }), NOW).status).toBe('down');
        // 舊版排程沒有 failed_streak：當成 1 輪
        expect(jobHealth('schedule_heavy_rss', row({ failed: true }), NOW).status).toBe('degraded');
    });

    it('樣本小但全數失敗仍判延遲', () => {
        const live = (checked: number, failed: number) => ({ last_run_at: ago(5), last_run_stats: { og_checked: checked, og_failed: failed } });
        expect(youtubeHealth(live(9, 9), NOW).status).toBe('degraded');
        expect(youtubeHealth(live(2, 2), NOW).status).toBe('operational');
        expect(youtubeHealth(live(9, 8), NOW).status).toBe('operational');
    });

    it('Twitch 回 200 但格式不對 → null（交給短快取），不能判成正常', () => {
        expect(summarizeTwitch({})).toBeNull();
        expect(summarizeTwitch([])).toBeNull();
        expect(summarizeTwitch({ status: { indicator: 'weird' }, components: [] })).toBeNull();
        expect(summarizeTwitch({ status: { indicator: 'none' } })?.status).toBe('operational');
    });

    it('總燈號忽略拿不到資料的來源', () => {
        expect(overallHealth(['operational', 'operational', 'unknown'])).toBe('operational');
        expect(overallHealth(['operational', undefined, 'degraded'])).toBe('degraded');
        expect(overallHealth(['unknown', undefined, null])).toBe('unknown');
    });
});

describe('遮蔽（review 修正）', () => {
    const ZW = '​';
    it.each([
        `jerry@gmail${ZW}.com`, `0912${ZW}345678`, `j${ZW}e${ZW}rry@gmail.com`, 'jerry­@gmail.com', 'jerry⁠@gmail.com',
        'IG@foo_bar', '加我 ig foo.bar', '我的line是 abc123', 'discord 用戶名 foo_bar', 'jerry＠gmail。com', 'jerry @ gmail . com',
        '02-2345-6789',
    ])('遮蔽變形寫法：%s', (input) => {
        const out = maskContact(input);
        expect(out).toContain(MASK);
        expect(out.split(MASK).join('')).not.toMatch(/gmail|jerry|foo|abc123|\d{4}/);
    });

    it.each(['問題x：畫面黑屏', 'Threads：好用', 'x: 很棒', 'line: 很卡', '影片ID 012345678', 'VOD 0234567890', '👨‍👩‍👧 家族'])(
        '不誤遮：%s', (input) => expect(maskContact(input)).toBe(input),
    );

    it('截斷點落在 email／電話中間時不外露被切半的片段', () => {
        for (const tail of ['jerry@gmail.com', '0912345678']) {
            for (let n = 180; n <= 210; n++) {
                const content = `https://${'a'.repeat(150)} ${'x'.repeat(n)} ${tail}`;
                const [r] = toPublicFeedback([{ id: '1', content, status: 'read', created_at: '2026-10-08T00:00:00Z' }]);
                expect(r.content).not.toMatch(/jerry|gmai|09123/);
            }
        }
    });

    it('舊值 processed 輸出成 fixed；日期只到「日」（台北時區）', () => {
        const [r] = toPublicFeedback([{ id: '1', content: 'x', status: 'processed', created_at: '2026-10-08T16:30:00Z' }]);
        expect(r).toEqual({ id: '1', content: 'x', status: 'fixed', created_at: '2026-10-09' });
    });

    it('一般中文長文（沒有或只有少量 @）的最壞耗時仍在預算內', () => {
        const cjk = '這是一段很長的中文回報內容，描述畫面卡住與聲音不見的狀況。'.repeat(200);
        for (const content of [cjk, `${cjk.slice(0, 300)}@某人 ${cjk}`, 'a@'.repeat(2500)]) {
            const rows = Array.from({ length: 30 }, (_, i) => ({ id: String(i), content, status: 'read', created_at: '2026-10-08T00:00:00Z' }));
            toPublicFeedback(rows);
            const t0 = performance.now();
            toPublicFeedback(rows);
            expect(performance.now() - t0).toBeLessThan(25);
        }
    });
});

describe('一致性：常數 ↔ 文案 ↔ SQL', () => {
    it('排程的公開 key 與門檻表一致，五語都有對應文案', () => {
        expect(Object.keys(JOB_KEYS).sort()).toEqual(Object.keys(JOB_THRESHOLDS).sort());
        for (const lang of LANGS) {
            const src = read(`src/i18n/locales/${lang}/status.ts`);
            for (const key of Object.values(JOB_KEYS)) expect(src, `${lang} services.site.jobs.${key}`).toContain(`'services.site.jobs.${key}'`);
        }
    });

    it('已知問題的狀態與影響範圍：後端常數 = migration CHECK，五語都有文案', () => {
        const sql = read('supabase/migrations/20261008100000_known_issues.sql');
        for (const s of ISSUE_STATUSES) expect(sql).toContain(`'${s}'`);
        for (const a of ISSUE_AREAS) expect(sql).toContain(`'${a}'`);
        for (const lang of LANGS) {
            const src = read(`src/i18n/locales/${lang}/status.ts`);
            for (const s of ISSUE_STATUSES) expect(src, `${lang} issues.status.${s}`).toContain(`'issues.status.${s}'`);
            for (const a of ISSUE_AREAS) expect(src, `${lang} issues.areas.${a}`).toContain(`'issues.areas.${a}'`);
        }
    });

    it('文案寫死的天數與百分比和後端常數一致（zh-TW）', () => {
        const src = read('src/i18n/locales/zh-TW/status.ts');
        const days = [...src.matchAll(/(\d+)\s*天/g)].map((m) => Number(m[1]));
        expect(days.length).toBeGreaterThan(0);
        for (const d of days) expect([RESOLVED_VISIBLE_DAYS, FEEDBACK_PUBLIC_DAYS]).toContain(d);
        for (const m of src.matchAll(/(\d+)%/g)) expect(Number(m[1])).toBe(Math.round(OG_FAIL_RATIO.degraded * 100));
    });
});

// ---------- 端點 ----------

type SbHandler = (method: string, path: string, body: unknown) => Response;
let sb: SbHandler;
let calls: Array<{ method: string; url: string; body: unknown }>;
const ENV = () => ({ SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'srk' });

beforeEach(() => {
    resetStatusMemo();
    calls = [];
    sb = () => new Response('[]');
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
        calls.push({ method, url, body });
        if (url.startsWith('https://status.twitch.com/')) return new Response(JSON.stringify({ status: { indicator: 'none' }, components: [] }));
        if (url.startsWith('http://sb/rest/v1/')) return sb(method, url.slice('http://sb/rest/v1/'.length), body);
        throw new Error(`unexpected fetch ${url}`);
    }));
});
afterEach(() => vi.unstubAllGlobals());

describe('/api/status：沒有 Cache API（*.pages.dev）時仍不放大到 DB', () => {
    const ctx = () => ({ request: new Request('https://x.pages.dev/api/status'), env: ENV() });
    const dbCalls = () => calls.filter((c) => c.url.startsWith('http://sb/')).length;

    it('同時進來的請求共用同一次查詢；之後 60 秒內走記憶體快取', async () => {
        const [a, b] = await Promise.all([statusGet(ctx()), statusGet(ctx())]);
        expect([a.headers.get('X-Edge-Cache'), b.headers.get('X-Edge-Cache')].sort()).toEqual(['MISS-NOCACHE', 'SHARED-NOCACHE']);
        const after = dbCalls();
        expect(after).toBe(4); // jobs、issues、announcements、feedbacks 各一次
        const c = await statusGet(ctx());
        expect(c.headers.get('X-Edge-Cache')).toBe('MEMO');
        expect(dbCalls()).toBe(after);
        expect((await c.json()).success).toBe(true);
    });

    it('排程資料只撈判燈需要的子欄位（不撈整份 last_run_stats）', async () => {
        await statusGet(ctx());
        const q = calls.find((c) => c.url.includes('cron_shard_state'))!.url;
        expect(q).toContain('failed:last_run_stats->failed');
        expect(q).toContain('og_checked:last_run_stats->og_checked');
        expect(q).not.toMatch(/select=[^&]*last_run_stats(?!->)/);
    });
});

describe('/api/feedback/submit：還沒套 migration（沒有 public_notice 欄位）時去掉欄位重送', () => {
    it('第一次 PGRST204 → 去掉 public_notice 重送成功', async () => {
        let n = 0;
        sb = (method) => {
            if (method !== 'POST') return new Response('[]');
            n++;
            return n === 1
                ? new Response(JSON.stringify({ code: 'PGRST204', message: "Could not find the 'public_notice' column" }), { status: 400 })
                : new Response('[{}]', { status: 201 });
        };
        const res = await feedbackSubmit({
            request: new Request('https://multistreaming.org/api/feedback/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
                body: JSON.stringify({ feedbackType: 'bug', content: '聊天室空白', publicNotice: true }),
            }),
            env: ENV(),
        });
        expect(res.status).toBe(200);
        const posts = calls.filter((c) => c.method === 'POST' && c.url.includes('/feedbacks'));
        expect(posts).toHaveLength(2);
        expect(posts[0].body).toHaveProperty('public_notice', true);
        expect(posts[1].body).not.toHaveProperty('public_notice');
    });
});
