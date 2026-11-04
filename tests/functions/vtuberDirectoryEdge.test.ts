// VTuber 名錄頁（/vtubers）的 edge 端與個人頁「相關推薦」內文：
// resolveDirectory／renderDirectoryBodyHtml、catch-all 的 200／hreflang／RPC 失敗、個人頁 related 區塊、文案與 i18n 同步。
// M 編號對應計畫的測試規格表（M1–M4 是 SQL，不在此檔）
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { PAGE_PATHS, pathToPage } from '../../src/config/routes';
import { schedulePersonFromPath } from '../../src/config/schedulePerson';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequest } from '../../functions/[[path]].js';
// @ts-expect-error 同上
import { renderPersonBodyHtml, SCHEDULE_PERSON_BODY } from '../../functions/lib/schedule-person.js';
// @ts-expect-error 同上
import { ROUTE_META } from '../../functions/lib/seo-meta.js';
import zhTWSchedule from '../../src/i18n/locales/zh-TW/schedule';
import enSchedule from '../../src/i18n/locales/en/schedule';

// vtuber-directory.js 還不存在：動態載入，讓各 it 各自紅，不拖垮整檔
const DIR_MODULE = '../../functions/lib/vtuber-directory.js';
const loadDir = () => import(/* @vite-ignore */ DIR_MODULE);

const SITE = 'https://multistreaming.org';
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon-test' };

const DATA = {
    groups: [
        { id: 'g1', name: '子午計畫', parent_id: null, kind: 'agency' },
        { id: 'g2', name: '子午計畫二期生', parent_id: 'g1', kind: 'circle' },
        { id: 'g3', name: '獨立公司', parent_id: null, kind: 'agency' },
    ],
    people: [
        { slug: 'a1', name: '甲', img_url: null, group_id: 'g1', last_live_at: '2026-10-01T00:00:00Z' },
        { slug: 'b2', name: '乙', img_url: null, group_id: 'g2', last_live_at: null },
        { slug: 'c3', name: '丙', img_url: null, group_id: 'g3', last_live_at: '2026-09-20T00:00:00Z' },
        { slug: 'solo', name: '獨立丁', img_url: null, group_id: null, last_live_at: null },
    ],
};

const parseFragment = (html: string) => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
const hrefsOf = (el: ParentNode) => [...el.querySelectorAll('a')].map((a) => a.getAttribute('href'));
/** 取出標題（h2）文字含 needle 的 <section> */
const sectionByHeading = (doc: Document | Element, needle: string) =>
    [...doc.querySelectorAll('section')].find((s) => (s.querySelector('h2')?.textContent ?? '').includes(needle));

// ── M5 個人頁內文 ────────────────────────────────────────────────────────────

