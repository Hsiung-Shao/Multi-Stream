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

    it('總燈號：只忽略外部 Twitch 拿不到；本站自己的資料拿不到時不能顯示正常', () => {
        expect(overallHealth(['operational', 'operational'], ['unknown'])).toBe('operational');
        expect(overallHealth(['operational', 'operational'], [undefined])).toBe('operational');
        expect(overallHealth([undefined, undefined], ['operational'])).toBe('unknown');
        expect(overallHealth(['unknown', 'operational'], ['operational'])).toBe('unknown');
        expect(overallHealth(['operational', 'degraded'], ['operational'])).toBe('degraded');
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

    it.each([
        '問題x：畫面黑屏', 'Threads：好用', 'x: 很棒', 'line: 很卡', '影片ID 012345678', 'VOD 0234567890', '👨‍👩‍👧 家族',
        // 英文句子提到平台名稱不能被當成帳號（第二輪 review：拿掉冒號要求後的回歸）
        'The second line is cut off in chat', 'I use discord daily and facebook login fails', 'Instagram embeds do not load',
        'Twitter player shows black screen', 'the threads view breaks', 'Please add Telegram support soon',
        // 第三輪 review：提示詞 id 要有字尾邊界、冒號後要有字母、中英混寫的一般字不是帳號
        'Each line identifies a stream', 'discord idle status wrong', 'Error on line: 42',
        '我用 Line app 分享連結會壞', '在 twitter app 裡看不到', '打開 ig reels 會當', 'Discord 是 OK 的',
    ])(
        '不誤遮：%s', (input) => expect(maskContact(input)).toBe(input),
    );

    it('中文緊鄰 email 時只遮 email，前後中文保留；超長帳號整段遮；點前後多空白、開頭多一個點也遮', () => {
        // email 左邊緊鄰的中文最多一起遮 4 字（「王小明abc@」的姓名不外露），右邊的中文完整保留
        expect(maskContact('請寄到我的信箱jerry@gmail.com謝謝你們的幫忙')).toBe(`請寄到${MASK}謝謝你們的幫忙`);
        expect(maskContact('王小明abc@gmail.com')).toBe(MASK);
        expect(maskContact('jerry@gmail.com.我等你回覆')).toBe(`${MASK}.我等你回覆`);
        expect(maskContact('mail jerry@gmail.com. Thanks a lot')).toBe(`mail ${MASK}. Thanks a lot`);
        expect(maskContact('jerry@gmail.com+bob@yahoo.com').split(MASK).join('')).not.toMatch(/bob|jerry/);
        expect(maskContact('王小明@例子.台灣')).toBe(MASK);
        expect(maskContact(`${'a'.repeat(100)}@gmail.com`)).toBe(MASK);
        expect(maskContact('寄 jerry@gmail   .com')).toBe(`寄 ${MASK}`);
        expect(maskContact('寄 jerry@.gmail.com')).toBe(`寄 ${MASK}`);
    });

    it('英文長回報截斷後仍保留大部分內容（第二輪 review：清尾段沒上限時整段被吃光）', () => {
        const sentence = 'The chat panel disappears when I open three streams and resize the window quickly. ';
        for (const content of [sentence.repeat(6), `${'中'.repeat(200)}${sentence.repeat(4)}`, sentence.replace(/ /g, ', ').repeat(5)]) {
            const [r] = toPublicFeedback([{ id: '1', content, status: 'read', created_at: '2026-10-08T00:00:00Z' }]);
            expect(r.content.length).toBeGreaterThanOrEqual(240);
            expect(content.startsWith(r.content.replace(/…$/, '').trimEnd())).toBe(true);
        }
    });

    it('截斷點切在帶空白的 email／電話中間也不外露（等長佔位後在原位置截斷）', () => {
        const tails = ['jerry@gmail .com', 'jerry @ gmail . com', 'jerry@gmail. com', 'jerry @gmail.com', '0912 345 678', '(02) 2345-6789'];
        for (const tail of tails) {
            for (const fill of ['字', 'x', 'ab ']) {
                for (let n = 100; n <= 420; n += 7) {
                    const content = `https://${'a'.repeat(140)} ${fill.repeat(n).slice(0, n)} ${tail} 後面還有`;
                    const [r] = toPublicFeedback([{ id: '1', content, status: 'read', created_at: '2026-10-08T00:00:00Z' }]);
                    expect(r.content.split(MASK).join('')).not.toMatch(/jerry|gmail|gma|091|234|345/);
                }
            }
        }
    });

    it('純中文長回報：公開 300 字並以「…」結尾；剛好 300 字不加', () => {
        for (const len of [301, 361, 1000]) {
            const [r] = toPublicFeedback([{ id: '1', content: '中'.repeat(len), status: 'read', created_at: '2026-10-08T00:00:00Z' }]);
            expect(Array.from(r.content)).toHaveLength(301);
            expect(r.content.endsWith('…')).toBe(true);
        }
        const [exact] = toPublicFeedback([{ id: '1', content: '中'.repeat(300), status: 'read', created_at: '2026-10-08T00:00:00Z' }]);
        expect(exact.content).toBe('中'.repeat(300));
    });

    it('大量零寬字元不能讓截斷點位移、把被切半的聯絡資訊拉進公開範圍', () => {
        const [r] = toPublicFeedback([{ id: '1', content: `${'\u200B'.repeat(4000)}${'字'.repeat(320)}jerry@gmail.com`, status: 'read', created_at: '2026-10-08T00:00:00Z' }]);
        expect(r.content).not.toMatch(/jerry|gmail/);
    });

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

describe('/api/status：排程子欄位 → 燈號；共用查詢失效後重建', () => {
    const ctx = () => ({ request: new Request('https://x.pages.dev/api/status'), env: ENV() });

    it('排程連續失敗達門檻 → 本站異常；DB 查不到時總燈號不是正常', async () => {
        sb = (_m, path) => (path.startsWith('cron_shard_state')
            ? new Response(JSON.stringify([{ job_name: 'schedule_heavy_rss', last_run_at: new Date().toISOString(), failed: true, failed_streak: FAILED_STREAK_DOWN }]))
            : new Response('[]'));
        const data = await (await statusGet(ctx())).json();
        expect(data.site.jobs.find((j: { key: string }) => j.key === 'heavy').status).toBe('down');

        resetStatusMemo();
        sb = (_m, path) => (path.startsWith('cron_shard_state') ? new Response('boom', { status: 500 }) : new Response('[]'));
        const failed = await (await statusGet(ctx())).json();
        expect(failed.site).toBeNull();
        expect(failed.overall).toBe('unknown');
    });
});

describe('/api/status：共用查詢與快取的邊界', () => {
    const okSb: SbHandler = (_m, path) => (path.startsWith('cron_shard_state')
        ? new Response(JSON.stringify([{ job_name: 'schedule_live_og', last_run_at: new Date().toISOString(), og_checked: 20, og_failed: 0 }]))
        : new Response('[]'));

    it('發起的請求以 waitUntil 撐到查詢完成；每支 DB 查詢都帶逾時訊號', async () => {
        sb = okSb;
        const waited: Promise<unknown>[] = [];
        await statusGet({ request: new Request('https://x.pages.dev/api/status'), env: ENV(), waitUntil: (p: Promise<unknown>) => waited.push(p) });
        expect(waited.length).toBeGreaterThan(0);
        const fetchMock = globalThis.fetch as unknown as { mock: { calls: Array<[string, RequestInit | undefined]> } };
        const dbInits = fetchMock.mock.calls.filter(([u]) => String(u).startsWith('http://sb/')).map(([, init]) => init);
        expect(dbInits).toHaveLength(4);
        for (const init of dbInits) expect(init?.signal).toBeInstanceOf(AbortSignal);
    });

    it('共用查詢卡住超過 15 秒就重建；舊查詢晚完成時不覆蓋較新的結果', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        try {
            vi.setSystemTime(Date.parse('2026-10-08T12:00:00Z'));
            let release: (r: Response) => void = () => {};
            let first = true;
            sb = (_m, path) => {
                if (path.startsWith('cron_shard_state') && first) {
                    first = false;
                    // 第一次查詢卡住，直到手動放行（回傳「舊」資料）
                    return new Promise<Response>((res) => { release = res; }) as unknown as Response;
                }
                return okSb('GET', path, null);
            };
            const ctx = () => ({ request: new Request('https://x.pages.dev/api/status'), env: ENV() });
            const stuck = statusGet(ctx());
            await new Promise((r) => setTimeout(r, 0));
            vi.setSystemTime(Date.parse('2026-10-08T12:00:16Z'));
            const fresh = await statusGet(ctx());
            expect(fresh.headers.get('X-Edge-Cache')).toBe('MISS-NOCACHE');
            const freshBody = await fresh.json();
            // 舊查詢現在才完成，回傳「舊」排程時間
            release(new Response(JSON.stringify([{ job_name: 'schedule_live_og', last_run_at: '2026-10-01T00:00:00Z' }])));
            await stuck;
            const after = await statusGet(ctx());
            expect(after.headers.get('X-Edge-Cache')).toBe('MEMO');
            expect((await after.json()).checkedAt).toBe(freshBody.checkedAt);
        } finally {
            vi.useRealTimers();
        }
    });

    it('有區塊拿不到資料時只短暫快取（10 秒後重查）', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        try {
            vi.setSystemTime(Date.parse('2026-10-08T12:00:00Z'));
            sb = (_m, path) => (path.startsWith('known_issues') ? new Response('boom', { status: 500 }) : okSb('GET', path, null));
            const ctx = () => ({ request: new Request('https://x.pages.dev/api/status'), env: ENV() });
            expect((await (await statusGet(ctx())).json()).issues).toBeNull();
            vi.setSystemTime(Date.parse('2026-10-08T12:00:05Z'));
            expect((await statusGet(ctx())).headers.get('X-Edge-Cache')).toBe('MEMO');
            sb = okSb;
            vi.setSystemTime(Date.parse('2026-10-08T12:00:11Z'));
            const recovered = await statusGet(ctx());
            expect(recovered.headers.get('X-Edge-Cache')).toBe('MISS-NOCACHE');
            expect((await recovered.json()).issues).toEqual([]);
        } finally {
            vi.useRealTimers();
        }
    });

    it('從沒跑過的排程顯示未知，但不讓本站燈號與總燈號永遠是未知', async () => {
        sb = okSb; // 只有 live 一支有資料
        const data = await (await statusGet({ request: new Request('https://x.pages.dev/api/status'), env: ENV() })).json();
        expect(data.site.jobs.find((j: { key: string }) => j.key === 'heavy').status).toBe('unknown');
        expect(data.site.status).toBe('operational');
        expect(data.overall).toBe('operational');
    });
});

describe('/api/feedback/submit：還沒套 migration（沒有 public_notice 欄位）時去掉欄位重送', () => {
    const submit = (content: string) => feedbackSubmit({
        request: new Request('https://multistreaming.org/api/feedback/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
            body: JSON.stringify({ feedbackType: 'bug', content, publicNotice: true }),
        }),
        env: ENV(),
    });
    const posts = () => calls.filter((c) => c.method === 'POST' && c.url.includes('/feedbacks'));

    it('其他錯誤不重送（CHECK 違規、500），內容含 public_notice 字樣也不重送', async () => {
        sb = (method) => (method === 'POST'
            ? new Response(JSON.stringify({ code: '23514', message: 'new row violates check constraint', details: 'Failing row contains (public_notice PGRST204)' }), { status: 400 })
            : new Response('[]'));
        expect((await submit('提到 public_notice 與 PGRST204 的回報')).status).toBe(500);
        expect(posts()).toHaveLength(1);
        calls = [];
        sb = (method) => (method === 'POST' ? new Response('boom', { status: 500 }) : new Response('[]'));
        expect((await submit('x')).status).toBe(500);
        expect(posts()).toHaveLength(1);
    });

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
