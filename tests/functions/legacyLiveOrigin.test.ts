// 舊版全頁掃描端點也要有來源限制，否則擋住 live-og 只會讓濫用改打這裡（2026-09）
import { describe, it, expect, vi, afterEach } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestGet } from '../../functions/api/youtube-channel-live.js';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('youtube-channel-live 來源限制', () => {
    it('裸 curl → 403，不抓 YouTube', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const res = await onRequestGet({ request: new Request('https://multistreaming.org/api/youtube-channel-live?channelId=UC' + 'a'.repeat(22)) });
        expect(res.status).toBe(403);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('本站同源請求 → 放行（格式錯誤的 channelId 回 400 證明進到了處理邏輯）', async () => {
        const res = await onRequestGet({ request: new Request('https://multistreaming.org/api/youtube-channel-live?channelId=bad', { headers: { 'Sec-Fetch-Site': 'same-origin' } }) });
        expect(res.status).toBe(400);
    });
});
