// 切換版面不得搬動既有視窗的 DOM 節點（2026-09 切版面全部靜音）：
// 瀏覽器搬動含 iframe 的節點會讓 iframe 重載，Twitch 播放器回到網址上的 muted=true，
// 且 StreamIframe 的 player 物件從此失聯，UI 按鈕救不回來。jsdom 不會重載 iframe，
// 所以這裡直接量「React 有沒有 insertBefore 既有節點」——那正是觸發重載的 DOM 動作。
import { describe, it, expect, vi } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import { SimpleCanvas, stableRenderOrder } from '../../src/components/Canvas/SimpleCanvas';
import type { CanvasWindow, WindowRenderProps } from '../../src/components/Canvas/DraggableWindow';

const win = (id: string, gridX: number, gridY: number): CanvasWindow => ({
    id, gridX, gridY, gridW: 8, gridH: 8, type: 'stream', contentId: 1,
});

const noop = () => {};
const renderContent = (w: CanvasWindow) => <div data-win={w.id}>{w.id}</div>;

function mount(windows: CanvasWindow[]) {
    return render(
        <SimpleCanvas windows={windows} onWindowUpdate={noop} onWindowRemove={noop} renderContent={renderContent} />,
    );
}

/** 找出「既有節點被搬動」的紀錄：同一個節點出現在某筆 mutation 的 addedNodes 裡 */
function watchMoves(container: HTMLElement, existing: Set<Node>) {
    const moved: string[] = [];
    const observer = new MutationObserver(records => {
        for (const r of records) {
            r.addedNodes.forEach(n => {
                if (existing.has(n)) moved.push((n as HTMLElement).querySelector('[data-win]')?.getAttribute('data-win') ?? '?');
            });
        }
    });
    observer.observe(container, { childList: true, subtree: true });
    return { moved, stop: () => { observer.takeRecords(); observer.disconnect(); } };
}

