// 聊天室收合的接線（階段 3 後半）：收合的聊天室（寬 0）不交給 SimpleCanvas，收合時顯示右緣展開標籤
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import i18n from '../../src/i18n/i18n';
import { useStreamStore } from '../../src/store/useStreamStore';
import { NewCanvasPage } from '../../src/components/Pages/NewCanvasPage';

// 與本測試無關、又會拉進大量相依的部分一律換成空殼
vi.mock('../../src/components/Navigation/DynamicIsland', () => ({ DynamicIsland: () => null }));
vi.mock('../../src/components/Navigation/DynamicIslandEdgeDock', () => ({ DynamicIslandEdgeDock: () => null }));
vi.mock('../../src/components/Canvas/CanvasTour', () => ({ CanvasTour: () => null }));
vi.mock('../../src/components/Canvas/CanvasEmptyState', () => ({ CanvasEmptyState: () => <div data-testid="canvas-empty" /> }));
vi.mock('../../src/components/SEO', () => ({ SEO: () => null }));
vi.mock('../../src/components/Pages/CanvasWindowBody', () => ({
    CanvasWindowBody: ({ windowId }: { windowId: string }) => <div data-body={windowId} />,
}));

const L = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const windowIds = () => [...document.querySelectorAll('[data-canvas-window-id]')].map(e => e.getAttribute('data-canvas-window-id')).sort();

describe('NewCanvasPage：聊天室收合', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('zh-TW');
        useStreamStore.setState({
            streams: [],
            chatColumnWidth: 4,
            canvasItems: [
                { i: 'w1', type: 'stream', contentId: 1, layout: L(0, 0, 20, 12) },
                { i: 'w2', type: 'stream', contentId: 2, layout: L(0, 12, 20, 12) },
                { i: 'chat', type: 'chat', contentId: 1, layout: L(20, 0, 4, 24), sharedChat: true },
            ],
        });
    });

    it('展開時聊天室在畫布上、沒有標籤；收合後聊天室不在畫布上、出現標籤；點標籤展開', () => {
        render(<NewCanvasPage />);
        expect(windowIds()).toEqual(['chat', 'w1', 'w2']);
        expect(screen.queryByRole('button', { name: '展開聊天室' })).toBeNull();

        act(() => useStreamStore.getState().collapseChats());
        expect(windowIds()).toEqual(['w1', 'w2']);

        fireEvent.click(screen.getByRole('button', { name: '展開聊天室' }));
        expect(windowIds()).toEqual(['chat', 'w1', 'w2']);
        expect(screen.queryByRole('button', { name: '展開聊天室' })).toBeNull();
    });

    it('畫布只剩收合的空聊天室：只顯示空畫布引導，不同時出現展開標籤', () => {
        useStreamStore.setState({
            canvasItems: [{ i: 'chat', type: 'chat', contentId: null, layout: L(24, 0, 0, 24), sharedChat: true }],
        });
        render(<NewCanvasPage />);
        expect(screen.getByTestId('canvas-empty')).toBeTruthy();
        expect(screen.queryByRole('button', { name: '展開聊天室' })).toBeNull();
    });

    it('有直播時收合：沒有空畫布引導、有展開標籤', () => {
        render(<NewCanvasPage />);
        act(() => useStreamStore.getState().collapseChats());
        expect(screen.queryByTestId('canvas-empty')).toBeNull();
        expect(screen.getByRole('button', { name: '展開聊天室' })).toBeTruthy();
    });
});
