import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../src/i18n/i18n';
import { useStreamStore } from '../../src/store/useStreamStore';
import { useUIStore } from '../../src/store/useUIStore';
import { CanvasStreamContent } from '../../src/components/Pages/CanvasStreamContent';
import type { WindowRenderProps } from '../../src/components/Canvas';
import type { StreamData } from '../../src/utils/streamUtils';

vi.mock('../../src/components/StreamChat', () => ({
    StreamChat: () => <div data-testid="stream-chat">Stream Chat Content</div>,
}));

vi.mock('../../src/components/Canvas/WindowParts/StreamIframe', () => ({
    StreamIframe: () => <div data-testid="stream-iframe">Stream Iframe Content</div>,
}));

const stream: StreamData = {
    id: 1,
    platform: 'twitch',
    channelId: 'test_channel',
    videoId: '',
    originalUrl: 'https://twitch.tv/test_channel',
    volume: 100,
    chatVisible: true,
    isMuted: false,
    displayName: 'Test Channel',
};

const renderProps: WindowRenderProps = {
    dragHandlers: {
        onPointerDown: vi.fn(),
        onPointerMove: vi.fn(),
        onPointerUp: vi.fn(),
        onPointerCancel: vi.fn(),
        onLostPointerCapture: vi.fn(),
    },
    isDragging: false,
    isResizing: false,
    gridW: 4,
    gridH: 6,
    onRemove: vi.fn(),
};

describe('CanvasStreamContent', () => {
    it('does not overlay the toolbar on top of chat iframe content', () => {
        render(<CanvasStreamContent stream={stream} windowType="chat" renderProps={renderProps} />);

        const toolbar = screen.getByText('Test Channel').closest('[data-window-toolbar]');

        expect(screen.getByTestId('stream-chat')).toBeInTheDocument();
        expect(toolbar).toHaveAttribute('data-window-toolbar', 'chat');
        expect(toolbar).not.toHaveClass('absolute');
        expect(toolbar).toHaveClass('relative');
    });

    it('keeps stream controls floating over video windows', () => {
        render(<CanvasStreamContent stream={stream} windowType="stream" renderProps={renderProps} />);

        const toolbar = screen.getByText('Test Channel').closest('[data-window-toolbar]');

        expect(screen.getByTestId('stream-iframe')).toBeInTheDocument();
        expect(toolbar).toHaveAttribute('data-window-toolbar', 'stream');
        expect(toolbar).toHaveClass('absolute');
    });
});

// 版面重設計（2026-09）：放大／設為主畫面按鈕、共用聊天室分頁。
// 讀真的 store（不 mock），因為按鈕是否出現取決於畫布上的 item。
describe('CanvasStreamContent 工具列：放大、設為主畫面、共用聊天室分頁', () => {
    const L = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
    const mk = (id: number, name: string): StreamData => ({ ...stream, id, channelId: name, displayName: name });

    beforeEach(async () => {
        await i18n.changeLanguage('zh-TW');
        useUIStore.setState({ theaterWindowId: null });
        useStreamStore.setState({
            streams: [mk(1, 'Alpha'), mk(2, 'Bravo'), mk(3, 'Charlie')],
            canvasItems: [
                { i: 'w1', type: 'stream', contentId: 1, layout: L(0, 0, 10, 10) },
                { i: 'w2', type: 'stream', contentId: 2, layout: L(10, 0, 10, 10) },
                { i: 'w3', type: 'stream', contentId: 3, layout: L(0, 10, 10, 10) },
                { i: 'chat', type: 'chat', contentId: 1, layout: L(20, 0, 4, 24) },
            ],
        });
    });

    it('放大鈕切換劇院模式（與快捷鍵 T 同一個 theaterWindowId）', () => {
        render(<CanvasStreamContent stream={mk(2, 'Bravo')} windowType="stream" renderProps={renderProps} windowId="w2" />);
        fireEvent.click(screen.getByTitle('放大（T）'));
        expect(useUIStore.getState().theaterWindowId).toBe('w2');
        fireEvent.click(screen.getByTitle('還原（T／Esc）'));
        expect(useUIStore.getState().theaterWindowId).toBeNull();
    });

    it('主畫面本身不顯示「設為主畫面」；其他視窗按下後與主畫面互換位置', () => {
        const { unmount } = render(<CanvasStreamContent stream={mk(1, 'Alpha')} windowType="stream" renderProps={renderProps} windowId="w1" />);
        expect(screen.queryByTitle('設為主畫面')).toBeNull();
        unmount();

        render(<CanvasStreamContent stream={mk(3, 'Charlie')} windowType="stream" renderProps={renderProps} windowId="w3" />);
        fireEvent.click(screen.getByTitle('設為主畫面'));
        const items = useStreamStore.getState().canvasItems;
        expect(items.find(i => i.i === 'w3')!.layout).toEqual(L(0, 0, 10, 10));
        expect(items.find(i => i.i === 'w1')!.layout).toEqual(L(0, 10, 10, 10));
    });

    // Radix Select 在 jsdom 需要的 API
    const polyfillSelect = () => {
        Element.prototype.hasPointerCapture ??= () => false;
        Element.prototype.releasePointerCapture ??= () => {};
        Element.prototype.scrollIntoView ??= () => {};
    };
    const openSelect = () => {
        const trigger = screen.getByRole('combobox');
        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
        return trigger;
    };

    it('聊天室標頭是下拉選單：列出畫布上的串流，選另一路只改聊天室的 contentId（i 不變）', () => {
        polyfillSelect();
        render(<CanvasStreamContent stream={mk(1, 'Alpha')} windowType="chat" renderProps={renderProps} windowId="chat" />);
        const trigger = openSelect();
        expect(trigger).toHaveTextContent('Alpha');
        const options = screen.getAllByRole('option');
        expect(options.map(o => o.textContent)).toEqual(['Alpha', 'Bravo', 'Charlie']);

        fireEvent.click(options[2]);
        const chat = useStreamStore.getState().canvasItems.find(i => i.type === 'chat')!;
        expect(chat).toMatchObject({ i: 'chat', contentId: 3 });
    });

    it('每路各一聊天室的版面也能用選單切換', () => {
        polyfillSelect();
        useStreamStore.setState({
            canvasItems: [
                { i: 'w1', type: 'stream', contentId: 1, layout: L(0, 0, 8, 12) },
                { i: 'c1', type: 'chat', contentId: 1, layout: L(8, 0, 4, 12) },
                { i: 'w2', type: 'stream', contentId: 2, layout: L(12, 0, 8, 12) },
                { i: 'c2', type: 'chat', contentId: 2, layout: L(20, 0, 4, 12) },
            ],
        });
        render(<CanvasStreamContent stream={mk(1, 'Alpha')} windowType="chat" renderProps={renderProps} windowId="c1" />);
        openSelect();
        expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['Alpha', 'Bravo']);
        fireEvent.click(screen.getAllByRole('option')[1]);
        expect(useStreamStore.getState().canvasItems.find(i => i.i === 'c1')!.contentId).toBe(2);
    });

    it('聊天室顯示的那一路不在畫布上時，仍列在選單裡（不會變成空白）', () => {
        polyfillSelect();
        useStreamStore.setState({
            canvasItems: [
                { i: 'w2', type: 'stream', contentId: 2, layout: L(0, 0, 20, 24) },
                { i: 'chat', type: 'chat', contentId: 1, layout: L(20, 0, 4, 24) },
            ],
        });
        render(<CanvasStreamContent stream={mk(1, 'Alpha')} windowType="chat" renderProps={renderProps} windowId="chat" />);
        expect(openSelect()).toHaveTextContent('Alpha');
        expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['Alpha', 'Bravo']);
    });
});

