// VTuber 投稿與資料回報（後端）：
//   lib：網址解析、社群正規化、驗證、頻道頁前段解析、Turnstile、KV 配額
//   端點：/api/vtuber/channel-lookup、/api/vtuber/contribute、/api/report、/api/admin/contributions、/api/admin/reports
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    parseYoutubeChannelInput,
    normalizeSocial,
    validateContribution,
    validateReport,
    parseChannelHead,
    lookupYoutubeChannel,
    // @ts-expect-error functions 目錄的 ESM JS 無型別宣告
} from '../../functions/lib/vtuber-submit.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { verifyTurnstile } from '../../functions/lib/turnstile.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { checkKvQuota, hashIp, ipKey, isIpBanned } from '../../functions/lib/rate-limit.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestGet as lookupGet } from '../../functions/api/vtuber/channel-lookup.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestPost as contributePost } from '../../functions/api/vtuber/contribute.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestPost as reportPost } from '../../functions/api/report.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestGet as adminContribGet, onRequestPost as adminContribPost, validateOverrides } from '../../functions/api/admin/contributions.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestPut as adminReportPut } from '../../functions/api/admin/reports.js';

const UC = 'UC' + 'a'.repeat(22);
const VID = '11111111-1111-4111-8111-111111111111';
const GID = '22222222-2222-4222-8222-222222222222';

const channelPage = (id = UC, extra = '') =>
    `<html><head><title>x</title><link rel="canonical" href="undefined">` +
    `<meta property="og:title" content="新人 &amp; 測試"><meta property="og:image" content="https://yt3.googleusercontent.com/avatar=s900">` +
    `<meta property="og:url" content="https://www.youtube.com/channel/${id}">${extra}</head><body></body></html>`;

describe('parseYoutubeChannelInput', () => {
    it.each([
        [UC, { kind: 'id', channelId: UC }],
        [`https://www.youtube.com/channel/${UC}/videos`, { kind: 'id', channelId: UC }],
        [`youtube.com/channel/${UC}`, { kind: 'id', channelId: UC }],
        ['@newbie_vt', { kind: 'handle', handle: 'newbie_vt' }],
        ['https://m.youtube.com/@newbie_vt/live', { kind: 'handle', handle: 'newbie_vt' }],
        ['https://www.youtube.com/@%E5%AD%90%E7%87%92zishaow', { kind: 'handle', handle: '子燒zishaow' }],
    ])('%s', (input, expected) => expect(parseYoutubeChannelInput(input)).toEqual(expected));

    it.each([
        ['', 'missing'],
        ['https://www.youtube.com/c/oldname', 'unsupported_url'],
        ['https://evil.com/@x', 'invalid_url'],
        ['https://www.youtube.com/watch?v=abc', 'invalid_url'],
        ['@a', 'invalid_url'],
    ])('拒絕 %s', (input, error) => expect(parseYoutubeChannelInput(input)).toEqual({ error }));
});

describe('normalizeSocial', () => {
    it('X／Instagram／Facebook／Twitch 正規化成固定格式', () => {
        expect(normalizeSocial('x', '@abc_1')).toEqual({ value: 'https://x.com/abc_1' });
        expect(normalizeSocial('x', 'https://twitter.com/abc_1/status/1')).toEqual({ value: 'https://x.com/abc_1' });
        expect(normalizeSocial('instagram', 'instagram.com/a.b_c/')).toEqual({ value: 'https://www.instagram.com/a.b_c' });
        expect(normalizeSocial('facebook', 'https://m.facebook.com/page.name?ref=1')).toEqual({ value: 'https://www.facebook.com/page.name' });
        expect(normalizeSocial('facebook', 'https://www.facebook.com/profile.php?id=123')).toEqual({ value: 'https://www.facebook.com/profile.php?id=123' });
        expect(normalizeSocial('twitch', 'https://www.twitch.tv/SomeOne')).toEqual({ value: 'someone' });
        expect(normalizeSocial('x', '')).toEqual({ value: null });
    });

    it('網域不符或格式錯拒絕', () => {
        expect(normalizeSocial('x', 'https://evil.com/abc').error).toBe('invalid_x');
        expect(normalizeSocial('instagram', '@has space').error).toBe('invalid_instagram');
        expect(normalizeSocial('facebook', 'https://evil.com/x').error).toBe('invalid_facebook');
        expect(normalizeSocial('twitch', 'a').error).toBe('invalid_twitch');
    });
});

