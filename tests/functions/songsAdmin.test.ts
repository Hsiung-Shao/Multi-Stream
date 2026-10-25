// 歌曲清單管理 API：片段驗證、payload 組裝、admin gate
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { buildSongVideoPayload } from '../../functions/lib/songs.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestPost as songsPost, onRequestPut as songsPut } from '../../functions/api/admin/songs.js';

const VIDEO_ID = 'dQw4w9WgXcQ';
const ENV = () => ({
    ADMIN_API_TOKEN: 't',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
});

const body = (segments: unknown[], extra: Record<string, unknown> = {}) => ({
    video_id: VIDEO_ID,
    title: '測試歌回',
    status: 'draft',
    segments,
    ...extra,
});

const req = (payload: unknown, headers: Record<string, string> = { 'X-Admin-Token': 't' }) =>
    new Request('https://multistreaming.org/api/admin/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload),
    });

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
    fetchSpy = vi.fn(async () => new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
    vi.unstubAllGlobals();
});

describe('POST /api/admin/songs', () => {
    it('未帶 token 或 token 錯誤回 401，且不碰資料庫', async () => {
        const payload = body([{ start_seconds: 0, end_seconds: 10, title: 'A' }]);
        const none = await songsPost({ request: req(payload, {}), env: ENV() });
        expect(none.status).toBe(401);
        const wrong = await songsPost({ request: req(payload, { 'X-Admin-Token': 'x' }), env: ENV() });
        expect(wrong.status).toBe(401);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('擋非法片段：重疊 → 400 invalid_segments，且不發出任何 fetch', async () => {
        const overlap = body([
            { start_seconds: 0, end_seconds: 100, title: 'A' },
            { start_seconds: 50, end_seconds: 150, title: 'B' },
        ]);
        const res = await songsPost({ request: req(overlap), env: ENV() });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe('invalid_segments');
        expect(Array.isArray(json.issues)).toBe(true);
        expect(json.issues.length).toBeGreaterThan(0);
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

describe('buildSongVideoPayload', () => {
    it('非法 video_id → invalid_video_id', () => {
        const r = buildSongVideoPayload({ ...body([{ start_seconds: 0, end_seconds: 10, title: 'A' }]), video_id: 'bad' });
        expect(r.ok).toBe(false);
        expect(r.error).toBe('invalid_video_id');
    });

    it('合法 payload：ok，position 依 start 排序為 0..n-1', () => {
        const r = buildSongVideoPayload(
            body([
                { start_seconds: 200, end_seconds: 300, title: '第三', original_artist: '原唱C' },
                { start_seconds: 0, end_seconds: 100, title: '第一' },
                { start_seconds: 100, end_seconds: 200, title: '第二' },
            ]),
        );
        expect(r.ok).toBe(true);
        expect(r.video).toMatchObject({ video_id: VIDEO_ID, title: '測試歌回', status: 'draft' });
        expect(r.segments.map((s: { title: string }) => s.title)).toEqual(['第一', '第二', '第三']);
        expect(r.segments.map((s: { position: number }) => s.position)).toEqual([0, 1, 2]);
        expect(r.segments[2].original_artist).toBe('原唱C');
    });

    it('片段規則與前端一致：缺結束、結束早於開始、空歌名、超過影片長度', () => {
        const codesOf = (segments: unknown[], extra: Record<string, unknown> = {}) => {
            const r = buildSongVideoPayload(body(segments, extra));
            expect(r.ok).toBe(false);
            expect(r.error).toBe('invalid_segments');
            return r.issues.map((i: { code: string }) => i.code);
        };
        expect(codesOf([{ start_seconds: 10, end_seconds: 10, title: 'A' }])).toContain('end_before_start');
        expect(codesOf([{ start_seconds: 10, end_seconds: 20, title: '  ' }])).toContain('empty_title');
        expect(codesOf([{ start_seconds: 10, end_seconds: 400, title: 'A' }], { duration_seconds: 300 })).toContain('exceeds_duration');
        expect(codesOf([{ start_seconds: 10, end_seconds: null, title: 'A' }])).toContain('missing_end');
    });

    it('片段超過 200 筆或歌名超過 200 字拒絕', () => {
        const many = Array.from({ length: 201 }, (_, i) => ({ start_seconds: i * 10, end_seconds: i * 10 + 5, title: `s${i}` }));
        expect(buildSongVideoPayload(body(many)).ok).toBe(false);
        const longTitle = buildSongVideoPayload(body([{ start_seconds: 0, end_seconds: 5, title: 'x'.repeat(201) }]));
        expect(longTitle.ok).toBe(false);
    });
});

// ---------- review 修正：PUT 改走單一 RPC ----------
const UID = '11111111-1111-4111-8111-111111111111';
const SEG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DASHES = '-'.repeat(36);
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const put = (payload: unknown, id: string = UID, headers: Record<string, string> = { 'X-Admin-Token': 't' }) =>
    new Request(`https://multistreaming.org/api/admin/songs?id=${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload),
    });
const callUrl = (c: unknown[]) => String(c[0] instanceof Request ? c[0].url : c[0]);
const callBody = (c: unknown[]) => {
    const raw = c[0] instanceof Request ? null : (c[1] as RequestInit | undefined)?.body;
    return typeof raw === 'string' ? JSON.parse(raw) : null;
};
const goodSegments = () => [
    { id: SEG_ID, start_seconds: 0, end_seconds: 100, title: '第一' },
    { start_seconds: 100, end_seconds: 200, title: '第二' },
];

describe('PUT /api/admin/songs（單一 RPC）', () => {
    it('PUT 只發一次 DB 請求，打 admin_save_song_video 並帶 p_id/p_video/p_segments', async () => {
        fetchSpy.mockResolvedValue(json({ id: UID, segments: [] }));
        const res = await songsPut({ request: put(body(goodSegments())), env: ENV() });
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const call = fetchSpy.mock.calls[0];
        expect(callUrl(call)).toContain('/rest/v1/rpc/admin_save_song_video');
        const sent = callBody(call);
        expect(sent.p_id).toBe(UID);
        expect(sent.p_video).toMatchObject({ video_id: VIDEO_ID });
        expect(sent.p_segments).toHaveLength(2);
        expect(sent.p_segments[0].id).toBe(SEG_ID);
    });

    it('PUT 驗證失敗（片段重疊）400 且不發請求', async () => {
        const overlap = body([
            { start_seconds: 0, end_seconds: 100, title: 'A' },
            { start_seconds: 50, end_seconds: 150, title: 'B' },
        ]);
        const res = await songsPut({ request: put(overlap), env: ENV() });
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('invalid_segments');
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('片段 id 不屬於這支影片 → 400 unknown_segment_id', async () => {
        fetchSpy.mockResolvedValue(json({ code: 'P0001', message: 'unknown_segment_id' }, 400));
        const res = await songsPut({ request: put(body(goodSegments())), env: ENV() });
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('unknown_segment_id');
    });

    it('PUT ?id= 不是標準 UUID（36 個 -）→ 400 且不發請求', async () => {
        const res = await songsPut({ request: put(body(goodSegments()), DASHES), env: ENV() });
        expect(res.status).toBe(400);
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

describe('POST 重複與錯誤對應', () => {
    it('video_id 唯一鍵衝突 → 409 video_exists；其他外鍵錯誤不得是 video_exists', async () => {
        const payload = body([{ start_seconds: 0, end_seconds: 10, title: 'A' }]);
        fetchSpy.mockResolvedValue(
            json({ code: '23505', message: 'duplicate key value violates unique constraint "song_videos_video_id_key"' }, 409),
        );
        const dup = await songsPost({ request: req(payload), env: ENV() });
        expect(dup.status).toBe(409);
        expect((await dup.json()).error).toBe('video_exists');

        fetchSpy.mockResolvedValue(json({ code: '23503', message: 'violates foreign key constraint "song_videos_vtuber_id_fkey"' }, 409));
        const fk = await songsPost({ request: req(payload), env: ENV() });
        expect((await fk.json()).error).not.toBe('video_exists');
    });
});

describe('buildSongVideoPayload（UUID 與長度，review 修正）', () => {
    const seg = (extra: Record<string, unknown> = {}) => ({ start_seconds: 0, end_seconds: 10, title: 'A', ...extra });

    it('vtuber_id 或片段 id 為 36 個 - → invalid_payload', () => {
        const a = buildSongVideoPayload(body([seg()], { vtuber_id: DASHES }));
        expect(a).toMatchObject({ ok: false, error: 'invalid_payload' });
        const b = buildSongVideoPayload(body([seg({ id: DASHES })]));
        expect(b).toMatchObject({ ok: false, error: 'invalid_payload' });
    });

    it('大寫 uuid 通過並輸出轉小寫', () => {
        const r = buildSongVideoPayload(body([seg({ id: SEG_ID.toUpperCase() })], { vtuber_id: UID.toUpperCase() }));
        expect(r.ok).toBe(true);
        expect(r.video.vtuber_id).toBe(UID);
        expect(r.segments[0].id).toBe(SEG_ID);
    });

    it('歌名超過 200 字回報列號：invalid_segments + title_too_long', () => {
        const r = buildSongVideoPayload(body([seg(), seg({ start_seconds: 10, end_seconds: 20, title: 'x'.repeat(201) })]));
        expect(r.ok).toBe(false);
        expect(r.error).toBe('invalid_segments');
        expect(r.issues).toContainEqual({ index: 1, code: 'title_too_long' });
    });
});
