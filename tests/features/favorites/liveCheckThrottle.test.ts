// YouTube 收藏直播偵測的每頻道節流（2026-09 CPU 超限事件）
import { describe, it, expect, beforeEach } from 'vitest';
import {
    shouldCheckChannel,
    recordChannelCheck,
    FORCE_MIN_RECHECK_MS,
    OFFLINE_RECHECK_MS,
    LIVE_RECHECK_MS,
    LIVE_CHECK_STORAGE_KEY,
} from '../../../src/features/favorites/liveCheckThrottle';

const CH = 'UC' + 'b'.repeat(22);
const T0 = 1_800_000_000_000;

beforeEach(() => {
    localStorage.clear();
});

describe('shouldCheckChannel', () => {
    it('沒有紀錄 → 要查', () => {
        expect(shouldCheckChannel(CH, T0)).toBe(true);
    });

    it('離線頻道 15 分鐘內不重查，滿 15 分鐘才查', () => {
        recordChannelCheck(CH, false, T0);
        expect(shouldCheckChannel(CH, T0 + LIVE_RECHECK_MS)).toBe(false);
        expect(shouldCheckChannel(CH, T0 + OFFLINE_RECHECK_MS - 1)).toBe(false);
        expect(shouldCheckChannel(CH, T0 + OFFLINE_RECHECK_MS)).toBe(true);
    });

    it('直播中頻道 10 分鐘內不重查，滿 10 分鐘就查（下播最多延遲約 10～15 分鐘，不再是 1 小時）', () => {
        recordChannelCheck(CH, true, T0);
        expect(shouldCheckChannel(CH, T0 + 5 * 60_000)).toBe(false);
        expect(shouldCheckChannel(CH, T0 + LIVE_RECHECK_MS - 1)).toBe(false);
        expect(shouldCheckChannel(CH, T0 + LIVE_RECHECK_MS)).toBe(true);
        expect(LIVE_RECHECK_MS).toBeLessThan(OFFLINE_RECHECK_MS);
    });

    it('force：直播中頻道 1 分鐘後就照查（手動重新整理要能看到下播）', () => {
        recordChannelCheck(CH, true, T0);
        expect(shouldCheckChannel(CH, T0 + FORCE_MIN_RECHECK_MS, true)).toBe(true);
    });

    it('force（使用者手動重新整理）只受 1 分鐘下限：擋連點', () => {
        recordChannelCheck(CH, false, T0);
        expect(shouldCheckChannel(CH, T0 + FORCE_MIN_RECHECK_MS - 1, true)).toBe(false);
        expect(shouldCheckChannel(CH, T0 + FORCE_MIN_RECHECK_MS, true)).toBe(true);
    });

    it('時鐘被往回調時視為可查，不會永久卡住', () => {
        recordChannelCheck(CH, false, T0);
        expect(shouldCheckChannel(CH, T0 - 60_000)).toBe(true);
    });

    it('localStorage 內容損毀時退回「要查」', () => {
        localStorage.setItem(LIVE_CHECK_STORAGE_KEY, '{not json');
        expect(shouldCheckChannel(CH, T0)).toBe(true);
    });
});

describe('recordChannelCheck', () => {
    it('紀錄寫在 localStorage，跨分頁共用', () => {
        recordChannelCheck(CH, true, T0);
        const map = JSON.parse(localStorage.getItem(LIVE_CHECK_STORAGE_KEY)!);
        expect(map[CH]).toEqual({ t: T0, live: true });
    });

    it('超過一天的舊紀錄在寫入時清掉', () => {
        const OLD = 'UC' + 'c'.repeat(22);
        recordChannelCheck(OLD, false, T0);
        recordChannelCheck(CH, false, T0 + 25 * 60 * 60 * 1000);
        const map = JSON.parse(localStorage.getItem(LIVE_CHECK_STORAGE_KEY)!);
        expect(map[OLD]).toBeUndefined();
        expect(map[CH]).toBeDefined();
    });
});
