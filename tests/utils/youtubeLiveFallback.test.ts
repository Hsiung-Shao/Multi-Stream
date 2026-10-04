// OG 端點回 HTTP 錯誤時不可退到舊版全頁掃描（2026-09 CPU 超限事件：超載時 fallback 會把負載加倍；
// 403 時 fallback 等於繞過來源限制）。只有網路層例外才退。
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

    it('OG 端點 403（來源檢查不通過）→ 丟錯，不退到舊版繞過限制', async () => {
        fetchMock.mockResolvedValueOnce(json({ error: 'Forbidden' }, 403));
        await expect(youtubeApi.checkChannelLiveStatus(CH)).rejects.toThrow(/403/);
        expect(legacyCalls()).toHaveLength(0);
    });

    it('OG 端點正常 → 直接採用，不打舊版端點', async () => {
        fetchMock.mockResolvedValueOnce(json({ isLive: true, videoId: 'abcdefghijk' }));
        const r = await youtubeApi.checkChannelLiveStatus(CH);
        expect(r.isLive).toBe(true);
        expect(legacyCalls()).toHaveLength(0);
    });

    // 2026-10-04：網路錯誤（含逾時）也不再退到舊版。YouTube 回應慢時這條退路會被大量觸發，
    // 而舊版整頁掃描必定超過 10ms CPU（Pages 24 小時 8,028 次超限）
    it('OG 端點網路錯誤或逾時 → 丟錯，不打舊版端點', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('network'));
        await expect(youtubeApi.checkChannelLiveStatus(CH)).rejects.toThrow();
        expect(legacyCalls()).toHaveLength(0);
    });
});
