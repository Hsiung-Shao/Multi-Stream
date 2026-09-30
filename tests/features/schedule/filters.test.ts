import { describe, expect, it } from 'vitest';
import {
    countByTab,
    filterStreams,
    groupByDay,
    groupByHour,
    nowDividerIndex,
    pickDefaultDay,
    isFavoriteChannel,
    listGroups,
    sameHourKeys,
    sortLive,
    toFavoriteKeys,
} from '../../../src/features/schedule/filters';
import { DEFAULT_FILTERS, GROUP_ANY_AGENCY, GROUP_NO_AGENCY } from '../../../src/features/schedule/types';
import { makeSnapshot, NOW } from './fixtures';

const noFav = toFavoriteKeys([]);
const TZ = 'Asia/Taipei';

describe('filterStreams', () => {
    it('預設只顯示 TW', () => {
        const snap = makeSnapshot();
        expect(DEFAULT_FILTERS.nationality).toBe('TW');
        expect(filterStreams(snap, 'live', DEFAULT_FILTERS, noFav).map((s) => s.vtuber_id)).toEqual(['v1']);
        expect(filterStreams(snap, 'upcoming', DEFAULT_FILTERS, noFav).map((s) => s.external_id)).toEqual(['TaiOneWait1', 'TaiTwoWait1', 'TaiTwoWait2']);
    });

    it('地區：all 不限、OTHER 是 TW/HK/MY/JP 以外', () => {
        const snap = makeSnapshot();
        snap.channels.v2.nationality = 'KR';
        expect(filterStreams(snap, 'live', { ...DEFAULT_FILTERS, nationality: 'all' }, noFav)).toHaveLength(3);
        expect(filterStreams(snap, 'upcoming', { ...DEFAULT_FILTERS, nationality: 'OTHER' }, noFav).map((s) => s.vtuber_id)).toEqual(['v2', 'v2']);
    });

    it('團體與平台', () => {
        const snap = makeSnapshot();
        const all = { ...DEFAULT_FILTERS, nationality: 'all' as const };
        expect(filterStreams(snap, 'upcoming', { ...all, group: '子午計畫' }, noFav).map((s) => s.vtuber_id)).toEqual(['v1']);
        // 所屬：所有企業勢／非企業勢（v1 屬子午計畫；v2、v3 沒有企業勢）
        expect(filterStreams(snap, 'upcoming', { ...all, group: GROUP_ANY_AGENCY }, noFav).map((s) => s.vtuber_id)).toEqual(['v1']);
        expect(filterStreams(snap, 'upcoming', { ...all, group: GROUP_NO_AGENCY }, noFav).map((s) => s.vtuber_id)).toEqual(['v2', 'v2', 'v3']);
        expect(filterStreams(snap, 'live', { ...all, platform: 'twitch' }, noFav).map((s) => s.vtuber_id)).toEqual(['v1', 'v4']);
    });

    it('收藏範圍：不套地區篩選；Twitch login 不分大小寫；同一人另一平台的場次也顯示', () => {
        const snap = makeSnapshot();
        const fav = toFavoriteKeys([
            { platform: 'twitch', channelId: 'taione' }, // 名冊存 TaiOne
            { platform: 'youtube', channelId: 'UC0000000000000000000003' }, // JP
            { platform: 'other', channelId: 'x' },
            { platform: 'youtube', channelId: null },
        ]);
        const f = { ...DEFAULT_FILTERS, scope: 'favorites' as const };
        expect(filterStreams(snap, 'live', f, fav).map((s) => s.vtuber_id)).toEqual(['v1', 'v3']);
        // v1 的 YouTube 待機室也算（收藏的是 Twitch）
        expect(filterStreams(snap, 'upcoming', f, fav).map((s) => s.external_id)).toEqual(['TaiOneWait1', 'JpWaiting01']);
        expect(isFavoriteChannel(undefined, fav)).toBe(false);
    });

    it('countByTab 與 listGroups', () => {
        const snap = makeSnapshot();
        expect(countByTab(snap, DEFAULT_FILTERS, noFav)).toEqual({ live: 1, upcoming: 3, recent: 1 });
        // 只列企業勢（ホロ 在 fixture 裡沒有 agency，不列）
        expect(listGroups(snap)).toEqual([{ name: '子午計畫', count: 1 }]);
        // snapshot 帶出全部企業勢時，本週沒有場次的也列（人數 0，依名稱排在後面）
        const idle = ['春魚創意', 'Aa'].sort((x, y) => x.localeCompare(y));
        expect(listGroups({ ...snap, agencies: ['春魚創意', '子午計畫', 'Aa'] })).toEqual([{ name: '子午計畫', count: 1 }, ...idle.map((name) => ({ name, count: 0 }))]);
    });
});

