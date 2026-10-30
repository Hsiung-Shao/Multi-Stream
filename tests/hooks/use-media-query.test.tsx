import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { useMediaQuery } from '../../src/hooks/use-media-query';

// 只 mock window.matchMedia(外部 I/O),hook 本身不 mock。
type Listener = (e: { matches: boolean }) => void;

function installMatchMedia(initial: boolean) {
    const state = { matches: initial };
    const listeners: Listener[] = [];
    const addEventListener = vi.fn((type: string, cb: Listener) => {
        if (type === 'change') listeners.push(cb);
    });
    const removeEventListener = vi.fn();
    const mql = {
        get matches() {
            return state.matches;
        },
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener,
        removeEventListener,
        dispatchEvent: vi.fn(),
    };
    window.matchMedia = vi.fn().mockImplementation((query: string) => {
        mql.media = query;
        return mql;
    }) as unknown as typeof window.matchMedia;
    return { state, listeners, addEventListener, removeEventListener };
}

function Probe({ query, seen }: { query: string; seen: boolean[] }) {
    const v = useMediaQuery(query);
    seen.push(v);
    return null;
}

describe('useMediaQuery', () => {
    const original = window.matchMedia;
    afterEach(() => {
        window.matchMedia = original;
    });

    it('第一次 render 就回傳 matchMedia 當下結果', () => {
        installMatchMedia(true);
        const seen: boolean[] = [];
        render(<Probe query="(max-width: 767px)" seen={seen} />);
        // 若實作先回 false 再於 effect 才變 true,首值會是 false(造成首屏版面閃動)
        expect(seen[0]).toBe(true);
    });

    it('收到 change 事件後更新為新值', () => {
        const mm = installMatchMedia(false);
        const seen: boolean[] = [];
        render(<Probe query="(max-width: 767px)" seen={seen} />);
        expect(seen[seen.length - 1]).toBe(false);
        expect(mm.listeners.length).toBeGreaterThan(0);

        act(() => {
            mm.state.matches = true;
            mm.listeners.forEach((cb) => cb({ matches: true }));
        });
        // 若沒訂閱 change 或沒更新 state,值會停在 false
        expect(seen[seen.length - 1]).toBe(true);
    });

    it('卸載後移除 change 監聽', () => {
        const mm = installMatchMedia(false);
        const seen: boolean[] = [];
        const { unmount } = render(<Probe query="(max-width: 767px)" seen={seen} />);
        const cb = mm.listeners[0];
        expect(cb).toBeTypeOf('function');
        unmount();
        // 若漏了 cleanup,卸載後仍收事件會洩漏並對已卸載元件 setState
        expect(mm.removeEventListener).toHaveBeenCalledWith('change', cb);
    });

    it('伺服器端 render(預渲染)一律回傳 false', () => {
        installMatchMedia(true);
        function Out() {
            return <span>{String(useMediaQuery('(max-width: 767px)'))}</span>;
        }
        const html = renderToString(<Out />);
        // 若 server render 直接讀 matchMedia,預渲染 HTML 會是 true,與 hydrate 第一輪不一致
        expect(html).toContain('false');
    });
});
