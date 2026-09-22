// StreamIframe 非同步建立播放器的競態（2026-09 切版面靜音、音量鍵失效）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

let resolveApi: () => void = () => {};
vi.mock('../../src/utils/apiLoader', () => ({
    apiLoader: {
        loadTwitchPlayerApi: vi.fn(() => new Promise<void>(r => { resolveApi = r; })),
        loadYouTubePlayerApi: vi.fn(),
    },
}));

import { StreamIframe } from '../../src/components/Canvas/WindowParts/StreamIframe';
import { usePlayerStore } from '../../src/store/playerStore';

interface FakePlayer {
    ready: () => void;
    setMuted: ReturnType<typeof vi.fn>;
    setVolume: ReturnType<typeof vi.fn>;
}
let created: FakePlayer[] = [];

class FakeTwitchPlayer {
    static READY = 'ready';
    private listeners: Record<string, () => void> = {};
    setMuted = vi.fn();
    setVolume = vi.fn();
    pause = vi.fn();
    removeEventListener = vi.fn();
    constructor() {
        created.push(this as unknown as FakePlayer);
        (this as unknown as FakePlayer).ready = () => this.listeners[FakeTwitchPlayer.READY]?.();
    }
    addEventListener(ev: string, cb: () => void) { this.listeners[ev] = cb; }
}

const stream = { id: 42, platform: 'twitch', channelId: 'somechannel', videoId: '' } as any;
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
    created = [];
    usePlayerStore.setState({ players: {} });
    delete (window as any).Twitch;
});

afterEach(() => {
    delete (window as any).Twitch;
});

/** 讓 API 在「元件已掛載、正在等待」時才載入完成 */
async function finishApiLoad() {
    (window as any).Twitch = { Player: FakeTwitchPlayer };
    resolveApi();
    await flush();
}

describe('StreamIframe 播放器生命週期', () => {
    it('API 載入完成前就卸載 → 不建立、不註冊孤兒 player', async () => {
        const { unmount } = render(<StreamIframe streamData={stream} volume={50} isMuted={false} />);
        unmount();
        await finishApiLoad();
        expect(created).toHaveLength(0);
        expect(usePlayerStore.getState().getPlayer(42)).toBeUndefined();
    });

    it('舊實例晚到的建立不會覆蓋新實例的註冊', async () => {
        // 第一個實例：等待 API 中被卸載
        const first = render(<StreamIframe streamData={stream} volume={50} isMuted={false} />);
        const resolveFirst = resolveApi;
        first.unmount();
        // 第二個實例（同一串流，例如切版面後重新掛載）：API 已可用，立即建立並註冊
        (window as any).Twitch = { Player: FakeTwitchPlayer };
        render(<StreamIframe streamData={stream} volume={50} isMuted={false} />);
        await flush();
        const secondPlayer = usePlayerStore.getState().getPlayer(42)?.player;
        expect(secondPlayer).toBeDefined();
        // 第一個實例的 await 這時才結束
        resolveFirst();
        await flush();
        expect(usePlayerStore.getState().getPlayer(42)?.player).toBe(secondPlayer);
        expect(created).toHaveLength(1);
    });

    it('卸載時不會刪掉同一串流「別人」的註冊', async () => {
        (window as any).Twitch = { Player: FakeTwitchPlayer };
        const a = render(<StreamIframe streamData={stream} volume={50} isMuted={false} />);
        await flush();
        const other = { type: 'twitch', player: {} };
        usePlayerStore.getState().registerPlayer(42, other);
        a.unmount();
        expect(usePlayerStore.getState().getPlayer(42)).toBe(other);
    });

    it('等待 API 時被卸載，不會刪掉或停掉同一串流已存在的另一個 player', async () => {
        const other = { type: 'twitch', player: { pause: vi.fn() } };
        usePlayerStore.getState().registerPlayer(42, other);
        const { unmount } = render(<StreamIframe streamData={stream} volume={50} isMuted={false} />);
        unmount();
        await finishApiLoad();
        expect(usePlayerStore.getState().getPlayer(42)).toBe(other);
        expect(other.player.pause).not.toHaveBeenCalled();
    });

    it('就緒前使用者取消靜音 → READY 套用最新狀態，不會蓋回靜音', async () => {
        (window as any).Twitch = { Player: FakeTwitchPlayer };
        const { rerender } = render(<StreamIframe streamData={stream} volume={50} isMuted={true} />);
        await flush();
        rerender(<StreamIframe streamData={stream} volume={70} isMuted={false} />);
        created[0].setMuted.mockClear();
        act(() => created[0].ready());
        expect(created[0].setMuted).toHaveBeenLastCalledWith(false);
        expect(created[0].setVolume).toHaveBeenLastCalledWith(0.7);
    });
});