const goodContribution = (over: Record<string, unknown> = {}) => ({
    youtubeUrl: '@newbie_vt',
    name: '新人',
    nationality: 'TW',
    affiliation: { type: 'personal' },
    socials: { x: '@abc', twitch: 'newbie' },
    turnstileToken: 'tok',
    ...over,
});

describe('validateContribution', () => {
    it('合法：社群正規化、地區證據併入來源', () => {
        const r = validateContribution(goodContribution({ nationality: 'HK', nationalityEvidenceUrl: 'https://x.com/abc/status/1', sourceUrls: ['https://x.com/abc/status/1', 'https://a.com/b'] }));
        expect(r.value.socials).toEqual({ x: 'https://x.com/abc', facebook: null, instagram: null, twitch: 'newbie' });
        expect(r.value.sourceUrls).toEqual(['https://x.com/abc/status/1', 'https://a.com/b']);
    });

    it.each([
        [{ name: '' }, 'invalid_name'],
        [{ name: 'x'.repeat(101) }, 'invalid_name'],
        [{ nationality: 'US' }, 'invalid_nationality'],
        [{ nationality: 'JP' }, 'nationality_evidence_required'],
        [{ affiliation: { type: 'agency' } }, 'affiliation_name_required'],
        [{ affiliation: { type: 'agency', groupId: 'not-uuid' } }, 'invalid_affiliation'],
        [{ bio: 'x'.repeat(501) }, 'invalid_bio'],
        [{ avatarUrl: 'http://insecure.com/a.png' }, 'invalid_avatar'],
        [{ avatarUrl: 'https://evil.example/tracker.png' }, 'invalid_avatar'],
        [{ youtubeUrl: '@bad%handle' }, 'youtube_invalid_url'],
        [{ youtubeUrl: '@has(paren)' }, 'youtube_invalid_url'],
        [{ youtubeUrl: '@a&b;c' }, 'youtube_invalid_url'],
        [{ sourceUrls: Array(6).fill('https://a.com') }, 'invalid_source_urls'],
        [{ youtubeUrl: 'https://www.youtube.com/c/x' }, 'youtube_unsupported_url'],
        [{ socials: { instagram: 'https://evil.com/a' } }, 'invalid_instagram'],
    ])('%j → %s', (over, error) => expect(validateContribution(goodContribution(over)).error).toBe(error));
});

describe('validateReport', () => {
    it('依類型要求對象', () => {
        expect(validateReport({ kind: 'vtuber_info', reasons: ['name'] }).error).toBe('invalid_target');
        expect(validateReport({ kind: 'roster', reasons: ['missing_member'], groupId: GID }).value.groupId).toBe(GID);
        expect(validateReport({ kind: 'stream', reasons: ['wrong_time'], stream: { platform: 'youtube', externalId: 'abcDEF_123-x' } }).value)
            .toMatchObject({ streamPlatform: 'youtube', streamExternalId: 'abcDEF_123-x' });
        expect(validateReport({ kind: 'stream', reasons: ['wrong_time'], stream: { platform: 'tiktok', externalId: 'a' } }).error).toBe('invalid_target');
    });

    it('原因白名單、「其他」要說明、站內路徑才保留', () => {
        expect(validateReport({ kind: 'vtuber_info', vtuberId: VID, reasons: ['wrong_time'] }).error).toBe('invalid_reasons');
        expect(validateReport({ kind: 'vtuber_info', vtuberId: VID, reasons: ['other'] }).error).toBe('description_required');
        expect(validateReport({ kind: 'vtuber_info', vtuberId: VID, reasons: ['name'], pageUrl: 'https://evil.com' }).value.pageUrl).toBeNull();
        expect(validateReport({ kind: 'vtuber_info', vtuberId: VID, reasons: ['name'], pageUrl: '/schedule/abc' }).value.pageUrl).toBe('/schedule/abc');
    });
});

