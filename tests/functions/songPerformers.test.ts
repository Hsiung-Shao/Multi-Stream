// 歌回合唱成員與剪輯來源（後端）：共用驗證、後台 payload、社群投稿解析與端點、timeline 回應
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { buildSongVideoPayload, normalizeClipSource, normalizePerformers, CLIP_URL_RE } from '../../functions/lib/songs.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { parseSubmissionBody } from '../../functions/lib/song-submissions.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestPost as submitPost } from '../../functions/api/songs/submissions.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestGet as timelineGet } from '../../functions/api/songs/timeline.js';

const VIDEO = 'dQw4w9WgXcQ';
const VT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REF = '55555555-5555-4555-8555-555555555555';
const SUB_ID = '44444444-4444-4444-8444-444444444444';
const REV = '2026-10-28T01:02:03.456+00:00';
const CLIP_URL = 'https://www.youtube.com/@zzclip';
const UC = 'UC' + 'abcdefghijklmnopqrstuv'; // UC + 22 字

// ================= 共用：normalizeClipSource =================
describe('normalizeClipSource', () => {
    it('API1 合法 @handle 與 channel/UC 網址通過，www／m／裸網域皆可，name 被 trim', () => {
        expect(normalizeClipSource('  剪輯頻道  ', CLIP_URL)).toEqual({ ok: true, value: { name: '剪輯頻道', url: CLIP_URL } });
        for (const url of [
            'https://youtube.com/@zzclip',
            'https://m.youtube.com/@zzclip',
            `https://www.youtube.com/channel/${UC}`,
        ]) {
            expect(normalizeClipSource('x', url), url).toEqual({ ok: true, value: { name: 'x', url } });
        }
    });

    it('API1 網址尾斜線、query、hash 先去掉再比對，輸出為乾淨網址', () => {
        expect(normalizeClipSource('x', `${CLIP_URL}/`)).toEqual({ ok: true, value: { name: 'x', url: CLIP_URL } });
        expect(normalizeClipSource('x', `${CLIP_URL}?si=abc#top`)).toEqual({ ok: true, value: { name: 'x', url: CLIP_URL } });
        expect(normalizeClipSource('x', `${CLIP_URL}/?si=abc`)).toEqual({ ok: true, value: { name: 'x', url: CLIP_URL } });
    });

    it('API1 兩者皆 null／空字串／未給 → ok 且 value 為 null（不是剪輯影片）', () => {
        expect(normalizeClipSource(null, null)).toEqual({ ok: true, value: null });
        expect(normalizeClipSource('', '')).toEqual({ ok: true, value: null });
        expect(normalizeClipSource(undefined, undefined)).toEqual({ ok: true, value: null });
    });

    it('API2 只給名稱或只給網址 → ok=false（兩欄必須同有同無）', () => {
        expect(normalizeClipSource('剪輯頻道', null).ok).toBe(false);
        expect(normalizeClipSource('剪輯頻道', '').ok).toBe(false);
        expect(normalizeClipSource(null, CLIP_URL).ok).toBe(false);
        expect(normalizeClipSource('', CLIP_URL).ok).toBe(false);
    });

    it('API2 非 YouTube 或格式不符的網址 → ok=false', () => {
        for (const url of [
            'http://www.youtube.com/@zzclip', // 非 https
            'https://youtu.be/dQw4w9WgXcQ', // 短網址
            'https://evil.com/@zzclip', // 其他網域
            'https://www.youtube.com.evil.com/@zzclip', // 網域偽裝
            'https://evil.com/?u=https://www.youtube.com/@zzclip',
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // 影片不是頻道
            'https://www.youtube.com/channel/UCshort', // UC 長度不對
            'https://www.youtube.com/@zzclip/videos', // 多餘路徑
            'https://www.youtube.com/@', // 空 handle
            'javascript:alert(1)',
            'www.youtube.com/@zzclip', // 沒有協定
        ]) {
            expect(normalizeClipSource('x', url).ok, url).toBe(false);
        }
        expect(normalizeClipSource('x', 123).ok).toBe(false);
    });

    it('API2 名稱超過 100 字或全空白 → ok=false；恰好 100 字通過', () => {
        expect(normalizeClipSource('a'.repeat(100), CLIP_URL).ok).toBe(true);
        expect(normalizeClipSource('a'.repeat(101), CLIP_URL).ok).toBe(false);
        expect(normalizeClipSource('   ', CLIP_URL).ok).toBe(false);
    });

    it('API2 匯出的 CLIP_URL_RE 與 DB 規則一致（拒絕 http、接受 @handle）', () => {
        expect(CLIP_URL_RE.test(CLIP_URL)).toBe(true);
        expect(CLIP_URL_RE.test('http://www.youtube.com/@zzclip')).toBe(false);
        expect(CLIP_URL_RE.test('https://evil.com/@zzclip')).toBe(false);
    });
});

