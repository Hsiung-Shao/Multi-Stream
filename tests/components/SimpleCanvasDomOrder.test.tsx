// 切換版面不得搬動既有視窗的 DOM 節點（2026-09 切版面全部靜音）：
// 瀏覽器搬動含 iframe 的節點會讓 iframe 重載，Twitch 播放器回到網址上的 muted=true，
// 且 StreamIframe 的 player 物件從此失聯，UI 按鈕救不回來。jsdom 不會重載 iframe，
// 所以這裡直接量「React 有沒有 insertBefore 既有節點」——那正是觸發重載的 DOM 動作。
import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { SimpleCanvas, stableRenderOrder } from '../../src/components/Canvas/SimpleCanvas';
import type { CanvasWindow } from '../../src/components/Canvas/DraggableWindow';

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
});
