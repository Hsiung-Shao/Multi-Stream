import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MobileWatchPage } from '../../src/components/Mobile/MobileWatchPage';
import type { StreamData } from '../../src/utils/streamUtils';

// jsdom 沒有 ResizeObserver，Radix 的 Slider（主音量）在掛載時會用到
globalThis.ResizeObserver ??= class {
    observe() { }
    unobserve() { }
    disconnect() { }
} as unknown as typeof ResizeObserver;

// 攔截播放器，記錄外層實際傳進來的音量參數。
// 這正是這次修復的重點：修復前手機版用的是寫死的 <iframe>，主音量滑桿
// 根本沒有接到任何播放器，拖了不會有任何反應。
const iframeProps: Array<{ id: number; volume: number; isMuted: boolean }> = [];

vi.mock('../../src/components/Canvas/WindowParts/StreamIframe', () => ({
    StreamIframe: ({ streamData, volume, isMuted }: any) => {
        iframeProps.push({ id: streamData.id, volume, isMuted });
        return <div data-testid={`player-${streamData.id}`} data-volume={volume} data-muted={String(isMuted)} />;
    },
}));

const streams: StreamData[] = [
    {
        id: 1, platform: 'twitch', channelId: 'chan_a', videoId: '',
        originalUrl: '', volume: 100, chatVisible: false, isMuted: false, displayName: 'A',
    },
    {
        // channelId 不可留空：MobileWatchPage 以 channelId 篩選出「有效串流」
        id: 2, platform: 'youtube', channelId: 'chan_b', videoId: 'vid_b',
        originalUrl: '', volume: 50, chatVisible: false, isMuted: false, displayName: 'B',
    },
];

let uiState = { masterVolume: 100, masterMuted: false };

vi.mock('../../src/store/useStreamStore', () => ({
    useStreamStore: (selector: any) => selector({ streams, removeStream: vi.fn() }),
}));

vi.mock('../../src/store/useUIStore', () => ({
    useUIStore: (selector: any) => selector({
        ...uiState,
        setMasterMuted: vi.fn(),
        setMasterVolume: vi.fn(),
    }),
}));

describe('MobileWatchPage 音量傳遞', () => {
    beforeEach(() => {
        iframeProps.length = 0;
        uiState = { masterVolume: 100, masterMuted: false };
    });

    it('每個串流都交由 StreamIframe 播放（不再是寫死的裸 iframe）', () => {
        render(<MobileWatchPage />);

        expect(screen.getByTestId('player-1')).toBeInTheDocument();
        expect(screen.getByTestId('player-2')).toBeInTheDocument();
        // Twitch 與 YouTube 都走同一條路徑，外層不再自行分流
        expect(iframeProps).toHaveLength(2);
    });

    it('主音量 100 時，個別音量原樣傳入', () => {
        render(<MobileWatchPage />);

        expect(iframeProps.find(p => p.id === 1)).toMatchObject({ volume: 100, isMuted: false });
        expect(iframeProps.find(p => p.id === 2)).toMatchObject({ volume: 50, isMuted: false });
    });

    it('主音量會與個別音量相乘', () => {
        uiState = { masterVolume: 50, masterMuted: false };
        render(<MobileWatchPage />);

        // 100 × 50% = 50；50 × 50% = 25
        expect(iframeProps.find(p => p.id === 1)!.volume).toBe(50);
        expect(iframeProps.find(p => p.id === 2)!.volume).toBe(25);
    });

    it('主靜音時音量歸零且標記為靜音', () => {
        uiState = { masterVolume: 80, masterMuted: true };
        render(<MobileWatchPage />);

        for (const p of iframeProps) {
            expect(p.volume).toBe(0);
            expect(p.isMuted).toBe(true);
        }
    });

    it('主音量為 0 時視為靜音', () => {
        uiState = { masterVolume: 0, masterMuted: false };
        render(<MobileWatchPage />);

        for (const p of iframeProps) {
            expect(p.volume).toBe(0);
            expect(p.isMuted).toBe(true);
        }
    });

    it('橫向版面同樣把音量傳給播放器', () => {
        uiState = { masterVolume: 40, masterMuted: false };
        render(<MobileWatchPage isLandscape />);

        expect(iframeProps).toHaveLength(2);
        expect(iframeProps.find(p => p.id === 1)!.volume).toBe(40);
    });
});