// ================= 共用：normalizePerformers =================
describe('normalizePerformers', () => {
    it('API1 站內（uuid 轉小寫）與站外（name trim）都通過，缺的欄位補 null', () => {
        expect(normalizePerformers([{ vtuber_id: VT_A.toUpperCase() }, { name: '  外部歌手  ' }])).toEqual({
            ok: true,
            value: [
                { vtuber_id: VT_A, name: null },
                { vtuber_id: null, name: '外部歌手' },
            ],
        });
        // 站內者同時帶 name 也保留
        expect(normalizePerformers([{ vtuber_id: VT_A, name: '快取名' }])).toEqual({
            ok: true,
            value: [{ vtuber_id: VT_A, name: '快取名' }],
        });
        expect(normalizePerformers([])).toEqual({ ok: true, value: [] });
    });

    it('API3 非陣列、超過 10 位 → ok=false；恰好 10 位通過', () => {
        for (const bad of [null, undefined, 'x', {}, 5]) expect(normalizePerformers(bad).ok, String(bad)).toBe(false);
        const names = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `人${i}` }));
        expect(normalizePerformers(names(10)).ok).toBe(true);
        expect(normalizePerformers(names(11)).ok).toBe(false);
    });

    it('API3 空名字、全空白、超過 60 字、vtuber_id 與 name 皆無 → ok=false', () => {
        expect(normalizePerformers([{ name: '' }]).ok).toBe(false);
        expect(normalizePerformers([{ name: '   ' }]).ok).toBe(false);
        expect(normalizePerformers([{ vtuber_id: null, name: null }]).ok).toBe(false);
        expect(normalizePerformers([{}]).ok).toBe(false);
        expect(normalizePerformers([{ name: 'a'.repeat(61) }]).ok).toBe(false);
        expect(normalizePerformers([{ name: 'a'.repeat(60) }]).ok).toBe(true);
    });

    it('API3 vtuber_id 不是 uuid、元素不是物件 → ok=false', () => {
        expect(normalizePerformers([{ vtuber_id: 'not-a-uuid' }]).ok).toBe(false);
        expect(normalizePerformers([{ vtuber_id: 123 }]).ok).toBe(false);
        expect(normalizePerformers(['外部歌手']).ok).toBe(false);
        expect(normalizePerformers([null]).ok).toBe(false);
    });

    it('API3 同 vtuber_id（含大小寫不同）或同站外名字重複 → 只留第一個', () => {
        expect(normalizePerformers([{ vtuber_id: VT_A }, { vtuber_id: VT_A.toUpperCase() }, { vtuber_id: VT_B }])).toEqual({
            ok: true,
            value: [
                { vtuber_id: VT_A, name: null },
                { vtuber_id: VT_B, name: null },
            ],
        });
        expect(normalizePerformers([{ name: '甲' }, { name: ' 甲 ' }, { name: '乙' }])).toEqual({
            ok: true,
            value: [
                { vtuber_id: null, name: '甲' },
                { vtuber_id: null, name: '乙' },
            ],
        });
    });

    it('API3 站內者之間名字相同不算重複（只有無 vtuber_id 的才比名字）', () => {
        const r = normalizePerformers([{ vtuber_id: VT_A, name: '同名' }, { vtuber_id: VT_B, name: '同名' }]);
        expect(r.ok).toBe(true);
        expect(r.value).toHaveLength(2);
    });
});

