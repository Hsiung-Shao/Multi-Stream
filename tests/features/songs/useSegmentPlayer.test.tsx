// 片段播放器 hook：不自動播、同影片 seek、輪詢切歌只觸發一次、錯誤 1.5 秒後跳過、卸載銷毀
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import type { QueueItem } from '../../../src/features/songs/lib/queue';

vi.mock('../../../src/utils/apiLoader', () => ({
    apiLoader: { loadYouTubePlayerApi: vi.fn(async () => undefined) },
}));

import { useSegmentPlayer, playerQueueReducer, type SegmentPlayer, type YTPlayerOptions } from '../../../src/features/songs/hooks/useSegmentPlayer';
import { createQueue, currentItem } from '../../../src/features/songs/lib/queue';
import { VOLUME_STORAGE_KEY } from '../../../src/features/songs/lib/volume';

type EventName = keyof NonNullable<YTPlayerOptions['events']>;

class FakePlayer {
    static instances: FakePlayer[] = [];
    opts: YTPlayerOptions;
    currentTime = 0;
    duration = 3600;
    state = -1;
    loadVideoById = vi.fn();
    cueVideoById = vi.fn();
    seekTo = vi.fn();
    playVideo = vi.fn();
    pauseVideo = vi.fn();
    destroy = vi.fn();
    setVolume = vi.fn();
    mute = vi.fn();
    unMute = vi.fn();
    isMuted = vi.fn(() => false);
    getCurrentTime = () => this.currentTime;
    getDuration = () => this.duration;
    getPlayerState = () => this.state;
    constructor(_target: HTMLElement, opts: YTPlayerOptions) {
        this.opts = opts;
        FakePlayer.instances.push(this);
    }
    emit(name: EventName, data?: number) {
        if (name === 'onStateChange' && typeof data === 'number') this.state = data;
        act(() => {
            (this.opts.events?.[name] as ((e: { target: FakePlayer; data: unknown }) => void) | undefined)?.({ target: this, data });
        });
    }
}

const item = (code: string, videoId: string, start: number, end: number): QueueItem => ({ code, videoId, start, end });
const V1 = 'vid00000001';
const V2 = 'vid00000002';

let api: SegmentPlayer;
function Harness() {
    const p = useSegmentPlayer();
    api = p;
    return <div ref={p.containerRef} />;
}

async function mountReady() {
    const view = render(<Harness />);
    await act(async () => { await Promise.resolve(); });
    const player = FakePlayer.instances[0];
    player.emit('onReady');
    return { view, player };
}

beforeEach(() => {
    vi.useFakeTimers();
    FakePlayer.instances = [];
    (window as unknown as { YT: unknown }).YT = { Player: FakePlayer };
});

afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as { YT?: unknown }).YT;
});

