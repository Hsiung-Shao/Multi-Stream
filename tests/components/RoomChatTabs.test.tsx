// RoomChatTabs：房間模式聊天室上方的頻道標籤，點選切換聊天室顯示哪一路
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../src/i18n/i18n';
import { useStreamStore } from '../../src/store/useStreamStore';
import { RoomChatTabs } from '../../src/components/Navigation/RoomChatTabs';
import type { StreamData } from '../../src/utils/streamUtils';

const L = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const mk = (id: number, name: string): StreamData => ({
    id, platform: 'twitch', channelId: name, videoId: '', originalUrl: '', volume: 50, chatVisible: true, isMuted: false, displayName: name,
});

describe('RoomChatTabs', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('zh-TW');
        useStreamStore.setState({
            streams: [mk(1, 'Alpha'), mk(2, 'Bravo'), mk(3, 'Charlie')],
            canvasItems: [
                { i: 'w1', type: 'stream', contentId: 1, layout: L(0, 0, 8, 12) },
                { i: 'w2', type: 'stream', contentId: 2, layout: L(8, 0, 8, 12) },
                { i: 'w3', type: 'stream', contentId: 3, layout: L(0, 12, 8, 12) },
                { i: 'chat', type: 'chat', contentId: 1, layout: L(16, 0, 8, 24), sharedChat: true },
            ],
        });
    });

    it('點頻道標籤切聊天室：store 的 contentId 改為該路，重新渲染後該標籤 aria-pressed=true', () => {
        const { rerender } = render(<RoomChatTabs chatItemId="chat" activeStreamId={1} />);
        expect(screen.getByRole('button', { name: /Alpha/ })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: /Bravo/ })).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(screen.getByRole('button', { name: /Bravo/ }));
        expect(useStreamStore.getState().canvasItems.find(it => it.i === 'chat')!.contentId).toBe(2);

        rerender(<RoomChatTabs chatItemId="chat" activeStreamId={2} />);
        expect(screen.getByRole('button', { name: /Bravo/ })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: /Alpha/ })).toHaveAttribute('aria-pressed', 'false');
    });
});