// ================= 後台 payload：buildSongVideoPayload =================
describe('buildSongVideoPayload 的剪輯來源與合唱者', () => {
    const body = (over: Record<string, unknown> = {}, segs?: unknown[]) => ({
        video_id: VIDEO,
        title: '測試歌回',
        status: 'draft',
        segments: segs ?? [{ start_seconds: 0, end_seconds: 10, title: 'A' }],
        ...over,
    });

    it('API1 合法剪輯來源與合唱者通過，輸出正規化後的欄位', () => {
        const r = buildSongVideoPayload(
            body(
                { clip_channel_name: '  剪輯頻道 ', clip_channel_url: `${CLIP_URL}/?si=x` },
                [{ start_seconds: 0, end_seconds: 10, title: 'A', performers: [{ vtuber_id: VT_A.toUpperCase() }, { name: ' 外部 ' }] }],
            ),
        );
        expect(r.ok).toBe(true);
        expect(r.video.clip_channel_name).toBe('剪輯頻道');
        expect(r.video.clip_channel_url).toBe(CLIP_URL);
        expect(r.segments[0].performers).toEqual([
            { vtuber_id: VT_A, name: null },
            { vtuber_id: null, name: '外部' },
        ]);
    });

    it('API1 兩個 clip key 都沒帶 → 輸出 video 不含這兩 key（DB 以 key 不存在表示保留舊值）', () => {
        const r = buildSongVideoPayload(body());
        expect(r.ok).toBe(true);
        expect('clip_channel_name' in r.video).toBe(false);
        expect('clip_channel_url' in r.video).toBe(false);
    });

    it('API1 兩個 clip key 都明確帶 null → 輸出帶 null（清除剪輯來源）', () => {
        const r = buildSongVideoPayload(body({ clip_channel_name: null, clip_channel_url: null }));
        expect(r.ok).toBe(true);
        expect(r.video.clip_channel_name).toBeNull();
        expect(r.video.clip_channel_url).toBeNull();
    });

    it('API1 片段沒帶 performers → 輸出片段不含此 key；帶 [] → 輸出 []（清空）', () => {
        const none = buildSongVideoPayload(body());
        expect('performers' in none.segments[0]).toBe(false);
        const cleared = buildSongVideoPayload(body({}, [{ start_seconds: 0, end_seconds: 10, title: 'A', performers: [] }]));
        expect(cleared.ok).toBe(true);
        expect(cleared.segments[0].performers).toEqual([]);
    });

    it('API2 剪輯網址非白名單、或只帶一個 clip 欄位 → invalid_payload', () => {
        for (const bad of [
            { clip_channel_name: '剪輯', clip_channel_url: 'https://evil.com/@x' },
            { clip_channel_name: '剪輯', clip_channel_url: 'http://www.youtube.com/@x' },
            { clip_channel_name: '剪輯', clip_channel_url: 'https://youtu.be/dQw4w9WgXcQ' },
            { clip_channel_name: '剪輯' },
            { clip_channel_url: CLIP_URL },
            { clip_channel_name: '剪輯', clip_channel_url: null },
        ]) {
            const r = buildSongVideoPayload(body(bad));
            expect(r.ok, JSON.stringify(bad)).toBe(false);
            expect(r.error, JSON.stringify(bad)).toBe('invalid_payload');
        }
    });

    it('API3 片段合唱者超過 10 位、空名字、壞 uuid → invalid_payload', () => {
        const seg = (performers: unknown) => [{ start_seconds: 0, end_seconds: 10, title: 'A', performers }];
        const eleven = Array.from({ length: 11 }, (_, i) => ({ name: `人${i}` }));
        for (const bad of [eleven, [{ name: '' }], [{ vtuber_id: 'nope' }], 'not-array']) {
            const r = buildSongVideoPayload(body({}, seg(bad)));
            expect(r.ok, JSON.stringify(bad)).toBe(false);
            expect(r.error, JSON.stringify(bad)).toBe('invalid_payload');
        }
    });

    it('API3 合唱者重複在 payload 階段就去重', () => {
        const r = buildSongVideoPayload(
            body({}, [{ start_seconds: 0, end_seconds: 10, title: 'A', performers: [{ vtuber_id: VT_A }, { vtuber_id: VT_A }] }]),
        );
        expect(r.ok).toBe(true);
        expect(r.segments[0].performers).toEqual([{ vtuber_id: VT_A, name: null }]);
    });
});