describe('useSegmentPlayer', () => {
    it('建立播放器時不自動播，只 cue 第一首', async () => {
        const { player } = await mountReady();
        expect(player.opts.playerVars?.autoplay).toBe(0);
        act(() => api.load([item('a0000001', V1, 10, 20)], { play: false }));
        expect(player.loadVideoById).not.toHaveBeenCalled();
        expect(player.playVideo).not.toHaveBeenCalled();
        expect(player.cueVideoById).toHaveBeenCalledWith({ videoId: V1, startSeconds: 10 });
    });

    it('按播放才以 loadVideoById 帶起訖載入', async () => {
        const { player } = await mountReady();
        act(() => api.load([item('a0000001', V1, 10, 20)], { play: false }));
        act(() => api.togglePlay());
        expect(player.loadVideoById).toHaveBeenCalledTimes(1);
        expect(player.loadVideoById).toHaveBeenCalledWith({ videoId: V1, startSeconds: 10 });
    });

    it('同影片的下一首呼叫 seekTo、不呼叫 loadVideoById', async () => {
        const { player } = await mountReady();
        act(() => api.load([item('a0000001', V1, 10, 20), item('b0000002', V1, 30, 40)]));
        expect(player.loadVideoById).toHaveBeenCalledTimes(1);
        act(() => api.next());
        expect(player.seekTo).toHaveBeenCalledWith(30, true);
        expect(player.loadVideoById).toHaveBeenCalledTimes(1);
        expect(api.current?.code).toBe('b0000002');
    });

    it('載入片段時不帶 endSeconds，同影片下一首輪詢到結束點只 seekTo', async () => {
        const { player } = await mountReady();
        act(() => api.load([item('a0000001', V1, 10, 20), item('b0000002', V1, 30, 40)]));
        expect(player.loadVideoById).toHaveBeenCalledTimes(1);
        const arg = player.loadVideoById.mock.calls[0][0] as Record<string, unknown>;
        expect(arg).toMatchObject({ videoId: V1, startSeconds: 10 });
        expect('endSeconds' in arg).toBe(false);

        player.emit('onStateChange', 1);
        player.currentTime = 12;
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });
        player.currentTime = 19.9;
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });
        expect(api.current?.code).toBe('b0000002');
        expect(player.seekTo).toHaveBeenLastCalledWith(30, true);
        expect(player.loadVideoById).toHaveBeenCalledTimes(1);
    });

    it('輪詢到結束點切下一首只觸發一次', async () => {
        const { player } = await mountReady();
        act(() => api.load([item('a0000001', V1, 10, 20), item('b0000002', V2, 0, 50), item('c0000003', V2, 60, 90)]));
        player.emit('onStateChange', 1);
        player.currentTime = 12;
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });
        player.currentTime = 19.9;
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });
        expect(api.current?.code).toBe('b0000002');
        expect(player.loadVideoById).toHaveBeenLastCalledWith({ videoId: V2, startSeconds: 0 });
        // 播放器還沒回報新時間：同一個舊時間不能再推進一次
        await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
        expect(api.current?.code).toBe('b0000002');
        expect(player.loadVideoById).toHaveBeenCalledTimes(2);
    });

    it('換首後讀到仍在結束點之後的舊時間不會連跳', async () => {
        const { player } = await mountReady();
        act(() => api.load([item('a0000001', V1, 100, 200), item('b0000002', V2, 0, 50), item('c0000003', V2, 60, 90)]));
        player.emit('onStateChange', 1);
        player.currentTime = 150;
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });
        player.currentTime = 199.9;
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });
        expect(api.current?.code).toBe('b0000002');
        // 舊影片的 199.9 秒 > b 的結束 50：還沒「上膛」，不能把 b 當成播完
        await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
        expect(api.current?.code).toBe('b0000002');
    });

    it('ENDED 也推進到下一首', async () => {
        const { player } = await mountReady();
        act(() => api.load([item('a0000001', V1, 10, 20), item('b0000002', V2, 0, 50)]));
        player.currentTime = 20;
        player.emit('onStateChange', 0);
        expect(api.current?.code).toBe('b0000002');
    });

    it('錯誤碼 150 在 1.5 秒後跳過整支影片', async () => {
        const { player } = await mountReady();
        act(() => api.load([item('a0000001', V1, 10, 20), item('b0000002', V1, 30, 40), item('c0000003', V2, 0, 50)]));
        player.emit('onError', 150);
        expect(api.skipping).toBe(true);
        await act(async () => { await vi.advanceTimersByTimeAsync(1499); });
        expect(api.current?.code).toBe('a0000001');
        await act(async () => { await vi.advanceTimersByTimeAsync(1); });
        expect(api.current?.code).toBe('c0000003');
        expect(api.queue.unplayable).toEqual([V1]);
        expect(api.skipping).toBe(false);
        expect(player.loadVideoById).toHaveBeenLastCalledWith({ videoId: V2, startSeconds: 0 });
    });

    it('等待跳過期間使用者自己換首就不標記錯誤', async () => {
        const { player } = await mountReady();
        act(() => api.load([item('a0000001', V1, 10, 20), item('b0000002', V2, 0, 50)]));
        player.emit('onError', 150);
        act(() => api.next());
        await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
        expect(api.current?.code).toBe('b0000002');
        expect(api.queue.unplayable).toEqual([]);
    });

    it('上一首在播超過 3 秒時回到本首開頭', async () => {
        const { player } = await mountReady();
        act(() => api.load([item('a0000001', V1, 10, 20), item('b0000002', V1, 30, 40)], { startIndex: 1 }));
        player.currentTime = 35;
        act(() => api.prev());
        expect(api.current?.code).toBe('b0000002');
        expect(player.seekTo).toHaveBeenLastCalledWith(30, true);
    });

    it('自動播放被擋時要求使用者點擊，點擊後播放', async () => {
        const { player } = await mountReady();
        act(() => api.load([item('a0000001', V1, 10, 20)]));
        player.emit('onAutoplayBlocked');
        expect(api.needsGesture).toBe(true);
        act(() => api.resume());
        expect(player.playVideo).toHaveBeenCalled();
        expect(api.needsGesture).toBe(false);
    });

    it('卸載時銷毀播放器', async () => {
        const { view, player } = await mountReady();
        view.unmount();
        await act(async () => { await vi.advanceTimersByTimeAsync(0); });
        expect(player.destroy).toHaveBeenCalledTimes(1);
    });
});

