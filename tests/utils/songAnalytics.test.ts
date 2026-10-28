/**
 * @vitest-environment-options {"url":"https://multistreaming.org/"}
 */
// 歌單 GA4 事件：事件名稱與參數固定、不送歌單名稱（使用者自填，可能含個資）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let gtag: ReturnType<typeof vi.fn>;

async function liveAnalytics() {
    vi.resetModules();
    localStorage.setItem('cookie_consent', 'accepted');
    gtag = vi.fn();
    (window as unknown as { gtag: unknown }).gtag = gtag;
    vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
        queueMicrotask(() => (node as unknown as HTMLScriptElement).onload?.(new Event('load')));
        return node;
    });
    const a = await import('../../src/utils/analytics');
    await a.initGA();
    gtag.mockClear();
    return a;
}

const sent = () => gtag.mock.calls.filter((c) => c[0] === 'event').map((c) => [c[1], c[2]]);

describe('歌單 GA4 事件', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => vi.restoreAllMocks());

    it('建立歌單送 song_playlist_create，帶來源與首數', async () => {
        const { track } = await liveAnalytics();
        track.songPlaylistCreate('queue', 5);
        expect(sent()).toEqual([['song_playlist_create', { source: 'queue', song_count: 5 }]]);
    });

    it('加入既有歌單送 song_playlist_add，帶加入首數', async () => {
        const { track } = await liveAnalytics();
        track.songPlaylistAdd(2);
        expect(sent()).toEqual([['song_playlist_add', { added_count: 2 }]]);
    });

    it('播放歌單送 song_playlist_play，帶可播首數', async () => {
        const { track } = await liveAnalytics();
        track.songPlaylistPlay(3);
        expect(sent()).toEqual([['song_playlist_play', { song_count: 3 }]]);
    });
});
