// GET /api/songs/timeline?v=<11 碼>：社群編輯器載入單場歌回的最新時間軸（不快取）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestGet as timelineGet } from '../../functions/api/songs/timeline.js';

const VIDEO = 'dQw4w9WgXcQ';
const VID_UUID = '55555555-5555-4555-8555-555555555555';
const VT_UUID = '66666666-6666-4666-8666-666666666666';
const REV = '2026-10-28T01:02:03.456+00:00';

type Call = { method: string; url: string };
let calls: Call[] = [];
// 外部 I/O 只有 fetch（PostgREST）；以路徑前綴分派，同時容忍「內嵌查詢」與「分表查詢」兩種實作
let videoRows: unknown[] = [];
let segmentRows: unknown[] = [];
let vtuberRows: unknown[] = [];

const VT = { id: VT_UUID, name: '某某', img_url: 'https://img.example/a.png' };
const SEGS_UNSORTED = [
    { id: 's2', code: 'bbbbbbbb', start_seconds: 200, end_seconds: 300, title: '第二首', original_artist: null, version_note: '現場版', end_estimated: true, position: 1 },
    { id: 's1', code: 'aaaaaaaa', start_seconds: 0, end_seconds: 100, title: '第一首', original_artist: '原唱', version_note: null, position: 0 },
];
const videoRow = (over: Record<string, unknown> = {}) => ({
    id: VID_UUID,
    video_id: VIDEO,
    title: '歌回 #1',
    vtuber_id: VT_UUID,
    streamed_at: '2026-10-01T12:00:00+00:00',
    duration_seconds: 5400,
    status: 'published',
    community_locked: false,
    updated_at: REV,
    // 內嵌查詢實作會用到的欄位（分表查詢實作會忽略）
    vtubers: VT,
    song_segments: SEGS_UNSORTED,
    ...over,
});

const ENV = () => ({ SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'k' });
const get = (query: string) =>
    timelineGet({
        request: new Request(`https://multistreaming.org/api/songs/timeline${query}`),
        env: ENV(),
        waitUntil: () => {},
    });

beforeEach(() => {
    calls = [];
    videoRows = [videoRow()];
    segmentRows = SEGS_UNSORTED;
    vtuberRows = [VT];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        calls.push({ method: init?.method ?? 'GET', url });
        if (!url.startsWith('http://sb/rest/v1/')) throw new Error(`unexpected fetch ${url}`);
        const path = url.slice('http://sb/rest/v1/'.length);
        if (path.startsWith('song_videos')) return new Response(JSON.stringify(videoRows));
        if (path.startsWith('song_segments')) return new Response(JSON.stringify(segmentRows));
        if (path.startsWith('vtubers')) return new Response(JSON.stringify(vtuberRows));
        return new Response('[]');
    }));
});
afterEach(() => vi.unstubAllGlobals());

describe('GET /api/songs/timeline', () => {
    it('F4 v 缺少或格式錯誤 → 400 invalid_video_id，且不碰 DB', async () => {
        for (const q of ['', '?v=bad', '?v=dQw4w9WgXcQ1', '?v=dQw4w9Wg XcQ', '?v=../etc/passwd']) {
            const res = await get(q);
            expect(res.status, q).toBe(400);
            expect(await res.json(), q).toMatchObject({ ok: false, error: 'invalid_video_id' });
        }
        expect(calls).toHaveLength(0);
    });

    it('F4 查無此影片 → 404 not_found', async () => {
        videoRows = [];
        const res = await get(`?v=${VIDEO}`);
        expect(res.status).toBe(404);
        expect(await res.json()).toMatchObject({ ok: false, error: 'not_found' });
    });

    it('F4 影片不是 published（草稿）→ 404 not_found，不洩漏內容', async () => {
        videoRows = [videoRow({ status: 'draft' })];
        const res = await get(`?v=${VIDEO}`);
        expect(res.status).toBe(404);
        const text = await res.text();
        expect(JSON.parse(text)).toMatchObject({ ok: false, error: 'not_found' });
        expect(text).not.toContain('第一首');
    });

    it('F4 成功 200：回契約格式，segments 依 start 排序，rev 為影片 updated_at，locked 帶出', async () => {
        const res = await get(`?v=${VIDEO}`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            ok: true,
            data: {
                videoId: VIDEO,
                title: '歌回 #1',
                vtuber: { id: VT_UUID, name: '某某', img: 'https://img.example/a.png' },
                streamedAt: '2026-10-01T12:00:00+00:00',
                durationSeconds: 5400,
                rev: REV,
                locked: false,
                segments: [
                    { code: 'aaaaaaaa', start: 0, end: 100, title: '第一首', artist: '原唱', note: null, estimated: false },
                    { code: 'bbbbbbbb', start: 200, end: 300, title: '第二首', artist: null, note: '現場版', estimated: true },
                ],
            },
        });
    });

    it('F4 已鎖定的歌回 locked 為 true（前端據此顯示唯讀提示）', async () => {
        videoRows = [videoRow({ community_locked: true })];
        const json = await (await get(`?v=${VIDEO}`)).json();
        expect(json.data.locked).toBe(true);
    });

    it('F4 沒有 VTuber 的歌回 vtuber 為 null', async () => {
        videoRows = [videoRow({ vtuber_id: null, vtubers: null })];
        vtuberRows = [];
        const json = await (await get(`?v=${VIDEO}`)).json();
        expect(json.data.vtuber).toBeNull();
    });

    it('F4 回應標頭 Cache-Control 含 no-store（成功與 404 都是）', async () => {
        const ok = await get(`?v=${VIDEO}`);
        expect(ok.headers.get('Cache-Control')).toContain('no-store');
        videoRows = [];
        const missing = await get(`?v=${VIDEO}`);
        expect(missing.headers.get('Cache-Control')).toContain('no-store');
    });

    it('F4 每次請求都重新查 DB（不做記憶體快取，否則編輯器會拿到舊 rev）', async () => {
        await get(`?v=${VIDEO}`);
        const first = calls.length;
        expect(first).toBeGreaterThan(0);
        videoRows = [videoRow({ updated_at: '2026-10-28T09:00:00.000+00:00' })];
        const json = await (await get(`?v=${VIDEO}`)).json();
        expect(calls.length).toBeGreaterThan(first);
        expect(json.data.rev).toBe('2026-10-28T09:00:00.000+00:00');
    });

    it('F4 DB 失敗 → 5xx 且不洩漏 DB 錯誤文字', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('secret db detail', { status: 500 })));
        const res = await get(`?v=${VIDEO}`);
        expect(res.status).toBeGreaterThanOrEqual(500);
        expect(await res.text()).not.toContain('secret db detail');
    });
});