// ================= 社群投稿解析：parseSubmissionBody =================
describe('parseSubmissionBody 的剪輯來源與合唱者', () => {
    const seg = (start: number, end: number, title: string, extra: Record<string, unknown> = {}) => ({ start, end, title, ...extra });
    const sub = (over: Record<string, unknown> = {}) => ({
        videoId: VIDEO,
        title: '歌回 #1',
        vtuberId: REF,
        streamedAt: null,
        rev: null,
        durationSeconds: null,
        segments: [seg(0, 100, 'A'), seg(100, 200, 'B')],
        note: null,
        contact: null,
        turnstileToken: 'tok',
        ...over,
    });
    const val = (r: any) => r.value ?? r.data;

    it('API4 clipSource 與每段 performers 正確傳遞並正規化', () => {
        const r = parseSubmissionBody(
            sub({
                clipSource: { name: ' 剪輯頻道 ', url: `${CLIP_URL}/` },
                segments: [
                    seg(0, 100, 'A', { performers: [{ vtuberId: VT_A.toUpperCase() }, { name: ' 外部 ' }] }),
                    seg(100, 200, 'B'),
                ],
            }),
        );
        expect(r.error).toBeUndefined();
        expect(val(r).clipSource).toEqual({ name: '剪輯頻道', url: CLIP_URL });
        expect(val(r).segments[0].performers).toEqual([
            { vtuberId: VT_A, name: null },
            { vtuberId: null, name: '外部' },
        ]);
        // 沒帶 performers 的片段維持 undefined（= 不改）
        expect(val(r).segments[1].performers).toBeUndefined();
    });

    it('API4 clipSource 未給 → undefined（不改）；明確給 null → null（清除）', () => {
        expect(val(parseSubmissionBody(sub())).clipSource).toBeUndefined();
        expect(val(parseSubmissionBody(sub({ clipSource: null }))).clipSource).toBeNull();
    });

    it('API4 performers 給 [] → 保留 []（清空），不被當成沒給', () => {
        const r = parseSubmissionBody(sub({ segments: [seg(0, 100, 'A', { performers: [] })] }));
        expect(r.error).toBeUndefined();
        expect(val(r).segments[0].performers).toEqual([]);
    });

    it('API4 clipSource 網址非 YouTube、缺欄位、型別錯 → invalid_payload 且不給 value', () => {
        for (const bad of [
            { name: '剪輯', url: 'https://evil.com/@x' },
            { name: '剪輯', url: 'http://www.youtube.com/@x' },
            { name: '剪輯' },
            { url: CLIP_URL },
            { name: '', url: CLIP_URL },
            '字串',
        ]) {
            const r = parseSubmissionBody(sub({ clipSource: bad }));
            expect(r.error, JSON.stringify(bad)).toBe('invalid_payload');
            expect(val(r)).toBeUndefined();
        }
    });

    it('API4 performers 超過 10 位、空名字、壞 uuid → invalid_payload', () => {
        const eleven = Array.from({ length: 11 }, (_, i) => ({ name: `人${i}` }));
        for (const bad of [eleven, [{ name: '' }], [{ vtuberId: 'nope' }], [{}], 'x']) {
            const r = parseSubmissionBody(sub({ segments: [seg(0, 100, 'A', { performers: bad })] }));
            expect(r.error, JSON.stringify(bad)).toBe('invalid_payload');
        }
    });
});

// ================= 投稿端點：POST /api/songs/submissions =================
function memKv() {
    const m = new Map<string, string>();
    return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => void m.set(k, v) };
}
type Call = { method: string; url: string; body: any };
let calls: Call[] = [];
let sb: (method: string, path: string, body: any) => Response;
const rpcCalls = () => calls.filter((c) => c.url.includes('rpc/community_save_song_video'));
const SUBMIT_ENV = () => ({
    SUPABASE_URL: 'http://sb',
    SUPABASE_SERVICE_ROLE_KEY: 'k',
    RATE_LIMIT_KV: memKv(),
    ENFORCE_TURNSTILE: 'true',
    TURNSTILE_SECRET_KEY: 's',
    IP_HASH_SALT: 'salt',
    ADMIN_API_TOKEN: 'admintoken',
});
const submitBody = (over: Record<string, unknown> = {}) => ({
    videoId: VIDEO,
    title: '歌回 #1',
    vtuberId: REF,
    streamedAt: null,
    rev: null,
    durationSeconds: null,
    segments: [{ start: 0, end: 100, title: 'A' }],
    note: null,
    contact: null,
    turnstileToken: 'tok',
    ...over,
});
const submit = (b: unknown) =>
    submitPost({
        request: new Request('https://multistreaming.org/api/songs/submissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9', Origin: 'https://multistreaming.org' },
            body: JSON.stringify(b),
        }),
        env: SUBMIT_ENV(),
        waitUntil: () => {},
    });

