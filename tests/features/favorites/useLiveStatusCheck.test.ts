// useLiveStatusCheck 與每頻道節流的接線（2026-09 CPU 超限事件）：
// 節流模組與觸發層各自有測試，這裡鎖住中間那段——輪詢迴圈真的有跳過、有記錄、手動 force 有繞過。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

import { useLiveStatusCheck, MAX_ENDPOINT_CALLS_PER_ROUND, FORCE_COOLDOWN_MS, __setLiveCheckSleepForTests } from '../../../src/features/favorites/useLiveStatusCheck';
import { recordChannelCheck, LIVE_CHECK_STORAGE_KEY } from '../../../src/features/favorites/liveCheckThrottle';
import { twitchService } from '../../../src/features/twitch/TwitchService';

async function runCheck(options?: { force?: boolean }) {
    const { result } = renderHook(() => useLiveStatusCheck());
    let res: Awaited<ReturnType<typeof result.current.checkNow>> | undefined;
    await act(async () => {
        res = await result.current.checkNow(options);
    });
    return res!;
}

// 端點之間的 2 秒間隔在測試裡立即完成（不動全域 setTimeout，整輪逾時才不會被誤觸發）
__setLiveCheckSleepForTests(async () => {});

afterEach(() => {
    vi.restoreAllMocks();
});

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

    it('使用者手動重新整理（force）→ 無視 15 分鐘節流照查；1 分鐘內連點不重查', async () => {
        recordChannelCheck(CH, false, Date.now() - 2 * 60_000);
        await runCheck({ force: true });
        expect(checkChannelLiveStatus).toHaveBeenCalledTimes(1);
        await runCheck({ force: true });
        expect(checkChannelLiveStatus).toHaveBeenCalledTimes(1);
    });

    it('手動重新整理不受冷卻時：同一頻道 1 分鐘內查過仍不重查（每頻道下限）', async () => {
        recordChannelCheck(CH, false, Date.now() - 30_000);
        await runCheck({ force: true });
        expect(checkChannelLiveStatus).not.toHaveBeenCalled();
    });

    it('冷卻中按手動重新整理 → 回傳剩餘秒數給畫面提示', async () => {
        await runCheck({ force: true });
        const res = await runCheck({ force: true });
        expect(res.forced).toBe(false);
        expect(res.cooldownRemainingMs).toBeGreaterThan(0);
        expect(res.cooldownRemainingMs).toBeLessThanOrEqual(FORCE_COOLDOWN_MS);
    });

    it('localStorage 讀不到時，手動重新整理照樣放行', async () => {
        recordChannelCheck(CH, false, Date.now() - 2 * 60_000);
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
        const res = await runCheck({ force: true });
        expect(res.forced).toBe(true);
    });

    it(`手動重新整理 ${FORCE_COOLDOWN_MS / 60_000} 分鐘內只生效一次，之後再按才會再次繞過節流`, async () => {
        const t0 = Date.now();
        const now = vi.spyOn(Date, 'now').mockReturnValue(t0);
        recordChannelCheck(CH, false, t0 - 2 * 60_000);
        await runCheck({ force: true });
        expect(checkChannelLiveStatus).toHaveBeenCalledTimes(1);

        // 2 分鐘後再按：冷卻中，當成一般輪詢（離線 15 分鐘節流擋下）
        now.mockReturnValue(t0 + 2 * 60_000);
        await runCheck({ force: true });
        expect(checkChannelLiveStatus).toHaveBeenCalledTimes(1);

        // 冷卻結束：再按就生效
        now.mockReturnValue(t0 + FORCE_COOLDOWN_MS + 1000);
        await runCheck({ force: true });
        expect(checkChannelLiveStatus).toHaveBeenCalledTimes(2);
    });

    it('直播中的收藏剛查過：自動輪詢 10 分鐘內跳過，手動重新整理照查（下播不再卡 1 小時）', async () => {
        favorites[0] = { ...favorites[0], isLive: true, lastChecked: new Date().toISOString() };
        recordChannelCheck(CH, true, Date.now() - 2 * 60_000);
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

    it('查詢失敗（例如端點 5xx）→ 只記失敗時間：5 分鐘內自動輪詢不重試，手動重新整理可以重試', async () => {
        checkChannelLiveStatus.mockRejectedValueOnce(new Error('live-og HTTP 503'));
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        await runCheck();
        const rec = JSON.parse(localStorage.getItem(LIVE_CHECK_STORAGE_KEY)!)[CH];
        expect(rec.t).toBeUndefined();
        expect(typeof rec.a).toBe('number');
        checkChannelLiveStatus.mockClear();
        await runCheck();
        expect(checkChannelLiveStatus).not.toHaveBeenCalled();
        await runCheck({ force: true });
        expect(checkChannelLiveStatus).toHaveBeenCalledTimes(1);
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

    it('用共享表的結果時，記錄的是它實際被查的時間（舊結果不會被當成剛查過、延後下一次檢查）', async () => {
        const checkedAt = Date.now() - 2 * 60_000;
        fetchLiveStatuses.mockResolvedValue(new Map([[CH, sharedRow({ checked_at: new Date(checkedAt).toISOString() })]]));
        await runCheck();
        expect(JSON.parse(localStorage.getItem(LIVE_CHECK_STORAGE_KEY)!)[CH].t).toBe(checkedAt);
    });

    it('週表排程 10 分鐘前查過 → 仍算新鮮，用資料庫結果、不打端點', async () => {
        fetchLiveStatuses.mockResolvedValue(new Map([[CH, sharedRow({ checked_at: new Date(Date.now() - 10 * 60 * 1000).toISOString() })]]));
        await runCheck();
        expect(checkChannelLiveStatus).not.toHaveBeenCalled();
    });

    it('資料已過期（超過 12 分鐘）→ 退回打端點', async () => {
        fetchLiveStatuses.mockResolvedValue(new Map([[CH, sharedRow({ checked_at: new Date(Date.now() - 13 * 60 * 1000).toISOString() })]]));
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

// 2026-10-04 正式站 CPU 超限：收藏上百個 YouTube 頻道的使用者，每 2 秒打一次端點、整輪打完上百次
describe('useLiveStatusCheck × 每輪打端點上限', () => {
    const chId = (i: number) => 'UC' + String(i).padStart(22, '0');
    const sharedRow = (id: string, ageMs = 0) => ({
        channel_id: id, is_live: false, is_upcoming: false, is_schedule_frame: false,
        video_id: null, channel_title: null, scheduled_start_at: null,
        checked_at: new Date(Date.now() - ageMs).toISOString(),
    });
    const calledIds = () => checkChannelLiveStatus.mock.calls.map(c => c[0] as string);

    beforeEach(() => {
        favorites.length = 0;
        for (let i = 0; i < 15; i++) {
            favorites.push({ id: `f${i}`, url: `https://www.youtube.com/channel/${chId(i)}`, name: `c${i}`, platform: 'youtube', channelId: chId(i), addedAt: '' });
        }
    });

    it(`一輪最多打 ${MAX_ENDPOINT_CALLS_PER_ROUND} 次端點，其餘留到下一輪`, async () => {
        await runCheck();
        expect(checkChannelLiveStatus).toHaveBeenCalledTimes(MAX_ENDPOINT_CALLS_PER_ROUND);
    });

    it('下一輪優先查還沒查過或最久沒查的頻道（輪流涵蓋全部收藏）', async () => {
        await runCheck();
        const first = new Set(calledIds());
        checkChannelLiveStatus.mockClear();
        // 讓第一輪查過的頻道過了節流時間，但比沒查過的晚
        const map = JSON.parse(localStorage.getItem(LIVE_CHECK_STORAGE_KEY)!);
        for (const k of Object.keys(map)) map[k].t = Date.now() - 16 * 60_000;
        localStorage.setItem(LIVE_CHECK_STORAGE_KEY, JSON.stringify(map));
        await runCheck();
        const missed = favorites.map(f => f.channelId).filter(id => !first.has(id));
        expect(missed).toHaveLength(5);
        for (const id of missed) expect(calledIds()).toContain(id);
    });

    it('持續失敗的頻道不會每輪佔住額度：下一輪改查其他收藏', async () => {
        checkChannelLiveStatus.mockRejectedValue(new Error('live-og HTTP 403'));
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        await runCheck();
        const failed = new Set(calledIds());
        expect(failed.size).toBe(MAX_ENDPOINT_CALLS_PER_ROUND);
        checkChannelLiveStatus.mockReset();
        checkChannelLiveStatus.mockResolvedValue({ isLive: false });
        await runCheck();
        // 剛失敗的 10 個在退避期內，第 11～15 個一定被查到
        expect(calledIds()).toHaveLength(5);
        for (const id of calledIds()) expect(failed.has(id)).toBe(false);
    });

    it('共享表有新鮮資料的頻道不佔上限', async () => {
        fetchLiveStatuses.mockResolvedValue(new Map(favorites.slice(0, 8).map(f => [f.channelId, sharedRow(f.channelId)])));
        await runCheck();
        expect(checkChannelLiveStatus).toHaveBeenCalledTimes(7);
    });

    it('手動重新整理：共享資料 3～12 分鐘前 → 額度內打端點，額度用完才退用共享資料', async () => {
        fetchLiveStatuses.mockResolvedValue(new Map(favorites.map(f => [f.channelId, sharedRow(f.channelId, 5 * 60_000)])));
        await runCheck({ force: true });
        expect(checkChannelLiveStatus).toHaveBeenCalledTimes(MAX_ENDPOINT_CALLS_PER_ROUND);
        // 其餘 5 個用共享資料記錄，沒有被晾著
        const map = JSON.parse(localStorage.getItem(LIVE_CHECK_STORAGE_KEY)!);
        expect(Object.keys(map)).toHaveLength(15);
    });

    it('自動輪詢進行中按手動重新整理 → 等這輪跑完後再跑一次手動', async () => {
        const auto = renderHook(() => useLiveStatusCheck());
        const manual = renderHook(() => useLiveStatusCheck());
        let manualRes: { forced: boolean } | undefined;
        await act(async () => {
            const a = auto.result.current.checkNow();
            const m = manual.result.current.checkNow({ force: true }).then(r => { manualRes = r; });
            await Promise.all([a, m]);
        });
        expect(manualRes?.forced).toBe(true);
        // 自動 10 次＋手動 10 次（手動略過節流，但同一頻道 1 分鐘內查過的不重查 → 只查前一輪沒查到的 5 個）
        expect(checkChannelLiveStatus).toHaveBeenCalledTimes(MAX_ENDPOINT_CALLS_PER_ROUND + 5);
    });

    it('打端點前再看一次紀錄：別的分頁剛查過的頻道跳過', async () => {
        // 讓第 1 個頻道在這輪讀完快照之後才被「別的分頁」寫入紀錄
        checkChannelLiveStatus.mockImplementationOnce(async () => {
            recordChannelCheck(favorites[1].channelId, false);
            return { isLive: false };
        });
        await runCheck();
        expect(calledIds()).not.toContain(favorites[1].channelId);
    });

    it('同一分頁兩個地方同時觸發自動輪詢 → 只跑一輪', async () => {
        const a = renderHook(() => useLiveStatusCheck());
        const b = renderHook(() => useLiveStatusCheck());
        await act(async () => {
            await Promise.all([a.result.current.checkNow(), b.result.current.checkNow()]);
        });
        expect(checkChannelLiveStatus).toHaveBeenCalledTimes(MAX_ENDPOINT_CALLS_PER_ROUND);
    });
});

describe('useLiveStatusCheck × Twitch login 大小寫', () => {
    it('舊收藏 channelId 含大寫（twitch.tv/Shroud）→ 仍能對上小寫 key 的直播結果', async () => {
        favorites.length = 0;
        favorites.push({ id: 't1', url: 'https://www.twitch.tv/Shroud', name: 'Shroud', platform: 'twitch', channelId: 'Shroud', addedAt: '', isLive: false });
        vi.mocked(twitchService.checkMultipleChannelsLiveStatus).mockResolvedValueOnce({
            shroud: { isLive: true, channelLogin: 'shroud', viewerCount: 123, gameName: 'Valorant' },
        });
        await runCheck();
        expect(saveFavorites).toHaveBeenCalledTimes(1);
        const saved = saveFavorites.mock.calls[0][0];
        expect(saved[0]).toMatchObject({ id: 't1', isLive: true, viewerCount: 123 });
    });
});