describe('頻道頁前段解析與查詢', () => {
    it('og:url 取 channelId、og:title 解 entity、頭像只收 YouTube 圖床；handle 以頁面上的正式值優先', () => {
        expect(parseChannelHead(channelPage(), 'newbie')).toEqual({ channelId: UC, title: '新人 & 測試', avatarUrl: 'https://yt3.googleusercontent.com/avatar=s900', handle: 'newbie' });
        const vanity = '"vanityChannelUrl":"http://www.youtube.com/@%E5%AD%90%E7%87%92zishaow"';
        expect(parseChannelHead(channelPage(UC, vanity), null)?.handle).toBe('子燒zishaow');
        expect(parseChannelHead(channelPage(UC, vanity), 'TypedByUser')?.handle).toBe('子燒zishaow');
        expect(parseChannelHead(channelPage(UC, '"vanityChannelUrl":"http://www.youtube.com/@bad%3Cx%3E"'), 'fallback_ok')?.handle).toBe('fallback_ok');
        expect(parseChannelHead('<html>沒有 og:url</html>')).toBeNull();
        expect(parseChannelHead(channelPage().replace('yt3.googleusercontent.com', 'evil.com'))?.avatarUrl).toBeNull();
    });

    it('查詢：404 → not_found；500 → fetch_failed；/channel/ 查到的 ID 必須相符', async () => {
        const page = (status: number, body = '') => (async () => new Response(body, { status })) as unknown as typeof fetch;
        expect(await lookupYoutubeChannel({ kind: 'handle', handle: 'x' }, { fetch: page(404) })).toEqual({ ok: false, error: 'not_found' });
        expect(await lookupYoutubeChannel({ kind: 'handle', handle: 'x' }, { fetch: page(500) })).toEqual({ ok: false, error: 'fetch_failed' });
        expect((await lookupYoutubeChannel({ kind: 'id', channelId: 'UC' + 'b'.repeat(22) }, { fetch: page(200, channelPage()) })).error).toBe('not_found');
        expect(await lookupYoutubeChannel({ kind: 'handle', handle: 'newbie' }, { fetch: page(200, channelPage()) }))
            .toMatchObject({ ok: true, channel: { channelId: UC, handle: 'newbie' } });
    });
});