// 聊天室欄寬與收合（階段 3 後半）
describe('CanvasStreamContent 工具列：聊天室寬度與收合', () => {
    const L = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
    const mk = (id: number, name: string): StreamData => ({ ...stream, id, channelId: name, displayName: name });

    beforeEach(async () => {
        await i18n.changeLanguage('zh-TW');
        useStreamStore.setState({
            streams: [mk(1, 'Alpha'), mk(2, 'Bravo')],
            chatColumnWidth: 4,
            canvasItems: [
                { i: 'w1', type: 'stream', contentId: 1, layout: L(0, 0, 20, 12) },
                { i: 'w2', type: 'stream', contentId: 2, layout: L(0, 12, 20, 12) },
                { i: 'chat', type: 'chat', contentId: 1, layout: L(20, 0, 4, 24), sharedChat: true },
            ],
        });
    });

    // Radix DropdownMenu 靠 pointerdown／Enter 開啟，fireEvent.click 打不開
    const openMenu = () => fireEvent.keyDown(screen.getByTitle('聊天室寬度與收合'), { key: 'Enter' });

    it('寬度選單：目前段位打勾，選「寬」改成 6 欄並重排', () => {
        render(<CanvasStreamContent stream={mk(1, 'Alpha')} windowType="chat" renderProps={renderProps} windowId="chat" />);
        openMenu();
        expect(screen.getByRole('menuitemradio', { name: '標準' })).toHaveAttribute('aria-checked', 'true');
        fireEvent.click(screen.getByRole('menuitemradio', { name: '寬' }));
        expect(useStreamStore.getState().chatColumnWidth).toBe(6);
        expect(useStreamStore.getState().canvasItems.find(i => i.i === 'chat')!.layout).toEqual(L(18, 0, 6, 24));
    });

    it('選單的「收合」：聊天室寬 0、串流填滿全寬', () => {
        render(<CanvasStreamContent stream={mk(1, 'Alpha')} windowType="chat" renderProps={renderProps} windowId="chat" />);
        openMenu();
        fireEvent.click(screen.getByRole('menuitem', { name: '收合聊天室（畫面讓給直播）' }));
        const items = useStreamStore.getState().canvasItems;
        expect(items.find(i => i.i === 'chat')!.layout.w).toBe(0);
        expect(items.filter(i => i.type === 'stream').every(i => i.layout.w === 24)).toBe(true);
    });

    it('串流視窗沒有這個選單', () => {
        render(<CanvasStreamContent stream={mk(1, 'Alpha')} windowType="stream" renderProps={renderProps} windowId="w1" />);
        expect(screen.queryByTitle('聊天室寬度與收合')).toBeNull();
    });

    it('收合後的右緣標籤：點一下展開並恢復偏好寬度', async () => {
        const { ChatCollapsedTab } = await import('../../src/components/Canvas/ChatCollapsedTab');
        useStreamStore.getState().setChatColumnWidth(6);
        useStreamStore.getState().collapseChats();
        render(<ChatCollapsedTab />);
        fireEvent.click(screen.getByRole('button', { name: '展開聊天室' }));
        expect(useStreamStore.getState().canvasItems.find(i => i.i === 'chat')!.layout).toEqual(L(18, 0, 6, 24));
    });
});