describe('groupByDay', () => {
    it('連續 7 天（空的日子也保留），依本地日期分組、每天依時間排序；超出 7 天併到最後一天', () => {
        const snap = makeSnapshot();
        const far = { ...snap.upcoming[0], external_id: 'FarFuture01', scheduled_start: '2026-10-20T12:00:00Z' };
        const late = { ...snap.upcoming[0], external_id: 'LateOverdue', scheduled_start: '2026-09-28T15:00:00Z' }; // 台北 9/28 23:00，已過期但在 3 小時內
        const days = groupByDay([snap.upcoming[1], snap.upcoming[0], snap.upcoming[2], far, late], NOW, TZ);
        expect(days.map((d) => d.dayKey)).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']);
        expect(days[0].streams.map((s) => s.external_id)).toEqual(['LateOverdue', 'TaiOneWait1', 'TaiTwoWait1']);
        expect(days[1].streams.map((s) => s.external_id)).toEqual(['TaiTwoWait2']);
        expect(days[6].streams.map((s) => s.external_id)).toEqual(['FarFuture01']);
        expect(days[3].streams).toEqual([]);
    });

    it('跨午夜：UTC 16:30 在台北是隔天 00:30', () => {
        const snap = makeSnapshot();
        const s = { ...snap.upcoming[0], scheduled_start: '2026-09-29T16:30:00Z' };
        const days = groupByDay([s], NOW, TZ);
        expect(days[1].dayKey).toBe('2026-09-30');
        expect(days[1].streams).toHaveLength(1);
    });
});

describe('groupByHour / pickDefaultDay / nowDividerIndex', () => {
    it('同一個本地整點的場次歸在一組，順序保留', () => {
        const snap = makeSnapshot();
        const hours = groupByHour([snap.upcoming[0], snap.upcoming[1], snap.upcoming[3]]); // 台北 20:00、20:30、21:00
        expect(hours.map((h) => h.streams.map((s) => s.external_id))).toEqual([['TaiOneWait1', 'TaiTwoWait1'], ['JpWaiting01']]);
        expect(groupByHour([{ ...snap.upcoming[0], scheduled_start: undefined }])).toEqual([]);
    });

    it('預設日：今天有場次就今天，否則第一個有場次的日子', () => {
        const snap = makeSnapshot();
        const days = groupByDay([snap.upcoming[2]], NOW, TZ); // 只有明天有
        expect(pickDefaultDay(days)).toBe('2026-09-30');
        expect(pickDefaultDay(groupByDay([], NOW, TZ))).toBe('2026-09-29');
        expect(pickDefaultDay([])).toBeNull();
    });

    it('現在線插在第一個整點 ≥ 目前整點的組之前；全部都過了回 -1', () => {
        const snap = makeSnapshot();
        const hours = groupByHour([snap.upcoming[0], snap.upcoming[3]]); // 20:00、21:00（台北）
        expect(nowDividerIndex(hours, Date.parse('2026-09-29T11:30:00Z'))).toBe(0); // 台北 19:30
        expect(nowDividerIndex(hours, Date.parse('2026-09-29T12:10:00Z'))).toBe(0); // 20:10 → 20 點那組仍算「現在」
        expect(nowDividerIndex(hours, Date.parse('2026-09-29T13:05:00Z'))).toBe(1);
        expect(nowDividerIndex(hours, Date.parse('2026-09-29T15:00:00Z'))).toBe(-1);
    });
});

describe('sameHourKeys / sortLive', () => {
    it('同一個本地小時的場次', () => {
        const snap = makeSnapshot();
        const hour = sameHourKeys(snap.upcoming, snap.upcoming[0], TZ).map((s) => s.external_id);
        expect(hour).toEqual(['TaiOneWait1', 'TaiTwoWait1']);
    });

    it('直播中依開播時間，新開播的在前；沒有開播時間的排最後', () => {
        const snap = makeSnapshot();
        expect(sortLive(snap.live).map((s) => s.external_id)).toEqual(['111', 'JpLiveVideo', '222']);
    });
});
