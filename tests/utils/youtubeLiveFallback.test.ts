// OG 端點 5xx 時不可退到舊版全頁掃描（2026-09 CPU 超限事件：超載時 fallback 會把負載加倍）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { youtubeApi } from '../../src/utils/youtubeApi';

const CH = 'UC' + 'd'.repeat(22);

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const legacyCalls = () =>
    fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/youtube-channel-live?'));

describe('youtubeApi.checkChannelLiveStatus fallback', () => {
    it('OG 端點 503 → 丟錯，不打舊版端點', async () => {
        fetchMock.mockResolvedValueOnce(json({ error: 'cpu' }, 503));
        await expect(youtubeApi.checkChannelLiveStatus(CH)).rejects.toThrow(/503/);
        expect(legacyCalls()).toHaveLength(0);
    });

    it('OG 端點正常 → 直接採用，不打舊版端點', async () => {
        fetchMock.mockResolvedValueOnce(json({ isLive: true, videoId: 'abcdefghijk' }));
        const r = await youtubeApi.checkChannelLiveStatus(CH);
        expect(r.isLive).toBe(true);
        expect(legacyCalls()).toHaveLength(0);
    });

    it('OG 端點網路錯誤 → 仍保留舊版 fallback', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('network'));
        fetchMock.mockResolvedValueOnce(json({ isLive: false }));
        const r = await youtubeApi.checkChannelLiveStatus(CH);
        expect(r.isLive).toBe(false);
        expect(legacyCalls()).toHaveLength(1);
    });
});
