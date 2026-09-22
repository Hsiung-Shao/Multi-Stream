// useLiveStatusCheck 與每頻道節流的接線（2026-09 CPU 超限事件）：
// 節流模組與觸發層各自有測試，這裡鎖住中間那段——輪詢迴圈真的有跳過、有記錄、手動 force 有繞過。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const CH = 'UC' + 'e'.repeat(22);

const { checkChannelLiveStatus, favorites } = vi.hoisted(() => ({
    checkChannelLiveStatus: vi.fn(),
    favorites: [] as any[],
}));

vi.mock('../../../src/utils/youtubeApi', () => ({
    youtubeApi: { checkChannelLiveStatus },
}));
vi.mock('../../../src/features/favorites/FavoritesService', () => ({
    favoritesService: {
        getFavorites: () => favorites,
        saveFavorites: vi.fn(),
    },
}));
vi.mock('../../../src/features/twitch/TwitchService', () => ({
    twitchService: { checkMultipleChannelsLiveStatus: vi.fn(async () => ({})) },
}));
vi.mock('../../../src/features/youtube/YouTubeChannelRepository', () => ({
    cacheChannelIfAbsent: vi.fn(async () => {}),
}));

import { useLiveStatusCheck } from '../../../src/features/favorites/useLiveStatusCheck';
import { recordChannelCheck, LIVE_CHECK_STORAGE_KEY } from '../../../src/features/favorites/liveCheckThrottle';

async function runCheck(options?: { force?: boolean }) {
    const { result } = renderHook(() => useLiveStatusCheck());
    await act(async () => {
        await result.current.checkNow(options);
    });
}

beforeEach(() => {
    localStorage.clear();
    checkChannelLiveStatus.mockReset();
    checkChannelLiveStatus.mockResolvedValue({ isLive: false });
    favorites.length = 0;
    favorites.push({ id: 'f1', url: `https://www.youtube.com/channel/${CH}`, name: 'x', platform: 'youtube', channelId: CH, addedAt: '' });
});

describe('useLiveStatusCheck × 每頻道節流', () => {
    it('沒有紀錄 → 查詢並寫入紀錄', async () => {
        await runCheck();
        expect(checkChannelLiveStatus).toHaveBeenCalledWith(CH);
        const map = JSON.parse(localStorage.getItem(LIVE_CHECK_STORAGE_KEY)!);
        expect(map[CH].live).toBe(false);
    });

    it('剛查過的離線頻道 → 自動輪詢跳過，不打端點', async () => {
        recordChannelCheck(CH, false);
        await runCheck();
        expect(checkChannelLiveStatus).not.toHaveBeenCalled();
    });

    it('使用者手動重新整理（force）→ 無視節流照查', async () => {
        recordChannelCheck(CH, false);
        await runCheck({ force: true });
        expect(checkChannelLiveStatus).toHaveBeenCalledTimes(1);
    });

    it('查詢失敗（例如端點 5xx）→ 不寫紀錄，下一輪會重試', async () => {
        checkChannelLiveStatus.mockRejectedValueOnce(new Error('live-og HTTP 503'));
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        await runCheck();
        expect(localStorage.getItem(LIVE_CHECK_STORAGE_KEY)).toBeNull();
    });
});