describe('M5 個人頁內文：相關推薦兩區塊與名錄麵包屑', () => {
    const related = {
        agency: { name: '子午計畫' },
        siblings: [{ slug: 'sib1', name: '同事甲', img_url: null, group: '子午計畫' }],
        neighbors: [{ slug: 'nb1', name: '鄰居乙', img_url: null, last_live_at: '2026-10-01T00:00:00Z' }],
    };
    const base = { name: '台一', youtube: null, twitch: null, streams: null };

    it('M5 zh-TW：兩個 section、標題含公司名、每人 href 帶 /zh-TW、麵包屑依序含名錄', () => {
        const html = renderPersonBodyHtml('zh-TW', { ...base, related }, 'abc');
        const doc = parseFragment(html);
        expect(doc.querySelectorAll('section')).toHaveLength(2);
        const agencySec = sectionByHeading(doc, '子午計畫');
        expect(agencySec, '同公司區塊標題含公司名').toBeDefined();
        expect(hrefsOf(agencySec as Element)).toEqual(['/zh-TW/schedule/sib1']);
        expect((agencySec as Element).querySelector('a')?.textContent).toBe('同事甲');
        const sections = [...doc.querySelectorAll('section')];
        const neighborSec = sections.find((s) => s !== agencySec) as Element;
        expect(hrefsOf(neighborSec)).toEqual(['/zh-TW/schedule/nb1']);
        expect(neighborSec.querySelector('a')?.textContent).toBe('鄰居乙');
        // 麵包屑：首頁 › 開台週表 › 名錄 › 本人
        const crumbs = hrefsOf(doc.querySelector('nav[aria-label="breadcrumb"]') as Element);
        expect(crumbs).toEqual(['/zh-TW', '/zh-TW/schedule', '/zh-TW/vtubers', '/zh-TW/schedule/abc']);
        expect(html).not.toContain('href="/schedule/');
    });

    it('M5 en：連結不加前綴', () => {
        const html = renderPersonBodyHtml('en', { ...base, related }, 'abc');
        expect(html).toContain('href="/schedule/sib1"');
        expect(html).toContain('href="/schedule/nb1"');
        expect(html).toContain('href="/vtubers"');
        expect(html).not.toContain('/zh-TW');
    });

    it('M5 related 為 null：整段不出，麵包屑仍有名錄', () => {
        const html = renderPersonBodyHtml('zh-TW', { ...base, related: null }, 'abc');
        expect(parseFragment(html).querySelectorAll('section')).toHaveLength(0);
        expect(html).toContain('href="/zh-TW/vtubers"');
    });

    it('M5 siblings 空：只出 neighbors 區塊；neighbors 空：只出同公司區塊', () => {
        const onlyN = parseFragment(renderPersonBodyHtml('zh-TW', { ...base, related: { ...related, siblings: [] } }, 'abc'));
        expect(onlyN.querySelectorAll('section')).toHaveLength(1);
        expect(hrefsOf(onlyN)).toContain('/zh-TW/schedule/nb1');
        expect(hrefsOf(onlyN)).not.toContain('/zh-TW/schedule/sib1');
        expect(sectionByHeading(onlyN, '子午計畫'), '沒有同事就不該出現公司標題').toBeUndefined();
        const onlyS = parseFragment(renderPersonBodyHtml('zh-TW', { ...base, related: { ...related, neighbors: [] } }, 'abc'));
        expect(onlyS.querySelectorAll('section')).toHaveLength(1);
        expect(hrefsOf(onlyS)).toContain('/zh-TW/schedule/sib1');
        expect(hrefsOf(onlyS)).not.toContain('/zh-TW/schedule/nb1');
    });

    it('M5 名字與公司名含標籤、引號時一律跳脫', () => {
        const evil = {
            agency: { name: '<script>x</script>' },
            siblings: [{ slug: 'sib1', name: '<img src=x onerror=1>', img_url: null, group: 'g' }],
            neighbors: [{ slug: 'nb1', name: '"><b>y</b>', img_url: null, last_live_at: null }],
        };
        const html = renderPersonBodyHtml('zh-TW', { ...base, related: evil }, 'abc');
        expect(html).not.toMatch(/<script|<img|<b>/);
        expect(html).toContain('&lt;img src=x onerror=1&gt;');
    });
});

// ── M6 名錄 edge ─────────────────────────────────────────────────────────────

