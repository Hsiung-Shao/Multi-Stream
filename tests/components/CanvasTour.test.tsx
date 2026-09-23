// 畫布首次導覽（2026-09 版面重設計）：使用者回報「不知道怎麼調整」，拖曳／換位／縮放／放大原本都藏在 hover 或快捷鍵後面。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import i18n from '../../src/i18n/i18n';
import { CanvasTour, CANVAS_TOUR_DONE_KEY, resetCanvasTourSessionForTest } from '../../src/components/Canvas/CanvasTour';
import { useStreamStore } from '../../src/store/useStreamStore';
import { useUIStore } from '../../src/store/useUIStore';

const L = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

/** 導覽只靠 DOM 屬性找目標；這裡手工放出與畫布相同的屬性結構 */
function fakeWindow(id: string) {
    const el = document.createElement('div');
    el.setAttribute('data-canvas-window-id', id);
    el.innerHTML = `<div data-window-toolbar="stream"><button data-tour="theater"></button></div><div data-corner="se"></div>`;
    document.body.appendChild(el);
    return el;
}

function setStreams(n: number) {
    useStreamStore.setState({
        canvasItems: Array.from({ length: n }, (_, i) => ({
            i: `w${i + 1}`, type: 'stream' as const, contentId: i + 1, layout: L(i * 10, 0, 10, 10),
        })),
    });
    for (let i = 1; i <= n; i++) fakeWindow(`w${i}`);
}

describe('CanvasTour', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('zh-TW');
        vi.useFakeTimers();
        localStorage.clear();
        resetCanvasTourSessionForTest();
        useUIStore.setState({ isCanvasTourOpen: false, canvasTourAvailable: false });
        useStreamStore.setState({ canvasItems: [] });
        document.body.innerHTML = '';
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('第一次有串流時自動開啟；略過後寫入旗標並關閉', () => {
        setStreams(2);
        render(<CanvasTour />);
        expect(screen.queryByRole('dialog')).toBeNull();
        act(() => { vi.advanceTimersByTime(1600); });

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('拖曳工具列移動視窗')).toBeInTheDocument();
        expect(screen.getByText('1 / 4')).toBeInTheDocument();
        // 目標視窗掛上 data-tour-active，平常 hover 才出現的工具列與縮放角由 CSS 強制顯示
        expect(document.querySelector('[data-canvas-window-id="w1"]')!.hasAttribute('data-tour-active')).toBe(true);

        fireEvent.click(screen.getByText('略過'));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(localStorage.getItem(CANVAS_TOUR_DONE_KEY)).toBe('1');
        expect(document.querySelector('[data-tour-active]')).toBeNull();
    });

    it('已看過就不再自動開啟', () => {
        localStorage.setItem(CANVAS_TOUR_DONE_KEY, '1');
        setStreams(2);
        render(<CanvasTour />);
        act(() => { vi.advanceTimersByTime(5000); });
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('沒有串流時不開啟', () => {
        render(<CanvasTour />);
        act(() => { vi.advanceTimersByTime(5000); });
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('只有 1 路時跳過「交換」那一步；最後一步按「開始使用」結束', () => {
        setStreams(1);
        render(<CanvasTour />);
        act(() => { vi.advanceTimersByTime(1600); });
        expect(screen.getByText('1 / 3')).toBeInTheDocument();

        fireEvent.click(screen.getByText('下一步'));
        expect(screen.getByText('拖曳四個角調整大小')).toBeInTheDocument();
        // 四個角都框起來（不是只框右下角）
        expect([...document.querySelectorAll('[data-tour-corner]')].map(el => el.getAttribute('data-tour-corner')).sort())
            .toEqual(['ne', 'nw', 'se', 'sw']);
        fireEvent.click(screen.getByText('下一步'));
        expect(screen.getByText('放大某一路')).toBeInTheDocument();
        fireEvent.click(screen.getByText('開始使用'));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(localStorage.getItem(CANVAS_TOUR_DONE_KEY)).toBe('1');
    });

    it('Esc 略過；從快捷鍵說明重看（setCanvasTourOpen）時從第一步開始', () => {
        setStreams(2);
        render(<CanvasTour />);
        act(() => { vi.advanceTimersByTime(1600); });
        fireEvent.click(screen.getByText('下一步'));
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull();

        act(() => { useUIStore.getState().setCanvasTourOpen(true); });
        expect(screen.getByText('1 / 4')).toBeInTheDocument();
    });

    it('掛載期間標記導覽可用（快捷鍵說明據此顯示「重看導覽」），卸載時清除', () => {
        const { unmount } = render(<CanvasTour />);
        expect(useUIStore.getState().canvasTourAvailable).toBe(true);
        unmount();
        expect(useUIStore.getState().canvasTourAvailable).toBe(false);
    });

    it('localStorage 寫不進去時，關掉後本次工作階段內不會再自動重開', () => {
        // 只讓導覽的 key 寫不進去（store 的 persist、i18n 也會寫 localStorage）。
        // tests/setup.ts 的 setItem 本身就是 vi.fn：先取出原實作，結束後放回（mockRestore 會把實作清掉）
        const setItem = localStorage.setItem as unknown as ReturnType<typeof vi.fn>;
        const original = setItem.getMockImplementation()!;
        setItem.mockImplementation((k: string, v: string) => {
            if (k === CANVAS_TOUR_DONE_KEY) throw new Error('blocked');
            original(k, v);
        });
        try {
            setStreams(2);
            render(<CanvasTour />);
            act(() => { vi.advanceTimersByTime(1600); });
            fireEvent.click(screen.getByText('略過'));
            expect(localStorage.getItem(CANVAS_TOUR_DONE_KEY)).toBeNull();
            act(() => { vi.advanceTimersByTime(5000); });
            expect(screen.queryByRole('dialog')).toBeNull();
        } finally {
            setItem.mockImplementation(original);
        }
    });

    it('空畫布上要求開啟（重看導覽）不會懸著，之後加串流也不會突然跳出', () => {
        localStorage.setItem(CANVAS_TOUR_DONE_KEY, '1');
        render(<CanvasTour />);
        act(() => { useUIStore.getState().setCanvasTourOpen(true); });
        expect(useUIStore.getState().isCanvasTourOpen).toBe(false);
        act(() => { setStreams(2); });
        act(() => { vi.advanceTimersByTime(5000); });
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
