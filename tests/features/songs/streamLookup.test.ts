// 公開資料查詢（自後台 hook 搬出）：週表場次帶入、oEmbed 標題
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchStreamByVideoId, fetchOEmbedTitle } from '../../../src/features/songs/streamLookup';
import { resetRestConfigCache } from '../../../src/features/schedule/restClient';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
    resetRestConfigCache();
});
afterEach(() => {
    vi.unstubAllGlobals();
});

describe('fetchStreamByVideoId', () => {
    it('找到場次時開台時間取實際開台，沒有就用預定時間', async () => {
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.startsWith('/api/supabase-config')) return json({ url: 'https://db.example.co', anonKey: 'anon' });
            return json([{ vtuber_id: 'v1', title: '歌回', actual_start: null, scheduled_start: '2026-10-01T12:00:00Z' }]);
        });
        vi.stubGlobal('fetch', fetchMock);
        await expect(fetchStreamByVideoId('AbCdEfGhIjK')).resolves.toEqual({ title: '歌回', vtuberId: 'v1', streamedAt: '2026-10-01T12:00:00Z' });
        const restUrl = String(fetchMock.mock.calls.at(-1)?.[0]);
        expect(restUrl).toContain('platform=eq.youtube');
        expect(restUrl).toContain('external_id=eq.AbCdEfGhIjK');
    });

    it('影片 ID 不合法不發請求，回 null', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        await expect(fetchStreamByVideoId('bad')).resolves.toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('fetchOEmbedTitle', () => {
    it('回傳 oEmbed 標題', async () => {
        const fetchFn = vi.fn(async () => json({ title: ' 歌回 #3 ' }));
        await expect(fetchOEmbedTitle('AbCdEfGhIjK', undefined, fetchFn as unknown as typeof fetch)).resolves.toBe('歌回 #3');
        expect(String((fetchFn.mock.calls[0] as unknown[])[0])).toContain(encodeURIComponent('https://www.youtube.com/watch?v=AbCdEfGhIjK'));
    });

    it('找不到影片（非 2xx）或網路錯誤回 null', async () => {
        await expect(fetchOEmbedTitle('AbCdEfGhIjK', undefined, (async () => json({}, 404)) as unknown as typeof fetch)).resolves.toBeNull();
        await expect(fetchOEmbedTitle('AbCdEfGhIjK', undefined, (async () => { throw new TypeError('net'); }) as unknown as typeof fetch)).resolves.toBeNull();
    });
});
