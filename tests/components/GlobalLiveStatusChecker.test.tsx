// 背景分頁暫停直播偵測（2026-09 CPU 超限事件：掛整夜的背景分頁是最大宗呼叫來源）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

const checkNow = vi.fn();
vi.mock('../../src/features/favorites/useLiveStatusCheck', () => ({
    useLiveStatusCheck: () => ({ checkNow, isRefreshing: false }),
}));

import { GlobalLiveStatusChecker } from '../../src/features/favorites/components/GlobalLiveStatusChecker';
import { useUIStore } from '../../src/store/useUIStore';

let hidden = false;

function setHidden(value: boolean) {
    hidden = value;
    document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
    vi.useFakeTimers();
    checkNow.mockClear();
    hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    useUIStore.setState({ bgLiveDetect: true });
});

afterEach(() => {
    vi.useRealTimers();
});

describe('GlobalLiveStatusChecker', () => {
    it('分頁可見時每 5 分鐘查一次', () => {
        render(<GlobalLiveStatusChecker />);
        act(() => { vi.advanceTimersByTime(5 * 60 * 1000); });
        expect(checkNow).toHaveBeenCalledTimes(1);
    });

    it('分頁在背景時整夜都不查，回到前景只補查一次', () => {
        render(<GlobalLiveStatusChecker />);
        act(() => { setHidden(true); });
        act(() => { vi.advanceTimersByTime(8 * 60 * 60 * 1000); });
        expect(checkNow).not.toHaveBeenCalled();

        act(() => { setHidden(false); });
        expect(checkNow).toHaveBeenCalledTimes(1);
    });

    it('背景時收到 refreshFavoritesStatus 事件也延後到回前景', () => {
        render(<GlobalLiveStatusChecker />);
        act(() => { setHidden(true); });
        act(() => { window.dispatchEvent(new CustomEvent('refreshFavoritesStatus')); });
        expect(checkNow).not.toHaveBeenCalled();
        act(() => { setHidden(false); });
        expect(checkNow).toHaveBeenCalledTimes(1);
    });

    it('沒有待辦時切回前景不會多查', () => {
        render(<GlobalLiveStatusChecker />);
        act(() => { setHidden(true); });
        act(() => { setHidden(false); });
        expect(checkNow).not.toHaveBeenCalled();
    });

    it('其他分頁寫入收藏時，本分頁派發 favoritesUpdated 重讀', () => {
        render(<GlobalLiveStatusChecker />);
        const onUpdate = vi.fn();
        window.addEventListener('favoritesUpdated', onUpdate);
        act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'favoriteStreams' })); });
        act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'somethingElse' })); });
        window.removeEventListener('favoritesUpdated', onUpdate);
        expect(onUpdate).toHaveBeenCalledTimes(1);
    });
});
