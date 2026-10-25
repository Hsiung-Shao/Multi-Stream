// 歌曲清單管理 API：片段驗證、payload 組裝、admin gate
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { buildSongVideoPayload } from '../../functions/lib/songs.js';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestPost as songsPost } from '../../functions/api/admin/songs.js';

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
