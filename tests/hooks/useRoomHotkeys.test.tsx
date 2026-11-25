// 房間模式快捷鍵：Ctrl/Cmd+K 開指令列、G 切模式、1–9 設焦點；輸入中只有 Ctrl/Cmd+K 有效
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, fireEvent } from '@testing-library/react';
import { useRoomHotkeys } from '../../src/components/Navigation/useRoomHotkeys';

function setup(enabled = true) {
    const handlers = { onTogglePalette: vi.fn(), onToggleMode: vi.fn(), onFocusIndex: vi.fn() };
    const hook = renderHook(({ on }) => useRoomHotkeys(handlers, on), { initialProps: { on: enabled } });
    return { handlers, ...hook };
}

const added: HTMLElement[] = [];
function addEl(tag: string, setupFn?: (el: HTMLElement) => void) {
    const el = document.createElement(tag);
    setupFn?.(el);
    document.body.appendChild(el);
    added.push(el);
    return el;
}

describe('useRoomHotkeys', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => {
        added.splice(0).forEach(el => el.remove());
    });

    it('Ctrl+K 觸發指令列切換，且事件被 preventDefault', () => {
        const { handlers } = setup();
        const notPrevented = fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
        expect(handlers.onTogglePalette).toHaveBeenCalledTimes(1);
        expect(notPrevented).toBe(false);
    });

    it('Meta+K（Mac）同樣觸發指令列切換並 preventDefault', () => {
        const { handlers } = setup();
        const notPrevented = fireEvent.keyDown(window, { key: 'k', metaKey: true });
        expect(handlers.onTogglePalette).toHaveBeenCalledTimes(1);
        expect(notPrevented).toBe(false);
    });

    it('沒按 Ctrl/Meta 的單獨 k 不觸發指令列', () => {
        const { handlers } = setup();
        fireEvent.keyDown(window, { key: 'k' });
        expect(handlers.onTogglePalette).not.toHaveBeenCalled();
    });

    it('g 與 G（無修飾鍵）觸發模式切換', () => {
        const { handlers } = setup();
        fireEvent.keyDown(window, { key: 'g' });
        fireEvent.keyDown(window, { key: 'G' });
        expect(handlers.onToggleMode).toHaveBeenCalledTimes(2);
    });

    it('Ctrl+G、Alt+G、Meta+G 不觸發模式切換（不攔截瀏覽器快捷鍵）', () => {
        const { handlers } = setup();
        fireEvent.keyDown(window, { key: 'g', ctrlKey: true });
        fireEvent.keyDown(window, { key: 'g', altKey: true });
        fireEvent.keyDown(window, { key: 'g', metaKey: true });
        expect(handlers.onToggleMode).not.toHaveBeenCalled();
    });

    it('數字 1～9 以「數字−1」呼叫 onFocusIndex', () => {
        const { handlers } = setup();
        for (let n = 1; n <= 9; n++) fireEvent.keyDown(window, { key: String(n) });
        expect(handlers.onFocusIndex.mock.calls.map(c => c[0])).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('數字 0 與其他字母鍵不觸發任何回呼', () => {
        const { handlers } = setup();
        fireEvent.keyDown(window, { key: '0' });
        fireEvent.keyDown(window, { key: 'h' });
        fireEvent.keyDown(window, { key: 'Enter' });
        expect(handlers.onFocusIndex).not.toHaveBeenCalled();
        expect(handlers.onToggleMode).not.toHaveBeenCalled();
        expect(handlers.onTogglePalette).not.toHaveBeenCalled();
    });

    describe('在輸入欄位中', () => {
        it.each(['input', 'textarea', 'select'])('目標是 %s 時，g 與數字不觸發', (tag) => {
            const { handlers } = setup();
            const el = addEl(tag);
            fireEvent.keyDown(el, { key: 'g' });
            fireEvent.keyDown(el, { key: '3' });
            expect(handlers.onToggleMode).not.toHaveBeenCalled();
            expect(handlers.onFocusIndex).not.toHaveBeenCalled();
        });

        it('目標是 contentEditable 元素時，g 與數字不觸發', () => {
            const { handlers } = setup();
            const el = addEl('div', e => {
                e.setAttribute('contenteditable', 'true');
                // jsdom 沒實作 isContentEditable，補上讓兩種判斷寫法都成立
                Object.defineProperty(e, 'isContentEditable', { value: true });
            });
            fireEvent.keyDown(el, { key: 'g' });
            fireEvent.keyDown(el, { key: '2' });
            expect(handlers.onToggleMode).not.toHaveBeenCalled();
            expect(handlers.onFocusIndex).not.toHaveBeenCalled();
        });

        it('目標是 input 時，Ctrl+K 仍觸發指令列', () => {
            const { handlers } = setup();
            const el = addEl('input');
            fireEvent.keyDown(el, { key: 'k', ctrlKey: true });
            expect(handlers.onTogglePalette).toHaveBeenCalledTimes(1);
        });

        it('目標是一般 div 時，g 與數字照常觸發（不是誤擋所有元素）', () => {
            const { handlers } = setup();
            const el = addEl('div');
            fireEvent.keyDown(el, { key: 'g' });
            fireEvent.keyDown(el, { key: '1' });
            expect(handlers.onToggleMode).toHaveBeenCalledTimes(1);
            expect(handlers.onFocusIndex).toHaveBeenCalledWith(0);
        });
    });

    describe('啟用與卸載', () => {
        it('enabled=false 時所有快捷鍵都不觸發', () => {
            const { handlers } = setup(false);
            fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
            fireEvent.keyDown(window, { key: 'g' });
            fireEvent.keyDown(window, { key: '1' });
            expect(handlers.onTogglePalette).not.toHaveBeenCalled();
            expect(handlers.onToggleMode).not.toHaveBeenCalled();
            expect(handlers.onFocusIndex).not.toHaveBeenCalled();
        });

        it('enabled 由 true 改成 false 後不再觸發', () => {
            const { handlers, rerender } = setup(true);
            rerender({ on: false });
            fireEvent.keyDown(window, { key: 'g' });
            expect(handlers.onToggleMode).not.toHaveBeenCalled();
        });

        it('enabled 由 false 改成 true 後開始觸發', () => {
            const { handlers, rerender } = setup(false);
            rerender({ on: true });
            fireEvent.keyDown(window, { key: 'g' });
            expect(handlers.onToggleMode).toHaveBeenCalledTimes(1);
        });

        it('unmount 後不再觸發', () => {
            const { handlers, unmount } = setup();
            unmount();
            fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
            fireEvent.keyDown(window, { key: 'g' });
            fireEvent.keyDown(window, { key: '1' });
            expect(handlers.onTogglePalette).not.toHaveBeenCalled();
            expect(handlers.onToggleMode).not.toHaveBeenCalled();
            expect(handlers.onFocusIndex).not.toHaveBeenCalled();
        });

        it('不傳 enabled 時預設啟用', () => {
            const handlers = { onTogglePalette: vi.fn(), onToggleMode: vi.fn(), onFocusIndex: vi.fn() };
            renderHook(() => useRoomHotkeys(handlers));
            fireEvent.keyDown(window, { key: 'g' });
            expect(handlers.onToggleMode).toHaveBeenCalledTimes(1);
        });
    });
});
