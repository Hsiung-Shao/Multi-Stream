/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useYouTubeRisk } from '../../src/hooks/useYouTubeRisk';
import { useStreamStore } from '../../src/store/useStreamStore';
import { useUIStore } from '../../src/store/useUIStore';

// 設定頁「YouTube 多直播風險提示」開關曾經沒有作用：hook 完全沒讀 youtubeRiskWarning（2026-10）
describe('useYouTubeRisk 尊重設定開關', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        sessionStorage.clear();
        // 兩路 YouTube、播放器尚未就緒 → 以加入數（2）判定，達到 soft 門檻
        useStreamStore.setState({
            streams: [
                { id: 1, platform: 'youtube', channelId: 'a', url: 'https://www.youtube.com/watch?v=a' },
                { id: 2, platform: 'youtube', channelId: 'b', url: 'https://www.youtube.com/watch?v=b' },
            ] as any,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        useUIStore.setState({ youtubeRiskWarning: true });
    });

    it('開關開著：同時 2 路 YouTube 會跳提示', () => {
        useUIStore.setState({ youtubeRiskWarning: true });
        const { result } = renderHook(() => useYouTubeRisk());
        act(() => { vi.advanceTimersByTime(3000); });
        expect(result.current.showYTRiskDialog).toBe(true);
        expect(result.current.currentYTRiskCount).toBe(2);
    });

    it('開關關掉：不會跳提示', () => {
        useUIStore.setState({ youtubeRiskWarning: false });
        const { result } = renderHook(() => useYouTubeRisk());
        act(() => { vi.advanceTimersByTime(10_000); });
        expect(result.current.showYTRiskDialog).toBe(false);
    });

    it('提示開著時關掉開關：提示收起來', () => {
        useUIStore.setState({ youtubeRiskWarning: true });
        const { result } = renderHook(() => useYouTubeRisk());
        act(() => { vi.advanceTimersByTime(3000); });
        expect(result.current.showYTRiskDialog).toBe(true);

        act(() => { useUIStore.getState().setYoutubeRiskWarning(false); });
        expect(result.current.showYTRiskDialog).toBe(false);
    });
});
