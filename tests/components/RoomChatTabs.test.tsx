// RoomChatTabs：房間模式聊天欄的分頁——「合併」收所有 Twitch，YouTube 各一個分頁
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../src/i18n/i18n';
import { useStreamStore } from '../../src/store/useStreamStore';
import { useUIStore } from '../../src/store/useUIStore';
import { RoomChatTabs } from '../../src/components/Navigation/RoomChatTabs';
import type { StreamData } from '../../src/utils/streamUtils';

const L = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const mk = (id: number, name: string, platform: 'twitch' | 'youtube' = 'twitch'): StreamData => ({
    id, platform, channelId: name, videoId: platform === 'youtube' ? `v${id}` : '', originalUrl: '', volume: 50, chatVisible: true, isMuted: false, displayName: name,
});

describe('RoomChatTabs', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('zh-TW');
        useUIStore.setState({ roomChatMerged: true });
        useStreamStore.setState({
            streams: [mk(1, 'Alpha'), mk(2, 'Bravo', 'youtube'), mk(3, 'Charlie')],
            canvasItems: [
                { i: 'w1', type: 'stream', contentId: 1, layout: L(0, 0, 8, 12) },
                { i: 'w2', type: 'stream', contentId: 2, layout: L(8, 0, 8, 12) },
                { i: 'w3', type: 'stream', contentId: 3, layout: L(0, 12, 8, 12) },
                { i: 'chat', type: 'chat', contentId: 1, layout: L(16, 0, 8, 24), sharedChat: true },
            ],
        });
    });

    it('有 Twitch 時只列一個合併分頁與各 YouTube 分頁，Twitch 不單獨列', () => {
        render(<RoomChatTabs chatItemId="chat" activeStreamId={1} />);
        const names = screen.getAllByRole('button').map(b => b.textContent);
        expect(names).toEqual(['合併', 'Bravo']);
        expect(screen.getByRole('button', { name: /合併/ })).toHaveAttribute('aria-pressed', 'true');
    });

    it('點 YouTube 分頁：離開合併並把聊天室換到那一路', () => {
        const { rerender } = render(<RoomChatTabs chatItemId="chat" activeStreamId={1} />);
        fireEvent.click(screen.getByRole('button', { name: /Bravo/ }));
        expect(useUIStore.getState().roomChatMerged).toBe(false);
        expect(useStreamStore.getState().canvasItems.find(it => it.i === 'chat')!.contentId).toBe(2);
        rerender(<RoomChatTabs chatItemId="chat" activeStreamId={2} />);
        expect(screen.getByRole('button', { name: /Bravo/ })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', { name: /合併/ }));
        expect(useUIStore.getState().roomChatMerged).toBe(true);
    });
});
