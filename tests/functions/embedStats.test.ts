// 嵌入統計：Referer 主機驗證（T11）與去重寫入（T10）
// T 編號對應計畫〈週表嵌入產生器〉的測試規格表
import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { refererHost, recordReferrer } from '../../functions/lib/embed-stats.js';

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon-test' };
const NOW = Date.parse('2026-10-08T12:00:00Z');
const req = (referer?: string) => new Request('https://multistreaming.org/embed/schedule/taione', referer === undefined ? {} : { headers: { Referer: referer } });

/** 以 Map 模擬 Cache API：match 命中回 Response，put 存起來 */
function fakeCache() {
    const store = new Map<string, Response>();
    const key = (r: Request | string) => (typeof r === 'string' ? r : r.url);
    return {
        store,
        match: vi.fn(async (r: Request | string) => store.get(key(r))?.clone()),
        put: vi.fn(async (r: Request | string, res: Response) => { store.set(key(r), res.clone()); }),
    };
}

describe('T11 refererHost：主機驗證', () => {
    it('一般網址 → 小寫主機名（路徑與查詢不帶）', () => {
        expect(refererHost(req('https://blog.example.com/post?x=1'))).toBe('blog.example.com');
        expect(refererHost(req('https://Blog.Example.COM/'))).toBe('blog.example.com');
        expect(refererHost(req('http://example.org/a'))).toBe('example.org');
    });

    it('沒有 Referer → null', () => {
        expect(refererHost(req())).toBeNull();
    });

    it('非 http(s)（javascript:、ftp:）→ null', () => {
        expect(refererHost(req('javascript:alert(1)'))).toBeNull();
        expect(refererHost(req('ftp://example.com/'))).toBeNull();
    });

    it('主機超過 253 字元 → null', () => {
        const host = `${'a'.repeat(60)}.`.repeat(5) + 'com';
        expect(host.length).toBeGreaterThan(253);
        expect(refererHost(req(`https://${host}/`))).toBeNull();
    });

    it('主機含非 hostname 字元 → null', () => {
        expect(refererHost(req('https://a$b.com/'))).toBeNull();
        expect(refererHost(req('https://a!b.com/'))).toBeNull();
        expect(refererHost(req('https://exa mple.com/'))).toBeNull();
    });

    it('本站與開發環境不算外部（含子網域、.pages.dev、localhost、127.0.0.1）→ null', () => {
        for (const u of [
            'https://multistreaming.org/schedule/x',
            'https://www.multistreaming.org/',
            'https://mutli-stream.pages.dev/',
            'https://abc.mutli-stream.pages.dev/',
            'http://localhost:5173/',
            'http://127.0.0.1:8788/',
        ]) {
            expect(refererHost(req(u)), u).toBeNull();
        }
    });

    it('只是結尾相似的外站不被誤排除', () => {
        // 後綴比對漏掉「.」會把它當本站
        expect(refererHost(req('https://notmultistreaming.org/'))).toBe('notmultistreaming.org');
        expect(refererHost(req('https://multistreaming.org.evil.com/'))).toBe('multistreaming.org.evil.com');
    });
});