describe('Turnstile 與 KV 配額', () => {
    const ok = (success: boolean) => (async () => new Response(JSON.stringify({ success }))) as unknown as typeof fetch;
    it('只有明確設成 false 才跳過；沒設或沒有 secret → 503；缺 token → 400；驗證失敗或逾時 → 403', async () => {
        expect(await verifyTurnstile({ ENFORCE_TURNSTILE: 'false' }, null)).toEqual({ ok: true, skipped: true });
        expect(await verifyTurnstile({}, 't')).toMatchObject({ ok: false, status: 503 });
        expect(await verifyTurnstile({ ENFORCE_TURNSTILE: 'true' }, 't')).toMatchObject({ ok: false, status: 503 });
        const env = { ENFORCE_TURNSTILE: 'true', TURNSTILE_SECRET_KEY: 's' };
        expect(await verifyTurnstile(env, '')).toMatchObject({ ok: false, status: 400 });
        expect(await verifyTurnstile(env, 't', '1.2.3.4', { fetch: ok(true) })).toEqual({ ok: true });
        expect(await verifyTurnstile(env, 't', '1.2.3.4', { fetch: ok(false) })).toMatchObject({ ok: false, status: 403 });
        const boom = (async () => { throw new Error('timeout'); }) as unknown as typeof fetch;
        expect(await verifyTurnstile(env, 't', '', { fetch: boom })).toMatchObject({ ok: false, status: 403 });
    });

    it('KV 配額到上限擋下；沒有 KV 放行；IP 雜湊不含原始 IP', async () => {
        const kv = memKv();
        expect(await checkKvQuota(kv, 'k', 2, 60)).toBe(true);
        expect(await checkKvQuota(kv, 'k', 2, 60)).toBe(true);
        expect(await checkKvQuota(kv, 'k', 2, 60)).toBe(false);
        expect(await checkKvQuota(undefined, 'k', 0, 60)).toBe(true);
        const h = await hashIp({ IP_HASH_SALT: 's' }, '203.0.113.9');
        expect(h).toMatch(/^[0-9a-f]{64}$/);
        expect(h).not.toContain('203');
    });

    it('IPv6 以 /64 計：同一段的不同位址是同一個身分（限流與封鎖都是）', async () => {
        expect(ipKey('2407:4d00:2c09:7a1b:c9bd:2518:9470:487')).toBe('2407:4d00:2c09:7a1b::/64');
        expect(ipKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
        expect(ipKey('203.0.113.9')).toBe('203.0.113.9');
        const env = { IP_HASH_SALT: 's' };
        expect(await hashIp(env, '2407:4d00:2c09:7a1b::1')).toBe(await hashIp(env, '2407:4d00:2c09:7a1b:ffff:1:2:3'));
        expect(isIpBanned({ BANNED_IPS: '2407:4d00:2c09:7a1b::/64' }, '2407:4d00:2c09:7a1b:c9bd:2518:9470:487')).toBe(true);
        expect(isIpBanned({ BANNED_IPS: '2407:4d00:2c09:7a1b::/64' }, '2407:4d00:2c09:7a1c::1')).toBe(false);
    });

    it('KV 讀寫失敗時放行（不讓請求變成 500）', async () => {
        const broken = { get: async () => { throw new Error('kv'); }, put: async () => { throw new Error('kv'); } };
        expect(await checkKvQuota(broken, 'k', 1, 60)).toBe(true);
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
let ytStatus = 200;
let turnstileOk = true;

const ENV = () => ({
    SUPABASE_URL: 'http://sb',
    SUPABASE_SERVICE_ROLE_KEY: 'k',
    RATE_LIMIT_KV: memKv(),
    ENFORCE_TURNSTILE: 'true',
    TURNSTILE_SECRET_KEY: 's',
    IP_HASH_SALT: 'salt',
    ADMIN_API_TOKEN: 'admintoken',
});

beforeEach(() => {
    calls = [];
    ytStatus = 200;
    turnstileOk = true;
    sb = (method, path) => {
        if (method === 'GET') return new Response('[]', { status: 200 });
        return new Response(JSON.stringify([{ id: 'new-id' }]), { status: 201 });
    };
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const body = init?.body && typeof init.body === 'string' && init.body.startsWith('{') || (typeof init?.body === 'string' && init.body.startsWith('[')) ? JSON.parse(init!.body as string) : init?.body ?? null;
        calls.push({ method, url, body });
        if (url.startsWith('https://challenges.cloudflare.com')) return new Response(JSON.stringify({ success: turnstileOk }));
        if (url.startsWith('https://www.youtube.com')) return new Response(ytStatus === 200 ? channelPage() : '', { status: ytStatus });
        if (url.startsWith('http://sb/rest/v1/')) return sb(method, url.slice('http://sb/rest/v1/'.length), body);
        throw new Error(`unexpected fetch ${url}`);
    }));
});
afterEach(() => vi.unstubAllGlobals());

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    new Request(`https://multistreaming.org${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9', Origin: 'https://multistreaming.org', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });

describe('POST /api/vtuber/contribute', () => {
    const run = (body: unknown, env = ENV()) => contributePost({ request: post('/api/vtuber/contribute', body), env });

    it('成功：伺服器端查頻道、寫入待審，只存雜湊 IP', async () => {
        const res = await run(goodContribution());
        expect(res.status).toBe(201);
        const write = calls.find((c) => c.method === 'POST' && c.url.includes('vtuber_contributions'))!;
        const row = write.body as Record<string, any>;
        expect(row).toMatchObject({ action: 'add', status: 'pending', youtube_channel_id: UC });
        expect(row.payload).toMatchObject({ name: '新人', youtube_channel_id: UC, handle: 'newbie_vt', channel_title: '新人 & 測試', x_url: 'https://x.com/abc', twitch_login: 'newbie' });
        expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(JSON.stringify(row)).not.toContain('203.0.113.9');
    });

    it('已在站上 → 409 exists 附個人頁；已有待審 → 409 pending_exists', async () => {
        sb = (method, path) => (method === 'GET' && path.startsWith('vtubers') ? new Response(JSON.stringify([{ name: '既有', slug: 'old' }])) : new Response('[]'));
        const r1 = await run(goodContribution());
        expect(r1.status).toBe(409);
        expect(await r1.json()).toMatchObject({ error: 'exists', vtuber: { slug: 'old' } });
        sb = (method, path) => (method === 'GET' && path.startsWith('vtuber_contributions') ? new Response('[{"id":"x"}]') : new Response('[]'));
        expect((await (await run(goodContribution())).json()).error).toBe('pending_exists');
    });

    it('驗證失敗 400（不耗配額）、Turnstile 失敗 403、頻道不存在 400、超過配額 429、緊急開關 503、封鎖 IP 403', async () => {
        const env = ENV();
        expect((await run(goodContribution({ name: '' }), env)).status).toBe(400);
        expect(env.RATE_LIMIT_KV._m.size).toBe(0);

        turnstileOk = false;
        expect((await run(goodContribution(), ENV())).status).toBe(403);
        turnstileOk = true;

        ytStatus = 404;
        const nf = await run(goodContribution(), ENV());
        expect(nf.status).toBe(400);
        expect((await nf.json()).error).toBe('youtube_not_found');
        ytStatus = 200;

        const limited = ENV();
        for (let i = 0; i < 3; i++) expect((await run(goodContribution(), limited)).status).toBe(201);
        expect((await run(goodContribution(), limited)).status).toBe(429);

        expect((await run(goodContribution(), { ...ENV(), SUBMISSIONS_DISABLED: 'true' })).status).toBe(503);
        expect((await run(goodContribution(), { ...ENV(), BANNED_IPS: '203.0.113.9' })).status).toBe(403);
        // 設定缺漏：不能在沒有限流、沒有鹽的狀態下默默收件
        expect((await (await run(goodContribution(), { ...ENV(), IP_HASH_SALT: '' })).json()).error).toBe('not_configured');
        expect((await run(goodContribution(), { ...ENV(), RATE_LIMIT_KV: undefined })).status).toBe(503);
    });

    it('假 token 不會吃掉全站配額（全站配額在 Turnstile 之後才扣）', async () => {
        turnstileOk = false;
        const env = ENV();
        for (let i = 0; i < 3; i++) await run(goodContribution(), env);
        expect([...env.RATE_LIMIT_KV._m.keys()].some((k) => k.startsWith('contrib:g:'))).toBe(false);
    });

    it('Twitch 帳號已屬於別人 → 409 twitch_exists；第二個頻道只登記在 vtuber_channels 也算已在站上', async () => {
        sb = (method, path) => (method === 'GET' && path.includes('twitch_channel_id=ilike.newbie') ? new Response('[{"id":"x"}]') : new Response('[]'));
        expect((await (await run(goodContribution())).json()).error).toBe('twitch_exists');
        sb = (method, path) => (method === 'GET' && path.startsWith('vtuber_channels?platform=eq.youtube') ? new Response('[{"vtubers":{"name":"主","slug":"main"}}]') : new Response('[]'));
        expect(await (await run(goodContribution())).json()).toMatchObject({ error: 'exists', vtuber: { slug: 'main' } });
    });

    it('資料庫唯一索引衝突（同時送出）→ 409 pending_exists', async () => {
        sb = (method) => (method === 'GET' ? new Response('[]') : new Response('{"code":"23505","message":"duplicate"}', { status: 409 }));
        expect((await (await run(goodContribution())).json()).error).toBe('pending_exists');
    });
});

describe('GET /api/vtuber/channel-lookup', () => {
    const get = (q: string, headers: Record<string, string> = { 'Sec-Fetch-Site': 'same-origin' }) =>
        lookupGet({ request: new Request(`https://multistreaming.org/api/vtuber/channel-lookup?url=${encodeURIComponent(q)}`, { headers }), env: ENV() });

    it('回傳頻道資料與是否已在站上；外站請求 403；不支援的網址 400；查詢不寫 KV', async () => {
        const res = await get('@newbie_vt');
        expect(await res.json()).toMatchObject({ ok: true, channel: { channelId: UC, title: '新人 & 測試' }, exists: null, pending: false });
        expect((await get('@newbie_vt', {})).status).toBe(403);
        expect((await get('https://www.youtube.com/c/old')).status).toBe(400);
    });
});

describe('POST /api/report', () => {
    const run = (body: unknown) => reportPost({ request: post('/api/report', body), env: ENV() });

    it('成功寫入；被回報的 VTuber 不存在 → 400', async () => {
        sb = (method, path) => (method === 'GET' && path.startsWith('vtubers') ? new Response(`[{"id":"${VID}"}]`) : new Response('[]', { status: method === 'GET' ? 200 : 201 }));
        const ok = await run({ kind: 'vtuber_info', vtuberId: VID, reasons: ['nationality'], description: '其實是港V', turnstileToken: 't', pageUrl: '/schedule/abc' });
        expect(ok.status).toBe(201);
        const row = calls.find((c) => c.method === 'POST' && c.url.includes('vtuber_reports'))!.body as Record<string, unknown>;
        expect(row).toMatchObject({ kind: 'vtuber_info', vtuber_id: VID, reasons: ['nationality'], page_url: '/schedule/abc' });

        sb = (method) => new Response('[]', { status: method === 'GET' ? 200 : 201 });
        expect((await run({ kind: 'vtuber_info', vtuberId: VID, reasons: ['name'], turnstileToken: 't' })).status).toBe(400);
    });
});

describe('後台 API', () => {
    const admin = (path: string, init: RequestInit = {}, token = 'admintoken') =>
        new Request(`https://multistreaming.org${path}`, { ...init, headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token, ...(init.headers || {}) } });

    it('沒有 token 401', async () => {
        expect((await adminContribGet({ request: admin('/api/admin/contributions', {}, 'wrong'), env: ENV() })).status).toBe(401);
    });

    it('核准：overrides 驗證後呼叫 RPC；RPC 回 exists → 409', async () => {
        sb = (method, path) => (path.startsWith('rpc/') ? new Response('{"vtuber_id":"v","slug":"newbie"}') : new Response('[]'));
        const res = await adminContribPost({
            request: admin(`/api/admin/contributions?id=${VID}&action=approve`, { method: 'POST', body: JSON.stringify({ overrides: { name: ' 新名 ', x_url: '@abc', new_group: { name: '新團', kind: 'circle' } } }) }),
            env: ENV(),
        });
        expect(res.status).toBe(200);
        const rpcCall = calls.find((c) => c.url.includes('rpc/approve_vtuber_contribution'))!;
        expect(rpcCall.body).toEqual({ p_id: VID, p_overrides: { name: '新名', x_url: 'https://x.com/abc', new_group: { name: '新團', kind: 'circle', nationality: null }, group_id: '' } });

        sb = () => new Response('{"code":"23505","message":"exists"}', { status: 409 });
        const dup = await adminContribPost({ request: admin(`/api/admin/contributions?id=${VID}&action=approve`, { method: 'POST', body: '{}' }), env: ENV() });
        expect(dup.status).toBe(409);
        expect((await dup.json()).error).toBe('exists');
    });

    it('overrides 白名單與格式', () => {
        expect(validateOverrides({ nationality: 'US' }).error).toBe('invalid_nationality');
        expect(validateOverrides({ group_id: 'nope' }).error).toBe('invalid_group');
        expect(validateOverrides({ unknown: 1, bio: ' 簡介 ' }).value).toEqual({ bio: '簡介' });
        expect(validateOverrides({ group_name: ' 某公司 ', affiliation_type: 'agency' }).value).toEqual({ group_name: '某公司', affiliation_type: 'agency' });
        expect(validateOverrides({ group_name: 'x'.repeat(101) }).error).toBe('invalid_group');
        expect(validateOverrides({ affiliation_type: 'vtuber' }).error).toBe('invalid_group');
    });

    it('駁回只改待審的；回報狀態更新寫入 resolved_at', async () => {
        sb = () => new Response('[]');
        const r = await adminContribPost({ request: admin(`/api/admin/contributions?id=${VID}&action=reject`, { method: 'POST', body: '{"notes":"重複"}' }), env: ENV() });
        expect(r.status).toBe(409);
        expect(calls.find((c) => c.method === 'PATCH')!.url).toContain('status=eq.pending');

        sb = (method) =>
            new Response(method === 'PATCH' ? `[{"id":"${VID}","status":"resolved"}]` : method === 'GET' ? '[{"status":"open"}]' : '[]', { status: method === 'POST' ? 201 : 200 });
        calls = [];
        const u = await adminReportPut({ request: admin(`/api/admin/reports?id=${VID}`, { method: 'PUT', body: '{"status":"resolved","admin_notes":"已修正"}' }), env: ENV() });
        expect(u.status).toBe(200);
        const patch = calls.find((c) => c.method === 'PATCH')!.body as Record<string, unknown>;
        expect(patch.status).toBe('resolved');
        expect(typeof patch.resolved_at).toBe('string');
        // 稽核紀錄記下原狀態
        const audit = calls.find((c) => c.method === 'POST' && c.url.includes('admin_actions'))!.body as Record<string, unknown>;
        expect(audit).toMatchObject({ action_type: 'review_vtuber_report', before_status: 'open', after_status: 'resolved' });

        // 回報不存在 → 404（先查原狀態）
        sb = () => new Response('[]');
        expect((await adminReportPut({ request: admin(`/api/admin/reports?id=${VID}`, { method: 'PUT', body: '{"status":"spam"}' }), env: ENV() })).status).toBe(404);
    });
});
