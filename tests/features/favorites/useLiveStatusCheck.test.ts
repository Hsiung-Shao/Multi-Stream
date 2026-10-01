// useLiveStatusCheck 與每頻道節流的接線（2026-09 CPU 超限事件）：
// 節流模組與觸發層各自有測試，這裡鎖住中間那段——輪詢迴圈真的有跳過、有記錄、手動 force 有繞過。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const CH = 'UC' + 'e'.repeat(22);

const { checkChannelLiveStatus, favorites, fetchLiveStatuses, saveFavorites } = vi.hoisted(() => ({
    checkChannelLiveStatus: vi.fn(),
    favorites: [] as any[],
    fetchLiveStatuses: vi.fn(),
    saveFavorites: vi.fn(),
}));

// 共享表的讀取換成可控的假資料；新鮮度判斷與欄位轉換用真的實作
vi.mock('../../../src/features/favorites/liveStatusRepository', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../src/features/favorites/liveStatusRepository')>()),
    fetchLiveStatuses,
}));

vi.mock('../../../src/utils/youtubeApi', () => ({
    youtubeApi: { checkChannelLiveStatus },
}));
vi.mock('../../../src/features/favorites/FavoritesService', () => ({
    favoritesService: {
        getFavorites: () => favorites,
        saveFavorites,
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
    fetchLiveStatuses.mockReset();
    fetchLiveStatuses.mockResolvedValue(new Map());
    saveFavorites.mockReset();
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

    it('直播中的收藏剛查過：自動輪詢 10 分鐘內跳過，手動重新整理照查（下播不再卡 1 小時）', async () => {
        favorites[0] = { ...favorites[0], isLive: true, lastChecked: new Date().toISOString() };
        recordChannelCheck(CH, true);
        await runCheck();
        expect(checkChannelLiveStatus).not.toHaveBeenCalled();
        await runCheck({ force: true });
        expect(checkChannelLiveStatus).toHaveBeenCalledTimes(1);
    });

    it('直播中的收藏超過 10 分鐘沒查：自動輪詢就會查（原本 1 小時內一律跳過）', async () => {
        favorites[0] = { ...favorites[0], isLive: true, lastChecked: new Date().toISOString() };
        recordChannelCheck(CH, true, Date.now() - 11 * 60_000);
        await runCheck();
        expect(checkChannelLiveStatus).toHaveBeenCalledTimes(1);
    });

    it('查詢失敗（例如端點 5xx）→ 不寫紀錄，下一輪會重試', async () => {
        checkChannelLiveStatus.mockRejectedValueOnce(new Error('live-og HTTP 503'));
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        await runCheck();
        expect(localStorage.getItem(LIVE_CHECK_STORAGE_KEY)).toBeNull();
    });
});

describe('useLiveStatusCheck × 共享表 youtube_live_status', () => {
    const sharedRow = (over: Record<string, unknown> = {}) => ({
        channel_id: CH,
        is_live: true,
        is_upcoming: false,
        is_schedule_frame: false,
        video_id: 'abcdefghijk',
        channel_title: 'Ch',
        scheduled_start_at: null,
        checked_at: new Date().toISOString(),
        ...over,
    });

    it('別人 3 分鐘內查過（新鮮）→ 直接用資料庫結果，不打端點，並更新收藏的直播狀態', async () => {
        fetchLiveStatuses.mockResolvedValue(new Map([[CH, sharedRow()]]));
        await runCheck();
        expect(checkChannelLiveStatus).not.toHaveBeenCalled();
        const saved = saveFavorites.mock.calls.at(-1)?.[0];
        expect(saved[0]).toMatchObject({ isLive: true, liveVideoId: 'abcdefghijk', liveUrl: 'https://www.youtube.com/watch?v=abcdefghijk' });
        // 讀共享表也算查過，節流照樣生效
        expect(JSON.parse(localStorage.getItem(LIVE_CHECK_STORAGE_KEY)!)[CH].live).toBe(true);
    });

    it('資料已過期 → 退回打端點', async () => {
        fetchLiveStatuses.mockResolvedValue(new Map([[CH, sharedRow({ checked_at: new Date(Date.now() - 10 * 60 * 1000).toISOString() })]]));
        await runCheck();
        expect(checkChannelLiveStatus).toHaveBeenCalledWith(CH);
    });

    it('資料庫沒有這個頻道 → 打端點', async () => {
        await runCheck();
        expect(fetchLiveStatuses).toHaveBeenCalledWith([CH]);
        expect(checkChannelLiveStatus).toHaveBeenCalledWith(CH);
    });

    it('被節流跳過的頻道連資料庫都不讀', async () => {
        recordChannelCheck(CH, false);
        await runCheck();
        expect(fetchLiveStatuses).not.toHaveBeenCalled();
    });
});