describe('T10 recordReferrer：去重與排除本站', () => {
    const base = (referer: string | undefined, over: Record<string, unknown> = {}) => ({
        request: req(referer), env, kind: 'person', slug: 'taione', now: NOW, ...over,
    });

    it('首次出現的外站：呼叫 rpc 一次（帶 kind／slug／host）、寫入快取、回 true', async () => {
        const cache = fakeCache();
        const rpcFn = vi.fn(async () => ({ ok: true, data: null }));
        const wrote = await recordReferrer(base('https://blog.example.com/p', { cache, rpcFn }));
        expect(wrote).toBe(true);
        expect(rpcFn).toHaveBeenCalledTimes(1);
        expect(rpcFn).toHaveBeenCalledWith(env, 'embed_referrer_seen', { p_kind: 'person', p_slug: 'taione', p_host: 'blog.example.com' });
        expect(cache.put).toHaveBeenCalledTimes(1);
    });

    it('同一外站同一頁第二次：命中快取 → false，不再呼叫 rpc', async () => {
        const cache = fakeCache();
        const rpcFn = vi.fn(async () => ({ ok: true, data: null }));
        await recordReferrer(base('https://blog.example.com/p1', { cache, rpcFn }));
        const again = await recordReferrer(base('https://blog.example.com/p2', { cache, rpcFn }));
        expect(again).toBe(false);
        expect(rpcFn).toHaveBeenCalledTimes(1);
    });

    it('不同外站、或同外站不同 slug：各寫一次', async () => {
        const cache = fakeCache();
        const rpcFn = vi.fn(async () => ({ ok: true, data: null }));
        expect(await recordReferrer(base('https://a.example.com/', { cache, rpcFn }))).toBe(true);
        expect(await recordReferrer(base('https://b.example.com/', { cache, rpcFn }))).toBe(true);
        expect(await recordReferrer(base('https://a.example.com/', { cache, rpcFn, slug: 'other' }))).toBe(true);
        expect(rpcFn).toHaveBeenCalledTimes(3);
    });

    it('來自本站、無 Referer、非 http：回 false 且完全不呼叫 rpc', async () => {
        const cache = fakeCache();
        const rpcFn = vi.fn(async () => ({ ok: true, data: null }));
        expect(await recordReferrer(base('https://multistreaming.org/schedule/x', { cache, rpcFn }))).toBe(false);
        expect(await recordReferrer(base(undefined, { cache, rpcFn }))).toBe(false);
        expect(await recordReferrer(base('javascript:alert(1)', { cache, rpcFn }))).toBe(false);
        expect(rpcFn).not.toHaveBeenCalled();
    });

    it('cache.match 已有紀錄：回 false，不呼叫 rpc', async () => {
        const cache = fakeCache();
        cache.match.mockResolvedValue(new Response('1'));
        const rpcFn = vi.fn(async () => ({ ok: true, data: null }));
        expect(await recordReferrer(base('https://blog.example.com/', { cache, rpcFn }))).toBe(false);
        expect(rpcFn).not.toHaveBeenCalled();
    });

    it('rpc 拋錯：不往外拋、回 false', async () => {
        const cache = fakeCache();
        const rpcFn = vi.fn(async () => { throw new Error('db down'); });
        await expect(recordReferrer(base('https://blog.example.com/', { cache, rpcFn }))).resolves.toBe(false);
    });

    it('rpc 回 ok:false：回 false', async () => {
        const cache = fakeCache();
        const rpcFn = vi.fn(async () => ({ ok: false, data: null }));
        expect(await recordReferrer(base('https://blog.example.com/', { cache, rpcFn }))).toBe(false);
    });

    it('cache 為 null：每次都呼叫 rpc', async () => {
        const rpcFn = vi.fn(async () => ({ ok: true, data: null }));
        expect(await recordReferrer(base('https://blog.example.com/', { cache: null, rpcFn }))).toBe(true);
        expect(await recordReferrer(base('https://blog.example.com/', { cache: null, rpcFn }))).toBe(true);
        expect(rpcFn).toHaveBeenCalledTimes(2);
    });
});

describe('T11b refererHost：內網、無點主機、pages.dev', () => {
    it('私有 IP 與沒有點的主機 → null', () => {
        expect(refererHost(req('https://192.168.1.5/'))).toBeNull();
        expect(refererHost(req('https://10.0.0.1/'))).toBeNull();
        expect(refererHost(req('https://intranet/'))).toBeNull();
    });

    it('別人的 *.pages.dev 要算外站；本專案預覽站與本站不算', () => {
        // 整個 .pages.dev 都排除會漏掉所有用 Cloudflare Pages 的外部站台
        expect(refererHost(req('https://myfan.pages.dev/'))).toBe('myfan.pages.dev');
        expect(refererHost(req('https://abc.mutli-stream.pages.dev/'))).toBeNull();
        expect(refererHost(req('https://multistreaming.org/x'))).toBeNull();
    });
});

describe('T10b recordReferrer：站數已滿旗標', () => {
    const base = (referer: string, over: Record<string, unknown> = {}) => ({
        request: req(referer), env, kind: 'person', slug: 'taione', now: NOW, ...over,
    });

    it('rpc 回 data:false（已達上限）→ false；之後同 slug 換 host 不再呼叫 rpc', async () => {
        const cache = fakeCache();
        const rpcFn = vi.fn(async () => ({ ok: true, data: false }));
        expect(await recordReferrer(base('https://a.example.com/', { cache, rpcFn }))).toBe(false);
        expect(rpcFn).toHaveBeenCalledTimes(1);
        expect(await recordReferrer(base('https://b.example.com/', { cache, rpcFn }))).toBe(false);
        expect(rpcFn).toHaveBeenCalledTimes(1);
    });

    it('已滿旗標只管那一份週表，別的 slug 照常寫', async () => {
        const cache = fakeCache();
        const full = vi.fn(async () => ({ ok: true, data: false }));
        await recordReferrer(base('https://a.example.com/', { cache, rpcFn: full }));
        const ok = vi.fn(async () => ({ ok: true, data: true }));
        expect(await recordReferrer(base('https://b.example.com/', { cache, rpcFn: ok, slug: 'other' }))).toBe(true);
        expect(ok).toHaveBeenCalledTimes(1);
    });

    it('cache 為 null：已滿也沒處記，每次都呼叫 rpc', async () => {
        const rpcFn = vi.fn(async () => ({ ok: true, data: false }));
        await recordReferrer(base('https://a.example.com/', { cache: null, rpcFn }));
        await recordReferrer(base('https://b.example.com/', { cache: null, rpcFn }));
        expect(rpcFn).toHaveBeenCalledTimes(2);
    });
});
