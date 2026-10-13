import { describe, expect, it } from 'vitest';
import {
    countByTab,
    filterStreams,
    isPastScheduled,
    UPCOMING_GRACE_MS,
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
import type { ScheduleStream } from '../../../src/features/schedule/types';
import { makeSnapshot, NOW } from './fixtures';

const noFav = toFavoriteKeys([]);
const TZ = 'Asia/Taipei';

describe('filterStreams', () => {
    it('給了 now：接下來不列預定時間已過寬限的場次，筆數一致；直播中不受影響', () => {
        const snap = makeSnapshot();
        const all = snap.upcoming.map((s) => Date.parse(s.scheduled_start!)).sort((x, y) => x - y);
        // 最早那場剛過時間但還在寬限內 → 仍在；過了寬限 → 移除
        expect(filterStreams(snap, 'upcoming', DEFAULT_FILTERS, noFav, '', all[0] + 1).length).toBe(filterStreams(snap, 'upcoming', DEFAULT_FILTERS, noFav).length);
        const cut = all[0] + UPCOMING_GRACE_MS + 1; // 最早那場過了寬限
        const before = filterStreams(snap, 'upcoming', DEFAULT_FILTERS, noFav);
        const after = filterStreams(snap, 'upcoming', DEFAULT_FILTERS, noFav, '', cut);
        expect(after.every((s) => Date.parse(s.scheduled_start!) + UPCOMING_GRACE_MS >= cut)).toBe(true);
        expect(after.length).toBeLessThan(before.length);
        expect(countByTab(snap, DEFAULT_FILTERS, noFav, '', cut).upcoming).toBe(after.length);
        expect(filterStreams(snap, 'live', DEFAULT_FILTERS, noFav, '', cut)).toEqual(filterStreams(snap, 'live', DEFAULT_FILTERS, noFav));
    });

    it('isPastScheduled：過了預定時間 15 分鐘才算已過；沒有預定時間的不算', () => {
        expect(UPCOMING_GRACE_MS).toBe(15 * 60_000);
        expect(isPastScheduled({ scheduled_start: '2026-09-29T04:00:00Z' }, Date.parse('2026-09-29T04:00:01Z'))).toBe(false);
        expect(isPastScheduled({ scheduled_start: '2026-09-29T04:00:00Z' }, Date.parse('2026-09-29T04:15:00Z'))).toBe(false);
        expect(isPastScheduled({ scheduled_start: '2026-09-29T04:00:00Z' }, Date.parse('2026-09-29T04:15:01Z'))).toBe(true);
        expect(isPastScheduled({ scheduled_start: undefined }, 0)).toBe(false);
    });

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
        // 全部都在現在之前（只剩寬限內的場次）：線畫在最後
        expect(nowDividerIndex(hours, Date.parse('2026-09-29T15:00:00Z'))).toBe(hours.length);
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

describe('時間未定場次（time_tbd，2026-10-14）', () => {
    /** 時間未定場次存台北當天 00:00：10/15 → 10/14 16:00Z */
    const TBD_1015 = '2026-10-14T16:00:00.000Z';
    const base: ScheduleStream = { vtuber_id: 'v1', platform: 'youtube', external_id: 'x', source: 'yt_waiting_room', status: 'scheduled' };
    const tbd = (id: string, start = TBD_1015): ScheduleStream => ({ ...base, external_id: id, source: 'community_post', scheduled_start: start, time_tbd: true });
    const timed = (id: string, start: string): ScheduleStream => ({ ...base, external_id: id, scheduled_start: start });
    const NOW14 = Date.parse('2026-10-14T10:00:00+08:00');

    it('T9 isPastScheduled：時間未定場次到台北當天結束前都不算過去，一般場次照舊 15 分鐘', () => {
        const late = Date.parse('2026-10-15T23:00:00+08:00');
        expect(isPastScheduled(tbd('a'), late)).toBe(false);
        expect(isPastScheduled(tbd('a'), Date.parse('2026-10-16T00:01:00+08:00'))).toBe(true);
        expect(isPastScheduled(timed('b', TBD_1015), late)).toBe(true);
    });

    it('T14 groupByDay：時間未定場次以台北日期分天（即使 timeZone 是 UTC），同一天排最後', () => {
        // UTC 下 10/14 16:00Z 是 10/14，但時間未定場次屬於台北 10/15
        const morning = timed('morning', '2026-10-15T01:00:00Z'); // UTC 10/15 01:00
        const days = groupByDay([tbd('t'), morning], NOW14, 'UTC');
        expect(days.find((d) => d.dayKey === '2026-10-14')?.streams.map((s) => s.external_id)).toEqual([]);
        expect(days.find((d) => d.dayKey === '2026-10-15')?.streams.map((s) => s.external_id)).toEqual(['morning', 't']);
    });

    it('T14 groupByDay（台北）：同一天 09:00、20:00 都排在時間未定之前，隔天 00:30 不在同一天', () => {
        const days = groupByDay(
            [timed('eve', '2026-10-15T12:00:00Z'), tbd('t'), timed('next0030', '2026-10-15T16:30:00Z'), timed('nine', '2026-10-15T01:00:00Z')],
            NOW14,
            TZ,
        );
        expect(days.find((d) => d.dayKey === '2026-10-15')?.streams.map((s) => s.external_id)).toEqual(['nine', 'eve', 't']);
        expect(days.find((d) => d.dayKey === '2026-10-16')?.streams.map((s) => s.external_id)).toEqual(['next0030']);
    });

    it('T15 groupByHour：時間未定場次另成一組 { hourIso: \'\', tbd: true } 放最後，不和 00:00 場次混在一起', () => {
        const midnight = timed('midnight', TBD_1015);
        const nine = timed('nine', '2026-10-15T01:00:00Z');
        const t1 = tbd('t1');
        const t2 = tbd('t2');
        const hours = groupByHour([t1, midnight, t2, nine]);
        expect(hours).toHaveLength(3);
        expect(hours[0].streams.map((s) => s.external_id)).toEqual(['midnight']);
        expect(hours[1].streams.map((s) => s.external_id)).toEqual(['nine']);
        expect(hours[2]).toEqual({ hourIso: '', tbd: true, streams: [t1, t2] });
        expect('tbd' in hours[0]).toBe(false);
        expect(hours[0].hourIso).not.toBe('');
    });
});
