// 空視窗（2026-09 版面重設計）：原本串流與聊天室都只能從「正在直播的收藏」挑，
// 沒有收藏或收藏都沒開台時完全無法使用。改為串流視窗可直接搜尋／貼網址、聊天室從畫布上的串流挑。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import i18n from '../../src/i18n/i18n';
import { EmptyWindowContent } from '../../src/components/Canvas/EmptyWindowContent';
import { useStreamStore } from '../../src/store/useStreamStore';
import type { WindowRenderProps } from '../../src/components/Canvas';

vi.mock('../../src/hooks/useFavorites', () => ({
    useFavorites: () => ({ favorites: [], liveFavorites: [] }),
}));

const renderProps: WindowRenderProps = {
    dragHandlers: {
        onPointerDown: vi.fn(), onPointerMove: vi.fn(), onPointerUp: vi.fn(),
        onPointerCancel: vi.fn(), onLostPointerCapture: vi.fn(),
    },
    isDragging: false,
    isResizing: false,
    gridW: 10,
    gridH: 10,
    onRemove: vi.fn(),
};

const mk = (id: number, name: string) => ({
    id, platform: 'twitch' as const, channelId: name, videoId: '', originalUrl: '', volume: 100,
    chatVisible: false, isMuted: false, displayName: name,
});
const L = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

describe('EmptyWindowContent', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('zh-TW');
        Element.prototype.hasPointerCapture ??= () => false;
        Element.prototype.releasePointerCapture ??= () => {};
        Element.prototype.scrollIntoView ??= () => {};
        useStreamStore.setState({
            streams: [mk(1, 'Alpha'), mk(2, 'Bravo')],
            canvasItems: [
                { i: 'w2', type: 'stream', contentId: 2, layout: L(10, 0, 10, 12) },
                { i: 'w1', type: 'stream', contentId: 1, layout: L(0, 0, 10, 12) },
                { i: 'empty', type: 'chat', contentId: null, layout: L(20, 0, 4, 24) },
            ],
        });
    });

    it('聊天室視窗：選單列出畫布上的串流（依位置），選了就填進這個視窗', () => {
        const onUpdate = vi.fn();
        render(<EmptyWindowContent windowId="empty" type="chat" onUpdateWindow={onUpdate} renderProps={renderProps} />);
        const trigger = screen.getByRole('combobox', { name: '顯示畫布上哪一路的聊天室' });
        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
        const options = screen.getAllByRole('option');
        expect(options.map(o => o.textContent)).toEqual(['Alpha', 'Bravo']);
        fireEvent.click(options[1]);
        expect(onUpdate).toHaveBeenCalledWith('empty', { contentId: 2 });
    });

    it('串流視窗：可以直接貼網址，填進這一格（帶 targetWindowId、不另外配聊天室）', async () => {
        const addStream = vi.fn(async () => ({ success: true, streamId: 3 }));
        useStreamStore.setState({ addStream } as never);
        render(<EmptyWindowContent windowId="empty-s" type="stream" onUpdateWindow={vi.fn()} renderProps={renderProps} />);
        const input = screen.getByPlaceholderText('搜尋...');
        fireEvent.change(input, { target: { value: 'https://www.twitch.tv/newone' } });
        await act(async () => { fireEvent.submit(input.closest('form')!); });
        expect(addStream).toHaveBeenCalledWith('https://www.twitch.tv/newone', expect.objectContaining({
            targetWindowId: 'empty-s', withChat: false,
        }));
    });
});
