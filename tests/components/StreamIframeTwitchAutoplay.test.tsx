// Twitch 播放器一律先靜音建立（瀏覽器才允許自動播放），READY 後再套使用者的聲音設定（房間模式第 6 點）
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { StreamIframe } from '../../src/components/Canvas/WindowParts/StreamIframe';
import type { StreamData } from '../../src/utils/streamUtils';

describe('StreamIframe 的 Twitch 自動播放', () => {
    afterEach(() => {
        delete (window as { Twitch?: unknown }).Twitch;
    });

    it('非靜音的直播也先靜音建立，READY 後才開聲音並套音量', async () => {
        const listeners: Record<string, () => void> = {};
        const player = { addEventListener: vi.fn((ev: string, fn: () => void) => { listeners[ev] = fn; }), setMuted: vi.fn(), setVolume: vi.fn() };
        const ctor = vi.fn(function TwitchPlayer() { return player; });
        (window as { Twitch?: unknown }).Twitch = { Player: Object.assign(ctor, { READY: 'ready', PLAYING: 'playing', ENDED: 'ended' }) };

        const stream = { id: 7, platform: 'twitch', channelId: 'somechannel' } as unknown as StreamData;
        render(<StreamIframe streamData={stream} volume={60} isMuted={false} />);

        await waitFor(() => expect(ctor).toHaveBeenCalled());
        const options = (ctor.mock.calls[0] as unknown as [unknown, { muted: boolean; autoplay: boolean }])[1];
        expect(options.autoplay).toBe(true);
        expect(options.muted).toBe(true);

        listeners.ready();
        expect(player.setMuted).toHaveBeenLastCalledWith(false);
        expect(player.setVolume).toHaveBeenCalledWith(0.6);
    });
});