describe('playerQueueReducer', () => {
    it('附加時略過已在佇列的歌並接在最後', () => {
        const s0 = createQueue([item('a0000001', V1, 0, 10)]);
        const s1 = playerQueueReducer(s0, { type: 'append', items: [item('a0000001', V1, 0, 10), item('b0000002', V2, 0, 10)] });
        expect(s1.items.map((i) => i.code)).toEqual(['a0000001', 'b0000002']);
        expect(s1.order).toEqual([0, 1]);
    });

    it('移除目前這首以外的項目後目前這首不變', () => {
        const s0 = createQueue([item('a0000001', V1, 0, 10), item('b0000002', V1, 20, 30), item('c0000003', V2, 0, 10)], { startIndex: 2 });
        const s1 = playerQueueReducer(s0, { type: 'remove', pos: 0 });
        expect(s1.items.map((i) => i.code)).toEqual(['b0000002', 'c0000003']);
        expect(currentItem(s1)?.code).toBe('c0000003');
        expect(playerQueueReducer(s1, { type: 'remove', pos: s1.cursor })).toBe(s1);
    });

    it('佇列播完後加入新歌，目前這首指向新歌', () => {
        let s = createQueue([item('a0000001', V1, 0, 10), item('b0000002', V2, 0, 10)], { repeat: 'off' });
        s = playerQueueReducer(s, { type: 'ended' });
        s = playerQueueReducer(s, { type: 'ended' });
        expect(s.status).toBe('stopped');
        s = playerQueueReducer(s, { type: 'append', items: [item('c0000003', V2, 20, 30)] });
        expect(currentItem(s)?.code).toBe('c0000003');
    });

    it('重新載入佇列時 playToken 一定變大', () => {
        const s0 = { ...createQueue([item('a0000001', V1, 0, 10)]), playToken: 5 };
        const s1 = playerQueueReducer(s0, { type: 'load', items: [item('b0000002', V2, 0, 10)], startIndex: 0, play: true });
        expect(s1.playToken).toBe(6);
        expect(s1.status).toBe('playing');
    });
});

// ---------- v1.1：聽滿門檻才記一次播放（以 useSegmentPlayer({ onPlayCredited }) 傳入）----------
function CreditHarness({ onPlayCredited }: { onPlayCredited: (code: string) => void }) {
    const p = useSegmentPlayer({ onPlayCredited } as never);
    api = p;
    return <div ref={p.containerRef} />;
}

async function mountCredit(onPlayCredited: (code: string) => void) {
    render(<CreditHarness onPlayCredited={onPlayCredited} />);
    await act(async () => { await Promise.resolve(); });
    const player = FakePlayer.instances[0];
    player.emit('onReady');
    return player;
}

/** 每 250ms 前進播放時間 0.25 秒，共 seconds 秒 */
async function listen(player: FakePlayer, seconds: number) {
    for (let i = 0; i < seconds * 4; i++) {
        player.currentTime += 0.25;
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    }
}