describe('M6 resolveDirectory 與 renderDirectoryBodyHtml', () => {
    it('M6 resolveDirectory：呼叫 schedule_directory RPC、回 { ok, data }；第二次命中快取不再呼叫', async () => {
        const { resolveDirectory } = await loadDir();
        const store = new Map<string, Response>();
        const cache = {
            match: async (req: Request) => store.get(req.url)?.clone() ?? undefined,
            put: async (req: Request, res: Response) => { store.set(req.url, res); },
        };
        const rpcFn = vi.fn(async () => ({ ok: true, status: 200, data: DATA, error: null }));
        const first = await resolveDirectory(env, rpcFn, cache);
        expect(first).toEqual({ ok: true, data: DATA });
        expect(rpcFn).toHaveBeenCalledWith(env, 'schedule_directory', {});
        const second = await resolveDirectory(env, rpcFn, cache);
        expect(second).toEqual(first);
        expect(rpcFn).toHaveBeenCalledTimes(1);
    });

    it('M6 RPC 失敗 → { ok: false }，且不進快取（下次還會重打）', async () => {
        const { resolveDirectory } = await loadDir();
        const store = new Map<string, Response>();
        const cache = {
            match: async (req: Request) => store.get(req.url)?.clone() ?? undefined,
            put: async (req: Request, res: Response) => { store.set(req.url, res); },
        };
        const failing = vi.fn(async () => ({ ok: false, status: 500, data: null, error: 'x' }));
        expect(await resolveDirectory(env, failing, cache)).toEqual({ ok: false });
        expect(store.size).toBe(0);
        await resolveDirectory(env, failing, cache);
        expect(failing).toHaveBeenCalledTimes(2);
    });

    it('M6 renderDirectoryBodyHtml：h1、公司各一個 section、子團成員歸頂層公司並以子團名分隔、個人勢區、每人連結帶前綴', async () => {
        const { renderDirectoryBodyHtml, DIRECTORY_BODY } = await loadDir();
        const doc = parseFragment(renderDirectoryBodyHtml('zh-TW', DATA));
        expect(doc.querySelector('h1')?.textContent).toBe(DIRECTORY_BODY['zh-TW'].title);
        // 兩家公司＋個人勢，子團不另成頂層 section
        expect(doc.querySelectorAll('section')).toHaveLength(3);
        const corp = sectionByHeading(doc, '子午計畫') as Element;
        expect(corp, '公司 section').toBeDefined();
        expect(hrefsOf(corp).sort()).toEqual(['/zh-TW/schedule/a1', '/zh-TW/schedule/b2']);
        expect(corp.textContent).toContain('子午計畫二期生');
        const other = sectionByHeading(doc, '獨立公司') as Element;
        expect(hrefsOf(other)).toEqual(['/zh-TW/schedule/c3']);
        const indep = sectionByHeading(doc, DIRECTORY_BODY['zh-TW'].independent) as Element;
        expect(indep, '個人勢 section').toBeDefined();
        expect(hrefsOf(indep)).toEqual(['/zh-TW/schedule/solo']);
        expect(doc.querySelectorAll('a')).toHaveLength(4);
    });

    it('M6 renderDirectoryBodyHtml：en 連結不加前綴；資料庫字串一律跳脫', async () => {
        const { renderDirectoryBodyHtml } = await loadDir();
        const evil = {
            groups: [{ id: 'g1', name: '<script>x</script>', parent_id: null, kind: 'agency' }],
            people: [{ slug: 'a1', name: '<img src=x onerror=1>', img_url: null, group_id: 'g1', last_live_at: null }],
        };
        const html = renderDirectoryBodyHtml('en', evil);
        expect(html).not.toMatch(/<script|<img/);
        expect(html).toContain('href="/schedule/a1"');
        expect(renderDirectoryBodyHtml('en', DATA)).not.toContain('/zh-TW');
    });
});

// ── catch-all ────────────────────────────────────────────────────────────────

// 最小殼（同 langUrls.test.ts）：只放 catch-all 會改寫的標籤
const SHELL = `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8" /><title>x</title>
<meta name="title" content="x" /><meta name="description" content="x" /><meta name="robots" content="index, follow" />
<link rel="canonical" href="https://multistreaming.org/" />
<meta property="og:type" content="website" /><meta property="og:url" content="https://multistreaming.org/" />
<meta property="og:title" content="x" /><meta property="og:description" content="x" /><meta property="og:locale" content="zh_TW" />
<meta name="twitter:title" content="x" /><meta name="twitter:description" content="x" /><meta name="twitter:url" content="https://multistreaming.org/" />
<script type="application/ld+json" id="ld-webapp">{}</script></head><body><div id="root"></div></body></html>`;

