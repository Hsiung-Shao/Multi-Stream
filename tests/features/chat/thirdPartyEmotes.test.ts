// 第三方表情：抓取失敗時不快取空結果，網路恢復後同一分頁還能再抓
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('loadChannelEmotes 快取', () => {
    beforeEach(() => { sessionStorage.clear(); vi.resetModules(); });
    afterEach(() => vi.unstubAllGlobals());

    it('有一家抓取失敗時不寫快取，下一次會重抓', async () => {
        const fetchMock = vi.fn(async (url: string) => (url.includes('7tv.io')
            ? new Response('err', { status: 503 })
            : new Response(JSON.stringify(url.includes('betterttv') ? { channelEmotes: [{ id: 'abc123', code: 'Pog' }], sharedEmotes: [] } : { sets: {} }), { status: 200 })));
        vi.stubGlobal('fetch', fetchMock);
        const { loadChannelEmotes } = await import('../../../src/features/chat/thirdPartyEmotes');
        const first = await loadChannelEmotes('123');
        expect(first.Pog).toBe('https://cdn.betterttv.net/emote/abc123/1x');
        const calls = fetchMock.mock.calls.length;
        await loadChannelEmotes('123');
        expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);
    });

    it('三家都成功時快取，第二次不再打網路', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const { loadChannelEmotes } = await import('../../../src/features/chat/thirdPartyEmotes');
        await loadChannelEmotes('456');
        const calls = fetchMock.mock.calls.length;
        await loadChannelEmotes('456');
        expect(fetchMock.mock.calls.length).toBe(calls);
    });
});