describe('useSegmentPlayer 播放計次', () => {
    it('聽滿門檻（30 秒）才呼叫一次 onPlayCredited，之後繼續聽不重複', async () => {
        const credited = vi.fn();
        const player = await mountCredit(credited);
        act(() => api.load([item('a0000001', V1, 0, 100), item('b0000002', V2, 0, 100)]));
        player.currentTime = 0;
        player.emit('onStateChange', 1);
        await listen(player, 25);
        expect(credited).not.toHaveBeenCalled();
        await listen(player, 10);
        expect(credited).toHaveBeenCalledTimes(1);
        expect(credited).toHaveBeenCalledWith('a0000001');
        await listen(player, 10);
        expect(credited).toHaveBeenCalledTimes(1);
    });

    it('換首後聆聽秒數歸零：兩首各聽 20 秒都不到門檻', async () => {
        const credited = vi.fn();
        const player = await mountCredit(credited);
        act(() => api.load([item('a0000001', V1, 0, 100), item('b0000002', V2, 0, 100)]));
        player.currentTime = 0;
        player.emit('onStateChange', 1);
        await listen(player, 20);
        act(() => api.next());
        player.currentTime = 0;
        player.emit('onStateChange', 1);
        await listen(player, 20);
        expect(api.current?.code).toBe('b0000002');
        expect(credited).not.toHaveBeenCalled();
    });

    it('暫停期間不累計', async () => {
        const credited = vi.fn();
        const player = await mountCredit(credited);
        act(() => api.load([item('a0000001', V1, 0, 100)]));
        player.currentTime = 0;
        player.emit('onStateChange', 1);
        await listen(player, 20);
        player.emit('onStateChange', 2);
        await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
        player.emit('onStateChange', 1);
        await listen(player, 5);
        expect(credited).not.toHaveBeenCalled();
    });
});

// ---------- 音量與靜音（記在 localStorage['song-player-volume']）----------
describe('useSegmentPlayer 音量', () => {
    const stored = () => JSON.parse(localStorage.getItem(VOLUME_STORAGE_KEY) ?? 'null');

    beforeEach(() => {
        localStorage.clear();
    });
    afterEach(() => {
        localStorage.clear();
    });

    it('調音量會套用到播放器、夾在 0..100 並記住', async () => {
        const { player } = await mountReady();
        act(() => api.setVolume(40));
        expect(player.setVolume).toHaveBeenLastCalledWith(40);
        expect(api.volume).toBe(40);
        expect(stored().volume).toBe(40);

        act(() => api.setVolume(140));
        expect(player.setVolume).toHaveBeenLastCalledWith(100);
        expect(api.volume).toBe(100);

        act(() => api.setVolume(-10));
        expect(player.setVolume).toHaveBeenLastCalledWith(0);
    });

    it('toggleMute 兩次：mute 一次、unMute 一次，狀態記住', async () => {
        const { player } = await mountReady();
        act(() => api.toggleMute());
        expect(player.mute).toHaveBeenCalledTimes(1);
        expect(api.muted).toBe(true);
        expect(stored().muted).toBe(true);
        act(() => api.toggleMute());
        expect(player.unMute).toHaveBeenCalledTimes(1);
        expect(api.muted).toBe(false);
        expect(stored().muted).toBe(false);
    });

    it('靜音中把音量調大會自動解除靜音，調到 0 則不解除', async () => {
        const { player } = await mountReady();
        act(() => api.toggleMute());
        act(() => api.setVolume(0));
        expect(player.unMute).not.toHaveBeenCalled();
        expect(api.muted).toBe(true);
        act(() => api.setVolume(30));
        expect(player.unMute).toHaveBeenCalledTimes(1);
        expect(api.muted).toBe(false);
        expect(player.setVolume).toHaveBeenLastCalledWith(30);
    });

    it('播放器就緒時套用上次的音量與靜音', async () => {
        localStorage.setItem(VOLUME_STORAGE_KEY, JSON.stringify({ volume: 25, muted: true }));
        const { player } = await mountReady();
        expect(player.setVolume).toHaveBeenCalledWith(25);
        expect(player.mute).toHaveBeenCalled();
        expect(api.volume).toBe(25);
        expect(api.muted).toBe(true);
    });

    it('沒有儲存值時預設音量 100、不靜音，就緒時不呼叫 mute', async () => {
        const { player } = await mountReady();
        expect(api.volume).toBe(100);
        expect(api.muted).toBe(false);
        expect(player.mute).not.toHaveBeenCalled();
    });
});