/** Workers 的 HTMLRewriter 在 Node 不存在：用 jsdom 的 DOMParser 做最小替身 */
class FakeHTMLRewriter {
    private rules: Array<[string, { element?: (el: unknown) => void }]> = [];
    on(selector: string, handler: { element?: (el: unknown) => void }) {
        this.rules.push([selector, handler]);
        return this;
    }
    transform(res: Response) {
        const rules = this.rules;
        const body = new ReadableStream<Uint8Array>({
            async start(controller) {
                const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
                for (const [selector, handler] of rules) {
                    doc.querySelectorAll(selector).forEach((node) => {
                        handler.element?.({
                            setAttribute: (k: string, v: string) => node.setAttribute(k, v),
                            getAttribute: (k: string) => node.getAttribute(k),
                            remove: () => node.remove(),
                            setInnerContent: (c: string, o?: { html?: boolean }) => {
                                if (o?.html) node.innerHTML = c;
                                else node.textContent = c;
                            },
                            append: (c: string, o?: { html?: boolean }) => {
                                if (o?.html) node.insertAdjacentHTML('beforeend', c);
                                else node.append(c);
                            },
                        });
                    });
                }
                controller.enqueue(new TextEncoder().encode('<!DOCTYPE html>' + doc.documentElement.outerHTML));
                controller.close();
            },
        });
        return new Response(body, { status: res.status, headers: res.headers });
    }
}

/** 依 URL 分流的全域 fetch 替身：名錄 RPC 回 rpcResponse，其餘一律 404；全部呼叫記進 calls */
function stubSupabaseFetch(rpcResponse: () => Response) {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        calls.push(url);
        if (url.includes('/rest/v1/rpc/schedule_directory')) return rpcResponse();
        return new Response('[]', { status: 404 });
    }));
    return calls;
}
const jsonOk = (data: unknown) => () => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });

async function callEdge(path: string) {
    const env2 = {
        ...env,
        SUPABASE_SERVICE_ROLE_KEY: 'service-test',
        ASSETS: {
            fetch: vi.fn(async () => new Response(SHELL, { status: 200, headers: { 'content-type': 'text/html' } })),
        },
    };
    const res: Response = await onRequest({ request: new Request(`${SITE}${path}`), env: env2, next: vi.fn() });
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const alternates: Record<string, string> = {};
    doc.querySelectorAll('link[rel="alternate"][hreflang]').forEach((l) => {
        alternates[l.getAttribute('hreflang') as string] = l.getAttribute('href') as string;
    });
    return {
        res,
        doc,
        lang: doc.documentElement.getAttribute('lang'),
        title: doc.title,
        canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
        ogUrl: doc.querySelector('meta[property="og:url"]')?.getAttribute('content') ?? null,
        robots: doc.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null,
        root: doc.querySelector('#root')?.innerHTML ?? '',
        alternates,
    };
}

describe('catch-all：/vtubers 名錄頁', () => {
    beforeAll(() => {
        vi.stubGlobal('HTMLRewriter', FakeHTMLRewriter);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.stubGlobal('HTMLRewriter', FakeHTMLRewriter);
    });

    it('M6 /vtubers（英文）：200、lang=en、canonical／og:url／hreflang、#root 含名錄內文、title 取 ROUTE_META', async () => {
        stubSupabaseFetch(jsonOk(DATA));
        const r = await callEdge('/vtubers');
        expect(r.res.status).toBe(200);
        expect(r.lang).toBe('en');
        expect(r.canonical).toBe(`${SITE}/vtubers`);
        expect(r.ogUrl).toBe(`${SITE}/vtubers`);
        expect(r.alternates).toEqual({ en: `${SITE}/vtubers`, 'zh-TW': `${SITE}/zh-TW/vtubers`, 'x-default': `${SITE}/vtubers` });
        expect(r.robots).not.toMatch(/noindex/);
        expect(r.title).toBe(ROUTE_META['/vtubers'].en.title);
        const links = [...r.doc.querySelectorAll('#root a')].map((a) => a.getAttribute('href'));
        expect(links).toContain('/schedule/a1');
        expect(links).toContain('/schedule/solo');
        expect(r.doc.querySelector('#root h1')).not.toBeNull();
    });

    it('M6 /zh-TW/vtubers：lang=zh-TW、canonical 自指、內文連結帶 /zh-TW、公司名與個人勢在 #root', async () => {
        stubSupabaseFetch(jsonOk(DATA));
        const r = await callEdge('/zh-TW/vtubers');
        expect(r.res.status).toBe(200);
        expect(r.lang).toBe('zh-TW');
        expect(r.canonical).toBe(`${SITE}/zh-TW/vtubers`);
        expect(r.ogUrl).toBe(`${SITE}/zh-TW/vtubers`);
        expect(r.alternates).toEqual({ en: `${SITE}/vtubers`, 'zh-TW': `${SITE}/zh-TW/vtubers`, 'x-default': `${SITE}/vtubers` });
        expect(r.title).toBe(ROUTE_META['/vtubers']['zh-TW'].title);
        const links = [...r.doc.querySelectorAll('#root a')].map((a) => a.getAttribute('href'));
        expect(links).toEqual(expect.arrayContaining(['/zh-TW/schedule/a1', '/zh-TW/schedule/b2', '/zh-TW/schedule/c3', '/zh-TW/schedule/solo']));
        expect(r.root).toContain('子午計畫');
        expect(r.root).toContain('獨立公司');
    });

    it('M7 名錄 RPC 回 500：仍 200、robots 為 index（不 noindex）、#root 空殼', async () => {
        stubSupabaseFetch(() => new Response('boom', { status: 500 }));
        for (const path of ['/vtubers', '/zh-TW/vtubers']) {
            const r = await callEdge(path);
            expect(r.res.status, path).toBe(200);
            expect(r.robots, path).toMatch(/index/);
            expect(r.robots, path).not.toMatch(/noindex/);
            expect(r.root.trim(), path).toBe('');
        }
    });

    it('M8 /vtubers 不走個人頁分支：沒有對 vtubers 表發查詢，只打名錄 RPC', async () => {
        const calls = stubSupabaseFetch(jsonOk(DATA));
        await callEdge('/vtubers');
        await callEdge('/zh-TW/vtubers');
        expect(calls.some((u) => u.includes('/rest/v1/vtubers'))).toBe(false);
        expect(calls.some((u) => u.includes('/rest/v1/rpc/schedule_directory'))).toBe(true);
    });
});