describe('POST /api/songs/submissions 傳遞剪輯來源與合唱者', () => {
    beforeEach(() => {
        calls = [];
        sb = (method) =>
            method === 'GET'
                ? new Response('[]')
                : new Response(JSON.stringify({ kind: 'new', video_ref: REF, rev: REV, submission_id: SUB_ID }), { status: 200 });
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

    it('API4 clipSource 轉成 p_video 的 clip_channel_*，performers 轉成 [{vtuber_id,name}]', async () => {
        const res = await submit(
            submitBody({
                clipSource: { name: '剪輯頻道', url: CLIP_URL },
                segments: [{ start: 0, end: 100, title: 'A', performers: [{ vtuberId: VT_A }, { name: '外部' }] }],
            }),
        );
        expect(res.status).toBe(201);
        expect(rpcCalls()).toHaveLength(1);
        const body = rpcCalls()[0].body;
        expect(body.p_video.clip_channel_name).toBe('剪輯頻道');
        expect(body.p_video.clip_channel_url).toBe(CLIP_URL);
        expect(body.p_segments[0].performers).toEqual([
            { vtuber_id: VT_A, name: null },
            { vtuber_id: null, name: '外部' },
        ]);
    });

    it('API4 沒帶 clipSource／performers 時 RPC 參數不含這些 key（保留 DB 原值）', async () => {
        const res = await submit(submitBody());
        expect(res.status).toBe(201);
        const body = rpcCalls()[0].body;
        expect('clip_channel_name' in body.p_video).toBe(false);
        expect('clip_channel_url' in body.p_video).toBe(false);
        expect('performers' in body.p_segments[0]).toBe(false);
    });

    it('API4 clipSource 為 null → RPC 帶 clip_channel_* 為 null（清除）', async () => {
        const res = await submit(submitBody({ clipSource: null }));
        expect(res.status).toBe(201);
        const body = rpcCalls()[0].body;
        expect(body.p_video.clip_channel_name).toBeNull();
        expect(body.p_video.clip_channel_url).toBeNull();
    });

    it('API4 clipSource 網址不合法 → 400 且不呼叫 RPC', async () => {
        const res = await submit(submitBody({ clipSource: { name: '剪輯', url: 'https://evil.com/@x' } }));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('invalid_payload');
        expect(rpcCalls()).toHaveLength(0);
    });
});

// ================= GET /api/songs/timeline =================
describe('GET /api/songs/timeline 回傳合唱者與剪輯來源', () => {
    const VID_UUID = '55555555-5555-4555-8555-555555555555';
    const VT = { id: VT_B, name: '主角', img_url: null };
    let videoRows: unknown[] = [];

    const videoRow = (over: Record<string, unknown> = {}) => ({
        id: VID_UUID,
        video_id: VIDEO,
        title: '歌回 #1',
        vtuber_id: VT_B,
        streamed_at: '2026-10-01T12:00:00+00:00',
        duration_seconds: 5400,
        status: 'published',
        community_locked: false,
        updated_at: REV,
        clip_channel_name: null,
        clip_channel_url: null,
        vtubers: VT,
        song_segments: [
            {
                code: 'aaaaaaaa', start_seconds: 0, end_seconds: 100, title: '第一首', original_artist: null, version_note: null,
                // 故意亂序；站內者的表內 name 是舊值，應以關聯 vtubers.name 為準
                song_segment_performers: [
                    { position: 1, vtuber_id: null, name: '外部歌手', vtubers: null },
                    { position: 0, vtuber_id: VT_A, name: '舊快取名', vtubers: { name: '站內即時名' } },
                ],
            },
            { code: 'bbbbbbbb', start_seconds: 100, end_seconds: 200, title: '第二首', original_artist: null, version_note: null, song_segment_performers: [] },
        ],
        ...over,
    });

    const get = () =>
        timelineGet({
            request: new Request(`https://multistreaming.org/api/songs/timeline?v=${VIDEO}`),
            env: { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'k' },
            waitUntil: () => {},
        });

    beforeEach(() => {
        videoRows = [videoRow()];
        vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
            const url = String(input);
            if (!url.startsWith('http://sb/rest/v1/')) throw new Error(`unexpected fetch ${url}`);
            const path = url.slice('http://sb/rest/v1/'.length);
            if (path.startsWith('song_videos')) return new Response(JSON.stringify(videoRows));
            return new Response('[]');
        }));
    });
    afterEach(() => vi.unstubAllGlobals());

    it('API5 每段 performers 依 position 排序，站內者名字取 vtubers.name，站外者取表內 name', async () => {
        const json = await (await get()).json();
        expect(json.ok).toBe(true);
        expect(json.data.segments[0].performers).toEqual([
            { vtuberId: VT_A, name: '站內即時名' },
            { vtuberId: null, name: '外部歌手' },
        ]);
    });

    it('API5 沒有合唱者的片段 performers 為 []（不是 undefined）', async () => {
        const json = await (await get()).json();
        expect(json.data.segments[1].performers).toEqual([]);
    });

    it('API5 影片有剪輯來源 → clipSource 帶 {name,url}', async () => {
        videoRows = [videoRow({ clip_channel_name: '剪輯頻道', clip_channel_url: CLIP_URL })];
        const json = await (await get()).json();
        expect(json.data.clipSource).toEqual({ name: '剪輯頻道', url: CLIP_URL });
    });

    it('API5 影片沒有剪輯來源 → clipSource 為 null（不是 undefined）', async () => {
        const json = await (await get()).json();
        expect(json.data.clipSource).toBeNull();
    });
});
