// YouTube 收藏直播偵測的每頻道節流（2026-09 CPU 超限事件）
import { describe, it, expect, beforeEach } from 'vitest';
import {
    shouldCheckChannel,
    recordChannelCheck,
    FORCE_MIN_RECHECK_MS,
    OFFLINE_RECHECK_MS,
    LIVE_RECHECK_MS,
    LIVE_CHECK_STORAGE_KEY,
    FAIL_BACKOFF_MS,
    recordChannelFailure,
    lastAttemptAt,
    readCheckMap,
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
        expect(shouldCheckChannel(CH, T0 + 10 * 60_000)).toBe(false);
        expect(shouldCheckChannel(CH, T0 + OFFLINE_RECHECK_MS - 1)).toBe(false);
        expect(shouldCheckChannel(CH, T0 + OFFLINE_RECHECK_MS)).toBe(true);
    });

    it('直播中頻道 30 分鐘內不重查，滿 30 分鐘就查（2026-10-08 使用者指定，原 60 分鐘下播反映太慢）', () => {
        recordChannelCheck(CH, true, T0);
        expect(LIVE_RECHECK_MS).toBe(30 * 60_000);
        expect(shouldCheckChannel(CH, T0 + 20 * 60_000)).toBe(false);
        expect(shouldCheckChannel(CH, T0 + LIVE_RECHECK_MS - 1)).toBe(false);
        expect(shouldCheckChannel(CH, T0 + LIVE_RECHECK_MS)).toBe(true);
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

// 2026-10-04：失敗也要留紀錄，否則持續失敗的頻道永遠排在最前面、每輪佔住打端點的額度
describe('查詢失敗的退避', () => {
    it('失敗只記失敗時間，保留上次成功的結果', () => {
        recordChannelCheck(CH, true, T0);
        recordChannelFailure(CH, T0 + 60_000);
        const rec = readCheckMap()[CH];
        expect(rec).toMatchObject({ t: T0, live: true, a: T0 + 60_000 });
    });

    it(`失敗後 ${FAIL_BACKOFF_MS / 60_000} 分鐘內自動輪詢不重試，之後照節流規則；手動重新整理不受退避`, () => {
        recordChannelFailure(CH, T0);
        expect(shouldCheckChannel(CH, T0 + FAIL_BACKOFF_MS - 1)).toBe(false);
        expect(shouldCheckChannel(CH, T0 + FAIL_BACKOFF_MS)).toBe(true);
        expect(shouldCheckChannel(CH, T0 + 1000, true)).toBe(true);
    });

    it('失敗之後又成功（t 比 a 新）→ 不再退避', () => {
        recordChannelFailure(CH, T0);
        recordChannelCheck(CH, false, T0 + 1000);
        expect(readCheckMap()[CH].a).toBeUndefined();
        expect(shouldCheckChannel(CH, T0 + OFFLINE_RECHECK_MS + 1000)).toBe(true);
    });

    it('舊格式紀錄（只有 t、live）照舊運作', () => {
        localStorage.setItem(LIVE_CHECK_STORAGE_KEY, JSON.stringify({ [CH]: { t: T0, live: false } }));
        expect(shouldCheckChannel(CH, T0 + OFFLINE_RECHECK_MS - 1)).toBe(false);
        expect(shouldCheckChannel(CH, T0 + OFFLINE_RECHECK_MS)).toBe(true);
    });

    it('lastAttemptAt 取成功與失敗較新者；沒查過回 0', () => {
        expect(lastAttemptAt(CH)).toBe(0);
        recordChannelCheck(CH, false, T0);
        recordChannelFailure(CH, T0 + 5000);
        expect(lastAttemptAt(CH)).toBe(T0 + 5000);
    });

    it('清理舊紀錄依成功與失敗較新者判斷：只失敗過的頻道一天後也會被清掉', () => {
        const OLD = 'UC' + 'z'.repeat(22);
        recordChannelFailure(OLD, T0);
        recordChannelCheck(CH, false, T0 + 25 * 60 * 60 * 1000);
        expect(readCheckMap()[OLD]).toBeUndefined();
    });

    it('紀錄裡有壞掉的值（null、非物件）→ 丟掉，不讓寫入丟錯', () => {
        localStorage.setItem(LIVE_CHECK_STORAGE_KEY, JSON.stringify({ bad: null, worse: 3, [CH]: { t: T0, live: false } }));
        expect(() => recordChannelFailure(CH, T0 + 1000)).not.toThrow();
        expect(Object.keys(readCheckMap())).toEqual([CH]);
    });
});
