// 舊版全頁掃描端點已停用（2026-10-04 CPU 超限）：任何請求都回 410，不再抓 YouTube。
// 擋住 live-og 只會讓濫用改打這裡（2026-09），停用後這條路徑完全不耗 CPU。
import { describe, it, expect, vi, afterEach } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { onRequestGet } from '../../functions/api/youtube-channel-live.js';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('youtube-channel-live（已停用）', () => {
    it.each([
        ['裸 curl', {}],
        ['本站同源請求', { 'Sec-Fetch-Site': 'same-origin' }],
    ])('%s → 410，不抓 YouTube', async (_label, headers) => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const res = await onRequestGet({ request: new Request('https://multistreaming.org/api/youtube-channel-live?channelId=UC' + 'a'.repeat(22), { headers }) });
        expect(res.status).toBe(410);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