describe('SimpleCanvas 視窗 DOM 順序', () => {
    it('stableRenderOrder 與輸入順序無關', () => {
        const a = win('a', 0, 0), b = win('b', 8, 0), c = win('c', 16, 0);
        expect(stableRenderOrder([c, a, b]).map(w => w.id)).toEqual(['a', 'b', 'c']);
        expect(stableRenderOrder([b, c, a]).map(w => w.id)).toEqual(['a', 'b', 'c']);
    });

    it('視窗陣列順序改變（切版面）時，既有視窗節點不被搬動', () => {
        const initial = [win('stream-a', 0, 0), win('chat-a', 8, 0), win('stream-b', 16, 0)];
        const { container, rerender } = mount(initial);
        const before = [...container.querySelectorAll('[data-win]')].map(el => el.getAttribute('data-win'));

        // 所有祖先節點都算「既有」，任何一層被 insertBefore 都會被抓到
        const existing = new Set<Node>();
        container.querySelectorAll('*').forEach(n => existing.add(n));
        const watcher = watchMoves(container, existing);

        // 模擬切版面：同一批視窗，位置與陣列順序都改變
        const reordered = [win('stream-b', 0, 0), win('stream-a', 8, 0), win('chat-a', 16, 0)];
        act(() => {
            rerender(<SimpleCanvas windows={reordered} onWindowUpdate={noop} onWindowRemove={noop} renderContent={renderContent} />);
        });
        watcher.stop();

        expect(watcher.moved).toEqual([]);
        const after = [...container.querySelectorAll('[data-win]')].map(el => el.getAttribute('data-win'));
        expect(after).toEqual(before);
    });

    it('新增視窗只插入新節點，不搬動既有節點', () => {
        const { container, rerender } = mount([win('b', 0, 0), win('d', 8, 0)]);
        const existing = new Set<Node>();
        container.querySelectorAll('*').forEach(n => existing.add(n));
        const watcher = watchMoves(container, existing);
        act(() => {
            rerender(<SimpleCanvas windows={[win('b', 0, 0), win('d', 8, 0), win('a', 16, 0)]} onWindowUpdate={noop} onWindowRemove={noop} renderContent={renderContent} />);
        });
        watcher.stop();
        expect(watcher.moved).toEqual([]);
        expect(container.querySelectorAll('[data-win]')).toHaveLength(3);
    });

    // 拖曳換位的落點提示（2026-09 版面重設計）：拖曳開始時其他視窗會 append 一層提示，
    // 必須是「新增節點」而不是把含 iframe 的內容節點搬來搬去。
    it('拖曳時其他視窗出現「可放在這裡交換」，放開後消失；全程不搬動既有節點', () => {
        // jsdom 沒有 pointer capture
        Element.prototype.setPointerCapture = vi.fn();
        Element.prototype.releasePointerCapture = vi.fn();
        const withHandle = (w: CanvasWindow, rp: WindowRenderProps) => (
            <div data-win={w.id}><span data-handle={w.id} {...rp.dragHandlers}>drag</span></div>
        );
        const windows = [win('a', 0, 0), win('b', 8, 0), win('c', 16, 0)];
        const { container } = render(
            <SimpleCanvas windows={windows} onWindowUpdate={noop} onWindowRemove={noop} renderContent={withHandle} />,
        );
        const existing = new Set<Node>();
        container.querySelectorAll('*').forEach(n => existing.add(n));
        const watcher = watchMoves(container, existing);

        const handle = container.querySelector('[data-handle="a"]')!;
        act(() => { fireEvent.pointerDown(handle, { clientX: 10, clientY: 10, pointerId: 1 }); });
        const hints = [...container.querySelectorAll('[data-swap-hint]')].map(h => h.closest('[data-canvas-window-id]')!.getAttribute('data-canvas-window-id'));
        expect(hints.sort()).toEqual(['b', 'c']);

        act(() => { fireEvent.pointerUp(handle, { clientX: 10, clientY: 10, pointerId: 1 }); });
        expect(container.querySelectorAll('[data-swap-hint]')).toHaveLength(0);

        watcher.stop();
        expect(watcher.moved).toEqual([]);
    });

    const withHandle = (w: CanvasWindow, rp: WindowRenderProps) => (
        <div data-win={w.id}><span data-handle={w.id} {...rp.dragHandlers}>drag</span></div>
    );
    const startDrag = (container: HTMLElement, id: string) => {
        Element.prototype.setPointerCapture = vi.fn();
        Element.prototype.releasePointerCapture = vi.fn();
        const handle = container.querySelector(`[data-handle="${id}"]`)!;
        act(() => { fireEvent.pointerDown(handle, { clientX: 10, clientY: 10, pointerId: 1 }); });
        return handle;
    };
    const hintedIds = (container: HTMLElement) =>
        [...container.querySelectorAll('[data-swap-hint]')].map(h => h.closest('[data-canvas-window-id]')!.getAttribute('data-canvas-window-id'));

    it('拖曳中遺失 pointer capture（pointerup 落進 iframe）也會收尾，提示層不殘留', () => {
        const { container } = render(
            <SimpleCanvas windows={[win('a', 0, 0), win('b', 8, 0)]} onWindowUpdate={noop} onWindowRemove={noop} renderContent={withHandle} />,
        );
        const handle = startDrag(container, 'a');
        expect(hintedIds(container)).toEqual(['b']);
        act(() => { fireEvent(handle, new Event('lostpointercapture', { bubbles: true })); });
        expect(hintedIds(container)).toEqual([]);
    });

    it('拖曳中的視窗被移除，其他視窗的提示層也會清掉', () => {
        const { container, rerender } = render(
            <SimpleCanvas windows={[win('a', 0, 0), win('b', 8, 0)]} onWindowUpdate={noop} onWindowRemove={noop} renderContent={withHandle} />,
        );
        startDrag(container, 'a');
        expect(hintedIds(container)).toEqual(['b']);
        act(() => {
            rerender(<SimpleCanvas windows={[win('b', 8, 0)]} onWindowUpdate={noop} onWindowRemove={noop} renderContent={withHandle} />);
        });
        expect(hintedIds(container)).toEqual([]);
    });

    it('只在同類型視窗上標示落點（拖串流時聊天室不邀請交換）', () => {
        const chat: CanvasWindow = { ...win('c', 16, 0), type: 'chat' };
        const { container } = render(
            <SimpleCanvas windows={[win('a', 0, 0), win('b', 8, 0), chat]} onWindowUpdate={noop} onWindowRemove={noop} renderContent={withHandle} />,
        );
        startDrag(container, 'a');
        expect(hintedIds(container)).toEqual(['b']);
    });
});