describe('M8 /vtubers 路由對照', () => {
    it('M8 PAGE_PATHS／pathToPage 認得 /vtubers（含語言前綴）', () => {
        expect(PAGE_PATHS).toHaveProperty('vtubers', '/vtubers');
        expect(pathToPage('/vtubers')).toBe('vtubers');
        expect(pathToPage('/zh-TW/vtubers')).toBe('vtubers');
    });

    it('M8 schedulePersonFromPath 不把 /vtubers 當個人頁（防呆鎖）', () => {
        expect(schedulePersonFromPath('/vtubers')).toBeNull();
        expect(schedulePersonFromPath('/zh-TW/vtubers')).toBeNull();
    });
});

// ── M14 文案鎖 ───────────────────────────────────────────────────────────────

describe('M14 文案與 i18n 同步（zh-TW／en）', () => {
    it('M14 SCHEDULE_PERSON_BODY 的 related.agency／related.neighbors／directory 等於 schedule.ts 對應 key', () => {
        for (const [lang, dict] of [['zh-TW', zhTWSchedule], ['en', enSchedule]] as const) {
            const d = dict as Record<string, string>;
            const b = SCHEDULE_PERSON_BODY[lang];
            expect(b.related.agency).toBe(d['person.related.agency']);
            expect(b.related.neighbors).toBe(d['person.related.neighbors']);
            expect(b.directory).toBe(d['person.breadcrumb.directory']);
            // 鎖住 i18n 端真的有這些 key，避免兩邊同為 undefined 而誤過
            expect(d['person.related.agency']).toContain('{{name}}');
            expect(typeof d['person.related.neighbors']).toBe('string');
            expect(typeof d['person.breadcrumb.directory']).toBe('string');
        }
    });

    it('M14 DIRECTORY_BODY.title 等於 schedule.ts 的 directory.title', async () => {
        const { DIRECTORY_BODY } = await loadDir();
        for (const [lang, dict] of [['zh-TW', zhTWSchedule], ['en', enSchedule]] as const) {
            const d = dict as Record<string, string>;
            expect(typeof d['directory.title']).toBe('string');
            expect(DIRECTORY_BODY[lang].title).toBe(d['directory.title']);
            expect(typeof DIRECTORY_BODY[lang].independent).toBe('string');
            expect(typeof DIRECTORY_BODY[lang].lastLive).toBe('string');
        }
    });
});
